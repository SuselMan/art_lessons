import { describe, expect, it } from 'vitest'
import { planCanonicalTargets } from './CanonicalTargetPlan'

const rect = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY })
describe('canonical authoritative target planning', () => {
  it('clips a giant footprint to the page before fanout admission', () => {
    const plan = planCanonicalTargets(rect(-1e9, -1e9, 1e9, 1e9), rect(0, 0, 10, 7), 10, 7)
    expect(plan.tiles).toEqual([{ tileX: 0, tileY: 0, storage: rect(0, 0, 10, 7), paint: rect(0, 0, 10, 7) }])
    expect(plan.clippedRect).toEqual(rect(0, 0, 10, 7))
  })
  it('preserves full storage and per-tile write bounds on an offset page', () => {
    const plan = planCanonicalTargets(rect(-20, -20, 20, 20), rect(-3, -2, 5, 3), 4, 4)
    expect(plan.tiles.map(t => [t.tileX, t.tileY])).toEqual([[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0]])
    expect(plan.tiles[0]).toEqual({ tileX: -1, tileY: -1, storage: rect(-4, -4, 0, 0), paint: rect(-3, -2, 0, 0) })
    expect(plan.tiles[5].paint).toEqual(rect(4, 0, 5, 3))
  })
  it('has no targets for outside, touching or empty footprints', () => {
    for (const footprint of [rect(-5, 1, 0, 2), rect(10, 0, 20, 10), rect(2, 2, 2, 4)])
      expect(planCanonicalTargets(footprint, rect(0, 0, 10, 10), 4, 4)).toEqual({ clippedRect: undefined, tiles: [] })
  })
  it('preserves half-open negative boundary geometry on an infinite page', () => {
    expect(planCanonicalTargets(rect(-8, -6, 0, 0), null, 4, 3).tiles.map(t => [t.tileX, t.tileY]))
      .toEqual([[-2, -2], [-1, -2], [-2, -1], [-1, -1]])
  })
  it('rejects enormous fanout before enumeration and accepts the exact cap', () => {
    expect(() => planCanonicalTargets(rect(-1e9, -1e9, 1e9, 1e9), null, 1, 1)).toThrow('fanout')
    expect(planCanonicalTargets(rect(0, 0, 8, 8), null, 1, 1).tiles).toHaveLength(64)
    expect(() => planCanonicalTargets(rect(0, 0, 65, 1), null, 1, 1)).toThrow('fanout')
    expect(() => planCanonicalTargets(rect(0, 0, 3, 3), null, 1, 1, 8)).toThrow('fanout')
  })
  it('rejects invalid geometry and unsafe outward tile extents', () => {
    for (const footprint of [rect(NaN, 0, 1, 1), rect(0, 0, Infinity, 1), rect(.5, 0, 1, 1), rect(2, 0, 1, 1)])
      expect(() => planCanonicalTargets(footprint, null, 4, 4)).toThrow('geometry')
    expect(() => planCanonicalTargets(rect(0, 0, 1, 1), rect(1, 0, 0, 1), 4, 4)).toThrow('geometry')
    expect(() => planCanonicalTargets(rect(Number.MAX_SAFE_INTEGER - 1, 0, Number.MAX_SAFE_INTEGER, 1), null, 4, 4)).toThrow('extent')
    for (const size of [0, -1, .5, 4097, NaN]) expect(() => planCanonicalTargets(rect(0, 0, 1, 1), null, size, 4)).toThrow('geometry')
  })
  it('does not retain mutable caller geometry', () => {
    const footprint = rect(0, 0, 2, 2), page = rect(0, 0, 1, 1)
    const plan = planCanonicalTargets(footprint, page, 4, 4)
    footprint.minX = page.minX = 100
    expect(plan.clippedRect).toEqual(rect(0, 0, 1, 1))
    expect(Object.isFrozen(plan.tiles[0].paint)).toBe(true)
  })
})
