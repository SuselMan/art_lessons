import { describe, expect, it } from 'vitest'

import type { LayerFilter } from '@grafetto/shared'

import {
  type FilterPlacement, applyLayerFilter, curveLut, directionQ14, gaussianBoxes, isIdentityFilter, isKnownLayerFilter,
  layerFilterReach, normalizeLayerFilter, rgbToHsl,
} from './layerFilters'

/** Deterministic premultiplied test image: a few opaque and translucent
 *  blobs on transparency, from an integer hash — no Math.random, so a
 *  failure reproduces. */
function sampleImage(w: number, h: number, seed = 1): Uint8Array {
  const px = new Uint8Array(w * h * 4)
  let s = seed >>> 0
  const next = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const inBlob = ((x - w / 3) ** 2 + (y - h / 2) ** 2 < (w / 5) ** 2)
        || (x > w * 0.6 && x < w * 0.8 && y > h * 0.2 && y < h * 0.7)
      if (!inBlob && next() % 7 !== 0) continue
      const a = inBlob ? 255 : next() % 256
      px[i + 3] = a
      for (let c = 0; c < 3; c++) px[i + c] = Math.floor(((next() % 256) * a) / 255)
    }
  }
  return px
}

function crop(px: Uint8Array, w: number, x0: number, y0: number, cw: number, ch: number): Uint8Array {
  const out = new Uint8Array(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    out.set(px.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + cw) * 4), y * cw * 4)
  }
  return out
}

/** Pads `px` by `m` transparent pixels on every side. */
function pad(px: Uint8Array, w: number, h: number, m: number): Uint8Array {
  const pw = w + 2 * m
  const out = new Uint8Array(pw * (h + 2 * m) * 4)
  for (let y = 0; y < h; y++) out.set(px.subarray(y * w * 4, (y + 1) * w * 4), ((y + m) * pw + m) * 4)
  return out
}

const at = (originX: number, originY: number, rowsUp = false): FilterPlacement => ({ originX, originY, rowsUp })
const AT = at(0, 0)
const UP = at(0, 0, true)

function flipRows(px: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(px.length)
  for (let y = 0; y < h; y++) out.set(px.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4)
  return out
}

const BLURS: LayerFilter[] = [
  { kind: 'gaussian_blur', radius: 1 },
  { kind: 'gaussian_blur', radius: 7 },
  { kind: 'motion_blur', angle: 0, distance: 9 },
  { kind: 'motion_blur', angle: 37, distance: 20 },
  { kind: 'motion_blur', angle: 90, distance: 5 },
  { kind: 'motion_blur', angle: 301, distance: 33 },
  { kind: 'motion_blur', angle: 75, distance: 40 },
  { kind: 'motion_blur', angle: 135, distance: 1 },
]

describe('layer filters — tile independence (ADR 014)', () => {
  // The whole cross-client argument: the engine filters a layer tile by tile,
  // each with a margin of `reach`, and tiles are split differently on
  // different clients. That is only safe if a tile's interior comes out
  // byte-identical to filtering the whole layer in one go.
  for (const filter of BLURS) {
    it(`${filter.kind} ${JSON.stringify(filter)}: a tile with its margin equals the whole`, () => {
      const W = 64, H = 48
      const whole = sampleImage(W, H)
      const reach = layerFilterReach(filter)
      // The "layer" is the image on an infinite transparent plane, so the
      // reference pads by more than any reach before filtering.
      const big = reach + 4
      const ref = applyLayerFilter(pad(whole, W, H, big), W + 2 * big, H + 2 * big, filter, at(-big, -big))
      const refInner = crop(ref, W + 2 * big, big, big, W, H)

      // Tile it 3×2 and filter each tile from a margin-padded read.
      const padded = pad(whole, W, H, reach)
      const PW = W + 2 * reach
      const tw = W / 4, th = H / 2
      for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 4; tx++) {
          const region = crop(padded, PW, tx * tw, ty * th, tw + 2 * reach, th + 2 * reach)
          const out = applyLayerFilter(region, tw + 2 * reach, th + 2 * reach, filter, at(tx * tw - reach, ty * th - reach))
          const inner = crop(out, tw + 2 * reach, reach, reach, tw, th)
          expect(inner).toEqual(crop(refInner, W, tx * tw, ty * th, tw, th))
        }
      }
    })
  }
})

describe('layer filters — blur', () => {
  it('bottom-up storage is the same picture, mirrored', () => {
    const W = 50, H = 40
    const px = sampleImage(W, H, 11)
    for (const f of BLURS) {
      const down = applyLayerFilter(px, W, H, f, at(3, 7))
      const up = applyLayerFilter(flipRows(px, W, H), W, H, f, at(3, 7, true))
      expect(flipRows(up, W, H)).toEqual(down)
    }
  })

  it('keeps premultiplied colour within alpha', () => {
    const W = 40, H = 30
    for (const f of BLURS) {
      const out = applyLayerFilter(sampleImage(W, H, 3), W, H, f, AT)
      for (let i = 0; i < out.length; i += 4) {
        expect(Math.max(out[i], out[i + 1], out[i + 2])).toBeLessThanOrEqual(out[i + 3])
      }
    }
  })

  it('gaussian boxes widen with the radius and stay odd', () => {
    let prev = 0
    for (const r of [1, 2, 5, 10, 50, 100]) {
      const boxes = gaussianBoxes(r)
      for (const b of boxes) expect(b % 2).toBe(1)
      const total = boxes.reduce((a, b) => a + b, 0)
      expect(total).toBeGreaterThanOrEqual(prev)
      prev = total
    }
  })

  it('a horizontal motion blur never leaves its row', () => {
    const W = 21, H = 5
    const px = new Uint8Array(W * H * 4)
    const i = (2 * W + 10) * 4
    px[i] = px[i + 3] = 255
    const out = applyLayerFilter(px, W, H, { kind: 'motion_blur', angle: 0, distance: 8 }, AT)
    for (let y = 0; y < H; y++) {
      const rowAlpha = Array.from({ length: W }, (_, x) => out[(y * W + x) * 4 + 3]).reduce((a, b) => a + b, 0)
      if (y === 2) expect(rowAlpha).toBeGreaterThan(200)
      else expect(rowAlpha).toBe(0)
    }
    // …and spreads along it, symmetrically.
    expect(out[(2 * W + 7) * 4 + 3]).toBeGreaterThan(0)
    expect(out[(2 * W + 13) * 4 + 3]).toBe(out[(2 * W + 7) * 4 + 3])
  })

  it('bottom-up rows mirror the vertical direction', () => {
    const W = 31, H = 31
    const px = new Uint8Array(W * H * 4)
    const c = (15 * W + 15) * 4
    px[c] = px[c + 3] = 255
    const f: LayerFilter = { kind: 'motion_blur', angle: 45, distance: 12 }
    const down = applyLayerFilter(px, W, H, f, AT)
    const up = applyLayerFilter(px, W, H, f, UP)
    // Angle 45 on screen runs right-and-down; stored bottom-up that is
    // right-and-up in array rows.
    expect(down[((15 + 4) * W + 15 + 4) * 4 + 3]).toBeGreaterThan(0)
    expect(up[((15 - 4) * W + 15 + 4) * 4 + 3]).toBeGreaterThan(0)
    expect(up[((15 + 4) * W + 15 + 4) * 4 + 3]).toBe(0)
  })

  it('direction table matches the axes exactly', () => {
    expect(directionQ14(0)).toEqual([16384, 0])
    expect(directionQ14(90)).toEqual([0, 16384])
    expect(directionQ14(180)).toEqual([-16384, 0])
    expect(directionQ14(270)).toEqual([0, -16384])
    expect(directionQ14(-90)).toEqual([0, -16384])
  })
})

describe('layer filters — colour', () => {
  const opaque = (rgb: number[][]): Uint8Array => {
    const px = new Uint8Array(rgb.length * 4)
    rgb.forEach(([r, g, b], i) => px.set([r, g, b, 255], i * 4))
    return px
  }

  it('identity settings leave every pixel as it was', () => {
    const W = 40, H = 30
    const px = sampleImage(W, H, 9)
    const identities: LayerFilter[] = [
      { kind: 'hsl', hue: 0, saturation: 0, lightness: 0 },
      { kind: 'curves', value: [[0, 0], [255, 255]], red: [[0, 0], [255, 255]], green: [[0, 0], [255, 255]], blue: [[0, 0], [255, 255]] },
      {
        kind: 'color_balance', preserveLuminosity: false,
        shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
        midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
        highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
      },
    ]
    for (const f of identities) {
      expect(isIdentityFilter(normalizeLayerFilter(f))).toBe(true)
      expect(applyLayerFilter(px, W, H, f, AT)).toEqual(px)
    }
  })

  it('never touches alpha', () => {
    const W = 20, H = 10
    const px = sampleImage(W, H, 5)
    const out = applyLayerFilter(px, W, H, { kind: 'hsl', hue: 90, saturation: 50, lightness: 30 }, AT)
    for (let i = 3; i < px.length; i += 4) expect(out[i]).toBe(px[i])
  })

  it('HSL extremes: lightness to white/black, saturation to grey', () => {
    const px = opaque([[200, 40, 90]])
    expect(Array.from(applyLayerFilter(px, 1, 1, { kind: 'hsl', hue: 0, saturation: 0, lightness: 100 }, AT))).toEqual([255, 255, 255, 255])
    expect(Array.from(applyLayerFilter(px, 1, 1, { kind: 'hsl', hue: 0, saturation: 0, lightness: -100 }, AT))).toEqual([0, 0, 0, 255])
    const grey = applyLayerFilter(px, 1, 1, { kind: 'hsl', hue: 0, saturation: -100, lightness: 0 }, AT)
    expect(grey[0]).toBe(grey[1])
    expect(grey[1]).toBe(grey[2])
  })

  it('a 120° hue turn sends red to green', () => {
    const out = applyLayerFilter(opaque([[255, 0, 0]]), 1, 1, { kind: 'hsl', hue: 120, saturation: 0, lightness: 0 }, AT)
    expect(Array.from(out)).toEqual([0, 255, 0, 255])
  })

  it('curves: an inverted value curve inverts, a monotone S never overshoots', () => {
    const inv: LayerFilter = {
      kind: 'curves', value: [[0, 255], [255, 0]],
      red: [[0, 0], [255, 255]], green: [[0, 0], [255, 255]], blue: [[0, 0], [255, 255]],
    }
    expect(Array.from(applyLayerFilter(opaque([[10, 100, 250]]), 1, 1, inv, AT))).toEqual([245, 155, 5, 255])

    const lut = curveLut([[0, 0], [64, 30], [192, 225], [255, 255]])
    for (let i = 1; i < 256; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1])
    expect(lut[0]).toBe(0)
    expect(lut[255]).toBe(255)
  })

  it('colour balance: pushing midtones to red reddens a mid grey, and luminosity can be kept', () => {
    const shift = (preserveLuminosity: boolean): LayerFilter => ({
      kind: 'color_balance', preserveLuminosity,
      shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
      midtones: { cyanRed: 60, magentaGreen: 0, yellowBlue: 0 },
      highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
    })
    const grey = opaque([[128, 128, 128]])
    const free = applyLayerFilter(grey, 1, 1, shift(false), AT)
    expect(free[0]).toBeGreaterThan(160)
    expect(free[1]).toBe(128)
    const kept = applyLayerFilter(grey, 1, 1, shift(true), AT)
    expect(kept[0]).toBeGreaterThan(kept[1])
    const l = rgbToHsl(kept[0] / 255, kept[1] / 255, kept[2] / 255)[2]
    expect(Math.abs(l - 128 / 255)).toBeLessThan(1.5 / 255)
  })
})

describe('layer filters — normalisation', () => {
  it('clamps and rounds to the shared limits', () => {
    expect(normalizeLayerFilter({ kind: 'gaussian_blur', radius: 1e6 })).toEqual({ kind: 'gaussian_blur', radius: 100 })
    expect(normalizeLayerFilter({ kind: 'gaussian_blur', radius: Number.NaN })).toEqual({ kind: 'gaussian_blur', radius: 1 })
    expect(normalizeLayerFilter({ kind: 'motion_blur', angle: -30.4, distance: 2.6 })).toEqual({ kind: 'motion_blur', angle: 330, distance: 3 })
    expect(normalizeLayerFilter({ kind: 'hsl', hue: 400, saturation: -250, lightness: 12.5 }))
      .toEqual({ kind: 'hsl', hue: 180, saturation: -100, lightness: 13 })
  })

  it('sorts curve points, drops duplicates, falls back to identity', () => {
    const f = normalizeLayerFilter({
      kind: 'curves', value: [[255, 255], [10, 40], [0, 0], [10, 50]],
      red: [[3, 3]], green: [], blue: [[0, 0], [255, 255]],
    })
    if (f.kind !== 'curves') throw new Error('kind changed')
    expect(f.value).toEqual([[0, 0], [10, 50], [255, 255]])
    expect(f.red).toEqual([[0, 0], [255, 255]])
    expect(f.green).toEqual([[0, 0], [255, 255]])
  })

  it('recognises only the kinds this build knows', () => {
    expect(isKnownLayerFilter({ kind: 'hsl' })).toBe(true)
    expect(isKnownLayerFilter({ kind: 'emboss' })).toBe(false)
    expect(isKnownLayerFilter(null)).toBe(false)
  })
})
