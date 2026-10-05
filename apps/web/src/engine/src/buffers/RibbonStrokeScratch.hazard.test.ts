import { expect, it } from 'vitest'
import { RibbonStrokeScratch } from './RibbonStrokeScratch'
import type { RibbonScratchPool } from './RibbonScratchPool'
import type { ILayerBuffer } from './ILayerBuffer'

it('retains the pigment hazard across scratch restore and resets at gesture start', () => {
  const pool = {} as RibbonScratchPool
  const scratch = new RibbonStrokeScratch(pool)
  scratch.pigmentHazard = 1.375
  scratch.advanceWater(7, 11)
  const snapshot = scratch.snapshot({} as WebGLRenderingContext, () => null)!
  const restored = RibbonStrokeScratch.restore(pool, snapshot, {} as ILayerBuffer)
  expect(restored.pigmentHazard).toBe(1.375)
  expect(restored.pigmentUsed).toBe(11)
  restored.beginStroke()
  expect(restored.pigmentHazard).toBe(0)
  expect(restored.pigmentUsed).toBe(0)
})
