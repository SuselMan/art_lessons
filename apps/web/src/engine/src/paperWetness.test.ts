import { describe, it, expect } from 'vitest'

import {
  PaperWetness, WET_CELL_PX, WET_DRY_MS,
  quantizeWet, dequantizeWet, wetAt, isDryProfile,
} from './paperWetness'

// #536. These cover the half of the wetness model that decides *replayability*,
// which is the half worth testing without a GPU: what a stroke sees, what it
// writes down, and that reading the record back gives the same number the live
// stroke used. The look of the mark is not testable here at all — MockGL never
// rasterizes the ribbon path (see index.watercolor.test.ts's own header).

describe('PaperWetness field (#536)', () => {
  it('reads dry where nothing has been painted', () => {
    const f = new PaperWetness()
    expect(f.sample('L', 0, 0, 1000)).toBe(0)
    expect(f.anyWetNear('L', 0, 0, 50, 1000)).toBe(false)
  })

  it('wets the cells a dab covers and nothing beyond its radius', () => {
    const f = new PaperWetness()
    f.deposit('L', 0, 0, 10, 0.8, 0)
    expect(f.sample('L', 0, 0, 0)).toBeCloseTo(0.8, 5)
    // Far outside the dab plus a cell of slack.
    expect(f.sample('L', WET_CELL_PX * 6, 0, 0)).toBe(0)
  })

  it('dries to exactly zero rather than asymptotically', () => {
    const f = new PaperWetness()
    f.deposit('L', 0, 0, 10, 1, 0)
    expect(f.sample('L', 0, 0, WET_DRY_MS * 0.5)).toBeCloseTo(0.5, 5)
    expect(f.sample('L', 0, 0, WET_DRY_MS)).toBe(0)
    expect(f.sample('L', 0, 0, WET_DRY_MS * 10)).toBe(0)
  })

  it('takes the wetter of what is there rather than summing', () => {
    const f = new PaperWetness()
    f.deposit('L', 0, 0, 10, 0.5, 0)
    f.deposit('L', 0, 0, 10, 0.3, 0)
    // Paper is a state, not an accumulator: passing over twice leaves it wet,
    // not twice as wet.
    expect(f.sample('L', 0, 0, 0)).toBeCloseTo(0.5, 5)
  })

  it('refreshes the drying clock when re-wetted', () => {
    const f = new PaperWetness()
    f.deposit('L', 0, 0, 10, 1, 0)
    f.deposit('L', 0, 0, 10, 1, WET_DRY_MS * 0.9)
    expect(f.sample('L', 0, 0, WET_DRY_MS * 0.9)).toBeCloseTo(1, 5)
  })

  it('keeps layers apart', () => {
    const f = new PaperWetness()
    f.deposit('A', 0, 0, 10, 1, 0)
    expect(f.sample('B', 0, 0, 0)).toBe(0)
  })

  it('answers the join question by proximity, not by recency', () => {
    const f = new PaperWetness()
    f.deposit('L', 0, 0, 10, 1, 0)
    // A brush coming down beside the puddle lands in it…
    expect(f.anyWetNear('L', WET_CELL_PX, 0, 20, 0)).toBe(true)
    // …and one coming down across the sheet does not, however recent it is.
    expect(f.anyWetNear('L', 2000, 2000, 20, 0)).toBe(false)
  })

  it('drops dried cells on prune', () => {
    const f = new PaperWetness()
    f.deposit('L', 0, 0, 10, 1, 0)
    f.prune(WET_DRY_MS + 1)
    expect(f.cellsOf('L', WET_DRY_MS + 1)).toHaveLength(0)
  })
})

describe('the recorded profile (#536)', () => {
  it('round-trips a quantized value to within one step', () => {
    for (const v of [0, 0.13, 0.5, 0.77, 1]) {
      expect(Math.abs(dequantizeWet(quantizeWet(v)) - v)).toBeLessThanOrEqual(1 / 30 + 1e-9)
    }
  })

  it('is exactly zero and exactly one at the ends', () => {
    expect(quantizeWet(0)).toBe('0')
    expect(quantizeWet(1)).toBe('f')
    expect(dequantizeWet('0')).toBe(0)
    expect(dequantizeWet('f')).toBe(1)
  })

  it('reads a missing or short profile as dry', () => {
    expect(wetAt(undefined, 0)).toBe(0)
    expect(wetAt('ff', 5)).toBe(0)
    expect(wetAt('', 0)).toBe(0)
  })

  it('indexes one digit per dab, so any slice of a gesture is a substring', () => {
    const profile = '0369cf'
    // What a peer paints after skipping the first two dabs must be what the
    // author saw for dabs 2..5 — a substring, with no arithmetic in between.
    const sliced = profile.slice(2)
    for (let i = 0; i < sliced.length; i++) {
      expect(wetAt(sliced, i)).toBeCloseTo(wetAt(profile, i + 2), 10)
    }
  })

  it('recognises a profile with nothing in it, so dry strokes carry no field', () => {
    expect(isDryProfile('0000')).toBe(true)
    expect(isDryProfile('')).toBe(true)
    expect(isDryProfile('0010')).toBe(false)
  })
})
