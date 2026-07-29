import { describe, expect, it } from 'vitest'

import { BIG_STEP_MULTIPLIER, parseNumberInput, snapToStep, stepValue } from './numberField'

describe('snapToStep', () => {
  it('snaps to the step grid and clamps to the range', () => {
    expect(snapToStep(12.4, 1, 1, 120)).toBe(12)
    expect(snapToStep(12.6, 1, 1, 120)).toBe(13)
    expect(snapToStep(999, 1, 1, 120)).toBe(120)
    expect(snapToStep(-5, 1, 1, 120)).toBe(1)
  })

  it('leaves no float noise on a fractional step', () => {
    // 0.1 + 0.2 arithmetic is exactly what a 0.01-step opacity field does 30
    // arrow presses in — the stored value must stay a clean 0.3, since it is
    // what gets displayed, saved and sent to the engine.
    expect(snapToStep(0.30000000000000004, 0.01, 0, 1)).toBe(0.3)
    expect(snapToStep(0.674, 0.01, 0, 1)).toBe(0.67)
  })

  it('snaps relative to min, not to zero', () => {
    // A range whose ends aren't on the step grid must still be reachable at
    // both ends rather than landing between its own endpoints.
    expect(snapToStep(3.5, 3, 1, 10)).toBe(4)
    expect(snapToStep(10, 3, 1, 10)).toBe(10)
  })

  it('passes a non-positive step through as a plain clamp', () => {
    expect(snapToStep(5.5, 0, 0, 10)).toBe(5.5)
  })
})

describe('stepValue', () => {
  it('moves one step per press', () => {
    expect(stepValue(12, 1, { step: 1, min: 1, max: 120 })).toBe(13)
    expect(stepValue(12, -1, { step: 1, min: 1, max: 120 })).toBe(11)
  })

  it('moves ten steps with the big modifier, not ten units', () => {
    // The distinction that matters for opacity: ten *units* would cross the
    // whole 0…1 range in a single Shift+Arrow.
    expect(stepValue(0.5, 1, { step: 0.01, min: 0, max: 1, big: true })).toBe(0.6)
    expect(stepValue(50, 1, { step: 1, min: 1, max: 120, big: true })).toBe(50 + BIG_STEP_MULTIPLIER)
  })

  it('clamps at the ends instead of wrapping', () => {
    expect(stepValue(119, 1, { step: 1, min: 1, max: 120, big: true })).toBe(120)
    expect(stepValue(1, -1, { step: 1, min: 1, max: 120 })).toBe(1)
  })
})

describe('parseNumberInput', () => {
  it('reads a plain number', () => {
    expect(parseNumberInput('42')).toBe(42)
    expect(parseNumberInput('  7.5 ')).toBe(7.5)
  })

  it('tolerates the decoration its own format adds', () => {
    expect(parseNumberInput('12px')).toBe(12)
    expect(parseNumberInput('100%')).toBe(100)
    expect(parseNumberInput('45°')).toBe(45)
  })

  it('accepts a comma decimal separator', () => {
    expect(parseNumberInput('7,5')).toBe(7.5)
  })

  it('returns null for anything without a number in it', () => {
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('   ')).toBeNull()
    expect(parseNumberInput('px')).toBeNull()
    expect(parseNumberInput('-')).toBeNull()
  })
})
