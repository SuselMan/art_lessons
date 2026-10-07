import { describe, expect, it } from 'vitest'
import { BrushContactFieldCache } from './BrushContactFieldCache'
import { brushDragContacts, type BrushTravel } from './brushDrag'

const rect = { x: -40, y: -40, w: 500, h: 400 }
const motion: BrushTravel = { x: 180, y: 160, radius: 200, aspect: 1.3, angle: .73, dx: 24, dy: -12, water: .8 }
const travel = Array.from({ length: 3 }, (_, i) => ({ ...motion, x: motion.x + i * 8, y: motion.y + i * 3 }))
function exact(actual: ReturnType<BrushContactFieldCache['contacts']>, expected: ReturnType<typeof brushDragContacts>) {
  expect(actual.map(c => [c.rect, c.radius, c.field.width, c.field.height])).toEqual(expected.map(c => [c.rect, c.radius, c.field.width, c.field.height]))
  for (let i = 0; i < actual.length; i++) expect(Buffer.compare(Buffer.from(actual[i].field.pixels), Buffer.from(expected[i].field.pixels))).toBe(0)
}

describe('bounded exact CPU contact field cache', () => {
  it('reuses cloned inputs without sharing mutable payloads with the owner', () => {
    const cache = new BrushContactFieldCache()
    const expected = brushDragContacts(travel, rect)
    const first = cache.contacts(travel, rect)
    exact(first, expected)
    expect(cache.stats.misses).toBe(1)
    first[0].field.pixels.fill(0)
    const next = cache.contacts(travel.map(d => ({ ...d })), { ...rect })
    exact(next, expected)
    expect(cache.stats.hits).toBe(1)
    next[0].field.pixels.fill(4)
    exact(cache.contacts(travel, rect), expected)
    expect(cache.stats.hits).toBe(2)
  })

  it('keys all eight ordered field inputs, including tiny double changes', () => {
    for (const key of ['x', 'y', 'radius', 'aspect', 'angle', 'dx', 'dy', 'water'] as const) {
      const cache = new BrushContactFieldCache()
      cache.contacts(travel, rect)
      const changed = travel.map(d => ({ ...d }))
      changed[1][key] += key === 'water' ? 1e-10 : .000001
      exact(cache.contacts(changed, rect), brushDragContacts(changed, rect))
      expect(cache.stats.hits).toBe(0)
      expect(cache.stats.misses).toBe(2)
    }
  })

  it('preserves order, grouping and pulse radius while reusing only field inputs', () => {
    const cache = new BrushContactFieldCache()
    cache.contacts(travel, rect)
    const reversed = [...travel].reverse()
    exact(cache.contacts(reversed, rect), brushDragContacts(reversed, rect))
    expect(cache.stats.hits).toBe(0)
    const radiusOnly = travel.map(d => ({ ...d, settleRadius: 333 }))
    exact(cache.contacts(radiusOnly, rect), brushDragContacts(radiusOnly, rect))
    expect(cache.stats.hits).toBe(1)
    expect(cache.contacts(radiusOnly, rect)[0].radius).toBe(333)
  })

  it('invalidates a field whose crop changes and distinguishes signed zero', () => {
    const cache = new BrushContactFieldCache()
    cache.contacts(travel, rect)
    const clipped = { x: 170, y: 160, w: 20, h: 20 }
    exact(cache.contacts(travel, clipped), brushDragContacts(travel, clipped))
    expect(cache.stats.hits).toBe(0)
    const zero = [{ ...motion, x: 0 }]
    cache.contacts(zero, rect)
    cache.contacts([{ ...motion, x: -0 }], rect)
    expect(cache.stats.hits).toBe(0)
  })

  it('bounds retention by both bytes and entries, retaining old payload independence after eviction', () => {
    const tiny = new BrushContactFieldCache(100)
    exact(tiny.contacts(travel, rect), brushDragContacts(travel, rect))
    expect(tiny.stats.entries).toBe(0); expect(tiny.stats.bytes).toBe(0)
    const cache = new BrushContactFieldCache(1024 * 1024, 2)
    const first = cache.contacts(travel, rect)
    for (let i = 1; i < 8; i++) {
      const shifted = travel.map(d => ({ ...d, x: d.x + i }))
      exact(cache.contacts(shifted, rect), brushDragContacts(shifted, rect))
      expect(cache.stats.entries).toBeLessThanOrEqual(2)
      expect(cache.stats.bytes).toBeLessThanOrEqual(1024 * 1024)
    }
    exact(first, brushDragContacts(travel, rect))
    cache.clear(); expect(cache.stats.entries).toBe(0); expect(cache.stats.bytes).toBe(0)
  })

  it('handles empty/dry contact input and bypasses unusually long groups', () => {
    const cache = new BrushContactFieldCache()
    exact(cache.contacts([], rect), brushDragContacts([], rect))
    exact(cache.contacts([{ ...motion, water: 0 }], rect), brushDragContacts([{ ...motion, water: 0 }], rect))
    const long = Array.from({ length: 65 }, () => ({ ...motion, dx: .02, dy: 0 }))
    exact(cache.contacts(long, rect), brushDragContacts(long, rect))
    expect(cache.stats.entries).toBe(0); expect(cache.stats.bypasses).toBe(1)
  })
})
