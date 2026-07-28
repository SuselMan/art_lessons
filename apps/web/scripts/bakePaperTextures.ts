// Offline bake of every shipped paper. Each one is a window onto a
// photographed sheet (../../../assets/paper-sources/, see its README),
// resampled to one 2048² tile and written as a gzip-compressed
// LUMINANCE_ALPHA byte grid to public/paper/ — R = height, for the
// blank-paper tint; A = the already-amplified graphite-catch response, for
// the stroke itself.
//
// Two properties this pipeline exists to hold:
//
//  - Every client renders identical bytes. They are produced once, here, and
//    fetched raw — no <img>/texImage2D-from-image-element step, so no
//    browser image-decode/colour-management pipeline is left to diverge
//    across devices (see paperLoader.ts). Baking replaced #141's
//    live-per-client GPU bake, which was the actual source of that drift.
//  - The catch channel never touches a GPU. It amplifies a difference of two
//    close values by ~30x, and running that through a fragment shader's
//    "highp" (a request, not a guarantee — many mobile GPUs quietly fall back
//    to mediump) made the same stroke land differently on a desktop and a
//    tablet. Computed here in plain JS doubles, DAB_FRAG just reads it back.
//
// (#333) The grain used to be procedural — a seamless-noise fBm, nine types
// across a coarseness × character grid. It was provably identical everywhere
// and still did not read as paper; a photographed sheet does. What survives
// of that machinery is this file's output format, which did not need to
// change at all.
//
// Output is NOT committed (the *source* is instead — see the README above).
// The bake is byte-reproducible, so CI regenerates it on every build and the
// binary blobs never enter git history. Run locally with `npm run bake:paper`
// when iterating.
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { PAPER_GRAIN_TYPES, type PaperGrainType } from '@grafetto/shared'

import { PAPER_BAKE_RESOLUTION } from '../src/engine/src/paperConstants.js'
import { writePaperAsset } from './paperAssetIO.js'

const RES = PAPER_BAKE_RESOLUTION
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '../public/paper')
const sourcePath = join(here, '../../../assets/paper-sources/paper001-displacement.jpg')

/** What separates the three papers: how much of the sheet is squeezed into
 *  one tile, in source pixels. A bigger window packs more paper into the same
 *  2048 texels, so the grain reads finer.
 *
 *  Chosen by eye against a real canvas, not derived — the sheet's physical
 *  size is unrecorded (see the source README). `coarse` is the widest window
 *  that still fits inside the sheet; past that the window wraps around it,
 *  which costs a visible repeat of the sheet's own motif and is why `fine`
 *  is the practical ceiling for this source rather than a chosen stopping
 *  point.
 *
 *  `catchGain` scales the tilt-direction slope before the same
 *  `max(0, dot*3 + 0.5)` the procedural bake used. It has to be per-window
 *  because downsampling flattens slopes: the same sheet at a 3.4x reduction
 *  has far gentler texel-to-texel differences than at 0.85x, and a single
 *  gain would leave one end of the range with no tooth and the other
 *  saturated. These three were measured — each is what made that window's
 *  slope spread match the paper it replaced. */
const PAPERS: Record<PaperGrainType, { window: number; catchGain: number }> = {
  coarse: { window: 2402, catchGain: 2.07 },
  medium: { window: 4100, catchGain: 1.50 },
  fine:   { window: 7000, catchGain: 1.17 },
}

/** Width of the wrap-around cross-fade, in samples. Applied to the sheet
 *  (when a window wraps around it) and always to the finished tile. */
const SEAM_MARGIN = 128

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function mean(a: Float64Array): number {
  let sum = 0
  for (const v of a) sum += v
  return sum / a.length
}

/** Maps the [lo, hi] percentile range onto 0..1. Percentiles rather than
 *  min/max because a JPEG-compressed sheet has ringing outliers at both ends
 *  that would otherwise eat most of the range and flatten everything else. */
function normalizeByPercentile(a: Float64Array, lo = 0.005, hi = 0.995): void {
  const sorted = Float64Array.from(a).sort()
  const vLo = sorted[Math.floor(lo * (sorted.length - 1))]
  const vHi = sorted[Math.floor(hi * (sorted.length - 1))]
  const span = Math.max(1e-6, vHi - vLo)
  for (let i = 0; i < a.length; i++) a[i] = clamp01((a[i] - vLo) / span)
}

/** Makes a grid wrap by cross-fading each edge into the opposite one.
 *
 *  Needed twice. On the *sheet*, because it does not tile despite being
 *  published as seamless — repeating it to fill a window larger than itself
 *  put a hard vertical seam down the middle of the baked tile and horizontal
 *  ones at the quarter lines. On our own tile, because a square window cut
 *  out of a non-square sheet is never tileable even if the sheet were:
 *  taking 2402 columns out of 4096 discards exactly the continuity a wrap
 *  needs.
 *
 *  The blend is variance-compensated (divided by sqrt(t² + (1-t)²) rather
 *  than left as a plain lerp): averaging two independent noise fields of
 *  equal variance yields ~0.71x the variance at the midpoint, which on a
 *  grain texture reads as a visibly *smoother* band along the seam — an
 *  artifact as obvious as the discontinuity it replaces. */
function makeSeamless(a: Float64Array, w: number, h: number, margin: number): void {
  const m = mean(a)
  const blend = (i: number, j: number, t: number) => {
    const norm = Math.sqrt(t * t + (1 - t) * (1 - t))
    a[i] = m + ((a[i] - m) * (1 - t) + (a[j] - m) * t) / norm
  }
  const mx = Math.min(margin, Math.floor(w / 2)), my = Math.min(margin, Math.floor(h / 2))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < mx; x++) {
      // 0.5 at the very edge falling to 0 at the margin's inner end: the two
      // sides meet halfway, so the wrap is continuous.
      const t = 0.5 * (1 - x / mx)
      blend(y * w + x, y * w + (w - 1 - x), t)
      blend(y * w + (w - 1 - x), y * w + x, t)
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < my; y++) {
      const t = 0.5 * (1 - y / my)
      blend(y * w + x, (h - 1 - y) * w + x, t)
      blend((h - 1 - y) * w + x, y * w + x, t)
    }
  }
}

/** Solves for the display gamma numerically, for mean(h^γ) = 0.5, by
 *  bisection.
 *
 *  The blank-paper tint is a symmetric ±0.035 around the paper colour (see
 *  shaders.ts's paperToneGLSL), so a height distribution parked off the
 *  midpoint reads as uniformly too-dark or too-light rather than as grain.
 *  Solved per paper rather than tabulated because each window has its own
 *  distribution. Not log(0.5)/log(mean h) — that centres the mean *raised
 *  to* γ, which by Jensen's inequality is a different quantity. */
function solveDisplayGamma(a: Float64Array): number {
  let lo = 0.01, hi = 8
  for (let iter = 0; iter < 60; iter++) {
    const g = (lo + hi) / 2
    let sum = 0
    for (const v of a) sum += Math.pow(v, g)
    if (sum / a.length > 0.5) lo = g; else hi = g
  }
  return (lo + hi) / 2
}

/** Reads one square window of the sheet into a 0..1 grid of RES².
 *
 *  Resampled here rather than by sharp, which hands back 8-bit no matter what
 *  it was given. That round trip is fatal for the catch channel specifically:
 *  once a window is downsampled, neighbouring texels of the result differ by
 *  well under one 8-bit level, so the finite difference driving catch
 *  quantises to a handful of discrete values and the amplification turns
 *  those steps into hard scanline banding across the whole tile. Averaging
 *  the source pixels that fall inside each output texel keeps the sub-level
 *  detail the difference needs. */
async function readWindow(window: number): Promise<Float64Array> {
  const meta = await sharp(sourcePath).metadata()
  const srcW = meta.width!, srcH = meta.height!
  const grey = await sharp(sourcePath).greyscale().toColourspace('b-w').raw().toBuffer()
  const source = Float64Array.from(grey, v => v / 255)

  if (window > Math.min(srcW, srcH)) makeSeamless(source, srcW, srcH, SEAM_MARGIN)

  const field = new Float64Array(RES * RES)
  const left = (srcW - window) / 2, top = (srcH - window) / 2
  const step = window / RES
  // Sampled through a modulo rather than out of a materialised tiling: the
  // widest window would otherwise need a ~470 MB intermediate for no gain.
  const at = (sx: number, sy: number) =>
    source[(((sy % srcH) + srcH) % srcH) * srcW + (((sx % srcW) + srcW) % srcW)]

  if (step >= 1) {
    // Area average — a box over exactly the footprint of one output texel,
    // with no lanczos ringing to be mistaken for grain.
    for (let oy = 0; oy < RES; oy++) {
      const y0 = top + oy * step, y1 = y0 + step
      for (let ox = 0; ox < RES; ox++) {
        const x0 = left + ox * step, x1 = x0 + step
        let sum = 0, weight = 0
        for (let sy = Math.floor(y0); sy < y1; sy++) {
          const wy = Math.min(sy + 1, y1) - Math.max(sy, y0)
          for (let sx = Math.floor(x0); sx < x1; sx++) {
            const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0))
            sum += at(sx, sy) * w
            weight += w
          }
        }
        field[oy * RES + ox] = sum / weight
      }
    }
  } else {
    // Bilinear for a window smaller than the tile — there is no detail to
    // average, only samples to interpolate between.
    for (let oy = 0; oy < RES; oy++) {
      const fy = top + oy * step, y0 = Math.floor(fy), ty = fy - y0
      for (let ox = 0; ox < RES; ox++) {
        const fx = left + ox * step, x0 = Math.floor(fx), tx = fx - x0
        const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx
        const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
        field[oy * RES + ox] = a * (1 - ty) + b * ty
      }
    }
  }

  normalizeByPercentile(field)
  makeSeamless(field, RES, RES, SEAM_MARGIN)
  // The seam blend's variance compensation can push a texel just past either
  // end of the range; left unclamped those feed Math.pow a negative base in
  // solveDisplayGamma, which quietly poisons the whole solve with NaN.
  for (let i = 0; i < field.length; i++) field[i] = clamp01(field[i])
  return field
}

const wrap = (v: number, n: number) => (v + n) % n

/** Graphite catch: the paper's slope along a fixed reference "tilt
 *  direction", amplified and clamped.
 *
 *  The direction (#163) is deliberately not a real pen's tilt, just a
 *  constant, so every stroke gets the same sharp directional response
 *  regardless of input device. The 1-texel offsets match DAB_FRAG's own
 *  sampling exactly. */
function catchAt(field: Float64Array, x: number, y: number, gain: number): number {
  const h = field[y * RES + x]
  const hDx = field[y * RES + wrap(x + 1, RES)]
  const hDy = field[wrap(y + 1, RES) * RES + x]
  const dot = ((h - hDx) * 0.6 + (h - hDy) * 0.8) * gain
  return clamp01(Math.max(0, dot * 3.0 + 0.5))
}

mkdirSync(outDir, { recursive: true })

// `--if-missing` is what makes this safe to hang off `prebuild`: a full bake
// is minutes, far too long to pay on every `npm run build`. CI caches
// public/paper keyed on a hash of the bake inputs, so on a cache hit the
// files are already there and this exits immediately. Running the script
// directly (npm run bake:paper) always re-bakes, which is what you want while
// iterating.
const skipIfPresent = process.argv.includes('--if-missing')
const expected = PAPER_GRAIN_TYPES.flatMap(t => [`${t}.paper`, `${t}.preview`])

if (skipIfPresent && expected.every(f => existsSync(join(outDir, f)))) {
  console.log(`paper: ${PAPER_GRAIN_TYPES.length} textures already baked, skipping`)
  process.exit(0)
}

for (const type of PAPER_GRAIN_TYPES) {
  const { window, catchGain } = PAPERS[type]
  const field = await readWindow(window)

  const gamma = solveDisplayGamma(field)
  const height = new Float64Array(RES * RES)
  const catchGrid = new Float64Array(RES * RES)
  for (let y = 0; y < RES; y++) {
    for (let x = 0; x < RES; x++) {
      const i = y * RES + x
      height[i] = Math.pow(field[i], gamma)
      catchGrid[i] = catchAt(field, x, y, catchGain)
    }
  }

  console.log(`${type}: window ${window} (${(RES / window).toFixed(2)}x resample), display gamma ${gamma.toFixed(3)}`)
  writePaperAsset(outDir, type, height, catchGrid, RES)
}

console.log(`\n${PAPER_GRAIN_TYPES.length} papers baked into ${outDir}`)
console.log("('flat' needs no asset at all — it has no grain to bake.)")
