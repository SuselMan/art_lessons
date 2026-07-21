import { describe, expect, it } from 'vitest'

import type { Dab } from '@art-lessons/shared'

import {
  LINER_PRESET, LINER_SIZES_MM, LINER_DWELL, applyLinerEndTaper,
  linerSpeedFlow, linerTiltFlow, dwellFlow, dwellConfigForTool,
} from './linerPresets'

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

describe('linerSpeedFlow (#245: constant-flow-over-time model)', () => {
  it('is 1.0 (baseline) at the reference "comfortable" speed', () => {
    expect(linerSpeedFlow(1)).toBeCloseTo(1.0)
  })

  it('drops toward the lighter floor as speed increases, without ever reaching 0', () => {
    expect(linerSpeedFlow(2)).toBeCloseTo(0.5)
    expect(linerSpeedFlow(100)).toBeCloseTo(0.5) // clamped, not a runaway toward 0
    expect(linerSpeedFlow(2)).toBeLessThan(linerSpeedFlow(1))
  })

  it('rises toward the darker ceiling as speed drops toward a stop', () => {
    expect(linerSpeedFlow(0)).toBeCloseTo(1.4)
    expect(linerSpeedFlow(0.01)).toBeCloseTo(1.4) // clamped, not a runaway toward infinity
    expect(linerSpeedFlow(0.5)).toBeGreaterThan(linerSpeedFlow(1))
  })

  it('is monotonically decreasing in speed', () => {
    const speeds = [0, 0.25, 0.5, 1, 1.5, 2, 3]
    const flows = speeds.map(linerSpeedFlow)
    for (let i = 1; i < flows.length; i++) expect(flows[i]).toBeLessThanOrEqual(flows[i - 1])
  })
})

describe('dwellFlow / dwellConfigForTool / LINER_DWELL (#245)', () => {
  it('starts at 1.0 (continuous with linerSpeedFlow at the moment movement stops)', () => {
    expect(dwellFlow(0, LINER_DWELL)).toBeCloseTo(1.0)
  })

  it('ramps up monotonically toward, but never past, maxFlow', () => {
    const samples = [0, 50, 150, 300, 600, 2000].map(ms => dwellFlow(ms, LINER_DWELL))
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1])
    expect(samples.at(-1)).toBeLessThan(LINER_DWELL.maxFlow)
    expect(samples.at(-1)).toBeGreaterThan(LINER_DWELL.maxFlow - 0.01) // effectively saturated by 2s
  })

  it('only liner opts into dwell today', () => {
    expect(dwellConfigForTool('liner')).toBe(LINER_DWELL)
    expect(dwellConfigForTool('pencil')).toBeNull()
    expect(dwellConfigForTool('eraser')).toBeNull()
    expect(dwellConfigForTool('smudge')).toBeNull()
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
