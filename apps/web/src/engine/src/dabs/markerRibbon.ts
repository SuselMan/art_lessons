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
// (#468 v6) Five, not four: x, y, edgePx, inkDeposit, and the same deposit
// weighted by how wet the brush was over *this segment*.
//
// The fifth exists because the water weighting cannot be a uniform. It was one,
// per batch, and that made the finished mark depend on how the stroke happened
// to be cut into pointer events: a live stroke weighted each batch's bands by
// its own water, while a replay — one batch for the whole stroke — weighted
// every band by the *final*, most depleted value. The two disagreed over 26% of
// the mark's area, so a stroke visibly changed the moment the room reloaded.
//
// 0 for every tool that has no water model, which leaves the channel it feeds
// unread.
//
// (#536) Six, and the sixth is the brush's own across-coordinate: -1 at the
// left tangent, 0 on the centre line, +1 at the right. It exists so the
// composite can index a *hair* rather than a place on the paper — see
// BRISTLE_COMB in shaders.ts. Nothing else can supply it: `edgePx` is an
// unsigned distance to the nearest boundary, so a hair on the left and its
// mirror on the right are the same number, and the fragment stage has no way
// to tell them apart afterwards.
// (#536) Seven, and the seventh is the same deposit weighted by how wet the
// *paper* already was under this segment — a different quantity from the sixth
// in the same way the brush's own water is a different quantity from the
// paper's: one decides how the mark was laid, the other what became of it.
// Per vertex for the identical reason inkWater is: a value per batch makes the
// finished mark depend on where the stroke happened to be cut into pointer
// events.
// (#536) Eight, and the eighth is how strong the paint in the brush was — the
// pigment slider, per stroke. It has to ride the deposit rather than the
// composite's single per-batch opacity, because a wash spans several strokes
// and they no longer have to agree about it: laying clean water and then taking
// paint into it is two strokes of the same wash with pigment 0 and pigment 0.8.
// With one scalar for the whole wash, whichever stroke happened to be first
// decided the lot — and a wash that opened with clean water rendered its own
// paint invisible at pen-up.
// (#536, s17.27) Nine: how DEEP the water stands under this segment, 1 for
// the puddle a brush leaves where it lands (and in a wet wash), less for the
// film it lays along the stroke. The photographs: a stroke's puddle dries
// last and leaves a ragged front inside the stroke where it met the film.
// #680: endpoint pressure follows each sub-pose, independent of event batching.
// Puddle and pressure share a vec2 attribute to stay within WebGL1's 8 slots.
const FLOATS_PER_VERTEX = 10 // …, across, inkDeposit*paperWet, inkDeposit*strength, puddle, pressure

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

/** Area of the nib, px². Exact for both shapes: a rounded box is the box
 *  minus the four corner squares it lost, plus the disc that replaced them. */
export function nibArea(nib: NibGeometry): number {
  const { semiMajor: a, semiMinor: b } = nib
  if (nib.shape === 'roundedBox') {
    const r = Math.min(nib.cornerRadius, a, b)
    return 4 * a * b - (4 - Math.PI) * r * r
  }
  return Math.PI * a * b
}

/**
 * (#559) Mean chord of the nib along world direction (tx, ty), px: how far,
 * on average, a point travelling that way spends inside the nib. Area divided
 * by the nib's width *across* the direction (twice its support value along
 * the normal) — Cavalieri, no integration needed.
 *
 * This is the quantity the ink deposit is really proportional to. A pixel on
 * the path is inside `chord / spacing` consecutive stamps, each laying
 * `opacity * spacing`, so the ink it accumulates is `opacity * chord` whatever
 * the spacing — and for a chisel drawn broad-side-on the chord is the nib's
 * *short* axis, a fifth of the number in the toolbar. See markerInkGain.ts.
 */
export function nibMeanChord(nib: NibGeometry, tx: number, ty: number): number {
  const width = 2 * nibSupport(nib, -ty, tx).value
  return width > 1e-6 ? nibArea(nib) / width : 0
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
/** Shortest-arc interpolation, so a nib crossing ±π doesn't spin the long way
 *  round between two samples. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

function lerpDab(d0: Dab, d1: Dab, t: number): Dab {
  return {
    ...d0,
    x: d0.x + (d1.x - d0.x) * t,
    y: d0.y + (d1.y - d0.y) * t,
    size: d0.size + (d1.size - d0.size) * t,
    aspectRatio: d0.aspectRatio + (d1.aspectRatio - d0.aspectRatio) * t,
    angle: lerpAngle(d0.angle, d1.angle, t),
  }
}

/**
 * How many sub-steps this pair needs (#330 follow-up).
 *
 * "Band + two nibs is the exact swept figure" holds for a *translation*. It
 * stops holding the moment the nib also turns or changes size between samples:
 * the intermediate poses then bulge outside the convex hull of the two end
 * ones, and the ribbon under-covers by the width of that bulge. Rendered, that
 * is a row of rounded bites out of the outer edge of every turn — measured at
 * 1.66px on a 120px chisel following a 150px-radius arc, against 0.08px for
 * the same arc with the nib angle held fixed.
 *
 * Subdividing the *band* alone does nothing (measured: 1.66 -> 1.61), because
 * the missing area is nib body, not band. Interpolated poses in between are
 * what closes it (0.12px at 8 sub-steps).
 *
 * The bulge scales with how far the nib reaches and how much its pose changes,
 * so that product is what gets divided down until it is under
 * `MARKER_POSE_STEP_PX`. Capped: past a dozen sub-steps the geometry cost stops
 * being worth the vanishing improvement, and a pose difference that large means
 * the sampler upstream should have emitted more dabs anyway.
 */
const MARKER_POSE_STEP_PX = 1.0
const MARKER_MAX_SUBSTEPS = 12

export function poseSubdivisions(g0: NibGeometry, g1: NibGeometry): number {
  const reach = Math.max(g0.semiMajor, g1.semiMajor)
  // How far a point at `reach` moves because the pose changed, ignoring the
  // translation the band already handles exactly.
  const turn = Math.abs(lerpAngle(g0.angle, g1.angle, 1) - g0.angle) * reach
  const grow = Math.abs(g1.semiMajor - g0.semiMajor) + Math.abs(g1.semiMinor - g0.semiMinor)
  const drift = turn + grow
  if (drift <= MARKER_POSE_STEP_PX) return 1
  return Math.min(MARKER_MAX_SUBSTEPS, Math.ceil(drift / MARKER_POSE_STEP_PX))
}

/** Points around the nib's outline, shrunk inward by `inset` px. For a rounded
 *  box the inset of the shape is exactly the same shape with every extent
 *  reduced by the inset, which is what this relies on; for an ellipse it is an
 *  approximation, and a good one at the sub-pixel insets this is used with. */
function outlinePoints(nib: NibGeometry, inset: number, segments: number): Array<{ x: number; y: number }> {
  const a = Math.max(nib.semiMajor - inset, 1e-3)
  const b = Math.max(nib.semiMinor - inset, 1e-3)
  const c = Math.cos(nib.angle), s = Math.sin(nib.angle)
  const pts: Array<{ x: number; y: number }> = []
  for (let i = 0; i < segments; i++) {
    const phi = (i / segments) * Math.PI * 2
    let lx: number, ly: number
    if (nib.shape === 'roundedBox') {
      // Squircle-free rounded box: the box's own corner arcs, walked by angle.
      const r = Math.min(Math.max(nib.cornerRadius - inset, 0), a, b)
      const ux = Math.cos(phi), uy = Math.sin(phi)
      const m = Math.max(Math.abs(ux) / (a - r || 1e-3), Math.abs(uy) / (b - r || 1e-3))
      lx = ux / m + r * ux
      ly = uy / m + r * uy
    } else {
      lx = a * Math.cos(phi)
      ly = b * Math.sin(phi)
    }
    pts.push({ x: lx * c - ly * s, y: lx * s + ly * c })
  }
  return pts
}

const OUTLINE_SEGMENTS = 16

export function buildRibbonBands(
  dabs: Dab[],
  sizeMultiplier: number,
  prevDab?: Dab,
  shape: NibShape = 'ellipse',
  cornerFraction = 0,
  aaPx = 1,
  /** (#468 v3) Overrides how much ink each segment carries. Omitted keeps the
   *  distance-normalized formula below exactly as it was, which is what the
   *  marker must keep forever (its strokes live in production rooms and its
   *  saturation constants were calibrated against that scale).
   *
   *  Watercolor passes one so its bands share the stamps' normalization and
   *  water depletion — the two overlap almost everywhere, so leaving the bands
   *  on the old scale would let them swamp whatever the stamps expressed. */
  inkFor?: (d0: Dab, d1: Dab, travel: number) => { ink: number; water: number; paperWet: number; strength: number; puddle?: number },
  /** (#536, s17.30) Emit the nib body at EVERY pose, the real samples too,
   *  not only the interpolated ones. Under the watercolour film's MAX blend
   *  the band and the sample's shader stamp do not add: the stamp is a
   *  plateau with a ramp over the outer half, the band is full to its edge,
   *  and on the outer side of a turn the wedge between two bands was covered
   *  by the ramp alone - a row of light spokes round every circle ("лента
   *  мазка рвётся при круговых движениях"). A full body at the vertex fills
   *  the wedge; under MAX it costs nothing in tone. Additive modes must not
   *  set this: the body would deposit on top of the stamp. */
  fillEveryPose = false,
): Float32Array {
  const chain = prevDab ? [prevDab, ...dabs] : dabs
  if (chain.length < 2) return new Float32Array(0)

  const out: number[] = []
  let ink = 0 // deposit carried by whichever segment is currently being emitted
  let inkWater = 0 // the same deposit, weighted by that segment's own water
  let inkWet = 0 // …and by how wet the paper under it already was (#536)
  let inkStrength = 0 // …and by how strong the paint was (#536)
  let pressure = 1
  let endPressure = 1
  let puddle = 1 // (s17.27) how deep the water stands here
  const push = (x: number, y: number, edge: number, across: number, press = pressure): void => {
    out.push(x, y, edge, ink, inkWater, across, inkWet, inkStrength, puddle, press)
  }
  const quad = (
    m0: { x: number; y: number }, e0: number, t0: { x: number; y: number },
    m1: { x: number; y: number }, e1: number, t1: { x: number; y: number },
    /** Which side of the centre line this half of the band is: -1 or +1. */
    side: number,
  ): void => {
    // m = centre-line vertex (edge = full half-width), t = tangent-line vertex
    // (edge = 0, i.e. exactly on the outer boundary).
    push(m0.x, m0.y, e0, 0); push(t0.x, t0.y, 0, side); push(t1.x, t1.y, 0, side, endPressure)
    push(m0.x, m0.y, e0, 0); push(t1.x, t1.y, 0, side, endPressure); push(m1.x, m1.y, e1, 0, endPressure)
  }

  /** One nib body, as an antialiased polygon: a ring of triangles carrying the
   *  edge ramp, and a fan filling everything inside it solid. Only ever emitted
   *  for *interpolated* poses — the real samples get an exact analytic outline
   *  from the shader instead (DAB_FRAG's u_inkMode=6). */
  const body = (centre: { x: number; y: number }, nib: NibGeometry, nx: number, ny: number): void => {
    const inset = Math.min(aaPx, nib.semiMinor * 0.5)
    const rim = outlinePoints(nib, 0, OUTLINE_SEGMENTS)
    const core = outlinePoints(nib, inset, OUTLINE_SEGMENTS)
    // (#536) The same across-coordinate the bands carry, so an interpolated
    // pose does not punch a comb-less hole through the middle of a turn:
    // distance from the centre along the band's own perpendicular, normalized
    // by how far the nib reaches in it.
    const reach = Math.max(nibSupport(nib, nx, ny).value, 1e-3)
    const across = (p: { x: number; y: number }): number =>
      Math.max(-1, Math.min(1, (p.x * nx + p.y * ny) / reach))
    for (let i = 0; i < OUTLINE_SEGMENTS; i++) {
      const j = (i + 1) % OUTLINE_SEGMENTS
      const r0 = { x: centre.x + rim[i].x, y: centre.y + rim[i].y }
      const r1 = { x: centre.x + rim[j].x, y: centre.y + rim[j].y }
      const c0 = { x: centre.x + core[i].x, y: centre.y + core[i].y }
      const c1 = { x: centre.x + core[j].x, y: centre.y + core[j].y }
      const ar0 = across(rim[i]), ar1 = across(rim[j])
      const ac0 = across(core[i]), ac1 = across(core[j])
      // ramp ring
      push(r0.x, r0.y, 0, ar0); push(r1.x, r1.y, 0, ar1); push(c1.x, c1.y, inset, ac1)
      push(r0.x, r0.y, 0, ar0); push(c1.x, c1.y, inset, ac1); push(c0.x, c0.y, inset, ac0)
      // solid interior
      push(centre.x, centre.y, inset, 0); push(c0.x, c0.y, inset, ac0); push(c1.x, c1.y, inset, ac1)
    }
  }

  for (let i = 0; i + 1 < chain.length; i++) {
    const d0 = chain[i], d1 = chain[i + 1]
    const travel = Math.hypot(d1.x - d0.x, d1.y - d0.y)
    if (travel < 1e-6) continue // no travel
    // Distance-normalized, the same quantity the nib stamps carry (ADR 004
    // "Ревизия v1.5" §2) — halved because those deposit too and the two overlap
    // almost everywhere. Where they don't (exactly the regions
    // this exists to cover) a half dose still lands, instead of nothing.
    if (inkFor) {
      const got = inkFor(d0, d1, travel)
      ink = got.ink
      inkWater = ink * got.water
      inkWet = ink * got.paperWet
      inkStrength = ink * got.strength
      puddle = got.puddle ?? 1
    } else {
      ink = d1.opacity * travel * 0.5
      inkWater = 0
      inkWet = 0
      inkStrength = 0
      puddle = 1
    }

    const steps = poseSubdivisions(
      nibGeometry(d0, sizeMultiplier, shape, cornerFraction),
      nibGeometry(d1, sizeMultiplier, shape, cornerFraction),
    )

    for (let k = 0; k < steps; k++) {
      const a = k === 0 ? d0 : lerpDab(d0, d1, k / steps)
      const b = k === steps - 1 ? d1 : lerpDab(d0, d1, (k + 1) / steps)
      const dx = b.x - a.x, dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      if (len < 1e-6) continue
      const nx = -dy / len, ny = dx / len

      pressure = a.pressure
      endPressure = b.pressure
      const ga = nibGeometry(a, sizeMultiplier, shape, cornerFraction)
      const gb = nibGeometry(b, sizeMultiplier, shape, cornerFraction)
      const la = nibSupport(ga, nx, ny), lb = nibSupport(gb, nx, ny)
      const ra = nibSupport(ga, -nx, -ny), rb = nibSupport(gb, -nx, -ny)
      const ca = { x: a.x, y: a.y }, cb = { x: b.x, y: b.y }

      quad(ca, la.value, { x: a.x + la.x, y: a.y + la.y }, cb, lb.value, { x: b.x + lb.x, y: b.y + lb.y }, +1)
      quad(ca, ra.value, { x: a.x + ra.x, y: a.y + ra.y }, cb, rb.value, { x: b.x + rb.x, y: b.y + rb.y }, -1)

      // Interior sub-poses only: the endpoints already have their own exact,
      // shader-drawn nib stamp.
      if (k > 0 || fillEveryPose) body(ca, ga, nx, ny)
    }
  }

  return new Float32Array(out)
}

export { FLOATS_PER_VERTEX as RIBBON_FLOATS_PER_VERTEX }
