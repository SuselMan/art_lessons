// Experiment: bake a paper asset from a *scanned* height map instead of the
// procedural fBm (see paperNoise.ts). Everything downstream of the height
// field is deliberately unchanged — same 2048² tile, same interleaved
// LUMINANCE_ALPHA bytes, same gzip, same loader, same shaders — so this
// swaps exactly one variable (where the height comes from) and nothing else.
// Cross-device determinism is unaffected by construction: the bytes are still
// produced once here and shipped identically to every client.
//
// Usage:
//   npm run bake:paper-scan -- --displacement <path> [--as coarse-fbm,...]
//                              [--crop <px|full>] [--highpass <sigma>]
//                              [--catch-gain <k>] [--seam <px>]
//
// Overwrites the named types in public/paper/ in place, so the paper picker
// needs no changes to compare against the remaining procedural ones — pick
// the overwritten card, then a neighbouring untouched one. Nothing here is
// committed (public/paper is gitignored, see bakePaperTextures.ts's header);
// `npm run bake:paper` restores the procedural originals.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { defaultPaperColor, PAPER_GRAIN_TYPES, type PaperGrainType } from '@grafetto/shared'

import {
  PAPER_BAKE_RESOLUTION, paperDisplayHeight, paperGridHeight, paperRoughnessOf,
} from '../src/engine/src/paperNoise.js'

import { writePaperAsset } from './paperAssetIO.js'

const RES = PAPER_BAKE_RESOLUTION
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '../public/paper')
const compareDir = join(here, '../../../temp')

// ---------------------------------------------------------------- arguments

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const displacementPath = arg('displacement')
if (!displacementPath) {
  console.error('--displacement <path to height/displacement map> is required')
  process.exit(1)
}

const types = (arg('as') ?? 'medium-fbm').split(',').map(t => t.trim()) as PaperGrainType[]
for (const t of types) {
  if (!PAPER_GRAIN_TYPES.includes(t)) {
    console.error(`unknown paper type '${t}' — expected one of ${PAPER_GRAIN_TYPES.join(', ')}`)
    process.exit(1)
  }
}

const cropArg = arg('crop') ?? 'full'
// A scan carries real low-frequency structure (cloudiness, fibre clumps,
// press marks). On the *tint* path that can read as genuine paper, but the
// catch path repeats the tile every PAPER_WORLD_SIZE (157) screen pixels,
// where anything that large becomes an obvious repeating motif instead. 0 =
// keep the source untouched, which is the honest first look; raise it to
// subtract a blur of this sigma and keep only grain finer than it.
const highpassSigma = Number(arg('highpass') ?? 0)
// Width of the wrap-around cross-fade that re-tiles the crop (see
// makeSeamless). Only 0 is meaningful if the crop happens to be the source's
// own full tileable extent, which a square crop of a non-square source never
// is.
const seamMargin = Number(arg('seam') ?? 128)
const catchGainOverride = arg('catch-gain') ? Number(arg('catch-gain')) : null

// ------------------------------------------------------------------ helpers

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function stats(a: Float64Array): { mean: number, std: number } {
  let sum = 0
  for (const v of a) sum += v
  const mean = sum / a.length
  let sq = 0
  for (const v of a) sq += (v - mean) * (v - mean)
  return { mean, std: Math.sqrt(sq / a.length) }
}

/** Maps the [lo, hi] percentile range onto 0..1. Percentiles rather than
 *  min/max because a JPEG-compressed scan has ringing outliers at both ends
 *  that would otherwise eat most of the range and flatten everything else. */
function normalizeByPercentile(a: Float64Array, lo = 0.005, hi = 0.995): void {
  const sorted = Float64Array.from(a).sort()
  const vLo = sorted[Math.floor(lo * (sorted.length - 1))]
  const vHi = sorted[Math.floor(hi * (sorted.length - 1))]
  const span = Math.max(1e-6, vHi - vLo)
  for (let i = 0; i < a.length; i++) a[i] = clamp01((a[i] - vLo) / span)
}

/** Makes a grid wrap by cross-fading each edge into the opposite one over
 *  `margin` samples.
 *
 *  Applied twice, for two different reasons. To the *source*, because
 *  ambientCG's Paper001 displacement is not actually tileable despite the
 *  material being sold as seamless — repeating it to fill a window larger
 *  than the sheet put a hard vertical seam down the middle of the baked tile
 *  and horizontal ones at the quarter lines (reproduced, then fixed by this).
 *  And to our own 2048 tile, because a square window cut out of a non-square
 *  sheet is never tileable even if the sheet were: taking 2402 columns out of
 *  4096 discards exactly the continuity a wrap would need.
 *
 *  The blend is variance-compensated (divided by sqrt(w² + (1-w)²) rather
 *  than left as a plain lerp): averaging two independent noise fields of
 *  equal variance yields ~0.71x the variance at the midpoint, which on a
 *  grain texture shows up as a visibly *smoother* band along the seam — an
 *  artifact just as obvious as the discontinuity it replaces, and one #302
 *  (a hard vertical line inside the procedural tile) already proves the eye
 *  picks up at this contrast. */
function makeSeamless(a: Float64Array, w: number, h: number, margin: number): void {
  if (margin <= 0) return
  const { mean } = stats(a)
  const blend = (i: number, j: number, t: number) => {
    const norm = Math.sqrt(t * t + (1 - t) * (1 - t))
    a[i] = mean + ((a[i] - mean) * (1 - t) + (a[j] - mean) * t) / norm
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

/** Solves for the display gamma the same way PAPER_DISPLAY_GAMMA was solved
 *  for the procedural types — numerically, for mean(h^γ) = 0.5, by bisection.
 *  Re-solved here rather than reused because that table was fitted to the
 *  fBm's own distribution, and a scan's is different; the blank-paper tint is
 *  a symmetric ±0.035 around the paper colour, so a distribution parked off
 *  the midpoint reads as uniformly too-dark or too-light rather than as
 *  grain. */
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

const wrap = (v: number, n: number) => (v + n) % n

/** The signed slope along the fixed reference tilt direction — the quantity
 *  paperGridCatch amplifies. Kept as its own step so the scan's version and
 *  the procedural reference can be compared on identical terms. */
function tiltSlope(a: Float64Array, res: number, x: number, y: number): number {
  const h = a[y * res + x]
  const hDx = a[y * res + wrap(x + 1, res)]
  const hDy = a[wrap(y + 1, res) * res + x]
  return (h - hDx) * 0.6 + (h - hDy) * 0.8
}

/** Spread of that slope for a procedural type, sampled on a coarse grid.
 *
 *  This is what calibrates the scan's catch gain. `normalScale` (2..10 by
 *  roughness) was fitted to the fBm's slope distribution, and a scan's is
 *  unrelated — reusing the constant would land the whole tile either at a
 *  flat 0.5 (no tooth at all) or fully saturated. Matching the *spread*
 *  instead means the pencil bites as hard as it does on the procedural paper
 *  of the same coarseness, so the comparison isolates the grain's structure
 *  rather than confounding it with a strength change. */
function proceduralSlopeStd(type: PaperGrainType): number {
  const stride = 8
  const n = Math.floor(RES / stride)
  const normalScale = 2.0 + (10.0 - 2.0) * paperRoughnessOf(type)
  const samples = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * stride + 0.5, y = j * stride + 0.5
      const h = paperGridHeight(type, x, y, RES, RES)
      const hDx = paperGridHeight(type, x + 1, y, RES, RES)
      const hDy = paperGridHeight(type, x, y + 1, RES, RES)
      samples[j * n + i] = ((h - hDx) * 0.6 + (h - hDy) * 0.8) * normalScale
    }
  }
  return stats(samples).std
}

// -------------------------------------------------------------- source load

const meta = await sharp(displacementPath).metadata()
const srcW = meta.width!, srcH = meta.height!
const cropSize = cropArg === 'full' ? Math.min(srcW, srcH) : Number(cropArg)

console.log(`source ${srcW}x${srcH} -> square window ${cropSize} -> ${RES} (${(RES / cropSize).toFixed(2)}x resample)`)
if (cropSize < RES) {
  console.log(
    `  note: upsampling ${(RES / cropSize).toFixed(2)}x — the source has no detail at this ` +
    `frequency, so the grain will read softer than a procedural one`,
  )
}

const grey = await sharp(displacementPath).greyscale().toColourspace('b-w').raw().toBuffer()
const source = Float64Array.from(grey, v => v / 255)

// How far "back" the window can be pulled is what sets the grain's apparent
// size, and a plain crop caps it at the sheet's shorter side (2402 of a
// 4096x2402 source) — which still read too coarse on a real canvas. Past that
// the window wraps around the sheet instead, which needs the sheet itself to
// wrap: it does not, despite the material being sold as seamless, so it gets
// cross-faded first. The remaining cost of going further back is the sheet's
// own motif recurring inside one baked tile, which the matching downsample
// shrinks but does not remove.
const wrapsSource = cropSize > Math.min(srcW, srcH)
if (wrapsSource) {
  makeSeamless(source, srcW, srcH, seamMargin)
  console.log(`  window exceeds the sheet — wrapping it ` +
    `(${(cropSize / srcW).toFixed(1)} x ${(cropSize / srcH).toFixed(1)} repeats inside one baked tile), ` +
    `sheet cross-faded first since it does not tile on its own`)
}

// Resampled here in floating point rather than by sharp, which hands back
// 8-bit no matter what it was given. That round trip is fatal specifically
// for the catch channel: once the window is downsampled, neighbouring texels
// of the result differ by well under one 8-bit level, so the finite
// difference that drives catch quantises to a handful of discrete values and
// the amplification turns those steps into hard scanline banding across the
// whole tile (seen, at 2x and 3.4x, before this was float). Averaging the
// source pixels that fall inside each output texel keeps the sub-level
// detail the difference actually needs.
const field = new Float64Array(RES * RES)
{
  const left = (srcW - cropSize) / 2, top = (srcH - cropSize) / 2
  const step = cropSize / RES
  // Sampled through a modulo rather than out of a materialised tiling: the
  // 3.4x window would otherwise need a ~470 MB intermediate for no gain.
  const at = (sx: number, sy: number) =>
    source[(((sy % srcH) + srcH) % srcH) * srcW + (((sx % srcW) + srcW) % srcW)]
  if (step >= 1) {
    // Area average — also the right filter for the job: a box over exactly
    // the footprint of one output texel, no lanczos ringing to be mistaken
    // for grain.
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
    // Bilinear for windows smaller than the tile — there is no detail to
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
}

if (highpassSigma > 0) {
  const asBytes = Buffer.from(Uint8Array.from(field, v => Math.round(clamp01(v) * 255)))
  const { data: blurred } = await sharp(asBytes, { raw: { width: RES, height: RES, channels: 1 } })
    .blur(highpassSigma)
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < field.length; i++) field[i] = field[i] - blurred[i] / 255 + 0.5
  console.log(`  high-passed at sigma ${highpassSigma}`)
}

normalizeByPercentile(field)
makeSeamless(field, RES, RES, seamMargin)
// The seam blend's variance compensation can push a texel just past either
// end of the range; left unclamped those feed Math.pow a negative base in
// solveDisplayGamma, which quietly poisons the whole solve with NaN.
for (let i = 0; i < field.length; i++) field[i] = clamp01(field[i])

const src = stats(field)
console.log(`  height field: mean ${src.mean.toFixed(3)}, std ${src.std.toFixed(3)}`)

// ------------------------------------------------------------------- bake

mkdirSync(outDir, { recursive: true })
mkdirSync(compareDir, { recursive: true })

let scanSlopeStd = 0
{
  const slopes = new Float64Array(RES * RES)
  for (let y = 0; y < RES; y++) {
    for (let x = 0; x < RES; x++) slopes[y * RES + x] = tiltSlope(field, RES, x, y)
  }
  scanSlopeStd = stats(slopes).std
}

for (const type of types) {
  const gamma = solveDisplayGamma(field)
  const height = new Float64Array(RES * RES)
  for (let i = 0; i < field.length; i++) height[i] = Math.pow(field[i], gamma)

  const gain = catchGainOverride ?? proceduralSlopeStd(type) / Math.max(1e-9, scanSlopeStd)
  const catchGrid = new Float64Array(RES * RES)
  for (let y = 0; y < RES; y++) {
    for (let x = 0; x < RES; x++) {
      const dot = tiltSlope(field, RES, x, y) * gain
      catchGrid[y * RES + x] = clamp01(Math.max(0, dot * 3.0 + 0.5))
    }
  }

  console.log(`\n${type}: display gamma ${gamma.toFixed(3)}, catch gain ${gain.toFixed(2)}` +
    `${catchGainOverride === null ? ' (auto-matched to the procedural spread)' : ' (overridden)'}`)
  writePaperAsset(outDir, type, height, catchGrid, RES)
  await writeComparison(type, height, catchGrid)
}

console.log(`\ncomparison images in ${compareDir}`)
console.log('run `npm run bake:paper` to restore the procedural originals')

// ------------------------------------------------------- comparison render

/** Side-by-side PNG: procedural vs scanned, tint row and catch row, at 1:1
 *  texel-to-pixel. 1:1 is the honest ratio for the tint — DISPLAY_FRAG maps
 *  the whole tile across the canvas once (u_paperScale = 1.0), so on a
 *  ~1750px canvas a texel is about a pixel. */
async function writeComparison(type: PaperGrainType, height: Float64Array, catchGrid: Float64Array) {
  const S = 512, GUT = 8
  const W = S * 2 + GUT, H = S * 2 + GUT
  const px = Buffer.alloc(W * H * 3, 24)

  const hex = defaultPaperColor(type)
  const color = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const AMP = 0.035

  const put = (col: number, row: number, sample: (x: number, y: number) => [number, number, number]) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const rgb = sample(x, y)
        const o = ((row * (S + GUT) + y) * W + col * (S + GUT) + x) * 3
        for (let c = 0; c < 3; c++) px[o + c] = Math.round(clamp01(rgb[c]) * 255)
      }
    }
  }

  const tint = (h: number): [number, number, number] =>
    color.map(c => Math.min(Math.max(c, AMP), 1 - AMP) + AMP * (h * 2 - 1)) as [number, number, number]

  // Same 512x512 window of the tile for every panel, so the four are directly
  // comparable rather than each showing its own lucky patch.
  const at = (a: Float64Array, x: number, y: number) => a[(y + 512) * RES + (x + 512)]

  put(0, 0, (x, y) => tint(paperDisplayHeight(type, paperGridHeight(type, x + 512.5, y + 512.5, RES, RES))))
  put(1, 0, (x, y) => tint(at(height, x, y)))
  put(0, 1, (x, y) => {
    const v = proceduralCatch(type, x + 512.5, y + 512.5)
    return [v, v, v]
  })
  put(1, 1, (x, y) => { const v = at(catchGrid, x, y); return [v, v, v] })

  const out = join(compareDir, `paper-compare-${type}.png`)
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(out)
  console.log(`  ${out}  (left = procedural, right = scanned; top = blank-paper tint, bottom = graphite catch)`)
}

function proceduralCatch(type: PaperGrainType, x: number, y: number): number {
  const normalScale = 2.0 + (10.0 - 2.0) * paperRoughnessOf(type)
  const h = paperGridHeight(type, x, y, RES, RES)
  const hDx = paperGridHeight(type, x + 1, y, RES, RES)
  const hDy = paperGridHeight(type, x, y + 1, RES, RES)
  const dot = ((h - hDx) * 0.6 + (h - hDy) * 0.8) * normalScale
  return clamp01(Math.max(0, dot * 3.0 + 0.5))
}
