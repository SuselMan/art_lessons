import { describe, expect, it } from 'vitest'

import { previewDownscaleChain, previewTargetSize } from './previewChain'

describe('previewTargetSize', () => {
  it('fits the longer side into maxSide and keeps the aspect', () => {
    expect(previewTargetSize(1240, 1754, 320)).toEqual({ width: 226, height: 320 })
    expect(previewTargetSize(1754, 1240, 320)).toEqual({ width: 320, height: 226 })
  })

  it('never upscales', () => {
    expect(previewTargetSize(200, 100, 320)).toEqual({ width: 200, height: 100 })
  })

  it('never collapses a thin axis to zero', () => {
    expect(previewTargetSize(8000, 3, 320)).toEqual({ width: 320, height: 1 })
  })
})

describe('previewDownscaleChain', () => {
  it('halves an A4 sheet twice, then lands on the target in one short step', () => {
    expect(previewDownscaleChain(1240, 1754, 320)).toEqual([
      { width: 620, height: 877 },
      { width: 310, height: 439 },
      { width: 226, height: 320 },
    ])
  })

  it('is pure halvings when the source is a power-of-two multiple of the target', () => {
    expect(previewDownscaleChain(1280, 1280, 320)).toEqual([
      { width: 640, height: 640 },
      { width: 320, height: 320 },
    ])
  })

  it('is empty when the source already fits', () => {
    expect(previewDownscaleChain(320, 200, 320)).toEqual([])
    expect(previewDownscaleChain(10, 10, 320)).toEqual([])
  })

  it('never shrinks an axis by more than 2x in one step, and ends on the target', () => {
    const cases: Array<[number, number, number]> = [
      [1240, 1754, 320], [8192, 8192, 320], [8192, 37, 320], [641, 641, 320],
      [5, 3, 2], [1023, 777, 100], [3000, 1, 320], [321, 321, 320],
    ]
    for (const [w, h, max] of cases) {
      const chain = previewDownscaleChain(w, h, max)
      let pw = w, ph = h
      for (const step of chain) {
        expect(step.width).toBeGreaterThanOrEqual(Math.ceil(pw / 2))
        expect(step.height).toBeGreaterThanOrEqual(Math.ceil(ph / 2))
        expect(step.width).toBeLessThanOrEqual(pw)
        expect(step.height).toBeLessThanOrEqual(ph)
        pw = step.width; ph = step.height
      }
      expect({ width: pw, height: ph }).toEqual(previewTargetSize(w, h, max))
      expect(Math.max(pw, ph)).toBeLessThanOrEqual(max)
    }
  })
})
