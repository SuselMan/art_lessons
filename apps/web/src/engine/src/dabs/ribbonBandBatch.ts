import type { Dab } from '@grafetto/shared'
import { lerpDab, nibGeometry, nibSupport, outlinePoints, poseSubdivisions, tipContactPressure, type NibGeometry, type NibShape } from './markerRibbon'

export type RibbonBandMaterialFor = (d0: Dab, d1: Dab, travel: number) => { ink: number; water: number; paperWet: number; strength: number; puddle?: number; pigmentPool?: number }
const OUTLINE_SEGMENTS = 16

/** One unchanged geometry walk; independent material doubles precede Float32 encoding. */
export function buildRibbonBandBatch(
  dabs: Dab[],
  sizeMultiplier: number,
  prevDab?: Dab,
  shape: NibShape = 'ellipse',
  cornerFraction = 0,
  aaPx = 1,
  inkFor: readonly RibbonBandMaterialFor[] = [],
  fillEveryPose = false,
): Float32Array[] {
  const chain = prevDab ? [prevDab, ...dabs] : dabs
  if (chain.length < 2) return inkFor.map(() => new Float32Array(0))

  let capacity = Math.max(1, chain.length - 1) * (12 + OUTLINE_SEGMENTS * 9) * 11
  let outputs = inkFor.map(() => new Float32Array(capacity))
  let written = 0
  const reserve = (required: number): void => {
    if (required <= capacity) return
    capacity = Math.max(required, capacity * 2)
    outputs = outputs.map(previous => { const next = new Float32Array(capacity); next.set(previous); return next })
  }
  let materials: Array<{ ink: number; water: number; wet: number; strength: number; puddle: number; pigmentPool: number }> = []
  let pressure = 1
  let endPressure = 1
  const push = (x: number, y: number, edge: number, across: number, press = pressure): void => {
    for (let i = 0; i < outputs.length; i++) {
      const m = materials[i]
      const out = outputs[i]
      out[written] = x; out[written + 1] = y; out[written + 2] = edge
      out[written + 3] = m.ink; out[written + 4] = m.water; out[written + 5] = across
      out[written + 6] = m.wet; out[written + 7] = m.strength; out[written + 8] = m.puddle
      out[written + 9] = press; out[written + 10] = m.pigmentPool
    }
    written += 11
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
    materials = inkFor.map(callback => {
      const got = callback(d0, d1, travel)
      // Preserve double products before either output becomes Float32.
      return { ink: got.ink, water: got.ink * got.water,
        wet: got.ink * got.paperWet, strength: got.ink * got.strength,
        puddle: got.puddle ?? 1, pigmentPool: got.pigmentPool ?? 0.5 }
    })

    const steps = poseSubdivisions(
      nibGeometry(d0, sizeMultiplier, shape, cornerFraction),
      nibGeometry(d1, sizeMultiplier, shape, cornerFraction),
    )

    // Capacity only: never read encoded values back into geometry/material math.
    reserve(written + (steps * 12 + (fillEveryPose ? steps : Math.max(0, steps - 1)) * OUTLINE_SEGMENTS * 9) * 11)
    for (let k = 0; k < steps; k++) {
      const a = k === 0 ? d0 : lerpDab(d0, d1, k / steps)
      const b = k === steps - 1 ? d1 : lerpDab(d0, d1, (k + 1) / steps)
      const dx = b.x - a.x, dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      if (len < 1e-6) continue
      const nx = -dy / len, ny = dx / len

      const ga = nibGeometry(a, sizeMultiplier, shape, cornerFraction)
      const gb = nibGeometry(b, sizeMultiplier, shape, cornerFraction)
      pressure = tipContactPressure(a.pressure, ga.semiMinor)
      endPressure = tipContactPressure(b.pressure, gb.semiMinor)
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

  return outputs.map(output => written === output.length ? output : output.slice(0, written))
}

