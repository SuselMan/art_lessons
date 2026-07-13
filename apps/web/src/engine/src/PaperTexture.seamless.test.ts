// #141 follow-up: making the paper texture GL_REPEAT-wrapped (see
// PaperTexture.ts/createPaperTexture's `repeat` param) only wraps the
// *sample coordinate* — it does nothing to make PAPER_GEN_FRAG's
// underlying noise (hash/vnoise/fbm) itself periodic over any domain, so a
// repeated texture still showed a hard seam every time it tiled (measured:
// up to a ~0.26 jump in the 0..1 height value at the wrap boundary for the
// rough/1024px/scale=580 case). Fixed by snapping each fbm octave's
// frequency to an integer cell count and wrapping vnoise's own grid-index
// lookups by that count (see shaders.ts's seamlessRatio/vnoise/fbm) so the
// noise is *exactly* periodic over the texture's own size once
// u_seamless is on.
//
// MockGL deliberately doesn't rasterize PAPER_GEN_FRAG's noise generation
// at all (see mockGL.ts's module docstring), so there is no way to
// exercise the real math through an engine-level test. This is instead a
// plain-TS port of PAPER_GEN_FRAG (src/shaders.ts) — same constants, same
// operation order, no WebGL/MockGL involved — verified against the actual
// GLSL source by inspection; keep the two in sync by hand if either
// changes (no shared implementation is possible: one is GLSL, one is a
// test-only TS mirror).
import { describe, expect, it } from 'vitest'

// Mirrors CONFIGS in PaperTexture.ts — duplicated (not imported) so this
// test still catches an accidental drift in either file.
const CONFIGS = {
  rough:   { scale: 580,  gain: 0.18,  contrast: 0.3,   warp: 0.15 },
  smooth:  { scale: 780,  gain: 0.135, contrast: 0.225, warp: 0.09 },
  bristol: { scale: 1050, gain: 0.1,   contrast: 0.17,  warp: 0.05 },
}

const INFINITE_PAPER_TEX_PIXELS = 1024 // mirrors engine/index.ts's own constant

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

// Artifact-free hash — 1:1 port of PAPER_GEN_FRAG's hash(vec2).
function hash(px: number, py: number): number {
  const hx = 17.0 * fracPos(px * 0.3183099 + 0.11)
  const hy = 17.0 * fracPos(py * 0.3183099 + 0.17)
  return fracPos(hx * hy * (hx + hy))
}

// 1:1 port of PAPER_GEN_FRAG's vnoise(vec2 p, vec2 period) — `period` is
// only consulted when `seamless` is true (mirrors u_seamless > 0.5).
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

// 1:1 port of PAPER_GEN_FRAG's seamlessRatio.
function seamlessRatio(ratio: number, basePeriod: number, seamless: boolean): number {
  if (seamless) return Math.floor(basePeriod * ratio + 0.5) / basePeriod
  return ratio
}

// 1:1 port of PAPER_GEN_FRAG's fbm(vec2 p, float basePeriod).
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

// 1:1 port of PAPER_GEN_FRAG's main(): uv = fragCoord/resolution*scale,
// domain-warp via q, fbm again on the warped point, contrast curve last.
function paperHeight(
  fragX: number, fragY: number, resW: number, resH: number,
  scale: number, gain: number, contrast: number, warp: number, seamless: boolean,
): number {
  const uvx = (fragX / resW) * scale
  const uvy = (fragY / resH) * scale

  const qx = fbm(uvx + 0.0, uvy + 0.0, scale, gain, seamless)
  const qy = fbm(uvx + 3.7, uvy + 5.4, scale, gain, seamless)

  const h = fbm(uvx + warp * qx, uvy + warp * qy, scale, gain, seamless)
  return Math.pow(clampNum(h, 0, 1), 1 / contrast)
}

// Literal, unmodified port of the *original* (pre-#141) PAPER_GEN_FRAG —
// no periods, no seamlessRatio, just the plain hash/vnoise/fbm this file
// had before this fix. Used only to prove seamless=false reduces to
// exactly this (see the "bounded rooms unchanged" describe block below).
function vnoiseOriginal(px: number, py: number): number {
  const ix = Math.floor(px), iy = Math.floor(py)
  const ux = smooth01(fracPos(px)), uy = smooth01(fracPos(py))
  return lerp(
    lerp(hash(ix, iy), hash(ix + 1, iy), ux),
    lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux),
    uy,
  )
}
function fbmOriginal(px: number, py: number, gain: number): number {
  let v = 0, a = 0.5, s = 0, f = 1
  v += a * vnoiseOriginal(px * f, py * f); s += a; a *= gain; f *= 2.1
  v += a * vnoiseOriginal(px * f, py * f); s += a; a *= gain; f *= 2.1
  v += a * vnoiseOriginal(px * f, py * f); s += a; a *= gain; f *= 2.1
  v += a * vnoiseOriginal(px * f, py * f); s += a
  return v / s
}
function paperHeightOriginal(
  fragX: number, fragY: number, resW: number, resH: number,
  scale: number, gain: number, contrast: number, warp: number,
): number {
  const uvx = (fragX / resW) * scale
  const uvy = (fragY / resH) * scale
  const qx = fbmOriginal(uvx + 0.0, uvy + 0.0, gain)
  const qy = fbmOriginal(uvx + 3.7, uvy + 5.4, gain)
  const h = fbmOriginal(uvx + warp * qx, uvy + warp * qy, gain)
  return Math.pow(clampNum(h, 0, 1), 1 / contrast)
}

const RES = INFINITE_PAPER_TEX_PIXELS
// Sample points spread across the texture, including ones deliberately
// close to 0/RES (where a wrap-related bug would be most likely to hide)
// and a couple of interior points for good measure.
const SAMPLE_POINTS: Array<[number, number]> = [
  [0.5, 0.5], [300.5, 700.5], [1023.5, 50.5], [512.5, 512.5], [777.5, 333.5],
]

describe('paper noise seamlessness (#141 follow-up)', () => {
  describe('seamless (infinite-room) mode is exactly periodic', () => {
    for (const [name, cfg] of Object.entries(CONFIGS)) {
      it(`${name}: height is invariant under a full-period shift in X`, () => {
        for (const [x, y] of SAMPLE_POINTS) {
          const h1 = paperHeight(x, y, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, true)
          const h2 = paperHeight(x + RES, y, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, true)
          expect(Math.abs(h1 - h2)).toBeLessThan(1e-8)
        }
      })

      it(`${name}: height is invariant under a full-period shift in Y and under a 2x period shift`, () => {
        const [x, y] = [100.5, 400.5]
        const base = paperHeight(x, y, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, true)
        const yShift = paperHeight(x, y + RES, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, true)
        const xShift2 = paperHeight(x + 2 * RES, y, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, true)
        expect(Math.abs(base - yShift)).toBeLessThan(1e-8)
        expect(Math.abs(base - xShift2)).toBeLessThan(1e-8)
      })
    }
  })

  // The reviewer's own numeric check (before this fix landed) compared the
  // height at the texture's leftmost column to its rightmost column, same
  // row, and found a hard jump (up to 0.26 in the 0..1 range). That's the
  // *visible* symptom, but it isn't a reliable pass/fail metric on its
  // own: column 0 and column RES-1 are only RES-1 apart, one pixel short
  // of a true full period, so even a correctly-fixed texture can show a
  // non-tiny left/right diff there — this noise's contrast curve
  // (pow(h, 1/contrast)) amplifies ordinary adjacent-pixel variation
  // enough that "near zero" isn't a safe absolute threshold (verified
  // numerically: an interior adjacent-pixel diff of ~0.27 occurs even
  // after the fix, for this same rough/580 config). What IS reliable, and
  // asserted above, is exact invariance under a true full-period shift.
  // This test instead reproduces the reviewer's own comparison directly
  // and checks it *improved*, row by row, rather than asserting an
  // absolute bound — a relative check robust to that same variance.
  it('seamless mode narrows the left-column/right-column gap the reviewer measured, at every row checked', () => {
    const cfg = CONFIGS.rough
    for (const row of [0, 200, 500, 800]) {
      const leftOld  = paperHeight(0.5, row + 0.5, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, false)
      const rightOld = paperHeight(RES - 0.5, row + 0.5, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, false)
      const leftNew  = paperHeight(0.5, row + 0.5, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, true)
      const rightNew = paperHeight(RES - 0.5, row + 0.5, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, true)
      const diffOld = Math.abs(leftOld - rightOld)
      const diffNew = Math.abs(leftNew - rightNew)
      expect(diffNew).toBeLessThan(diffOld)
    }
  })

  it('non-seamless (bounded-room) mode is NOT periodic — demonstrates the bug this fix targets', () => {
    // A texture that already happened to be exactly periodic wouldn't need
    // fixing — this confirms the *un-fixed* formula genuinely has the
    // seam (a real, non-negligible mismatch a full period apart), so the
    // periodicity asserted above is this fix actually doing something,
    // not a property the noise already had for free.
    const cfg = CONFIGS.rough
    let maxDiff = 0
    for (const [x, y] of SAMPLE_POINTS) {
      const h1 = paperHeight(x, y, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, false)
      const h2 = paperHeight(x + RES, y, RES, RES, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, false)
      maxDiff = Math.max(maxDiff, Math.abs(h1 - h2))
    }
    expect(maxDiff).toBeGreaterThan(0.01)
  })

  describe('bounded rooms: u_seamless off reduces to exactly the pre-#141 formula', () => {
    for (const [name, cfg] of Object.entries(CONFIGS)) {
      it(`${name}: matches the original (un-seamed) hash/vnoise/fbm bit-for-bit at every sample point`, () => {
        // Bounded rooms are generated at canvas size (not RES) and never
        // wrap — a couple of representative canvas sizes, not just RES.
        for (const [resW, resH] of [[RES, RES], [1057, 793], [37, 51]] as Array<[number, number]>) {
          for (const [x, y] of SAMPLE_POINTS) {
            const fx = Math.min(x, resW - 0.5)
            const fy = Math.min(y, resH - 0.5)
            const fixed = paperHeight(fx, fy, resW, resH, cfg.scale, cfg.gain, cfg.contrast, cfg.warp, false)
            const original = paperHeightOriginal(fx, fy, resW, resH, cfg.scale, cfg.gain, cfg.contrast, cfg.warp)
            expect(fixed).toBe(original)
          }
        }
      })
    }
  })
})
