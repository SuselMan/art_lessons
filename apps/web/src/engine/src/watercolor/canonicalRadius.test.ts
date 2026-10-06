import { describe, expect, it } from 'vitest'
import { canonicalMinorRadius, canonicalMajorRadius } from './canonicalRadius'
import { brushDragContacts, type BrushTravel } from './brushDrag'

describe('default-off canonical solver radius experiment', () => {
  it('canonicalises recorded inputs before multiplying, including non-unit presets/aspects', () => {
    for (const size of [33.175935919141808, 29.858342327227628, 123.123456789]) {
      for (const aspect of [1, 1.777777777, 4.01234567]) for (const multiplier of [1, .8, 1.3]) {
        expect(canonicalMajorRadius(size, aspect, multiplier)).toBe(canonicalMajorRadius(Math.fround(size), Math.fround(aspect), multiplier))
        expect(canonicalMinorRadius(size, multiplier)).toBe(canonicalMinorRadius(Math.fround(size), multiplier))
      }
    }
  })
  it('leaves flow geometry/field bytes unchanged while selecting the diagnostic gain radius', () => {
    const radius = 16.587967959570904
    const travel: BrushTravel[] = Array.from({ length: 12 }, (_, i) => ({
      x: 100 + i * 10, y: 150, radius, aspect: 1, angle: 0, dx: 10, dy: 0, water: 1,
    }))
    const rect = { x: 0, y: 0, w: 517, h: 387 }
    const off = brushDragContacts(travel, rect)
    const on = brushDragContacts(travel.map(d => ({ ...d, settleRadius: canonicalMinorRadius(d.radius * 2, 1) })), rect)
    expect(on.length).toBe(off.length)
    for (let i = 0; i < off.length; i++) {
      expect(on[i].rect).toEqual(off[i].rect)
      expect(on[i].field).toEqual(off[i].field)
      expect(on[i].radius).toBe(16.587968826293945)
      expect(off[i].radius).toBe(radius)
    }
  })
})
