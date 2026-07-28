import type { Dab } from '@grafetto/shared'

// #330 stage 2: marker's stroke silhouette as a connected ribbon instead of a
// row of independent stamps.
//
// Why the stamps had to go (measured, see docs/marker-edge-problem.md): the
// union of nib shapes dropped every `spacing` px deviates from the true swept
// figure by ~0.75 * spacing for a 5:1 chisel held at 45 degrees — the flat nib
// translates as a whole, so the error falls only *linearly* with spacing. At our
// spacing (0.22 * brush size = 26.4px on a 120px brush) that is a 21px scallop.
// Getting under a 0.5px tolerance would need ~0.7px spacing, i.e. ~1400 stamps
// per 1000px of stroke. A round nib is the opposite case — its error falls
// quadratically and is already 0.13px at 8px spacing — but one tool wants one
// rasterizer, so both nibs go through this.
//
// The construction rests on one fact: for a *convex* shape, the Minkowski sum
// with a segment is exactly the convex hull of the shape at both endpoints. So
// the swept region of one stroke segment is exactly
//
//     nib(c0)  ∪  nib(c1)  ∪  band(c0, c1)
//
// where `band` is the quad bounded by the two common outer tangent lines —
// which, for two translates of one shape, touch it at its support points in
// ±n (n perpendicular to the direction of travel). No distance field, no
// iteration: two support points per endpoint and the band is exact.
//
// The nib shapes themselves are drawn separately (as ordinary dab quads with an
// analytic in-pixel signed distance, DAB_FRAG's u_inkMode=6 branch), so this
// module only builds the bands.

/** Half of a band, split along the ribbon's centre line — see buildRibbonBands
 *  for why the split is load-bearing. */
const FLOATS_PER_VERTEX = 3 // x, y, edgePx

/** Which shape the nib actually is. Mirrors DAB_FRAG's markerNibDistPx —
 *  the two must agree, or the bands and the stamps they connect would be built
 *  from different outlines. */
export type NibShape = 'ellipse' | 'roundedBox'

export interface NibGeometry {
  shape: NibShape
  /** Semi-axis along the nib's own X (the long one for a chisel), px. */
  semiMajor: number
  /** Semi-axis along the nib's own Y, px. */
  semiMinor: number
  /** Corner radius, px. Ignored for an ellipse. */
  cornerRadius: number
  /** Nib orientation, radians. */
  angle: number
}

export function nibGeometry(dab: Dab, sizeMultiplier: number, shape: NibShape = 'ellipse', cornerFraction = 0): NibGeometry {
  const semiMinor = dab.size * 0.5 * sizeMultiplier
  return {
    shape,
    semiMajor: semiMinor * Math.max(dab.aspectRatio, 1),
    semiMinor,
    cornerRadius: semiMinor * cornerFraction,
    angle: dab.angle,
  }
}

/**
 * Support point of the nib in world direction (nx, ny), relative to its own
 * centre, plus the support *value* — the distance from the centre to the
 * tangent line with that normal. Those two are all the band construction needs,
 * for any convex nib.
 *
 * Ellipse: in its own frame the support value of direction u is
 * sqrt((a·u.x)² + (b·u.y)²), touching at (a²u.x, b²u.y) / that value.
 *
 * Rounded box: a box of half-extents (a, b) shrunk by the corner radius r, then
 * grown back by a disc of radius r — a Minkowski sum, and support functions add
 * over one, so h(u) = (a-r)|u.x| + (b-r)|u.y| + r, touching at the shrunk box's
 * own corner offset by r·u.
 */
export function nibSupport(nib: NibGeometry, nx: number, ny: number): { x: number; y: number; value: number } {
  const { semiMajor: a, semiMinor: b, angle, shape } = nib
  const c = Math.cos(angle), s = Math.sin(angle)
  // World -> nib-local (inverse rotation).
  const ux = nx * c + ny * s
  const uy = -nx * s + ny * c

  let px: number, py: number, value: number
  if (shape === 'roundedBox') {
    const r = Math.min(nib.cornerRadius, a, b)
    const ix = a - r, iy = b - r
    value = ix * Math.abs(ux) + iy * Math.abs(uy) + r
    px = Math.sign(ux) * ix + r * ux
    py = Math.sign(uy) * iy + r * uy
  } else {
    value = Math.hypot(a * ux, b * uy)
    if (value < 1e-9) return { x: 0, y: 0, value: 0 }
    px = (a * a * ux) / value
    py = (b * b * uy) / value
  }
  // Nib-local -> world (forward rotation).
  return { x: px * c - py * s, y: px * s + py * c, value }
}

/**
 * Triangles for the bands connecting each consecutive pair of dabs, as a flat
 * interleaved array of (x, y, edgePx) — world coordinates, caller offsets them
 * into tile space.
 *
 * `edgePx` is the distance from that vertex to the ribbon's nearest *outer*
 * boundary, in canvas pixels, and it is what makes the edge crisp at a width
 * that no longer scales with the brush: the fragment shader turns it straight
 * into coverage over a fixed ~1px ramp.
 *
 * Each band is emitted as two quads split along the centre line (centre → left
 * tangent, centre → right tangent) rather than one. That split is not cosmetic:
 * across the whole band the distance-to-nearest-edge is `min` of two linear
 * functions, which a single quad's linear interpolation cannot represent — it
 * would sag to a wrong value down the middle. Split at the ridge, each half is
 * genuinely linear and interpolates exactly.
 *
 * The band's two *ends* deliberately carry no edge falloff at all: they are
 * interior to the union (the nib drawn at each endpoint covers them), so
 * antialiasing them would paint a hairline seam right through the middle of a
 * solid mark — the classic abutting-AA-polygons failure.
 */
export function buildRibbonBands(
  dabs: Dab[],
  sizeMultiplier: number,
  prevDab?: Dab,
  shape: NibShape = 'ellipse',
  cornerFraction = 0,
): Float32Array {
  const chain = prevDab ? [prevDab, ...dabs] : dabs
  if (chain.length < 2) return new Float32Array(0)

  // 2 quads per band, 2 triangles per quad, 3 vertices per triangle.
  const out = new Float32Array((chain.length - 1) * 12 * FLOATS_PER_VERTEX)
  let w = 0

  const push = (x: number, y: number, edge: number): void => {
    out[w++] = x; out[w++] = y; out[w++] = edge
  }
  const quad = (
    m0: { x: number; y: number }, e0: number, t0: { x: number; y: number },
    m1: { x: number; y: number }, e1: number, t1: { x: number; y: number },
  ): void => {
    // m = centre-line vertex (edge = full half-width), t = tangent-line vertex
    // (edge = 0, i.e. exactly on the outer boundary).
    push(m0.x, m0.y, e0); push(t0.x, t0.y, 0); push(t1.x, t1.y, 0)
    push(m0.x, m0.y, e0); push(t1.x, t1.y, 0); push(m1.x, m1.y, e1)
  }

  for (let i = 0; i + 1 < chain.length; i++) {
    const d0 = chain[i], d1 = chain[i + 1]
    const dx = d1.x - d0.x, dy = d1.y - d0.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue // no travel: the nib stamp alone covers it
    const nx = -dy / len, ny = dx / len

    const g0 = nibGeometry(d0, sizeMultiplier, shape, cornerFraction)
    const g1 = nibGeometry(d1, sizeMultiplier, shape, cornerFraction)
    const l0 = nibSupport(g0, nx, ny)
    const l1 = nibSupport(g1, nx, ny)
    const r0 = nibSupport(g0, -nx, -ny)
    const r1 = nibSupport(g1, -nx, -ny)

    const c0 = { x: d0.x, y: d0.y }, c1 = { x: d1.x, y: d1.y }
    quad(c0, l0.value, { x: d0.x + l0.x, y: d0.y + l0.y }, c1, l1.value, { x: d1.x + l1.x, y: d1.y + l1.y })
    quad(c0, r0.value, { x: d0.x + r0.x, y: d0.y + r0.y }, c1, r1.value, { x: d1.x + r1.x, y: d1.y + r1.y })
  }

  return w === out.length ? out : out.subarray(0, w)
}

export { FLOATS_PER_VERTEX as RIBBON_FLOATS_PER_VERTEX }
