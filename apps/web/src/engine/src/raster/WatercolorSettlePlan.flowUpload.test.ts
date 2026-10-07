import { describe, it, expect, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'

type UploadPlan = Pick<WatercolorSettlePlan, 'diagnosticReuseFlowStorage' | 'flowUploadStats' | 'forgetTextures'> & { uploadBrushFlow(w: number, h: number, pixels: Uint8Array): void }

describe('brush flow storage reuse candidate', () => {
  for (const enabled of [false, true]) {
    it(`preserves full payload identity and reallocates on size changes (enabled=${enabled})`, () => {
      const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
      const plan = (engine as unknown as { _settlePlan: UploadPlan })._settlePlan
      const gl = (plan as unknown as { gl: WebGLRenderingContext }).gl
      const image = vi.spyOn(gl, 'texImage2D'), update = vi.spyOn(gl, 'texSubImage2D')
      plan.diagnosticReuseFlowStorage = enabled
      try {
        const first = new Uint8Array(3 * 5 * 4).fill(17)
        const second = new Uint8Array(3 * 5 * 4).fill(223)
        const changed = new Uint8Array(4 * 5 * 4).fill(99)
        plan.uploadBrushFlow(3, 5, first)
        plan.uploadBrushFlow(3, 5, second)
        plan.uploadBrushFlow(4, 5, changed)
        expect(image).toHaveBeenCalledTimes(enabled ? 2 : 3)
        expect(update).toHaveBeenCalledTimes(enabled ? 1 : 0)
        expect(image.mock.calls[0].at(-1)).toBe(first)
        expect((enabled ? update.mock.calls[0] : image.mock.calls[1]).at(-1)).toBe(second)
        expect(image.mock.calls.at(-1)?.at(-1)).toBe(changed)
        expect(plan.flowUploadStats).toEqual({ allocations: enabled ? 2 : 3, updates: enabled ? 1 : 0, bytes: 200 })
        plan.forgetTextures()
        plan.uploadBrushFlow(4, 5, changed)
        expect(image).toHaveBeenCalledTimes(enabled ? 3 : 4)
      } finally { image.mockRestore(); update.mockRestore(); engine.destroy() }
    })
  }
})
