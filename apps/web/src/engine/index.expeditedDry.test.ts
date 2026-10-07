import { expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'
import { RibbonStrokeScratch } from './src/buffers/RibbonStrokeScratch'

it('Dry marks a captured remote boundary without synchronously advancing material or expediting its next gesture', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine['_wcAsyncFinish'] = true
  engine['_wcExpeditedDry'] = true
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'])
  scratch.gesture = 4
  const draw = vi.fn()
  const drain = vi.spyOn(engine as unknown as { _completeSettle(): void }, '_completeSettle')
  const display = vi.spyOn(engine as unknown as { _displayIfNotSuspended(): void }, '_displayIfNotSuspended').mockImplementation(() => {})
  try {
    engine['_startSettle'](scratch, [() => {}, draw], () => {}, { isAlive: () => true, abort: () => {} })
    const old = engine['_settle']!.lifecycle as { isExpedited(): boolean }
    expect(old.isExpedited()).toBe(false)
    engine.watercolorDryAll()
    expect(draw).not.toHaveBeenCalled()
    expect(drain).not.toHaveBeenCalled()
    expect(old.isExpedited()).toBe(true)
    scratch.gesture = 9
    expect(old.isExpedited()).toBe(true)
    engine['_completeSettle']()
    expect(engine['_wcAsyncDryTo'].has(scratch)).toBe(false)
    engine['_startSettle'](scratch, [() => {}, draw], () => {}, { isAlive: () => true, abort: () => {} })
    expect((engine['_settle']!.lifecycle as { isExpedited(): boolean }).isExpedited()).toBe(false)
    engine['_cancelSettle']()
    expect(engine['_wcAsyncDryTo'].size).toBe(0)
  } finally { drain.mockRestore(); display.mockRestore(); scratch.destroy(); engine.destroy() }
})

it('default OFF preserves remote Dry eligibility and a fresh reveal clears earlier Dry clocks', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L')
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool'])
  const display = vi.spyOn(engine as unknown as { _displayIfNotSuspended(): void }, '_displayIfNotSuspended').mockImplementation(() => {})
  try {
    engine['_wcAsyncFinish'] = true
    engine['_startSettle'](scratch, [() => {}, () => {}], () => {}, { isAlive: () => true, abort: () => {} })
    engine.watercolorDryAll()
    expect(engine['_wcAsyncDryTo'].has(scratch)).toBe(false)
    expect((engine['_settle']!.lifecycle as { isExpedited(): boolean }).isExpedited()).toBe(false)
    const layer = engine['_layers'].get('L')!
    const tile = engine['_resolveWithinSheet'](layer, { minX: 0, minY: 0, maxX: 16, maxY: 16 })[0]
    engine['_revealWash'](tile, layer)
    const previous = engine['_washReveals'].get(tile.buffer)!
    previous.dryRequested = true; previous.dryPreviewStartedAt = 100; previous.durationMs = 2000
    engine['_revealWash'](tile, layer)
    const fresh = engine['_washReveals'].get(tile.buffer)!
    expect(fresh).not.toBe(previous)
    expect(fresh.dryRequested).toBeUndefined()
    expect(fresh.dryPreviewStartedAt).toBeUndefined()
    expect(fresh.durationMs).toBeUndefined()
  } finally { display.mockRestore(); engine['_cancelSettle'](); scratch.destroy(); engine.destroy() }
})

it('keeps the Dry ticket across a drawing-to-solver continuation and clears it on abort', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine['_wcAsyncFinish'] = true; engine['_wcExpeditedDry'] = true
  const scratch = new RibbonStrokeScratch(engine['_ribbonScratchPool']); scratch.gesture = 3
  const display = vi.spyOn(engine as unknown as { _displayIfNotSuspended(): void }, '_displayIfNotSuspended').mockImplementation(() => {})
  const abort = vi.fn()
  try {
    engine['_startSettle'](scratch, [() => {}, () => {}], () => {
      engine['_startSettle'](scratch, [() => {}, () => {}], () => {}, { isAlive: () => true, abort })
    }, { isAlive: () => true, abort })
    engine.watercolorDryAll()
    engine['_advanceSettle']()
    expect(engine['_wcAsyncDryTo'].get(scratch)).toBe(3)
    expect((engine['_settle']!.lifecycle as { isExpedited(): boolean }).isExpedited()).toBe(true)
    engine['_contextLost'] = true
    engine['_cancelSettle']()
    engine['_contextLost'] = false
    expect(abort).toHaveBeenCalledOnce()
    expect(engine['_wcAsyncDryTo'].size).toBe(0)
  } finally { display.mockRestore(); scratch.destroy(); engine.destroy() }
})

it('starts the Dry preview clock only when a calculated target arrives, without changing canonical pixels', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L')
  const layer = engine['_layers'].get('L')!
  const tile = engine['_resolveWithinSheet'](layer, { minX: 0, minY: 0, maxX: 16, maxY: 16 })[0]
  try {
    engine['_revealWash'](tile, layer)
    const reveal = engine['_washReveals'].get(tile.buffer)!
    reveal.progressive = true; reveal.dryRequested = true; reveal.durationMs = 2000
    const canonical = tile.buffer.readPixels().slice()
    engine['_advanceWashReveal'](tile.buffer, reveal, 10000)
    expect(reveal.dryPreviewStartedAt).toBeUndefined()
    reveal.pending = engine['_revealPoolAcquire'](tile.buffer.width, tile.buffer.height)
    tile.buffer.copyTo(reveal.pending)
    engine['_advanceWashReveal'](tile.buffer, reveal, 10016)
    expect(reveal.dryPreviewStartedAt).toBe(10016)
    expect(reveal.startedAt).toBeNull()
    expect(tile.buffer.readPixels()).toEqual(canonical)
    engine['_advanceWashReveal'](tile.buffer, reveal, 14016)
    expect(reveal.startedAt).toBeNull()
    expect(tile.buffer.readPixels()).toEqual(canonical)
  } finally { engine.destroy() }
})
