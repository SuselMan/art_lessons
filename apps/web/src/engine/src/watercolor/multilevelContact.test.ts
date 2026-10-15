import { expect, it } from 'vitest'
import { multilevelContactSchedule } from './multilevelContact'
import { WC_BRUSH_JUMP_FRAG } from '../raster/shaders'

it('retains the integrated spatial second moment with bounded paired exchange at both strengths', () => {
  for (const pulses of [8, 31, 100, 400]) for (const strength of [4, 8] as const) {
    const schedule = multilevelContactSchedule(pulses, .13, strength)
    expect(schedule.reduce((sum, s) => sum + s.count * s.gain * s.jump ** 2, 0)).toBeCloseTo(pulses * .13, 12)
    expect(schedule.reduce((sum, s) => sum + s.count * s.mixScale * s.jump ** 2, 0)).toBeCloseTo(pulses, 12)
    expect(schedule.at(-1)?.jump).toBe(1)
    for (const s of schedule) { expect(s.gain).toBeGreaterThan(0); expect(s.gain).toBeLessThanOrEqual(.13); expect(s.mixScale).toBeLessThanOrEqual(1) }
    if (pulses >= 100) expect(schedule.reduce((sum, s) => sum + s.count, 0)).toBeLessThan(pulses / 4)
  }
})
it('keeps the accepted unit solver when disabled or contact has one pulse', () => {
  expect(multilevelContactSchedule(100, .13, 0)).toEqual([{ jump: 1, count: 100, gain: .13, mixScale: 1 }])
  expect(multilevelContactSchedule(1, .13, 8)).toEqual([{ jump: 1, count: 1, gain: .13, mixScale: 1 }])
})
it('checks every crossed wet/flow cell while preserving common P/C capacity constraints', () => {
  expect(WC_BRUSH_JUMP_FRAG).toContain('float(j) < u_jump')
  expect(WC_BRUSH_JUMP_FRAG).toContain('pathDose = min(pathDose, flowAt(q).b)')
  expect(WC_BRUSH_JUMP_FRAG).toContain('texture2D(u_water, q).a < 0.015')
  expect(WC_BRUSH_JUMP_FRAG).toContain('mixFraction * pathDose * u_mixScale')
  expect(WC_BRUSH_JUMP_FRAG).toContain('channelLimit(C.a,roomC.a,raw)')
})

it('replaces 2..7 local pulses with one bounded nonlocal P/C exchange', () => {
  for (const pulses of [2, 3, 4, 5, 6, 7]) for (const strength of [4, 8] as const) {
    const schedule = multilevelContactSchedule(pulses, .13, strength)
    expect(schedule).toHaveLength(1)
    const s = schedule[0]
    expect(s.count).toBe(1)
    expect(s.jump).toBe(strength === 8 || pulses > 4 ? 4 : 2)
    expect(s.gain * s.jump ** 2).toBeCloseTo(pulses * .13, 12)
    expect(s.mixScale * s.jump ** 2).toBeCloseTo(pulses, 12)
    expect(s.mixScale).toBeLessThanOrEqual(1)
    expect(s.gain).toBeLessThanOrEqual(.13)
  }
})
