import { expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'
import type { WatercolorSettleQueue } from './src/watercolor/WatercolorSettleQueue'
import type { WatercolorSettlePlan } from './src/raster/WatercolorSettlePlan'

it('keeps the combined candidate off unless explicitly requested in DEV, including production callers', () => {
  for (const [dev, requested, enabled] of [[true, undefined, false], [true, true, true], [false, true, false]] as const) {
    vi.stubEnv('DEV', dev)
    const { engine } = createTestEngine({ watercolorReview: requested })
    try {
      const probe = engine as unknown as { _watercolorReview: boolean; _settleQueue: WatercolorSettleQueue; _settlePlan: WatercolorSettlePlan }
      expect(probe._watercolorReview).toBe(enabled)
      expect(probe._settleQueue.diagnosticSolverBatchEnabled).toBe(enabled)
      expect(probe._settlePlan.diagnosticHoistedContactRaster).toBe(enabled)
      expect(probe._settlePlan.diagnosticReuseFlowRaster).toBe(enabled)
    } finally { engine.destroy(); vi.unstubAllEnvs() }
  }
})
