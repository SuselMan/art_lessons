import { afterEach, expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd } from './testing/engineTestUtils'
import { RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'
import { ribbonProfileFor } from './src/dabs/ribbonProfile'
import { presetForTool } from './src/presets/resolvePreset'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function suspendedHalfResolution() {
  vi.useFakeTimers()
  const { engine, canvas } = createTestEngine({ paper: 'flat', pageWidth: 2048, pageHeight: 2048 }, { width: 64, height: 64 })
  engine.appendOperation(makeLayerAdd('author', 'L'), 'remote')
  const pool = engine['_ribbonScratchPool'], target = engine['_layers'].get('L')!
  const tile = pool.acquire(2048, 2048), scratch = new RibbonStrokeScratch(pool, true, true)
  scratch.getOrCreate(tile)
  scratch.diffusePending = true
  const bounds = { minX: 100, minY: 100, maxX: 1500, maxY: 1500 }
  vi.spyOn(engine as unknown as { _resolveWithinSheet: typeof engine['_resolveWithinSheet'] }, '_resolveWithinSheet').mockReturnValue([{ buffer: tile, originX: 0, originY: 0, contentRect: null }])
  scratch.noteFinish({ target, preset: presetForTool('watercolor', 'normal:100:100:PB29:round'), profile: ribbonProfileFor('watercolor', 'normal:100:100:PB29:round'), color: [0.3, 0.2, 0.7], opacity: 1, bounds, fieldSeed: [0, 0], landedWet: 0, wetPeak: 0, radiusPx: 80, dwellMs: 0 })
  const acquire = vi.spyOn(pool, 'acquire'), released = vi.spyOn(pool, 'release')
  engine['_finishRibbonStroke'](scratch, false, false, true)
  const resident = new Set(Object.values(scratch.peek(tile)!))
  const returned = new Set(released.mock.calls.map(([buffer]) => buffer))
  const inputs = [...new Set(acquire.mock.results.map(result => result.value))].filter(buffer => !resident.has(buffer) && !returned.has(buffer))
  acquire.mockRestore(); released.mockRestore()
  expect(inputs.length).toBeGreaterThanOrEqual(3) // S2 a0/ca0 plus full-resolution captured ink.
  expect(engine['_settleQueue'].current).not.toBeNull()
  return { engine, canvas, pool, tile, scratch, inputs }
}

it('cancels an actual half-resolution solver without landing and returns each captured input once', () => {
  const { engine, pool, tile, scratch, inputs } = suspendedHalfResolution()
  const releases = vi.spyOn(pool, 'release'), draws = vi.spyOn(engine['_watercolorPasses'], 'fieldOp')
  const destroys = inputs.map(b => vi.spyOn(b, 'destroy'))
  const abort = engine['_settleQueue'].current!.lifecycle!.abort
  engine['_cancelSettle']()
  engine['_cancelSettle']()
  abort() // Repeated cleanup cannot enqueue the same buffer twice.
  expect(draws).not.toHaveBeenCalled() // Abort is cleanup, never finish/copy-back.
  for (const input of inputs) expect(releases.mock.calls.filter(([b]) => b === input)).toHaveLength(1)
  expect(engine['_settlePlan']['_ownedInputs'].size).toBe(0)
  scratch.destroy(); pool.release(tile); engine.destroy()
  for (const destroyed of destroys) expect(destroyed).toHaveBeenCalledOnce()
})

it('forgets captured inputs before context-loss cancellation so dead names never re-enter the pool', () => {
  const { engine, pool, scratch, inputs } = suspendedHalfResolution()
  const release = vi.spyOn(pool, 'release'), destroy = inputs.map(b => vi.spyOn(b, 'destroy'))
  const gl = engine['gl'], bind = vi.spyOn(gl, 'bindFramebuffer'), draw = vi.spyOn(gl, 'drawArrays'), del = vi.spyOn(gl, 'deleteTexture')
  engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
  engine['_cancelSettle']()
  expect(engine['_settleQueue'].current).toBeNull()
  expect(engine['_settlePlan']['_ownedInputs'].size).toBe(0)
  for (const input of inputs) expect(release.mock.calls.filter(([b]) => b === input)).toHaveLength(0)
  for (const d of destroy) expect(d).not.toHaveBeenCalled()
  expect(bind).not.toHaveBeenCalled(); expect(draw).not.toHaveBeenCalled(); expect(del).not.toHaveBeenCalled()
  scratch.forget(); pool.forget()
  // Match restore's forget-before-replacement: no dead buffers retained.
  expect(pool.bytes).toEqual({ live: 0, free: 0 })
  engine.destroy()
})

it('healthy engine teardown cancels a still-running solver and destroys its checked-out inputs', () => {
  const { engine, pool, tile, scratch, inputs } = suspendedHalfResolution()
  const destroyed = inputs.map(b => vi.spyOn(b, 'destroy'))
  engine.destroy()
  for (const spy of destroyed) expect(spy).toHaveBeenCalledOnce()
  expect(engine['_settlePlan']['_ownedInputs'].size).toBe(0)
  // The synthetic tile/scratch is not in an engine wash cache.
  scratch.destroy(); tile.destroy(); pool.destroy()
})
