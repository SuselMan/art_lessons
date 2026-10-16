import { describe, expect, it } from 'vitest'

import { WatercolorFootprintIndex, type FootprintBounds } from './watercolorFootprintIndex'

const overlaps = (a: FootprintBounds, b: FootprintBounds) => a.left <= b.right && b.left <= a.right
  && a.top <= b.bottom && b.top <= a.bottom

describe('conservative wet footprint broad phase', () => {
  it('never drops a geometrically overlapping candidate across positive and negative cells', () => {
    let seed = 728
    const number = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 }
    const box = (): FootprintBounds => {
      const left = number() * 2000 - 1000, top = number() * 2000 - 1000
      return { left, top, right: left + number() * 400, bottom: top + number() * 400 }
    }
    const index = new WatercolorFootprintIndex(), shapes = Array.from({ length: 200 }, box)
    shapes.forEach((bounds, id) => index.add(id, bounds))
    for (let i = 0; i < 100; i++) {
      const query = box(), candidates = new Set(index.candidates(query))
      shapes.forEach((shape, id) => { if (overlaps(shape, query)) expect(candidates.has(id)).toBe(true) })
    }
  })

  it('keeps exact cell-boundary tangencies and zero-width footprints', () => {
    const index = new WatercolorFootprintIndex()
    index.add(1, { left: -128, top: 0, right: 0, bottom: 128 })
    expect([...index.candidates({ left: 0, top: 128, right: 0, bottom: 128 })]).toContain(1)
  })

  it('falls back for huge inserted and queried footprints without missing small contacts', () => {
    const index = new WatercolorFootprintIndex()
    index.add(1, { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 })
    index.add(2, { left: 5, top: 5, right: 10, bottom: 10 })
    expect(new Set(index.candidates({ left: 6, top: 6, right: 7, bottom: 7 }))).toEqual(new Set([1, 2]))
    expect(new Set(index.candidates({ left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }))).toEqual(new Set([1, 2]))
  })

  it('falls back when grid coordinates exceed safe integer stepping', () => {
    const index = new WatercolorFootprintIndex()
    const point = { left: 1e300, top: 1e300, right: 1e300, bottom: 1e300 }
    index.add(1, point)
    expect([...index.candidates(point)]).toEqual([1])
  })

  it('keeps layer/period instances independent and ignores empty bounds', () => {
    const previous = new WatercolorFootprintIndex(), next = new WatercolorFootprintIndex()
    const rect = { left: 0, top: 0, right: 20, bottom: 20 }
    previous.add(1, rect)
    next.add(2, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
    expect([...next.candidates(rect)]).toEqual([])
    expect([...previous.candidates(rect)]).toEqual([1])
  })
})
