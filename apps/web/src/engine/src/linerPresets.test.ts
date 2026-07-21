import { describe, expect, it } from 'vitest'

import type { Dab } from '@art-lessons/shared'

import { LINER_PRESET, LINER_SIZES_MM, applyLinerEndTaper, linerSpeedFlow, linerTiltFlow } from './linerPresets'

describe('LINER_SIZES_MM', () => {
  it('is the fixed, ascending MVP size ladder from ADR 003', () => {
    expect(LINER_SIZES_MM).toEqual([0.1, 0.2, 0.3, 0.5, 0.8])
  })
})

describe('LINER_PRESET', () => {
  it('has no hardness scale — one flat preset for every size (unlike PENCIL_PRESETS)', () => {
    expect(LINER_PRESET.opacity).toBeGreaterThan(0.85) // near-saturated first pass, ADR §5
    expect(LINER_PRESET.hardness).toBeGreaterThan(0.7) // crisp edge, not graphite's soft falloff
    expect(LINER_PRESET.sizeMultiplier).toBe(1)
  })
})

describe('linerSpeedFlow', () => {
  it('peaks near rest/slow movement and settles to a soft floor when fast, never fading to 0', () => {
    expect(linerSpeedFlow(0)).toBeCloseTo(1.08)
    expect(linerSpeedFlow(2)).toBeCloseTo(0.88)
    expect(linerSpeedFlow(100)).toBeCloseTo(0.88) // clamped, not a runaway negative
    expect(linerSpeedFlow(1)).toBeGreaterThan(0.88)
    expect(linerSpeedFlow(1)).toBeLessThan(1.08)
  })
})

describe('linerTiltFlow', () => {
  it('is neutral at ordinary writing angles', () => {
    expect(linerTiltFlow(0)).toBe(1)
    expect(linerTiltFlow(30)).toBe(1)
    expect(linerTiltFlow(54.9)).toBe(1)
  })

  it('reduces flow only mildly in the 55-70deg range', () => {
    const at60 = linerTiltFlow(60)
    expect(at60).toBeLessThan(1)
    expect(at60).toBeGreaterThan(0.9)
  })

  it('reduces flow a bit more past 70deg, still bounded', () => {
    expect(linerTiltFlow(90)).toBeCloseTo(0.85)
    expect(linerTiltFlow(90)).toBeGreaterThan(0.8)
  })
})

describe('applyLinerEndTaper', () => {
  function makeDabs(n: number, size = 10): Dab[] {
    return Array.from({ length: n }, () => (
      { x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, size, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
    ))
  }

  it('is a no-op below the taper-start speed threshold', () => {
    const dabs = makeDabs(5)
    applyLinerEndTaper(dabs, 0.5)
    expect(dabs.every(d => d.size === 10)).toBe(true)
  })

  it('shrinks only the last few dabs, ramping toward the very last one, bounded to ~15%', () => {
    const dabs = makeDabs(6)
    applyLinerEndTaper(dabs, 10) // well past the "fully tapered" speed
    // Untouched: everything before the last 4.
    expect(dabs[0].size).toBe(10)
    expect(dabs[1].size).toBe(10)
    // Tapered window: strictly decreasing toward the end, each within 15%.
    for (let i = 2; i < dabs.length; i++) {
      expect(dabs[i].size).toBeLessThan(10)
      expect(dabs[i].size).toBeGreaterThan(8.4) // > 10 * (1 - 0.15) - epsilon
    }
    expect(dabs[5].size).toBeLessThan(dabs[2].size)
  })

  it('does nothing on an empty array', () => {
    expect(() => applyLinerEndTaper([], 10)).not.toThrow()
  })
})
