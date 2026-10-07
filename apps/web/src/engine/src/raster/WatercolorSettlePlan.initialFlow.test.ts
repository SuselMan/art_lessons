import { it, expect, vi } from 'vitest'
import { createTestEngine } from '../../testing/engineTestUtils'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { WatercolorPasses } from './WatercolorPasses'
import type { WatercolorSettlePlan } from './WatercolorSettlePlan'

function record(skip: boolean, foreign: boolean) {
  const { engine } = createTestEngine({ paper: 'flat' }, { width: 64, height: 64 })
  const probe = engine as unknown as { _settlePlan: WatercolorSettlePlan; _watercolorPasses: WatercolorPasses; _ribbonScratchPool: RibbonScratchPool }
  const planBuilder = probe._settlePlan
  planBuilder.diagnosticSkipInitialFlowUpload = skip
  const gl = (planBuilder as unknown as { gl: WebGLRenderingContext }).gl
  const tile = probe._ribbonScratchPool.acquire(64, 64)
  const scratch = new RibbonStrokeScratch(probe._ribbonScratchPool, true, true)
  scratch.filmBuffers(tile)
  scratch.paints.add('1,0,0'); scratch.paints.add('0,0,1')
  scratch.brushTravel.push(
    { x: 30, y: 30, radius: 8, aspect: 1, angle: 0, dx: 24, dy: 0, water: 1 },
    { x: 35, y: 33, radius: 8, aspect: 1.5, angle: .5, dx: -24, dy: 2, water: 1 },
  )
  if (foreign) {
    const footprint = { x: 32, y: 32, radius: 8, aspect: 1, angle: 0 }
    scratch.foreignSources = [{ gesture: 'prior-water', footprints: [footprint] }]
    scratch.wetContacts = [footprint]
  }
  const uploads: Uint8Array[] = [], samples: Uint8Array[] = []
  let current: Uint8Array | undefined
  const original = gl.texImage2D.bind(gl)
  const upload = vi.spyOn(gl, 'texImage2D').mockImplementation((...args: unknown[]) => {
    if (args[2] === gl.RGBA && args.at(-1) instanceof Uint8Array) {
      current = (args.at(-1) as Uint8Array).slice(); uploads.push(current)
    }
    original(...args as Parameters<WebGLRenderingContext['texImage2D']>)
  })
  const brushOriginal = probe._watercolorPasses.brushPass.bind(probe._watercolorPasses)
  const brush = vi.spyOn(probe._watercolorPasses, 'brushPass').mockImplementation((...args) => {
    expect(current).toBeDefined()
    samples.push(current!.slice())
    brushOriginal(...args)
  })
  const source = scratch.peek(tile)!.inkLoad!
  const capture = vi.spyOn(source, 'copyRegionInto')
  try {
    const plan = planBuilder.prepare(scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }],
      { minX: 20, minY: 20, maxX: 44, maxY: 44 }, .2, 8, 1, 1, 1, 1)!
    // This option must be latched: UI changes after preparation cannot alter capture.
    planBuilder.diagnosticSkipInitialFlowUpload = !skip
    plan.ops[0]()
    expect(capture).toHaveBeenCalled()
    expect(brush).not.toHaveBeenCalled()
    expect(uploads).toHaveLength(skip ? 0 : 1)
    for (const op of plan.ops.slice(1)) op()
    plan.finish()
    expect(samples.length).toBeGreaterThan(0)
    const stats = { ...planBuilder.initialFlowUploadStats }
    plan.dispose()
    return { uploads, samples, stats }
  } finally { upload.mockRestore(); brush.mockRestore(); capture.mockRestore(); scratch.destroy(); probe._ribbonScratchPool.release(tile); engine.destroy() }
}

for (const foreign of [false, true]) it(`removes only unconsumed first upload; every brush sees identical chronological bytes (foreign=${foreign})`, () => {
  const baseline = record(false, foreign), candidate = record(true, foreign)
  expect(candidate.uploads).toEqual(baseline.uploads.slice(1))
  expect(baseline.uploads[0]).toEqual(baseline.uploads[1])
  expect(candidate.samples).toEqual(baseline.samples)
  expect(candidate.stats).toEqual({ retained: 0, skipped: 1, bytesAvoided: baseline.uploads[0].byteLength })
  expect(baseline.stats).toEqual({ retained: 1, skipped: 0, bytesAvoided: 0 })
})
