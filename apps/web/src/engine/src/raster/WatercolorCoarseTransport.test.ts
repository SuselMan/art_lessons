import { expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import type { WatercolorPasses } from './WatercolorPasses'

it('reduces transport work for a 90px brush while retaining paired pigment/color passes', () => {
  const results = []
  for (const coarse of [false, true]) {
    const { engine } = createTestEngine({ paper: 'flat', watercolorCoarseTransport: coarse }, { width: 512, height: 512 })
    const p = engine as unknown as { _ribbonScratchPool: RibbonScratchPool; _settlePlan: WatercolorSettlePlan; _watercolorPasses: WatercolorPasses }
    const tile = p._ribbonScratchPool.acquire(512, 512)
    const scratch = new RibbonStrokeScratch(p._ribbonScratchPool, true, true)
    scratch.getOrCreate(tile); scratch.paints.add('1,1,0'); scratch.paints.add('0,0,1')
    let frontPixels = 0, frontCalls = 0
    const front = vi.spyOn(p._watercolorPasses, 'waterFrontStep').mockImplementation((field) => { frontCalls++; frontPixels += field.w * field.h })
    const diffuse = vi.spyOn(p._watercolorPasses, 'diffuseStep')
    try {
      const plan = p._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], { minX: 100, minY: 100, maxX: 350, maxY: 350 }, .2, 45, 1, 1, 1, 1)!
      for (const op of plan.ops) op()
      plan.finish()
      expect(diffuse.mock.calls.length).toBeGreaterThan(0)
      for (let i = 0; i < diffuse.mock.calls.length; i += 2) {
        const color = diffuse.mock.calls[i], pigment = diffuse.mock.calls[i + 1]
        expect(color[11]).toBe(pigment[6])
      }
      results.push({ frontPixels, frontCalls })
    } finally { front.mockRestore(); diffuse.mockRestore(); scratch.destroy(); p._ribbonScratchPool.release(tile); engine.destroy() }
  }
  console.info('Coarse transport work (MockGL, not GPU timing)', results)
  expect(results[1].frontPixels).toBeLessThan(results[0].frontPixels / 4)
  expect(results[1].frontCalls).toBeLessThan(results[0].frontCalls)
})

it('never activates the experimental material in production', () => {
  vi.stubEnv('DEV', false)
  const { engine } = createTestEngine({ watercolorCoarseTransport: true })
  try { expect((engine as unknown as { _settlePlan: WatercolorSettlePlan })._settlePlan.diagnosticCoarseTransport).toBe(false) }
  finally { engine.destroy(); vi.unstubAllEnvs() }
})
