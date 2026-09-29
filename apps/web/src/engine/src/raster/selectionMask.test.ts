import { describe, it, expect } from 'vitest'

import {
  buildSelectionMask, MASK_MAX_DIM, maskResolution, rasterizeSelectionMask,
  rectangleSelection, selectionBounds,
} from './selectionMask'

const at = (mask: { data: Uint8Array; width: number }, x: number, y: number) => mask.data[y * mask.width + x]

describe('selectionBounds', () => {
  it('rounds outward to whole pixels', () => {
    expect(selectionBounds({ points: [1.2, 2.7, 8.9, 2.7, 8.9, 6.1, 1.2, 6.1] }))
      .toEqual({ minX: 1, minY: 2, maxX: 9, maxY: 7 })
  })

  it('refuses a shape with no inside', () => {
    // Fewer than three points, a zero-height drag, and a single tap: all
    // reachable by hand, none of them a region.
    expect(selectionBounds({ points: [0, 0, 10, 10] })).toBeNull()
    expect(selectionBounds({ points: [0, 5, 10, 5, 20, 5] })).toBeNull()
    expect(selectionBounds({ points: [3, 3, 3, 3, 3, 3] })).toBeNull()
  })

  it('refuses non-finite coordinates rather than producing an infinite rect', () => {
    expect(selectionBounds({ points: [0, 0, Number.NaN, 4, 8, 8] })).toBeNull()
    expect(selectionBounds({ points: [0, 0, Infinity, 4, 8, 8] })).toBeNull()
  })
})

describe('maskResolution', () => {
  it('is one texel per pixel below the cap', () => {
    expect(maskResolution({ minX: 0, minY: 0, maxX: 300, maxY: 120 })).toEqual({ width: 300, height: 120 })
  })

  it('caps each axis on its own, so a long thin selection keeps its short side sharp', () => {
    expect(maskResolution({ minX: 0, minY: 0, maxX: 100000, maxY: 40 }))
      .toEqual({ width: MASK_MAX_DIM, height: 40 })
  })
})

describe('rasterizeSelectionMask', () => {
  it('fills a pixel-aligned rectangle solidly and leaves the outside empty', () => {
    const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    const data = rasterizeSelectionMask(rectangleSelection(2, 3, 7, 8), rect, 10, 10)
    const mask = { data, width: 10 }

    expect(at(mask, 2, 3)).toBe(255)
    expect(at(mask, 6, 7)).toBe(255)
    // Exclusive at the far edge — the rectangle ends at x=7, so column 7 is
    // the first one outside it.
    expect(at(mask, 7, 7)).toBe(0)
    expect(at(mask, 1, 3)).toBe(0)
    expect(at(mask, 2, 2)).toBe(0)
  })

  it('gives a half-covered pixel about half coverage', () => {
    const rect = { minX: 0, minY: 0, maxX: 4, maxY: 4 }
    const data = rasterizeSelectionMask(rectangleSelection(0, 0, 2.5, 4), rect, 4, 4)
    const mask = { data, width: 4 }

    expect(at(mask, 1, 1)).toBe(255)
    expect(at(mask, 2, 1)).toBeGreaterThan(120)
    expect(at(mask, 2, 1)).toBeLessThan(136)
    expect(at(mask, 3, 1)).toBe(0)
  })

  it('antialiases a diagonal edge instead of stepping straight from 0 to 255', () => {
    const rect = { minX: 0, minY: 0, maxX: 16, maxY: 16 }
    // Right triangle with the hypotenuse running corner to corner.
    const data = rasterizeSelectionMask({ points: [0, 0, 16, 16, 0, 16] }, rect, 16, 16)
    const mask = { data, width: 16 }

    const onEdge = [...Array(14).keys()].map(i => at(mask, i + 1, i + 1))
    expect(onEdge.every(v => v > 0 && v < 255)).toBe(true)
    // Well inside stays solid, well outside stays empty.
    expect(at(mask, 1, 14)).toBe(255)
    expect(at(mask, 14, 1)).toBe(0)
  })

  it('keeps a self-crossing lasso filled (nonzero winding, not even-odd)', () => {
    // A bow tie: the two lobes meet at the middle. Under even-odd the right
    // lobe would punch itself out; a hand-drawn lasso that crosses its own
    // tail must not lose the part it crossed.
    const rect = { minX: 0, minY: 0, maxX: 40, maxY: 20 }
    const data = rasterizeSelectionMask({ points: [0, 0, 40, 20, 40, 0, 0, 20] }, rect, 40, 20)
    const mask = { data, width: 40 }

    expect(at(mask, 5, 10)).toBe(255)
    expect(at(mask, 34, 10)).toBe(255)
  })

  it('samples at a reduced resolution without moving the shape', () => {
    const rect = { minX: 0, minY: 0, maxX: 400, maxY: 400 }
    // Same rectangle, mask stored at a quarter of the world resolution: the
    // uv mapping is normalized, so the covered *fraction* has to match.
    const data = rasterizeSelectionMask(rectangleSelection(100, 100, 300, 300), rect, 100, 100)
    const mask = { data, width: 100 }

    expect(at(mask, 12, 12)).toBe(0)
    expect(at(mask, 40, 40)).toBe(255)
    expect(at(mask, 74, 74)).toBe(255)
    expect(at(mask, 80, 80)).toBe(0)
  })

  it('is byte-for-byte repeatable — the whole reason it is not on the GPU', () => {
    const shape = { points: [3.3, 1.1, 27.9, 4.4, 19.5, 28.25, 2.2, 15.75] }
    const rect = selectionBounds(shape)!
    const a = rasterizeSelectionMask(shape, rect, 32, 32)
    const b = rasterizeSelectionMask(shape, rect, 32, 32)
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('buildSelectionMask', () => {
  it('returns bounds, resolution and bytes together', () => {
    const mask = buildSelectionMask(rectangleSelection(10, 20, 30, 50))!
    expect(mask.rect).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 50 })
    expect(mask.width).toBe(20)
    expect(mask.height).toBe(30)
    expect(mask.data.length).toBe(600)
    expect(at(mask, 10, 15)).toBe(255)
  })

  it('is null for a selection with no inside', () => {
    expect(buildSelectionMask({ points: [1, 1, 5, 1] })).toBeNull()
  })
})
