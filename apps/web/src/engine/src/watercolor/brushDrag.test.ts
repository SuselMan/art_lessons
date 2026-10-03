import { describe, expect, it } from 'vitest'
import { brushDragField, type BrushTravel } from './brushDrag'

const rect = { x: 0, y: 0, w: 64, h: 64 }
const motion: BrushTravel = { x: 32, y: 32, radius: 20, aspect: 1, angle: 0, dx: 8, dy: 0, water: 1 }
const at = (f: NonNullable<ReturnType<typeof brushDragField>>, x: number, y: number) => [...f.pixels.slice(((f.height - 1 - y) * f.width + x) * 4, ((f.height - 1 - y) * f.width + x) * 4 + 4)]
describe('recorded brush contact flow', () => {
  it('does not move paint with a dry brush or stationary jitter', () => {
    const f = brushDragField([{ ...motion, water: 0 }, { ...motion, dx: 0.001 }], rect)!
    expect(f.pixels.filter((_, i) => i % 4 === 2).some(x => x > 0)).toBe(false)
  })
  it('acts inside the actual footprint, with world Y converted to GL Y', () => {
    const f = brushDragField([{ ...motion, dx: 0, dy: 8 }], rect)!
    expect(at(f, 8, 8)[1]).toBeLessThan(128)
    expect(at(f, 8, 8)[2]).toBeGreaterThan(0)
    expect(at(f, 0, 0)[2]).toBe(0)
  })
  it('weights travel, not the number of coalesced dabs', () => {
    const a = brushDragField([motion], rect)!
    const b = brushDragField(Array.from({ length: 8 }, () => ({ ...motion, dx: 1 })), rect)!
    expect([...a.pixels]).toEqual([...b.pixels])
  })
  it('remembers a return direction rather than cancelling both passes', () => {
    const f = brushDragField([motion, { ...motion, dx: -30 }], rect)!
    expect(at(f, 8, 8)[0]).toBeLessThan(128)
  })
})
