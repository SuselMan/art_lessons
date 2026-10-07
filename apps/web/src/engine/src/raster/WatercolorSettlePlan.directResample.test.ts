import { describe, it, expect, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { WatercolorPasses } from './WatercolorPasses'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'

type LandingPlan = Pick<WatercolorSettlePlan, 'diagnosticDirectResample' | 'resampleLandingStats'> & {
  landResampled(target: AccumulationBuffer, base: AccumulationBuffer, source: AccumulationBuffer,
    old: AccumulationBuffer, tx: number, ty: number, w: number, h: number,
    fx: number, fy: number, ratio: number, clamp: [number, number, number, number]): void
}

describe('direct half-resolution landing candidate', () => {
  for (const enabled of [false, true]) for (const alias of ['none', 'base', 'source', 'old'] as const) {
    it(`retains sampler dependencies, dimensions, scissor and rounding boundary (${enabled}, ${alias})`, () => {
      const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
      const probe = engine as unknown as { _settlePlan: LandingPlan; _watercolorPasses: WatercolorPasses; _ribbonScratchPool: RibbonScratchPool }
      const pool = probe._ribbonScratchPool
      const buffers = Array.from({ length: 4 }, () => pool.acquire(64, 64))
      const [target, base, source, old] = buffers
      const read = { base, source, old }
      if (alias !== 'none') read[alias] = target
      const draw = vi.spyOn(probe._watercolorPasses, 'wcResample').mockImplementation(() => {})
      const copy = vi.spyOn(AccumulationBuffer.prototype, 'copyRegionInto')
      const acquire = vi.spyOn(pool, 'acquire')
      try {
        probe._settlePlan.diagnosticDirectResample = enabled
        probe._settlePlan.landResampled(target, read.base, read.source, read.old,
          3, 7, 13, 17, 1.5, 8.5, 0.5, [0, 1, 20, 30])
        expect(draw).toHaveBeenCalledTimes(1)
        const direct = enabled && alias === 'none'
        const output = draw.mock.calls[0][0]
        expect(output === target).toBe(direct)
        expect(draw.mock.calls[0].slice(1)).toEqual([3, 7, 13, 17, read.source, 1.5, 8.5, 0.5, 1, read.old, read.base, [0, 1, 20, 30]])
        expect(acquire).toHaveBeenCalledTimes(direct ? 0 : 1)
        expect(probe._settlePlan.resampleLandingStats).toEqual({ direct: direct ? 1 : 0, temporary: direct ? 0 : 1, copyPixelsAvoided: direct ? 221 : 0 })
        // No caller-owned buffer can become the temporary sampled output.
        if (!direct) expect(buffers).not.toContain(output)
        expect(copy).toHaveBeenCalledTimes(direct ? 0 : 1)
        if (!direct) expect(copy).toHaveBeenCalledWith(target, 3, 7, 3, 7, 13, 17)
      } finally { draw.mockRestore(); copy.mockRestore(); acquire.mockRestore(); for (const buffer of buffers) pool.release(buffer); engine.destroy() }
    })
  }
})
