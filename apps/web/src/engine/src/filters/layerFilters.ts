/**
 * Layer filters (#574, ADR 014): the pixel math, and nothing else.
 *
 * Every function here runs on the CPU over a flat premultiplied RGBA8 buffer,
 * and that is the design rather than a shortcut. A filter is a recipe in the
 * log (see LayerFilterOperation), so every participant computes it for
 * themselves, and the result has to be the same number on every device. WebGL
 * promises nothing of the kind — `highp` is a request, not a guarantee — and
 * the paper-grain redesign broke three times on exactly that. JavaScript
 * arithmetic is IEEE double everywhere, so the rules that keep this portable
 * are few and are kept throughout:
 *
 * - no transcendental functions (Math.sin, Math.exp, Math.pow) anywhere a
 *   result is derived — engines are allowed to differ in their last bit.
 *   The motion-blur direction comes from a baked integer table instead, and
 *   the Gaussian is three box blurs, which needs only `Math.sqrt` (correctly
 *   rounded by IEEE, so identical everywhere);
 * - sampling positions are fixed-point integers, never accumulated floats;
 * - `+ - * /` and `Math.round`/`Math.floor` only, otherwise.
 *
 * Buffers may arrive in GL row order (bottom-up). Only motion blur cares —
 * its angle has a vertical component — and takes a flag for it.
 */

import type { LayerFilter, CurvePoint, ColorBalanceShift } from '@grafetto/shared'
import { LAYER_FILTER_KINDS, LAYER_FILTER_LIMITS } from '@grafetto/shared'

// ─── Normalisation ───────────────────────────────────────────────────────────

const clampInt = (v: number, lo: number, hi: number): number => {
  const n = Number.isFinite(v) ? Math.round(v) : 0
  return n < lo ? lo : n > hi ? hi : n
}

const IDENTITY_CURVE: CurvePoint[] = [[0, 0], [255, 255]]

/** Integer, in range, sorted, one point per input level, endpoints kept. A
 *  curve that ends up with fewer than two points is the identity. */
export function normalizeCurve(points: readonly CurvePoint[] | undefined): CurvePoint[] {
  if (!Array.isArray(points)) return IDENTITY_CURVE
  const byX = new Map<number, number>()
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2) continue
    byX.set(clampInt(p[0], 0, 255), clampInt(p[1], 0, 255))
  }
  const sorted = [...byX.entries()].sort((a, b) => a[0] - b[0]).map(([x, y]): CurvePoint => [x, y])
  if (sorted.length < 2) return IDENTITY_CURVE
  if (sorted.length <= LAYER_FILTER_LIMITS.curvePoints) return sorted
  // Too many: keep both ends and the first ones in between.
  return [...sorted.slice(0, LAYER_FILTER_LIMITS.curvePoints - 1), sorted[sorted.length - 1]]
}

function normalizeShift(s: ColorBalanceShift | undefined): ColorBalanceShift {
  const p = LAYER_FILTER_LIMITS.percent
  return {
    cyanRed: clampInt(s?.cyanRed ?? 0, -p, p),
    magentaGreen: clampInt(s?.magentaGreen ?? 0, -p, p),
    yellowBlue: clampInt(s?.yellowBlue ?? 0, -p, p),
  }
}

/** What every client applies: the operation's filter clamped to the ranges in
 *  LAYER_FILTER_LIMITS and rounded to integers. The author normalises before
 *  sending too, so this only ever changes something for a malformed peer. */
export function normalizeLayerFilter(f: LayerFilter): LayerFilter {
  const L = LAYER_FILTER_LIMITS
  switch (f.kind) {
    case 'gaussian_blur':
      return { kind: 'gaussian_blur', radius: clampInt(f.radius, L.blurRadius.min, L.blurRadius.max) }
    case 'motion_blur':
      return {
        kind: 'motion_blur',
        angle: ((clampInt(f.angle, -100000, 100000) % 360) + 360) % 360,
        distance: clampInt(f.distance, L.motionDistance.min, L.motionDistance.max),
      }
    case 'hsl':
      return {
        kind: 'hsl',
        hue: clampInt(f.hue, -L.hue, L.hue),
        saturation: clampInt(f.saturation, -L.percent, L.percent),
        lightness: clampInt(f.lightness, -L.percent, L.percent),
      }
    case 'curves':
      return {
        kind: 'curves',
        value: normalizeCurve(f.value), red: normalizeCurve(f.red),
        green: normalizeCurve(f.green), blue: normalizeCurve(f.blue),
      }
    case 'color_balance':
      return {
        kind: 'color_balance',
        shadows: normalizeShift(f.shadows), midtones: normalizeShift(f.midtones),
        highlights: normalizeShift(f.highlights), preserveLuminosity: f.preserveLuminosity !== false,
      }
  }
}

const isIdentityCurve = (c: CurvePoint[]): boolean => c.every(([x, y]) => x === y)
const isZeroShift = (s: ColorBalanceShift): boolean => !s.cyanRed && !s.magentaGreen && !s.yellowBlue

/** True when the (normalised) filter leaves every pixel as it is — the UI
 *  uses it to keep Apply from writing a no-op into the permanent log. */
export function isIdentityFilter(f: LayerFilter): boolean {
  switch (f.kind) {
    case 'gaussian_blur':
    case 'motion_blur':
      return false
    case 'hsl':
      return f.hue === 0 && f.saturation === 0 && f.lightness === 0
    case 'curves':
      return [f.value, f.red, f.green, f.blue].every(isIdentityCurve)
    case 'color_balance':
      return isZeroShift(f.shadows) && isZeroShift(f.midtones) && isZeroShift(f.highlights)
  }
}

// ─── Reach ───────────────────────────────────────────────────────────────────

/** Box widths (odd) whose three-fold convolution approximates a Gaussian of
 *  standard deviation `sigma` — the classic construction (Kovesi). `Math.sqrt`
 *  is the only non-trivial call and IEEE requires it correctly rounded. */
export function gaussianBoxes(sigma: number): [number, number, number] {
  const n = 3
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(ideal)
  if (wl % 2 === 0) wl--
  const wu = wl + 2
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4))
  return [m > 0 ? wl : wu, m > 1 ? wl : wu, m > 2 ? wl : wu]
}

/** How far, in pixels, a filter's output at one pixel can depend on input
 *  away from it. The engine reads this much margin around every tile it
 *  filters, which is what makes a tile-by-tile result equal to filtering the
 *  whole layer at once — and so independent of how any one client happens to
 *  have its layer split into tiles. */
export function layerFilterReach(f: LayerFilter): number {
  switch (f.kind) {
    case 'gaussian_blur':
      return gaussianBoxes(f.radius).reduce((sum, w) => sum + (w - 1) / 2, 0)
    case 'motion_blur':
      // Half the smear either way, plus the bilinear neighbour of each of
      // its two passes.
      return Math.ceil(f.distance / 2) + 2
    default:
      return 0
  }
}

// ─── Blur ────────────────────────────────────────────────────────────────────

/** One box pass along rows, over a 16-bit working buffer (8-bit values
 *  scaled by 256, so rounding between passes does not band). Outside the
 *  buffer counts as transparent, never as a clamped edge: the engine filters
 *  tiles with a margin, and a clamped edge would smear the margin's own
 *  border back inward. */
function boxPassH(buf: Uint16Array, w: number, h: number, radius: number): Uint16Array {
  if (radius <= 0) return buf
  const out = new Uint16Array(buf.length)
  const d = 2 * radius + 1
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let c = 0; c < 4; c++) {
      const start = row + c
      let sum = 0
      // Window [i - radius, i + radius]; primed with [0, radius - 1].
      for (let k = 0; k < radius && k < w; k++) sum += buf[start + k * 4]
      for (let i = 0; i < w; i++) {
        if (i + radius < w) sum += buf[start + (i + radius) * 4]
        if (i - radius - 1 >= 0) sum -= buf[start + (i - radius - 1) * 4]
        out[start + i * 4] = Math.floor((sum + radius) / d)
      }
    }
  }
  return out
}

/** The same box along columns, walked row by row with one running sum per
 *  column — a column-at-a-time walk strides the whole buffer per step and
 *  measured several times slower for identical arithmetic. */
function boxPassV(buf: Uint16Array, w: number, h: number, radius: number): Uint16Array {
  if (radius <= 0) return buf
  const out = new Uint16Array(buf.length)
  const d = 2 * radius + 1
  const rowLen = w * 4
  const sums = new Float64Array(rowLen)
  for (let k = 0; k < radius && k < h; k++) {
    const r = k * rowLen
    for (let i = 0; i < rowLen; i++) sums[i] += buf[r + i]
  }
  for (let y = 0; y < h; y++) {
    if (y + radius < h) {
      const r = (y + radius) * rowLen
      for (let i = 0; i < rowLen; i++) sums[i] += buf[r + i]
    }
    if (y - radius - 1 >= 0) {
      const r = (y - radius - 1) * rowLen
      for (let i = 0; i < rowLen; i++) sums[i] -= buf[r + i]
    }
    const o = y * rowLen
    for (let i = 0; i < rowLen; i++) out[o + i] = Math.floor((sums[i] + radius) / d)
  }
  return out
}

function toWork(px: Uint8Array): Uint16Array {
  const out = new Uint16Array(px.length)
  for (let i = 0; i < px.length; i++) out[i] = px[i] << 8
  return out
}

function fromWork(work: Uint16Array, out: Uint8Array): void {
  for (let i = 0; i < work.length; i++) out[i] = (work[i] + 128) >> 8
}

function gaussianBlur(px: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  let work = toWork(px)
  for (const box of gaussianBoxes(radius)) {
    const r = (box - 1) / 2
    work = boxPassV(boxPassH(work, w, h, r), w, h, r)
  }
  const out = new Uint8Array(px.length)
  fromWork(work, out)
  return out
}

/** sin(0°..90°) in Q14, baked offline (`Math.round(Math.sin(d·π/180) · 16384)`)
 *  so no client ever evaluates a sine: engines may disagree in the last bit
 *  of Math.sin, and a direction off by one ulp moves a sample position. */
const SIN_Q14 = [
  0, 286, 572, 857, 1143, 1428, 1713, 1997, 2280, 2563, 2845, 3126, 3406,
  3686, 3964, 4240, 4516, 4790, 5063, 5334, 5604, 5872, 6138, 6402, 6664, 6924,
  7182, 7438, 7692, 7943, 8192, 8438, 8682, 8923, 9162, 9397, 9630, 9860, 10087,
  10311, 10531, 10749, 10963, 11174, 11381, 11585, 11786, 11982, 12176, 12365, 12551, 12733,
  12911, 13085, 13255, 13421, 13583, 13741, 13894, 14044, 14189, 14330, 14466, 14598, 14726,
  14849, 14968, 15082, 15191, 15296, 15396, 15491, 15582, 15668, 15749, 15826, 15897, 15964,
  16026, 16083, 16135, 16182, 16225, 16262, 16294, 16322, 16344, 16362, 16374, 16382, 16384,
]

/** Unit direction of `angle` whole degrees, Q14, from the table alone. */
export function directionQ14(angle: number): [number, number] {
  const a = ((Math.round(angle) % 360) + 360) % 360
  const sinOf = (deg: number): number => {
    const q = deg % 360
    if (q <= 90) return SIN_Q14[q]
    if (q <= 180) return SIN_Q14[180 - q]
    if (q <= 270) return -SIN_Q14[q - 180]
    return -SIN_Q14[360 - q]
  }
  return [sinOf(a + 90), sinOf(a)]
}

/** Rounds halves away from zero. `Math.round` sends -2.5 to -2 and 2.5 to 3,
 *  which would put a centred smear's two halves at different distances. */
const roundHalfAway = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v))

function flipRows(buf: Uint16Array, w: number, h: number): Uint16Array {
  const out = new Uint16Array(buf.length)
  const rowLen = w * 4
  for (let y = 0; y < h; y++) out.set(buf.subarray(y * rowLen, (y + 1) * rowLen), (h - 1 - y) * rowLen)
  return out
}

/** `w`×`h` in, `h`×`w` out. */
function transpose(buf: Uint16Array, w: number, h: number): Uint16Array {
  const out = new Uint16Array(buf.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const o = (x * h + y) * 4
      out[o] = buf[i]; out[o + 1] = buf[i + 1]; out[o + 2] = buf[i + 2]; out[o + 3] = buf[i + 3]
    }
  }
  return out
}

/** A centred box along a mostly-horizontal direction (`cQ` > 0, |`sQ`| ≤
 *  `cQ`, Q14), by shearing instead of sampling along the line.
 *
 *  Each column is shifted vertically by its world x times the slope, which
 *  lays every line of that slope flat along a row; a plain running-sum box
 *  then smears along the rows at a cost that does not depend on the
 *  distance; and the shift is undone. Two linear interpolations (in, out)
 *  soften the cross direction by under a pixel — invisible under a smear —
 *  and in exchange a 200 px blur costs what a 2 px one does. Sampling taps
 *  along the line, which this replaced, measured 1.4 s per 1024 tile at 200 px.
 *
 *  The shift is taken from the pixel's *world* column (`ox` + x), not its
 *  column in this buffer. That is what keeps the result independent of how a
 *  layer is split into tiles: the interpolation phase of a column is a
 *  property of where it is on the canvas, so two clients cutting the layer
 *  differently still compute the same number for it. */
function shearBox(
  src: Uint16Array, w: number, h: number, ox: number, oy: number, cQ: number, sQ: number, distance: number,
): Uint16Array {
  const half = roundHalfAway((distance * cQ) / (2 * 16384))
  if (half <= 0) return src
  const slope = roundHalfAway((sQ * 65536) / cQ) // Q16, |slope| ≤ 1

  // Per column: integer part of the shift, and its fraction in Q8 (0..256).
  const sInt = new Int32Array(w)
  const frac = new Int32Array(w)
  let sMin = Infinity, sMax = -Infinity
  for (let x = 0; x < w; x++) {
    const shift = (ox + x) * slope
    const i = Math.floor(shift / 65536)
    sInt[x] = i
    frac[x] = (shift - i * 65536 + 128) >> 8
    if (i < sMin) sMin = i
    if (i > sMax) sMax = i
  }

  // Sheared rows, indexed by world row V from vMin: S(x, V) = I(x, V + shift_x).
  const vMin = oy - sMax - 1
  const sh = h + (sMax - sMin) + 2
  const rowLen = w * 4
  const sheared = new Uint16Array(sh * rowLen)
  for (let x = 0; x < w; x++) {
    const f = frac[x]
    const r0Base = vMin + sInt[x] - oy // buffer row of I for k = 0
    for (let k = 0; k < sh; k++) {
      const r = r0Base + k
      const in0 = r >= 0 && r < h
      const in1 = r + 1 >= 0 && r + 1 < h
      if (!in0 && !in1) continue
      const i0 = r * rowLen + x * 4
      const o = k * rowLen + x * 4
      for (let c = 0; c < 4; c++) {
        const v = (in0 ? src[i0 + c] * (256 - f) : 0) + (in1 ? src[i0 + rowLen + c] * f : 0)
        sheared[o + c] = (v + 128) >> 8
      }
    }
  }

  const smeared = boxPassH(sheared, w, sh, half)

  // Undo the shear: O(x, Y) sits between sheared rows Y - shift_x - 1 (weight
  // frac) and Y - shift_x (weight 1 - frac).
  const out = new Uint16Array(src.length)
  for (let x = 0; x < w; x++) {
    const f = frac[x]
    const k0Base = oy - sInt[x] - 1 - vMin
    for (let y = 0; y < h; y++) {
      const k = k0Base + y
      const i0 = k * rowLen + x * 4
      const o = y * rowLen + x * 4
      for (let c = 0; c < 4; c++) {
        out[o + c] = (smeared[i0 + c] * f + smeared[i0 + rowLen + c] * (256 - f) + 128) >> 8
      }
    }
  }
  return out
}

/** A centred box of length `distance` along `angle`. `originX/Y` are the world
 *  coordinates of the buffer's top-left pixel — see shearBox for why the
 *  result depends on them. A mostly-vertical direction is handled by
 *  transposing, so shearBox only ever sees slopes of at most 1. */
function motionBlur(
  px: Uint8Array, w: number, h: number, angle: number, distance: number,
  originX: number, originY: number, rowsUp: boolean,
): Uint8Array {
  let work = toWork(px)
  // Work top-down, so buffer row r is world row originY + r.
  if (rowsUp) work = flipRows(work, w, h)
  let [c, s] = directionQ14(angle)
  // The smear is centred, so a direction and its opposite are the same one.
  if (c < 0 || (c === 0 && s < 0)) { c = -c; s = -s }
  if (Math.abs(s) <= c) {
    work = shearBox(work, w, h, originX, originY, c, s, distance)
  } else {
    let a = s, b = c
    if (a < 0) { a = -a; b = -b }
    work = transpose(shearBox(transpose(work, w, h), h, w, originY, originX, a, b, distance), h, w)
  }
  if (rowsUp) work = flipRows(work, w, h)
  const out = new Uint8Array(px.length)
  fromWork(work, out)
  return out
}

// ─── Colour ──────────────────────────────────────────────────────────────────

/** Runs `fn` over every pixel's straight-alpha colour (0..1) and writes the
 *  result back premultiplied. Alpha is never touched: none of the colour
 *  filters is about coverage. Fully transparent pixels are skipped — they
 *  carry no colour to adjust. */
function mapColors(
  px: Uint8Array,
  fn: (r: number, g: number, b: number, out: Float64Array) => void,
): Uint8Array {
  const out = new Uint8Array(px.length)
  const rgb = new Float64Array(3)
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]
    if (a === 0) continue
    out[i + 3] = a
    fn(Math.min(1, px[i] / a), Math.min(1, px[i + 1] / a), Math.min(1, px[i + 2] / a), rgb)
    for (let c = 0; c < 3; c++) {
      const v = rgb[c] < 0 ? 0 : rgb[c] > 1 ? 1 : rgb[c]
      out[i + c] = Math.round(v * a)
    }
  }
  return out
}

/** RGB (0..1) → HSL with h in 0..1, the GIMP convention. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const delta = max - min
  const s = l <= 0.5 ? delta / (max + min) : delta / (2 - max - min)
  let h: number
  if (max === r) h = (g - b) / delta
  else if (max === g) h = 2 + (b - r) / delta
  else h = 4 + (r - g) / delta
  h /= 6
  if (h < 0) h += 1
  return [h, s, l]
}

function hueChannel(m1: number, m2: number, h: number): number {
  if (h < 0) h += 1
  else if (h > 1) h -= 1
  if (h * 6 < 1) return m1 + (m2 - m1) * h * 6
  if (h * 2 < 1) return m2
  if (h * 3 < 2) return m1 + (m2 - m1) * (2 / 3 - h) * 6
  return m1
}

export function hslToRgb(h: number, s: number, l: number, out: Float64Array): void {
  if (s === 0) { out[0] = out[1] = out[2] = l; return }
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s
  const m1 = 2 * l - m2
  out[0] = hueChannel(m1, m2, h + 1 / 3)
  out[1] = hueChannel(m1, m2, h)
  out[2] = hueChannel(m1, m2, h - 1 / 3)
}

/** Hue rotates, saturation scales, lightness pulls toward white or black —
 *  the GIMP Hue-Saturation "master" range, which is also what Photoshop's
 *  dialog does with Colorize off. */
function hsl(px: Uint8Array, hue: number, saturation: number, lightness: number): Uint8Array {
  const dh = hue / 360
  const ds = saturation / 100
  const dl = lightness / 100
  return mapColors(px, (r, g, b, out) => {
    let [h, s, l] = rgbToHsl(r, g, b)
    h += dh
    if (h < 0) h += 1
    else if (h >= 1) h -= 1
    s *= 1 + ds
    if (s > 1) s = 1
    l = dl < 0 ? l * (1 + dl) : l + (1 - l) * dl
    hslToRgb(h, s, l, out)
  })
}

/** A 256-entry lookup through the control points: monotone cubic Hermite
 *  (Fritsch–Carlson), so a curve dragged into an S never overshoots between
 *  its points — the wiggle a natural spline adds is the classic complaint
 *  about curve dialogs. Flat past the end points. */
export function curveLut(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256)
  const n = points.length
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) slopes.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  const tangents: number[] = new Array(n)
  tangents[0] = slopes[0]
  tangents[n - 1] = slopes[n - 2]
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) { tangents[i] = 0; tangents[i + 1] = 0; continue }
    const a = tangents[i] / slopes[i]
    const b = tangents[i + 1] / slopes[i]
    const sq = a * a + b * b
    if (sq > 9) {
      const t = 3 / Math.sqrt(sq)
      tangents[i] = t * a * slopes[i]
      tangents[i + 1] = t * b * slopes[i]
    }
  }
  let seg = 0
  for (let x = 0; x < 256; x++) {
    let y: number
    if (x <= xs[0]) y = ys[0]
    else if (x >= xs[n - 1]) y = ys[n - 1]
    else {
      while (x > xs[seg + 1]) seg++
      const hSeg = xs[seg + 1] - xs[seg]
      const t = (x - xs[seg]) / hSeg
      const t2 = t * t
      const t3 = t2 * t
      y = (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * hSeg * tangents[seg]
        + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * hSeg * tangents[seg + 1]
    }
    lut[x] = y < 0 ? 0 : y > 255 ? 255 : Math.round(y)
  }
  return lut
}

function curves(px: Uint8Array, f: Extract<LayerFilter, { kind: 'curves' }>): Uint8Array {
  const master = curveLut(f.value)
  const channel = [curveLut(f.red), curveLut(f.green), curveLut(f.blue)]
  // Composed once into one table per channel: channel curve, then master.
  const lut = channel.map(c => {
    const t = new Uint8Array(256)
    for (let i = 0; i < 256; i++) t[i] = master[c[i]]
    return t
  })
  return mapColors(px, (r, g, b, out) => {
    out[0] = lut[0][Math.round(r * 255)] / 255
    out[1] = lut[1][Math.round(g * 255)] / 255
    out[2] = lut[2][Math.round(b * 255)] / 255
  })
}

/** GIMP's colour balance transfer: each range's shift is weighted by where the
 *  pixel's lightness falls, so a shadows correction fades out through the
 *  midtones instead of stopping at a hard edge. */
function balanceChannel(value: number, lightness: number, shadows: number, midtones: number, highlights: number): number {
  const a = 0.25
  const b = 0.333
  const scale = 0.7
  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
  const s = shadows * clamp01((lightness - b) / -a + 0.5) * scale
  const m = midtones * clamp01((lightness - b) / a + 0.5) * clamp01((lightness + b - 1) / -a + 0.5) * scale
  const hi = highlights * clamp01((lightness + b - 1) / a + 0.5) * scale
  return clamp01(value + s + m + hi)
}

function colorBalance(px: Uint8Array, f: Extract<LayerFilter, { kind: 'color_balance' }>): Uint8Array {
  const { shadows: sh, midtones: mid, highlights: hi } = f
  return mapColors(px, (r, g, b, out) => {
    const l = rgbToHsl(r, g, b)[2]
    const nr = balanceChannel(r, l, sh.cyanRed / 100, mid.cyanRed / 100, hi.cyanRed / 100)
    const ng = balanceChannel(g, l, sh.magentaGreen / 100, mid.magentaGreen / 100, hi.magentaGreen / 100)
    const nb = balanceChannel(b, l, sh.yellowBlue / 100, mid.yellowBlue / 100, hi.yellowBlue / 100)
    if (f.preserveLuminosity) {
      const [h, s] = rgbToHsl(nr, ng, nb)
      hslToRgb(h, s, l, out)
    } else {
      out[0] = nr; out[1] = ng; out[2] = nb
    }
  })
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Whether `filter` is one this build knows. A peer running a newer build
 *  can send a kind that did not exist when this one shipped; the engine
 *  skips such an operation rather than guessing what it meant. */
export function isKnownLayerFilter(filter: { kind?: unknown } | null | undefined): filter is LayerFilter {
  return typeof filter?.kind === 'string' && (LAYER_FILTER_KINDS as readonly string[]).includes(filter.kind)
}

/** Where a buffer sits: the world coordinates of its top-left pixel, and
 *  whether its rows are stored bottom-up (as gl.readPixels returns them). */
export interface FilterPlacement {
  originX: number
  originY: number
  rowsUp: boolean
}

/** Applies `filter` (normalised first) to a premultiplied RGBA8 buffer of
 *  `w`×`h` and returns a new buffer of the same shape. */
export function applyLayerFilter(
  px: Uint8Array, w: number, h: number, filter: LayerFilter, placement: FilterPlacement,
): Uint8Array {
  const f = normalizeLayerFilter(filter)
  switch (f.kind) {
    case 'gaussian_blur': return gaussianBlur(px, w, h, f.radius)
    case 'motion_blur':
      return motionBlur(px, w, h, f.angle, f.distance, placement.originX, placement.originY, placement.rowsUp)
    case 'hsl': return hsl(px, f.hue, f.saturation, f.lightness)
    case 'curves': return curves(px, f)
    case 'color_balance': return colorBalance(px, f)
  }
}
