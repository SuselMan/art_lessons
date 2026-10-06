import { expect, it, vi } from 'vitest'
import { createTestEngine, dab } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from './ribbonProfile'

it('prepares water metadata without allocating or drawing GPU material', () => {
  const { engine } = createTestEngine()
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'], true, true)
  const presetName = 'normal:100:100:PB29:round'
  const preset = engine['_resolvePreset']('watercolor', presetName)
  const profile = ribbonProfileFor('watercolor', presetName)
  const draw = vi.spyOn(engine['gl'], 'drawArrays')
  const allocate = vi.spyOn(engine['_ribbonScratchPool'], 'acquire')
  const dabs = [dab(16, 16, { size: 32, t: 0 }), dab(24, 16, { size: 32, t: 16 })]
  try {
    const prepared = engine['_ribbonPainter']['prepareDelivery'](
      dabs, undefined, preset, profile, scratch, () => 0, 0, 'combined', false, true,
    )
    expect(draw).not.toHaveBeenCalled()
    expect(allocate).not.toHaveBeenCalled()
    expect([...scratch.tileEntries()]).toHaveLength(0)
    expect(scratch.standing.size).toBe(2)
    expect(prepared.waterByDab.size).toBe(2)
    expect(prepared.deposits.every(x => x > 0)).toBe(true)
    expect(scratch.waterUsed).toBeGreaterThan(0)
    expect(scratch.brushTravel).toHaveLength(1)
    const firstWater = [...prepared.waterByDab.values()]
    const later = dab(36, 16, { size: 32, t: 32 })
    engine['_ribbonPainter']['prepareDelivery'](
      [later], dabs[1], preset, profile, scratch, () => 1, 0, 'combined', false, true,
    )
    expect([...prepared.waterByDab.values()]).toEqual(firstWater)
    expect(prepared.waterByDab.has(later)).toBe(false)
  } finally {
    draw.mockRestore(); allocate.mockRestore(); scratch.destroy(); engine.destroy()
  }
})
