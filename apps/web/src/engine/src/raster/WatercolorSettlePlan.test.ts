import { describe, expect, it, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'

type Probe = {
  _ribbonScratchPool: RibbonScratchPool
  _watercolorPasses: WatercolorPasses
  _settlePlan: WatercolorSettlePlan
  _wcAb: { opDry: boolean }
}

// MockGL verifies resources and execution order, not GLSL pixels. In
// particular this catches colour mobility accidentally reading its own
// absorption alpha, and writing over density before the pigment draw.
describe('coupled pigment and absorption diffusion', () => {
  for (const opDry of [false, true]) for (const wetPeak of [0, 1]) {
    it(`reads one pre-step pigment for both records (opDry=${opDry}, wet=${wetPeak})`, () => {
      const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
      const probe = engine as unknown as Probe
      probe._wcAb.opDry = opDry
      const tile = probe._ribbonScratchPool.acquire(64, 64)
      const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
      scratch.getOrCreate(tile)
      scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
      const calls: Array<{ src: AccumulationBuffer; dst: AccumulationBuffer; gate: AccumulationBuffer; density: AccumulationBuffer }> = []
      const original = probe._watercolorPasses.diffuseStep.bind(probe._watercolorPasses)
      const spy = vi.spyOn(probe._watercolorPasses, 'diffuseStep').mockImplementation((...args) => {
        calls.push({ src: args[6], dst: args[7], gate: args[10], density: args[11] ?? args[6] })
        original(...args)
      })
      try {
        const plan = probe._settlePlan.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], { minX: 20, minY: 20, maxX: 44, maxY: 44 }, 0.2, 8, 1, wetPeak, 1, wetPeak)
        expect(plan).not.toBeNull()
        for (const op of plan!.ops) op()
        plan!.finish()
        expect(calls.length).toBeGreaterThan(0)
        expect(calls.length % 2).toBe(0)
        for (let i = 0; i < calls.length; i += 2) {
          const colour = calls[i], pigment = calls[i + 1]
          expect(colour.density).toBe(pigment.src)
          expect(pigment.density).toBe(pigment.src)
          expect(colour.src).not.toBe(pigment.src)
          expect(colour.dst).not.toBe(colour.density)
          expect(pigment.dst).not.toBe(pigment.density)
          expect(colour.gate).toBe(pigment.gate)
        }
      } finally {
        spy.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy()
      }
    })
  }
})
