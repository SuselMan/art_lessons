import { describe, expect, it } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { appendWatercolorLift } from './watercolorLift'
const dab = (x: number, y: number, pressure = 0.8): Dab => ({ x, y, pressure, size: 80, aspectRatio: 1, angle: 0, opacity: 1, tiltX: 0, tiltY: 0, t: x })
describe('watercolor pen-up', () => {
  it('records a falling contact even when the final device pressure is high', () => {
    const recorded = [dab(0, 0), dab(30, 0)]
    const pending = [dab(40, 0)]
    appendWatercolorLift(pending, recorded)
    expect(recorded).toEqual([dab(0, 0), dab(30, 0)])
    expect(pending[0]).toEqual(dab(40, 0))
    expect(pending.at(-1)?.pressure).toBe(0)
    expect(pending.at(-1)?.x).toBe(52)
    expect(pending.slice(1).every(d => d.y === 0 && d.t > 40)).toBe(true)
  })
  it('uses the incoming path through a stationary pause and works without pending dabs', () => {
    const pending: Dab[] = []
    appendWatercolorLift(pending, [dab(0, 0), dab(30, 0), dab(40, 0), dab(40, 0), dab(40, 0)])
    expect(pending.at(-1)?.x).toBe(52)
    expect(pending.every(d => d.y === 0)).toBe(true)
  })
  it('never re-inflates a tip narrowed by real pressure and the end taper', () => {
    const recorded = [dab(0, 0), dab(30, 0)]
    const pending = [{ ...dab(40, 0, 0.2), size: 24, aspectRatio: 5 }]
    appendWatercolorLift(pending, recorded)
    for (let i = 1; i < pending.length; i++) {
      expect(pending[i].size).toBeLessThan(pending[i - 1].size)
      expect(pending[i].pressure).toBeLessThan(pending[i - 1].pressure)
      expect(pending[i].aspectRatio).toBe(5)
    }
    expect(pending.at(-1)?.x).toBeCloseTo(43.84)
  })
  it('does not invent a direction for a tap or an empty stroke', () => {
    const tap = [dab(5, 5)]
    appendWatercolorLift(tap, [])
    expect(tap).toEqual([dab(5, 5)])
    const empty: Dab[] = []
    appendWatercolorLift(empty, [])
    expect(empty).toEqual([])
  })
})
