import { describe, expect, it } from 'vitest'

import { nextOptionIndex } from './optionGroupKeys'

describe('nextOptionIndex', () => {
  it('moves forward on Right and Down alike', () => {
    expect(nextOptionIndex('ArrowRight', 0, 3)).toBe(1)
    expect(nextOptionIndex('ArrowDown', 0, 3)).toBe(1)
  })

  it('moves back on Left and Up alike', () => {
    expect(nextOptionIndex('ArrowLeft', 2, 3)).toBe(1)
    expect(nextOptionIndex('ArrowUp', 2, 3)).toBe(1)
  })

  it('wraps around both ends', () => {
    expect(nextOptionIndex('ArrowRight', 2, 3)).toBe(0)
    expect(nextOptionIndex('ArrowLeft', 0, 3)).toBe(2)
  })

  it('jumps to the ends on Home and End', () => {
    expect(nextOptionIndex('Home', 2, 3)).toBe(0)
    expect(nextOptionIndex('End', 0, 3)).toBe(2)
  })

  it('returns null for keys it does not own, so they stay unprevented', () => {
    expect(nextOptionIndex('Tab', 0, 3)).toBeNull()
    expect(nextOptionIndex('Enter', 0, 3)).toBeNull()
    expect(nextOptionIndex(' ', 0, 3)).toBeNull()
  })

  it('stays put in a single-option group instead of dividing by zero', () => {
    expect(nextOptionIndex('ArrowRight', 0, 1)).toBe(0)
    expect(nextOptionIndex('ArrowLeft', 0, 1)).toBe(0)
  })

  it('returns null for an empty group', () => {
    expect(nextOptionIndex('ArrowRight', 0, 0)).toBeNull()
    expect(nextOptionIndex('Home', 0, 0)).toBeNull()
  })
})
