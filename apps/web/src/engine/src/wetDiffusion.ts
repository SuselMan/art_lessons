// #536, ADR 011 §17.11: the mobile phase of pigment — diffusion in standing
// water, as a CPU reference model.
//
// This file is the *oracle*, not the production path. The production path is
// a GLSL pass over the wash's deposit buffer (WC_DIFFUSE_FRAG), and the whole
// point of having this twin in plain TypeScript is that the algorithm can be
// proved on a 32x32 grid — mass conserved, pigment confined to the water,
// valleys favoured over crests, symmetry kept — before a single shader line is
// tuned by eye. Five rounds of "растекание должно быть сильнее" were spent
// re-shaping a *stamp*, and none of them could have worked: what was missing
// was not a shape but a phase. Pigment dropped into water keeps moving after
// the brush has gone. That is what this computes.
//
// The model, deliberately the simplest that has the four properties:
//
//   one step = for every pixel i and each of its K stencil neighbours j, an
//   exchange of pigment across the pair, decided once per pair and applied
//   with opposite signs to the two — so whatever i loses j gains, exactly,
//   and the total cannot drift by construction.
//
//   flux(i -> j) = gate(i, j) * (
//         D * (c_i - c_j)                          diffusion proper
//       + B * max(h_i - h_j, 0) * c_i               downhill, i donating
//       - B * max(h_j - h_i, 0) * c_j )             downhill, j donating
//
//   gate(i, j) = min(w_i, w_j) — water on BOTH sides, or nothing moves. That
//   one term is the puddle's edge: a dry pixel next to a wet one exchanges
//   nothing, so pigment can approach the water's boundary and never cross it.
//
// Height enters only as the *direction* of a pairwise exchange, never as a
// source: every term is antisymmetric in (i, j), and every donating term is
// scaled by the donor's own concentration, so a pixel can never give what it
// does not have. With K(D + B) <= 1 the outflow of any pixel in one step is
// bounded by its content, which keeps concentrations non-negative without a
// clamp — and a clamp is exactly what would break the antisymmetry.
//
// No clocks anywhere. N steps is a constant of the tool; the picture after N
// steps is the dry target and is committed at once. What the eye sees over
// the following seconds is the display converging onto it (ADR 011 §17.6).
//
// The oracle is scalar: one concentration per cell. The GPU twin moves the
// deposit's whole vec4, written as two donor terms per pair (i gives j a
// fraction of its own texel, j gives i a fraction of its own); on the .a
// channel the two sum to exactly the flux below, and the other channels
// travel in each donor's own proportions — conserved by the same argument,
// texel by texel. The water gate on the GPU is coverage times the standing
// water recorded in the coverage buffer's .b (see u_washWater); here it is
// simply `water`.

/** Per-step diffusion rate. With the 8-neighbour stencil, K*(D + B) must stay
 *  at or below 1 — see positivity above. */
export const WET_DIFFUSE_D = 0.09
/** Per-step downhill rate at unit height difference. Small against D: the
 *  web along the paper's valleys is a bias on where pigment settles, not a
 *  current that empties the crests. */
export const WET_DIFFUSE_B = 0.03
/** The canonical schedule: one stencil radius per step, in texels, coarse
 *  first. The steps run at several spatial scales rather than at one: the
 *  coarse ones carry pigment across the puddle, the fine ones take the
 *  eight-pointed star a coarse step leaves back out again. Not one huge
 *  radius, deliberately — that would be a blur, and a blur is not paint
 *  seeping along a sheet.
 *
 *  Ten steps, against the four to six the design thread budgeted for
 *  eight-bit quantisation between GPU passes. Measured on a replay of Ilya's
 *  own dab — a scribbled dot in a puddle about a hundred texels across — with
 *  the water gate open (see WC_DIFFUSE_FRAG's wcWaterAt on the gate that was
 *  shut while the schedule was first being chosen): the dot's peak came down
 *  by a third and its pale reach went from the halo's edge to about ten
 *  texels short of the puddle's, without crossing it. Whether ten steps can
 *  stay is decided by the divergence(N) test across two GPUs, not here; the
 *  eight-bit write between steps is the one leak, and it compounds with N.
 *
 *  Known limit, accepted for the first milestone: a pair at radius r is gated
 *  by the water at its two ends only, so two wet texels with a dry gap of
 *  under r between them still exchange. A puddle is convex enough for that
 *  not to show; a thin dry channel through a wash would leak across it. */
//  (#536, s17.20) A 48 in front, from a top of 32: "растекание надо всё-таки
//  увеличивать". And every other step on the KNIGHT'S ring instead of the
//  axes-and-diagonals: eight jumps at one radius put a dab's paint on eight
//  spots, and with the same eight directions at every scale the spots lined
//  up into rings that the fine steps could not take out — "после высыхания
//  остаются круги". The knight's offsets (2,1) sit 26.6 degrees off the
//  axes, so consecutive scales interleave sixteen directions, and a knight
//  step of r reaches r·√5.
export interface WetDiffuseStep { readonly radius: number; readonly knight: boolean }
export const WET_DIFFUSE_SCHEDULE: readonly WetDiffuseStep[] = [
  { radius: 21, knight: true }, { radius: 32, knight: false }, { radius: 14, knight: true },
  { radius: 16, knight: false }, { radius: 7, knight: true }, { radius: 8, knight: false },
  { radius: 4, knight: false }, { radius: 3, knight: true }, { radius: 2, knight: false },
  { radius: 1, knight: true }, { radius: 1, knight: false },
]
/** The plain radii, for callers that only need a length or a count. */
export const WET_DIFFUSE_RADII: readonly number[] = WET_DIFFUSE_SCHEDULE.map(s => s.radius)
export const WET_DIFFUSE_STEPS = WET_DIFFUSE_SCHEDULE.length
/** How far a texel's paint can travel over the whole schedule — the sum of
 *  the steps' reaches (a knight step reaches radius·√5, rounded up). The
 *  engine pads the field it diffuses by this, so nothing ever reaches the
 *  field's edge and the edge is never a wall anyone can see. */
export const WET_DIFFUSE_REACH = WET_DIFFUSE_SCHEDULE.reduce(
  (a, s) => a + (s.knight ? Math.ceil(s.radius * Math.SQRT2 * 1.582) : s.radius), 0,
)
/** The share of a deposit that is MOBILE — that the schedule moves at all.
 *  The rest is fixed where the brush put it, which is what keeps a mark laid
 *  into a puddle a mark: at 1.0 a stroke dropped into standing water thinned
 *  to a tint over the whole puddle and read as vanishing ("штрих исчезает, а
 *  лужа по краям набирает цвет"); real paint settles on contact as it runs.
 *  The design thread called this split before it was seen: "нужна подвижная
 *  доля", not everything mobile to the end of the solve. The flux is linear
 *  in the concentration for a given gate field, so diffusing the mobile
 *  share alone is exactly mix(deposit, diffused(deposit), share) — one blend
 *  after the schedule, mass conserved as a linear blend of two conserved
 *  fields. The share is of what the OPERATION laid, not of the wash (see
 *  _diffuseWash): paint moves once, at the settle that laid it. A first
 *  split; a share that itself settles step by step, more in the valleys, is
 *  the next refinement. */
//  (#536, s17.20) 0.75, from 0.6 — the other half of "растекание надо
//  увеличивать": more of what a stroke lays goes with the water.
export const WET_DIFFUSE_MOBILE = 0.75

/** The eight-neighbour stencil, as (dx, dy). Order matters only in that the
 *  GPU pass must use the same one. */
export const WET_DIFFUSE_STENCIL: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
]
/** The knight's ring — see WET_DIFFUSE_SCHEDULE. Eight offsets, each with its
 *  negative, so every pair is still counted once from its forward member. */
export const WET_DIFFUSE_KNIGHT: ReadonlyArray<readonly [number, number]> = [
  [2, 1], [-2, -1], [1, 2], [-1, -2],
  [-1, 2], [1, -2], [-2, 1], [2, -1],
]

export interface WetGrid {
  width: number
  height: number
  /** Pigment concentration per cell, >= 0. */
  pigment: Float64Array
  /** Standing water per cell, 0..1. Zero is dry paper: nothing crosses it. */
  water: Float64Array
  /** Paper height per cell, any units; only differences matter. Higher is a
   *  crest, lower is a pit. */
  paperHeight: Float64Array
}

export function makeWetGrid(width: number, height: number): WetGrid {
  const n = width * height
  return {
    width, height,
    pigment: new Float64Array(n),
    water: new Float64Array(n),
    paperHeight: new Float64Array(n),
  }
}

/** One diffusion step. Returns a new pigment field; the grid is not mutated.
 *
 *  Written pair-by-pair rather than as a stencil sum per pixel on purpose,
 *  and the difference is the whole guarantee: a per-pixel sum would compute
 *  the (i, j) exchange twice — once from each side — and any asymmetry in how
 *  the two evaluations round would be a leak. Here the pair is evaluated once
 *  and applied to both ends, so mass is conserved to the last bit of the
 *  arithmetic, not merely on average. */
export function wetDiffuseStep(
  grid: WetGrid, pigment: Float64Array,
  d = WET_DIFFUSE_D, b = WET_DIFFUSE_B,
  /** Stencil radius in cells. The eight offsets are scaled by it. */
  radius = 1,
  knight = false,
): Float64Array {
  return wetDiffuseStepMany(grid, [pigment], d, b, radius, knight)[0]
}

/** One step over SEVERAL fields at once, every one of them moved by the same
 *  donor fractions — which is the whole point (§17.19): the pigment's mass
 *  and its optical depth per channel are one suspension, so what leaves a
 *  cell takes the same share of each. The pair's exchange is written as two
 *  donor terms, i's share to j and j's share to i, and the fractions depend on
 *  the gate and the height only — never on any field's value — so they are
 *  the same for every field, to the bit. On one field the two terms sum to
 *  the flux of the header: D (cᵢ − cⱼ) + B max(dh,0) cᵢ − B max(−dh,0) cⱼ. */
/** (#536, §17.23) The advective terms of a step — what turns a diffusion
 *  into a bloom or a tideline. Both are OPTIONAL; without them the step is
 *  the plain one above.
 *
 *  `pressure` is a water-pressure field (a dome over a drop, the puddle's
 *  own profile): paint drifts DOWN its gradient at `pressureRate`, written
 *  exactly like the paper's downhill term — antisymmetric per pair, scaled
 *  by the donor's concentration — so it conserves and stays positive by the
 *  same argument. Where the gate closes the drift stops, and the paint it
 *  carried piles up at the last open cell: the dry line.
 *
 *  `gateThreshold` closes the gate where the water is at or below it. A drop
 *  into a DAMP wash is the case: the wash's own water must not move its
 *  settled paint, only the drop's water may — so the threshold sits between
 *  the two levels. Given per cell and modulated by the paper's height, the
 *  stop line wanders cell by cell with the sheet: the cauliflower edge. */
export interface WetDiffuseOpts {
  pressure?: Float64Array
  pressureRate?: number
  gateThreshold?: Float64Array | number
}

export function wetDiffuseStepMany(
  grid: WetGrid, fields: readonly Float64Array[],
  d = WET_DIFFUSE_D, b = WET_DIFFUSE_B, radius = 1, knight = false,
  opts: WetDiffuseOpts = {},
): Float64Array[] {
  const { width, height, water, paperHeight } = grid
  const outs = fields.map(f => Float64Array.from(f))
  const pressure = opts.pressure ?? null
  const pr = opts.pressureRate ?? 0
  const thr = opts.gateThreshold
  const thrAt = typeof thr === 'number' ? (_i: number) => thr : thr ? (i: number) => thr[i] : null
  const gateAt = (i: number): number => {
    const w = water[i]
    return thrAt && w <= thrAt(i) ? 0 : w
  }
  // Each unordered pair once: only the four "forward" directions of the
  // stencil, taken from every cell, cover every pair exactly once.
  const stencil = knight ? WET_DIFFUSE_KNIGHT : WET_DIFFUSE_STENCIL
  const forward = stencil.filter(([dx, dy]) => dx > 0 || (dx === 0 && dy > 0))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const gi = gateAt(i)
      if (gi <= 0) continue
      for (const [ox, oy] of forward) {
        const nx = x + ox * radius, ny = y + oy * radius
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const j = ny * width + nx
        const gate = Math.min(gi, gateAt(j))
        if (gate <= 0) continue
        const dh = paperHeight[i] - paperHeight[j]
        const dp = pressure ? pressure[i] - pressure[j] : 0
        const give = gate * (d + b * Math.max(dh, 0) + pr * Math.max(dp, 0))
        const take = gate * (d + b * Math.max(-dh, 0) + pr * Math.max(-dp, 0))
        for (let k = 0; k < fields.length; k++) {
          const f = fields[k], out = outs[k]
          const flux = give * f[i] - take * f[j]
          out[i] -= flux
          out[j] += flux
        }
      }
    }
  }
  return outs
}

/** N steps at radius 1 — the plain form the invariants are proved on. */
export function wetDiffuse(grid: WetGrid, steps = WET_DIFFUSE_STEPS, d = WET_DIFFUSE_D, b = WET_DIFFUSE_B): Float64Array {
  let p = grid.pigment
  for (let s = 0; s < steps; s++) p = wetDiffuseStep(grid, p, d, b)
  return p
}

/** The canonical schedule — what the GPU pass runs. */
export function wetDiffuseScheduled(
  grid: WetGrid, schedule: readonly WetDiffuseStep[] = WET_DIFFUSE_SCHEDULE, d = WET_DIFFUSE_D, b = WET_DIFFUSE_B,
): Float64Array {
  let p = grid.pigment
  for (const s of schedule) p = wetDiffuseStep(grid, p, d, b, s.radius, s.knight)
  return p
}

/** Total pigment — the invariant. */
export function totalPigment(p: Float64Array): number {
  let sum = 0
  for (let i = 0; i < p.length; i++) sum += p[i]
  return sum
}

/** Centre of mass, for the symmetry test. */
export function centreOfMass(grid: WetGrid, p: Float64Array): { x: number; y: number } {
  let sx = 0, sy = 0, m = 0
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const v = p[y * grid.width + x]
      sx += v * x; sy += v * y; m += v
    }
  }
  return m > 0 ? { x: sx / m, y: sy / m } : { x: NaN, y: NaN }
}
