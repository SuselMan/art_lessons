import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'

type Probe = { _ribbonScratchPool: RibbonScratchPool; _settlePlan: WatercolorSettlePlan; _watercolorPasses: WatercolorPasses }
function run(enabled: boolean) {
  const { engine, canvas } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const mock = canvas.getContext('webgl')!
  const p = engine as unknown as Probe
  expect(p._settlePlan.diagnosticContactFieldCache).toBe(false)
  p._settlePlan.diagnosticContactFieldCache = enabled
  const tile = p._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(p._ribbonScratchPool, true, true)
  scratch.getOrCreate(tile); scratch.paints.add('1,0,0')
  scratch.brushTravel = [{ x: 30, y: 30, radius: 8, aspect: 1.5, angle: .31, dx: 5, dy: -2, water: .8 }]
  const brush = vi.spyOn(p._watercolorPasses, 'brushPass')
  const upload = vi.spyOn(mock, 'texImage2D')
  const modes = vi.spyOn(p._watercolorPasses, 'fieldOp')
  const totals: number[] = []
  try {
    for (let i = 0; i < 2; i++) {
      const plan = p._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
        { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0, 8, 1, 1, 1, 1)!
      totals.push(plan.ops.length)
      for (const op of plan.ops) op()
      plan.finish(); plan.dispose()
    }
    const stats = p._settlePlan.contactFieldCacheStats
    const result = {
      totals,
      // Ignore resource identities; compare every contact geometry/pulse
      // and every uploaded raw payload byte, plus the field operator order.
      brush: brush.mock.calls.map(a => [a[2], a[3], a[7], a[8], a[10]]),
      uploads: upload.mock.calls.filter(a => a[8] instanceof Uint8Array).map(a => [a[3], a[4], [...a[8] as Uint8Array]]),
      modes: modes.mock.calls.map(a => [a[3], a[4]]),
    }
    p._settlePlan.forgetTextures()
    expect(p._settlePlan.contactFieldCacheStats.entries).toBe(0)
    return { result, stats }
  } finally {
    brush.mockRestore(); upload.mockRestore(); modes.mockRestore()
    scratch.destroy(); p._ribbonScratchPool.release(tile); engine.destroy()
  }
}

describe('contact cache prepare integration', () => {
  it('keeps upload bytes, contact pulses and field schedule identical with warm memoization', () => {
    const baseline = run(false), candidate = run(true)
    expect(candidate.result).toEqual(baseline.result)
    expect(candidate.result.brush.length).toBeGreaterThan(0)
    expect(candidate.result.uploads.length).toBeGreaterThan(0)
    expect(baseline.stats.hits).toBe(0); expect(baseline.stats.misses).toBe(0)
    expect(candidate.stats.hits).toBe(1); expect(candidate.stats.misses).toBe(1)
  })
})
