import { it, expect, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { WC_WATER_FRONT_FRAG, WC_WATER_FRONT_INVARIANT_FRAG } from './shaders'
import type { WatercolorPasses } from './WatercolorPasses'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'

it('hoists only the unchanged central film expression; neighbour/min/Q8 logic stays intact', () => {
  const film = /float film = [^\n]+;/
  const baseline = WC_WATER_FRONT_FRAG.match(film)![0]
  expect(WC_WATER_FRONT_INVARIANT_FRAG.match(film)?.[0]).toBe(baseline)
  expect(WC_WATER_FRONT_INVARIANT_FRAG.indexOf(baseline)).toBeLessThan(WC_WATER_FRONT_INVARIANT_FRAG.indexOf('for (int k'))
  expect(WC_WATER_FRONT_FRAG.indexOf(baseline)).toBeGreaterThan(WC_WATER_FRONT_FRAG.indexOf('for (int k'))
  const normalize = (text: string) => text.replace(film, '').replace(/\s/g, '')
  expect(normalize(WC_WATER_FRONT_INVARIANT_FRAG)).toBe(normalize(WC_WATER_FRONT_FRAG))
})

it('retains water-front draw inputs and does not link optional program until requested', () => {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as { _watercolorPasses: WatercolorPasses; _ribbonScratchPool: RibbonScratchPool }
  const passes = probe._watercolorPasses
  const gl = (passes as unknown as { gl: WebGLRenderingContext }).gl
  const pool = probe._ribbonScratchPool
  const [source, target, coverage] = Array.from({ length: 3 }, () => pool.acquire(64, 64))
  const create = vi.spyOn(gl, 'createProgram'), draw = vi.spyOn(gl, 'drawArrays')
  const field = { w: 64, h: 64, coverage }
  try {
    const step = () => passes.waterFrontStep(field, 12, 25, 24, source, target, 36, 5, 1, 2, 1, null)
    step()
    expect(create).not.toHaveBeenCalled()
    passes.warmWaterFrontInvariant()
    expect(create).toHaveBeenCalledTimes(1)
    passes.diagnosticWaterFrontInvariant = true
    step(); step()
    expect(create).toHaveBeenCalledTimes(1)
    expect(draw).toHaveBeenCalledTimes(3)
    expect(passes.waterFrontStats).toEqual({ baseline: 1, invariant: 2, pixels: 3 * 4096 })
    passes.initSettlePrograms()
    create.mockClear()
    passes.warmWaterFrontInvariant()
    expect(create).toHaveBeenCalledTimes(1)
  } finally { create.mockRestore(); draw.mockRestore(); for (const buffer of [source, target, coverage]) pool.release(buffer); engine.destroy() }
})
