import { describe, expect, it } from 'vitest'

import { PENCIL_GRADES, PENCIL_PRESETS, isPencilGrade } from './pencilPresets'

// Grades the toolbar exposes as dedicated quick-pick keyboard shortcuts (Room's
// '1'-'5' keydown map). All must resolve to a real, distinct preset — no silent
// fallback to HB.
const SHORTCUT_GRADES = ['H', 'HB', '2B', '4B', '6B'] as const

describe('PENCIL_GRADES', () => {
  it('covers the full standard 6H-6B range plus F, ordered hardest to softest', () => {
    expect(PENCIL_GRADES).toEqual([
      '6H', '5H', '4H', '3H', '2H', 'H', 'F', 'HB', 'B', '2B', '3B', '4B', '5B', '6B',
    ])
  })

  it('has no duplicate grade names', () => {
    expect(new Set(PENCIL_GRADES).size).toBe(PENCIL_GRADES.length)
  })
})

describe('PENCIL_PRESETS', () => {
  it('has a real entry for every grade in PENCIL_GRADES', () => {
    for (const grade of PENCIL_GRADES) {
      expect(PENCIL_PRESETS[grade]).toBeDefined()
    }
    expect(Object.keys(PENCIL_PRESETS)).toHaveLength(PENCIL_GRADES.length)
  })

  it('never falls back to a default — every shortcut-exposed grade is its own distinct preset', () => {
    const seen = new Map<string, string>()
    for (const grade of SHORTCUT_GRADES) {
      const key = JSON.stringify(PENCIL_PRESETS[grade])
      const clashesWith = seen.get(key)
      expect(clashesWith, `${grade} has identical values to ${clashesWith} — looks like a silent fallback`).toBeUndefined()
      seen.set(key, grade)
    }
  })

  it('preserves the hand-calibrated H / HB / 2B anchors exactly', () => {
    expect(PENCIL_PRESETS['H']).toEqual({ opacity: 0.32, hardness: 0.55, sizeMultiplier: 0.85 })
    expect(PENCIL_PRESETS['HB']).toEqual({ opacity: 0.48, hardness: 0.38, sizeMultiplier: 1.00 })
    expect(PENCIL_PRESETS['2B']).toEqual({ opacity: 0.65, hardness: 0.25, sizeMultiplier: 1.10 })
  })

  it('is monotonically non-decreasing in opacity from 6H to 6B', () => {
    const values = PENCIL_GRADES.map(g => PENCIL_PRESETS[g].opacity)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })

  it('is monotonically non-increasing in hardness from 6H to 6B', () => {
    const values = PENCIL_GRADES.map(g => PENCIL_PRESETS[g].hardness)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1])
    }
  })

  it('is monotonically non-decreasing in sizeMultiplier from 6H to 6B', () => {
    const values = PENCIL_GRADES.map(g => PENCIL_PRESETS[g].sizeMultiplier)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })

  it('keeps every value within a sane, non-nonsensical range', () => {
    for (const grade of PENCIL_GRADES) {
      const preset = PENCIL_PRESETS[grade]
      expect(preset.opacity).toBeGreaterThan(0)
      expect(preset.opacity).toBeLessThanOrEqual(1)
      expect(preset.hardness).toBeGreaterThan(0)
      expect(preset.hardness).toBeLessThanOrEqual(1)
      expect(preset.sizeMultiplier).toBeGreaterThan(0)
    }
  })
})

describe('isPencilGrade', () => {
  it('accepts every known grade', () => {
    for (const grade of PENCIL_GRADES) {
      expect(isPencilGrade(grade)).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(isPencilGrade('9B')).toBe(false)
    expect(isPencilGrade('')).toBe(false)
    expect(isPencilGrade('hb')).toBe(false)
  })
})
