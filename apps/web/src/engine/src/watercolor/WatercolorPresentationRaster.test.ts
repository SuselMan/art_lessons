import { expect, it, vi } from 'vitest'
import type { Dab } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { RibbonStrokePainterContext } from '../dabs/RibbonStrokePainter'
import type { RibbonProfile } from '../dabs/ribbonProfile'
const observed = vi.hoisted(() => ({ contexts: [] as unknown[], batches: [] as unknown[][], releases: [] as boolean[] }))
vi.mock('../dabs/RibbonStrokePainter', () => ({ RibbonStrokePainter: class {
  constructor(ctx: unknown) { observed.contexts.push(ctx) }
  *paint(...args: unknown[]) { observed.batches.push(args); yield 0 }
  releaseWaterSources(lost: boolean) { observed.releases.push(lost) }
} }))
import { WatercolorPresentationRaster } from './WatercolorPresentationRaster'
it('feeds the ribbon material path separate immutable colors/presets and bounded projected coordinates', () => {
  observed.batches.length = 0; observed.contexts.length = 0
  const canonicalLive = vi.fn(), reveal = vi.fn(), canonicalPool = {} as RibbonScratchPool
  const ownPool = {} as RibbonScratchPool
  const ctx = { dabPool: () => new WeakMap(), scratchPool: () => canonicalPool, setLiveComposite: canonicalLive,
    revealBeforeBatch: reveal } as unknown as RibbonStrokePainterContext
  const raster = new WatercolorPresentationRaster({ width: 100, height: 100 } as AccumulationBuffer,
    { originX: 1000, originY: 2000, worldWidth: 400, worldHeight: 400, width: 100, height: 100 }, ownPool, ctx)
  const dab: Dab = { x: 1200, y: 2200, size: 80, opacity: 0.7, pressure: 0.8, tiltX: 0, tiltY: 0,
    aspectRatio: 1, angle: 0, t: 12 }
  const original = structuredClone(dab), color: [number, number, number] = [1, 0, 0]
  const preset = { opacity: 1, hardness: 0.5, sizeMultiplier: 1 }
  raster.paint('water', [dab], preset, 'normal:100:0', {} as RibbonProfile, color, 'a')
  color[0] = 0
  raster.paint('pigment', [dab], preset, 'normal:100:100', {} as RibbonProfile, [0, 0, 1], 'b')
  expect(dab).toEqual(original)
  expect(observed.batches[0][1]).toEqual([{ ...dab, x: 50, y: 50, size: 20 }])
  expect(observed.batches[0][5]).toEqual([1, 0, 0])
  expect(observed.batches[1][3]).toBe('normal:100:100')
  expect(observed.batches[1][5]).toEqual([0, 0, 1])
  expect(observed.batches[1][7]).toBeUndefined() // no bridge between distinct gestures
  expect(observed.batches[0][10]).toBe(false) // no canonical live composite
  const isolated = observed.contexts[0] as RibbonStrokePainterContext
  expect(isolated.scratchPool()).toBe(ownPool)
  expect(isolated.pageSize()).toEqual({ w: 100, h: 100 })
  expect(isolated.revealBeforeBatch({} as never, {} as never)).toBeNull()
  expect(() => isolated.setLiveComposite(null)).toThrow('canonical')
  expect(canonicalLive).not.toHaveBeenCalled()
  expect(reveal).not.toHaveBeenCalled()
  raster.release(true); raster.release(true)
  expect(observed.releases).toEqual([true])
  expect(() => raster.paint('late', [dab], preset, 'normal:100:100', {} as RibbonProfile, [1,0,0])).toThrow('Released')
})
