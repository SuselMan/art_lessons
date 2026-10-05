import { describe, expect, it } from 'vitest'
import { watercolorPigmentHazard, watercolorPigmentLoad, watercolorPigmentRate, watercolorPigmentRun } from './watercolorPresets'

describe('available-fluid pigment clock', () => {
  it('matches the existing constant-fluid curve across partitions', () => {
    for (const water of [0, .15, .7, 1]) {
      let h = 0
      for (const distance of [0, .125, 1.5, 4, 8]) h = watercolorPigmentHazard(h, distance, water)
      expect(Math.exp(-h)).toBeCloseTo(watercolorPigmentLoad(13.625, water), 14)
      expect(h).toBeCloseTo(watercolorPigmentHazard(0, 13.625, water), 14)
    }
  })
  it('never restores stock when the brush enters water', () => {
    const dry = watercolorPigmentHazard(0, 8, 0)
    const wet = watercolorPigmentHazard(dry, 1, 1)
    expect(wet).toBeGreaterThan(dry)
    expect(Math.exp(-wet)).toBeLessThan(Math.exp(-dry))
    expect(watercolorPigmentHazard(wet, -1, 1)).toBe(wet)
  })
  it('bounds a varying-fluid delivery by the actual maximum rate times run', () => {
    const maxBudget = Math.max(...Array.from({ length: 1001 }, (_, i) => watercolorPigmentRate(i / 1000) * watercolorPigmentRun(i / 1000)))
    expect(maxBudget).toBeGreaterThan(96)
    expect(maxBudget).toBeLessThan(96.267)
    let h = 0, dose = 0
    for (let i = 0; i < 100000; i++) {
      const water = i < 1000 ? 0 : i % 100 < 40 ? .3 : 1
      h = watercolorPigmentHazard(h, .01, water)
      dose += .01 * watercolorPigmentRate(water) * Math.exp(-h)
    }
    expect(dose).toBeLessThan(maxBudget)
  })
})
