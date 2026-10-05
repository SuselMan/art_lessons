import { describe, expect, it } from 'vitest'
import { advanceSolventSource, type SolventSourceClock, type WaterPolicy } from './solventSource'
import { watercolorBrushRunsDry, watercolorWaterClock, watercolorWaterLoad, watercolorWaterStep } from '../presets/watercolorPresets'

const samples = Array.from({ length: 87 }, (_, i) => ({
  seg: i % 11 === 0 ? 0 : (i * 17 % 31) + 0.125,
  radius: 0.5 + (i * 7 % 19), wet: i % 9 / 8,
}))
const profile = { waterDepletion: true, waterLevel: 0.73, pigmentStrength: 0.8 }
function sequence(cuts: number[], policy: WaterPolicy, segmentMode = true) {
  let clock: SolventSourceClock = { waterUsed: 0, pigmentUsed: 0 }
  const amplitudes: number[] = []
  let start = 0
  for (const end of cuts) {
    for (const s of samples.slice(start, end)) {
      const next = advanceSolventSource(clock, profile, s.seg, s.radius, s.wet, segmentMode, policy)
      amplitudes.push(next.water)
      clock = next
    }
    start = end
  }
  return { clock, amplitudes }
}
describe('exact solvent source amplitude extraction', () => {
  it('preserves the previous own-source equations for all water policies', () => {
    for (const policy of ['legacy', 'finite', 'bottomless'] as const) for (const segmentMode of [false, true]) {
      let used = 0, pigment = 0
      const expected: number[] = []
      for (const s of samples) {
        const step = watercolorWaterStep(s.seg, s.radius)
        pigment += step
        used = watercolorWaterClock(used, step, s.wet)
        const spends = segmentMode && policy !== 'legacy' ? policy === 'finite' : watercolorBrushRunsDry(profile.pigmentStrength)
        expected.push(profile.waterLevel * (spends ? watercolorWaterLoad(used) : 1))
      }
      const actual = sequence([samples.length], policy, segmentMode)
      expect(actual.amplitudes).toEqual(expected)
      expect(actual.clock.waterUsed).toBe(used)
      expect(actual.clock.pigmentUsed).toBe(pigment)
    }
  })
  it('has identical amplitudes and clocks across 1, 3 or 7 chunks', () => {
    for (const policy of ['legacy', 'finite', 'bottomless'] as const) {
      const ref = sequence([87], policy)
      expect(sequence([13, 57, 87], policy)).toEqual(ref)
      expect(sequence([1, 2, 15, 30, 51, 69, 87], policy)).toEqual(ref)
    }
  })
  it('recorded wetness refills only the water clock; bottomless source does not depend on pigment', () => {
    const dry = advanceSolventSource({ waterUsed: 12, pigmentUsed: 12 }, profile, 10, 5, 0, true, 'finite')
    const wet = advanceSolventSource({ waterUsed: 12, pigmentUsed: 12 }, profile, 10, 5, 1, true, 'finite')
    expect(wet.waterUsed).toBeLessThan(dry.waterUsed)
    expect(wet.pigmentUsed).toBe(dry.pigmentUsed)
    for (const pigmentStrength of [0, 0.15, 1]) {
      expect(advanceSolventSource({ waterUsed: 12, pigmentUsed: 12 }, { ...profile, pigmentStrength }, 10, 5, 0, true, 'bottomless').water).toBe(profile.waterLevel)
    }
  })
})

import { assembleForeignSolvent, type RasterizedSolventChunk } from './solventSource'
const chunk = (gesture: string, id: string, values: number[], done = true, epoch = 1): RasterizedSolventChunk => ({
  gesture, chunk: id, volume: new Float32Array(values), done, epoch,
})
describe('ephemeral foreign reservoir CPU reference', () => {
  it('MAXes chunks of one gesture, ADDs different gestures and reports cap as the existing limit', () => {
    expect([...assembleForeignSolvent([
      chunk('a', 'a1', [1, 0.5, 3]), chunk('a', 'a2', [0.5, 2, 1]),
      chunk('b', 'b1', [0.75, 1, 2]),
    ], 3, 1, 'current')]).toEqual([1.75, 3, 4])
  })
  it('repeated chunks and repeated settles cannot add their water twice or mutate source data', () => {
    const a = chunk('a', 'a1', [0.5, 1]), b = chunk('a', 'a2', [1, 0.75])
    const expected = assembleForeignSolvent([a, b], 2, 1, 'current')
    expect(assembleForeignSolvent([a, b, a, b], 2, 1, 'current')).toEqual(expected)
    expect(assembleForeignSolvent([a, b], 2, 1, 'current')).toEqual(expected)
    expect([...a.volume]).toEqual([0.5, 1])
    expect([...b.volume]).toEqual([1, 0.75])
  })
  it('excludes undone, dried/cleared epochs and own source', () => {
    expect([...assembleForeignSolvent([
      chunk('undone', 'u', [4], false), chunk('old', 'o', [4], true, 0),
      chunk('current', 'c', [4]), chunk('fresh', 'f', [0.25]),
    ], 1, 1, 'current')]).toEqual([0.25])
  })
})
