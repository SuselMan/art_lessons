import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'

describe('isolated concentration diffusion gate', () => {
  for (const [enabled, colors, count] of [[false, 1, 1], [true, 1, 1], [true, 2, 1], [true, 1, 2], [true, 1, -1]] as const) {
    it(`preserves carry and gates known first single pigment ${enabled}/${colors}/${count}`, () => {
      const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
      const e = engine as unknown as { _ribbonScratchPool: RibbonScratchPool; _watercolorPasses: WatercolorPasses; _settlePlan: WatercolorSettlePlan; _wcAb: { concentrationDiffuse: boolean } }
      e._wcAb.concentrationDiffuse = enabled
      const tile = e._ribbonScratchPool.acquire(64, 64)
      const scratch = new RibbonStrokeScratch(e._ribbonScratchPool, true, true)
      scratch.getOrCreate(tile); scratch.solventFilm(tile); scratch.paints.add('1,0,0'); scratch.solventPigmentGestures = count
      if (colors === 2) scratch.paints.add('0,0,1')
      const diffuse = vi.spyOn(e._watercolorPasses, 'diffuseStep')
      const field = vi.spyOn(e._watercolorPasses, 'fieldOp')
      try {
        const plan = e._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], { minX: 20, minY: 20, maxX: 44, maxY: 44 }, .4, 8, 1, 1, 1, 1)!
        for (const op of plan.ops) op()
        expect(diffuse.mock.calls.length).toBeGreaterThan(0)
        for (const args of diffuse.mock.calls) expect(args[13]).toBe(enabled && colors === 1 && count === 1 && args[8] <= 4)
        expect(field.mock.calls.some(a => a[3] === 15)).toBe(true)
        plan.finish()
      } finally { diffuse.mockRestore(); field.mockRestore(); scratch.destroy(); e._ribbonScratchPool.release(tile); engine.destroy() }
    })
  }
})
