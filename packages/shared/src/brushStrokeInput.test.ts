import { describe, expect, it } from 'vitest'
import { isBrushBehavior } from './brushBehavior.js'

const accepts = (strokeInput: unknown) => isBrushBehavior({ version: 2, strokeInput })
const input = { version: 1, initialDirection: 'cursorHistory' }

describe('author-side stroke input contract', () => {
  it('keeps legacy descriptors and permits the explicit history law without fan insertion', () => {
    expect(isBrushBehavior({ version: 2 })).toBe(true)
    expect(accepts(input)).toBe(true)
    for (const stepDegrees of [5, 10, 30, 90]) {
      expect(accepts({ ...input, fanCorners: { stepDegrees } })).toBe(true)
    }
  })
  it('rejects unsafe, fractional, unknown and incomplete input policies', () => {
    for (const value of [null, [], {}, { ...input, version: 2 }, { ...input, initialDirection: 'fixed' }, { ...input, extra: true }]) {
      expect(accepts(value)).toBe(false)
    }
    for (const stepDegrees of [0, -1, 4, 91, 180, 6.5, NaN, Infinity, '30', undefined]) {
      expect(accepts({ ...input, fanCorners: { stepDegrees } })).toBe(false)
    }
    for (const fanCorners of [null, [], {}, { stepDegrees: 30, extra: 1 }, { stepRadians: Math.PI / 6 }]) {
      expect(accepts({ ...input, fanCorners })).toBe(false)
    }
  })
})
