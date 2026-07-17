import type { PaperType } from '@art-lessons/shared'

// The paper-grain noise algorithm — a value-noise fBm with domain warp and
// an exact-periodicity ("seamless") mode, originally #141's GLSL
// (PAPER_GEN_FRAG) baked live on each client's own GPU. Ported here to
// plain TS so it can be baked exactly once, offline, by the developer
// (see ../../../scripts/bakePaperTextures.ts) — the baked bytes are then
// shipped identically to every client, removing the cross-GPU-divergence
// risk the live-per-client bake had. This is the single source of truth:
// both the bake script and paperNoise.test.ts's periodicity proofs import
// straight from here, instead of hand-duplicating the math (as the old
// GLSL-vs-test-oracle split required).

export interface PaperGrainConfig {
  scale: number
  gain: number
  contrast: number
  warp: number
  // Felted cellulose-fiber layer (see fiberContribution's own comment) —
  // additive on top of the base fbm above, not a replacement: real paper
  // reads as a fine grain *sitting on* coarser fiber structure, not either
  // one alone. fiberPeriod must evenly divide `scale` (same exact-
  // periodicity integer-modulus trick vnoise's own corner wrap uses) so
  // this layer closes up exactly at the same texture edge the base fbm
  // already does — pick it smaller than `scale` (fewer, bigger cells),
  // since fibers should read as coarser than the fine background grain.
  fiberPeriod: number
  fiberHalfLen: number   // fiber half-length, in fiber-cell units (1 = one full cell)
  fiberWidth: number     // fiber width, in fiber-cell units
  fiberStrength: number  // 0..1 blend weight vs. the base fbm height
}

// scale = noise cells across the seamless period (see PAPER_BAKE_RESOLUTION):
//   bigger scale = finer grain.
// warp = domain warp strength (displaces UV by another noise pass — breaks
//   regularity, creates organic fiber-like look instead of grid blobs).
// Contrast/gain history (#95 and two follow-ups, from real-use feedback):
// lowered across the board — at the original values all three papers read
// as too bas-relief; real paper grain is a much fainter variation. Relative
// ordering (rough roughest, bristol nearly flat) kept throughout every
// revision.
// Fiber values are a first guess, not yet visually tuned (see paperNoise's
// own fiberPeriod comment for why each must evenly divide its row's
// `scale`: 580/20=29, 780/26=30, 1050/30=35) — same relative-ordering
// pattern as gain/contrast/warp above, rough getting the strongest/coarsest
// fiber presence and bristol barely any, extrapolated one and two steps
// finer. Expect a bake:paper + look-at-it round or several before these
// settle, same as every previous PAPER_GRAIN_CONFIGS tuning pass.
export const PAPER_GRAIN_CONFIGS: Record<PaperType, PaperGrainConfig> = {
  rough:   { scale: 580,  gain: 0.18,  contrast: 0.3,   warp: 0.15,
             fiberPeriod: 20, fiberHalfLen: 0.75, fiberWidth: 0.18, fiberStrength: 0.45 },
  smooth:  { scale: 780,  gain: 0.135, contrast: 0.225, warp: 0.09,
             fiberPeriod: 26, fiberHalfLen: 0.65, fiberWidth: 0.14, fiberStrength: 0.28 },
  bristol: { scale: 1050, gain: 0.1,   contrast: 0.17,  warp: 0.05,
             fiberPeriod: 30, fiberHalfLen: 0.5,  fiberWidth: 0.1,  fiberStrength: 0.08 },
}

// The baked texture's own pixel resolution — deliberately unrelated to
// PAPER_WORLD_SIZE below (see that constant's comment); this one only
// needs to be a WebGL1-legal power-of-two (REPEAT requires POT) and high
// enough that a texel stays sub-pixel at realistic zoom levels.
export const PAPER_BAKE_RESOLUTION = 2048

// World-space size the baked tile repeats over at runtime (both bounded
// and infinite rooms — see engine/index.ts's _paperWorldSize). Deliberately
// NOT a multiple or divisor of TILE_SIZE (1024, see tileMath.ts): if it
// were, every infinite-room tile's origin (always an exact multiple of
// TILE_SIZE) would land on an exact multiple of this too, making
// u_paperOrigin's threading in DAB_FRAG a no-op under REPEAT — every tile
// would silently re-sample the same [0,1) sub-range. 157 shares no common
// factor with 1024 (1024 is a power of 2, 157 is odd — prime, in fact) —
// tuned from real-use feedback testing on a Surface, in two rounds: first
// from 900 to 315 (a measured 100%-vs-35% ratio), then a further /2 by feel
// (315 still read coarser than wanted) — 315/2 = 157.5, rounded down to the
// nearest odd. Grain cell size in world units works out to
// PAPER_WORLD_SIZE / cfg.scale — PAPER_BAKE_RESOLUTION cancels out of that
// ratio entirely, so tuning grain size never needs to touch it.
export const PAPER_WORLD_SIZE = 157

// Drives how much the pencil itself "feels" the paper grain while drawing —
// see paperCatchValue's normalScale below, mix()'d by this over a 0..1
// range (0 = bristol-like uniform fill, 1 = max tooth) — independent of
// PAPER_GRAIN_CONFIGS, which shapes the noise's own shape/frequency (shared
// with the blank-paper look), not how strongly a given surface normal
// translates into graphite catch.
//
// Careful: below ~0.02 this range is visually flat — mix(2.0,10.0,r) etc.
// are already within a couple percent of their r=0 floor there, so e.g.
// 0.0001 vs 0.002 vs 0.02 all look identical. Stay above that if a tier is
// meant to have *some* perceptible tooth; use 0 outright for "none".
//
// Tuning history (carried over unchanged from engine/index.ts, where this
// table used to live before paperCatch moved from a runtime GPU
// computation to this offline bake — see paperCatchValue): third
// follow-up, current bristol is the reference for "roughest" — rough now
// takes the old bristol config outright, smooth/bristol extrapolate one
// and two steps finer still (same scale/gain/contrast/warp trend as the
// previous follow-up, continued).
export const PAPER_ROUGHNESS: Record<PaperType, number> = {
  rough:   0.05,
  smooth:  0.02,
  bristol: 0,
}

// GLSL fract(x) = x - floor(x), always in [0,1) even for negative x —
// distinct from JS's `%`, which can return a negative result.
function fracPos(x: number): number {
  return x - Math.floor(x)
}

// GLSL mod(x,y) = x - y*floor(x/y) — likewise not the same as JS's `%`.
function glslMod(x: number, y: number): number {
  return x - y * Math.floor(x / y)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smooth01(t: number): number {
  return t * t * (3 - 2 * t)
}

function clampNum(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

// Artifact-free hash (Inigo Quilez) — no sin(), no diagonal banding, chosen
// to avoid the classic cross-GPU noise-portability pitfall (this mattered
// when the noise ran live on each client's GPU; kept as-is now that it's
// baked once, since the algorithm itself is otherwise unchanged).
function hash(px: number, py: number): number {
  const hx = 17.0 * fracPos(px * 0.3183099 + 0.11)
  const hy = 17.0 * fracPos(py * 0.3183099 + 0.17)
  return fracPos(hx * hy * (hx + hy))
}

// `period` is only consulted when `seamless` is true: wrapping each
// corner's integer grid index by an integer period before hashing makes
// hash(i) exactly equal hash(i+period) (integer-to-integer, no
// floating-point drift), which in turn makes vnoise exactly periodic in p
// with that same period.
function vnoise(px: number, py: number, periodX: number, periodY: number, seamless: boolean): number {
  const ix = Math.floor(px), iy = Math.floor(py)
  const ux = smooth01(fracPos(px)), uy = smooth01(fracPos(py))

  let i00x = ix, i00y = iy
  let i10x = ix + 1, i10y = iy
  let i01x = ix, i01y = iy + 1
  let i11x = ix + 1, i11y = iy + 1
  if (seamless) {
    i00x = glslMod(i00x, periodX); i00y = glslMod(i00y, periodY)
    i10x = glslMod(i10x, periodX); i10y = glslMod(i10y, periodY)
    i01x = glslMod(i01x, periodX); i01y = glslMod(i01y, periodY)
    i11x = glslMod(i11x, periodX); i11y = glslMod(i11y, periodY)
  }

  return lerp(
    lerp(hash(i00x, i00y), hash(i10x, i10y), ux),
    lerp(hash(i01x, i01y), hash(i11x, i11y), ux),
    uy,
  )
}

// An octave's frequency multiplier is normally the exact mathematical
// ratio (1, 2.1, 2.1^2, 2.1^3 — see fbm) — when seamless, basePeriod*ratio
// is snapped to the nearest integer first (2.1 isn't a whole number, so an
// octave's *exact* frequency almost never divides evenly into basePeriod),
// letting vnoise's integer-modulus trick apply to every octave so their sum
// (fbm) stays exactly periodic over basePeriod too, at the cost of a
// less-than-1%, imperceptible nudge to that octave's actual frequency.
function seamlessRatio(ratio: number, basePeriod: number, seamless: boolean): number {
  if (seamless) return Math.floor(basePeriod * ratio + 0.5) / basePeriod
  return ratio
}

// 4-octave fBm (fixed loop count, matching the original WebGL1 shader).
function fbm(px: number, py: number, basePeriod: number, gain: number, seamless: boolean): number {
  let v = 0, a = 0.5, s = 0
  const f0 = seamlessRatio(1.0, basePeriod, seamless)
  const f1 = seamlessRatio(2.1, basePeriod, seamless)
  const f2 = seamlessRatio(2.1 * 2.1, basePeriod, seamless)
  const f3 = seamlessRatio(2.1 * 2.1 * 2.1, basePeriod, seamless)

  v += a * vnoise(px * f0, py * f0, f0 * basePeriod, f0 * basePeriod, seamless); s += a; a *= gain
  v += a * vnoise(px * f1, py * f1, f1 * basePeriod, f1 * basePeriod, seamless); s += a; a *= gain
  v += a * vnoise(px * f2, py * f2, f2 * basePeriod, f2 * basePeriod, seamless); s += a; a *= gain
  v += a * vnoise(px * f3, py * f3, f3 * basePeriod, f3 * basePeriod, seamless); s += a

  return v / s
}

// One scattered, randomly oriented capsule-shaped fiber strand per grid
// cell — closer to how felted cellulose paper fibers actually look than
// the isotropic-blob base fbm, since each strand has a length and a
// direction rather than just a round hash peak. One fiber per cell (not
// denser): a fiber's visible footprint spans many pixels, unlike a single
// vnoise hash corner, so packing more per cell reads as repetitive fast.
// `cx,cy` are already in this layer's own cell space (period-integer
// units, see fiberPeriod's own comment) — cellX/cellY is which cell
// (cx,cy) itself falls in, but the strand seeded in ANY of its 8
// neighbors can still reach into it (halfLen/width can exceed 1 cell), so
// all 9 are checked and the strongest contribution wins.
//
// Per cell: three hashes, each offset by a different additive constant
// before hashing (same "decorrelate via an arbitrary offset" trick fbm's
// own qx/qy domain-warp passes use) so a fiber's position, angle, and
// strength don't correlate with each other or with the base fbm layer
// sharing the same underlying hash() — jittered seed position, a
// uniformly random angle in [0, pi) (a line has no head/tail, so this
// already covers every possible orientation without a 2x-redundant
// [0, 2*pi) range), and a per-fiber strength for texture variety.
// Distance to the strand is the standard clamped-projection formula (t
// clamped to [-halfLen, halfLen] keeps the closest point from sliding past
// either end onto the strand's infinite extension), soft linear falloff
// over `width`.
//
// The hash lookup key (gx,gy) is wrapped by `period` — same integer-
// modulus trick vnoise's own corner wrap uses — but the strand's actual
// *position* (seedX/seedY) stays in unwrapped, continuous cell space, so
// distance math in the local neighborhood around (cx,cy) is unaffected;
// only which hash value a given cell resolves to needs to agree across the
// wrap boundary (cell 0 and cell `period` must hash identically) for this
// layer to close up exactly at the texture's own edge.
function fiberContribution(cx: number, cy: number, period: number, halfLen: number, width: number): number {
  const cellX = Math.floor(cx), cellY = Math.floor(cy)
  let best = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = glslMod(cellX + dx, period)
      const gy = glslMod(cellY + dy, period)
      const seedX = cellX + dx + hash(gx, gy)
      const seedY = cellY + dy + hash(gx + 31.7, gy + 47.3)
      const angle = hash(gx + 91.3, gy + 12.1) * Math.PI
      const dirX = Math.cos(angle), dirY = Math.sin(angle)

      const relX = cx - seedX, relY = cy - seedY
      const t = clampNum(relX * dirX + relY * dirY, -halfLen, halfLen)
      const closeX = seedX + dirX * t, closeY = seedY + dirY * t
      const dist = Math.hypot(cx - closeX, cy - closeY)

      const strength = 0.4 + 0.6 * hash(gx + 5.5, gy + 77.7)
      const contribution = Math.max(0, 1 - dist / width) * strength
      if (contribution > best) best = contribution
    }
  }
  return best
}

// uv = fragCoord/resolution*scale, domain-warp via q, fbm again on the
// warped point, contrast curve last. `seamless` should be true for every
// real bake (see PAPER_BAKE_RESOLUTION) — false is kept only so
// paperNoise.test.ts can prove seamless mode is a genuine fix, not a
// no-op, against the plain unwrapped formula.
export function paperHeight(
  fragX: number, fragY: number, resW: number, resH: number,
  cfg: PaperGrainConfig, seamless: boolean,
): number {
  const { scale, gain, contrast, warp } = cfg
  const uvx = (fragX / resW) * scale
  const uvy = (fragY / resH) * scale

  const qx = fbm(uvx + 0.0, uvy + 0.0, scale, gain, seamless)
  const qy = fbm(uvx + 3.7, uvy + 5.4, scale, gain, seamless)

  const h = fbm(uvx + warp * qx, uvy + warp * qy, scale, gain, seamless)

  // Fiber layer only applies in seamless (real-bake) mode — it's always
  // exactly periodic by construction (see fiberContribution's own comment),
  // so blending it into the deliberately-*non*-periodic `seamless: false`
  // path would make that path partially periodic and undermine the tests
  // that rely on it staying the old, unfixed, non-periodic formula.
  //
  // Additive, not a cross-fade: a cross-fade (`h*(1-s) + fiber*s`) mutes
  // the base grain by `s` *everywhere*, including the vast majority of
  // pixels a sparse fiber layer doesn't reach at all (fiber=0 there),
  // which read as flatter overall rather than "fibrous" — added on top
  // instead, the base grain stays exactly as present as before and fiber
  // strands read as ridges layered over it, closer to how a felted fiber
  // structure actually sits under a finer surface grain.
  let combined = h
  if (seamless && cfg.fiberStrength > 0) {
    const cellsPerBaseUnit = cfg.fiberPeriod / scale
    const fiber = fiberContribution(
      uvx * cellsPerBaseUnit, uvy * cellsPerBaseUnit, cfg.fiberPeriod, cfg.fiberHalfLen, cfg.fiberWidth,
    )
    combined = h + fiber * cfg.fiberStrength
  }

  return Math.pow(clampNum(combined, 0, 1), 1 / contrast)
}

// ─── Rough-paper fiber-variant exploration (dev-only comparison) ──────────
// 10 candidate replacements for variant #2's fiber layer above (which is
// what's actually shipping right now) — rough paper only for now, wired up
// behind the Settings panel's "Paper grain variant" dev control (see
// featureFlags.ts's getPaperGrainVariant / SettingsPanel / bakePaperTextures
// --rough-variants). First prototyped as a throwaway HTML comparison with
// no tiling requirement; every variant here is re-derived to stay exactly
// seamless, since these bake to real REPEAT textures the app loads.

function fiberLayer(uvx: number, uvy: number, fiberPeriod: number, halfLen: number, width: number): number {
  const cellsPerBaseUnit = fiberPeriod / PAPER_GRAIN_CONFIGS.rough.scale
  return fiberContribution(uvx * cellsPerBaseUnit, uvy * cellsPerBaseUnit, fiberPeriod, halfLen, width)
}

// Seamless Worley/cellular distance field (nearest scattered point, jittered
// within its own cell) — same integer-modulus hash-key wrap fiberContribution
// uses, just for point distance instead of line-segment distance.
function worleyLayer(uvx: number, uvy: number, period: number, jitter: number): number {
  const cellsPerBaseUnit = period / PAPER_GRAIN_CONFIGS.rough.scale
  const cx = uvx * cellsPerBaseUnit, cy = uvy * cellsPerBaseUnit
  const cellX = Math.floor(cx), cellY = Math.floor(cy)
  let best = 999
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = glslMod(cellX + dx, period), gy = glslMod(cellY + dy, period)
      const px = cellX + dx + 0.5 + jitter * (hash(gx, gy) - 0.5)
      const py = cellY + dy + 0.5 + jitter * (hash(gx + 19.1, gy + 7.3) - 0.5)
      best = Math.min(best, Math.hypot(cx - px, cy - py))
    }
  }
  return clampNum(best, 0, 1)
}

// A from-scratch 3-octave fbm with *integer* frequency ratios (1x, 2x, 3x)
// and independently-wrappable X/Y periods — deliberately NOT the shared
// `fbm` above, whose octave frequencies (2.1, 2.1², 2.1³) are snapped
// against one shared basePeriod for both axes. Stretching only one axis
// before feeding that fbm would need every fractional-ratio octave's own
// wrap period to scale by the same stretch factor too, which doesn't land
// on an integer in general — breaking exact seamlessness in the stretched
// axis. Integer ratios sidestep that entirely: octave k's own
// (periodX*k, periodY*k) pair is exactly what its (px*k, py*k) sample
// needs to wrap correctly under a full-period shift in *either* axis,
// independently of the other.
function anisoFbm(px: number, py: number, periodX: number, periodY: number, gain: number): number {
  let v = 0, a = 0.5, s = 0
  for (const k of [1, 2, 3]) {
    v += a * vnoise(px * k, py * k, periodX * k, periodY * k, true)
    s += a; a *= gain
  }
  return v / s
}

interface RoughVariant {
  label: string
  /** Raw (pre-contrast) height — same (fragX, fragY, resW, resH) convention
   *  as paperHeight, always seamless. */
  rawHeight(fragX: number, fragY: number, resW: number, resH: number): number
}

function roughBaseHeight(uvx: number, uvy: number): number {
  const { scale, gain, warp } = PAPER_GRAIN_CONFIGS.rough
  const qx = fbm(uvx, uvy, scale, gain, true)
  const qy = fbm(uvx + 3.7, uvy + 5.4, scale, gain, true)
  return fbm(uvx + warp * qx, uvy + warp * qy, scale, gain, true)
}

function roughUv(fragX: number, fragY: number, resW: number, resH: number): { uvx: number; uvy: number } {
  const { scale } = PAPER_GRAIN_CONFIGS.rough
  return { uvx: (fragX / resW) * scale, uvy: (fragY / resH) * scale }
}

export const ROUGH_VARIANTS: readonly RoughVariant[] = [
  {
    label: 'Base fBm (no fiber)',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      return roughBaseHeight(uvx, uvy)
    },
  },
  {
    label: 'Capsules · moderate (current)',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const h = roughBaseHeight(uvx, uvy)
      const f = fiberLayer(uvx, uvy, 20, 0.75, 0.18)
      return h + f * 0.45
    },
  },
  {
    label: 'Capsules · dense/thin',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const h = roughBaseHeight(uvx, uvy)
      const f = fiberLayer(uvx, uvy, 58, 0.4, 0.08)
      return h + f * 0.5
    },
  },
  {
    label: 'Capsules · bold',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const h = roughBaseHeight(uvx, uvy)
      const f = fiberLayer(uvx, uvy, 10, 0.9, 0.35)
      return h + f * 0.6
    },
  },
  {
    label: 'Capsules · cross-fade blend',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const h = roughBaseHeight(uvx, uvy)
      const f = fiberLayer(uvx, uvy, 20, 0.75, 0.18)
      return h * 0.55 + f * 0.45
    },
  },
  {
    label: 'Horizontal streak',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const { scale, gain } = PAPER_GRAIN_CONFIGS.rough
      const stretch = 4
      return anisoFbm(uvx, uvy * stretch, scale, scale * stretch, gain)
    },
  },
  {
    label: 'Patchy direction',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const { scale, gain } = PAPER_GRAIN_CONFIGS.rough
      const stretch = 4
      const horiz = anisoFbm(uvx, uvy * stretch, scale, scale * stretch, gain)
      const vert  = anisoFbm(uvx * stretch, uvy, scale * stretch, scale, gain)
      const mix = vnoise(uvx, uvy, scale, scale, true)
      return lerp(horiz, vert, mix)
    },
  },
  {
    label: 'Two-scale capsules',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const h = roughBaseHeight(uvx, uvy)
      const coarse = fiberLayer(uvx, uvy, 10, 0.8, 0.3)
      const fine = fiberLayer(uvx, uvy, 58, 0.35, 0.07)
      return h + coarse * 0.35 + fine * 0.3
    },
  },
  {
    label: 'Worley mottle',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const h = roughBaseHeight(uvx, uvy)
      const w = worleyLayer(uvx, uvy, 20, 0.9)
      return h * 0.4 + (1 - w) * 0.6
    },
  },
  {
    label: 'Patchy + capsules',
    rawHeight(fragX, fragY, resW, resH) {
      const { uvx, uvy } = roughUv(fragX, fragY, resW, resH)
      const { scale, gain } = PAPER_GRAIN_CONFIGS.rough
      const stretch = 3
      const horiz = anisoFbm(uvx, uvy * stretch, scale, scale * stretch, gain)
      const vert  = anisoFbm(uvx * stretch, uvy, scale * stretch, scale, gain)
      const mix = vnoise(uvx, uvy, scale, scale, true)
      const flow = lerp(horiz, vert, mix)
      const f = fiberLayer(uvx, uvy, 20, 0.7, 0.16)
      return flow + f * 0.35
    },
  },
  {
    label: 'Flat (no texture)',
    // Constant everywhere — no fbm, no fiber, nothing. Both the blank-paper
    // tint and paperCatch end up spatially uniform: a zero height-gradient
    // makes paperCatchValue's (h-hDx)/(h-hDy) terms exactly 0, which its
    // own directionalHit formula maps to a flat, neutral 0.5 — not the
    // formula's floor or ceiling, just what falls out naturally with no
    // gradient to amplify. The graphite-grain "Solid" mode's own paper-side
    // counterpart, for isolating the stroke's own grain from paper bumps.
    rawHeight() { return 0.5 },
  },
]

export function paperHeightForRoughVariant(
  fragX: number, fragY: number, resW: number, resH: number, variantIndex: number,
): number {
  const raw = ROUGH_VARIANTS[variantIndex].rawHeight(fragX, fragY, resW, resH)
  return Math.pow(clampNum(raw, 0, 1), 1 / PAPER_GRAIN_CONFIGS.rough.contrast)
}

// Mirrors paperCatchValue exactly (see its own comment for the full
// reasoning), just against paperHeightForRoughVariant instead of the
// shipped paperHeight/cfg pair.
export function paperCatchValueForRoughVariant(
  fragX: number, fragY: number, resW: number, resH: number, variantIndex: number,
): number {
  const h   = paperHeightForRoughVariant(fragX,     fragY,     resW, resH, variantIndex)
  const hDx = paperHeightForRoughVariant(fragX + 1, fragY,     resW, resH, variantIndex)
  const hDy = paperHeightForRoughVariant(fragX,     fragY + 1, resW, resH, variantIndex)

  const normalScale = lerp(2.0, 10.0, PAPER_ROUGHNESS.rough)
  const nx = (h - hDx) * normalScale
  const ny = (h - hDy) * normalScale

  const tiltDirX = 0.6, tiltDirY = 0.8
  const dot = nx * tiltDirX + ny * tiltDirY
  const directionalHit = Math.max(0, dot * 3.0 + 0.5)
  return clampNum(directionalHit, 0, 1)
}

// How much graphite a surface point catches, from the paper's own local
// surface normal — precomputed here, at bake time, in plain JS double
// precision, rather than in DAB_FRAG at runtime on the GPU (where it used
// to live). That move was forced by a real cross-device bug: this formula
// takes (h - hDx) — two very close values — and amplifies the difference
// by normalScale (up to 10x) and then another 3x, a ~30x total gain. A
// live cross-device comparison (same room, same synced stroke data, same
// baked paper bytes on both devices — confirmed byte-identical) showed the
// stroke's own graphite deposit diverging wildly between a desktop and a
// tablet despite that. The likely mechanism: 'precision highp float' in a
// WebGL1/GLSL-ES-1.0 fragment shader is a *request*, not a guarantee —
// many mobile GPUs silently fall back to mediump there, and subtracting
// two close mediump values (catastrophic cancellation) loses most of its
// significant bits before the 30x amplification even starts. No amount of
// fixing individual precision sources (this function had two real ones
// fixed first — see shaders.ts's DAB_FRAG history) closes this class of
// bug for good, because *any* GPU-side floating-point computation run
// through this much gain is liable to diverge across vendors. Baking the
// final, already-amplified result once (here) and having DAB_FRAG just
// read it back via texture2D removes the GPU from this computation's
// critical path entirely — the same principle the whole paper-texture
// redesign is built on, just applied one level deeper.
//
// `x`/`y` use the exact same (fragX, fragY, resW, resH) convention as
// paperHeight — the 1-unit offset for hDx/hDy is one full bake texel,
// matching DAB_FRAG's own PAPER_TEXEL (1.0/PAPER_BAKE_RESOLUTION) exactly
// (a fragX shift of 1 out of resW=PAPER_BAKE_RESOLUTION is a UV shift of
// 1/PAPER_BAKE_RESOLUTION — see paperHeight's own uvx formula).
export function paperCatchValue(
  fragX: number, fragY: number, resW: number, resH: number,
  cfg: PaperGrainConfig, roughness: number,
): number {
  const h   = paperHeight(fragX,     fragY,     resW, resH, cfg, true)
  const hDx = paperHeight(fragX + 1, fragY,     resW, resH, cfg, true)
  const hDy = paperHeight(fragX,     fragY + 1, resW, resH, cfg, true)

  const normalScale = lerp(2.0, 10.0, roughness)
  const nx = (h - hDx) * normalScale
  const ny = (h - hDy) * normalScale

  // Fixed reference "tilt direction" (#163) — deliberately not a real
  // pen's tilt, just a constant so every stroke gets the same sharp
  // directional response regardless of input device (mouse/finger/stylus).
  const tiltDirX = 0.6, tiltDirY = 0.8
  const dot = nx * tiltDirX + ny * tiltDirY
  const directionalHit = Math.max(0, dot * 3.0 + 0.5)
  return clampNum(directionalHit, 0, 1)
}
