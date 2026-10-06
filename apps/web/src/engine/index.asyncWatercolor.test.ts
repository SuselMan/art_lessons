import { expect, it, vi } from 'vitest'
import { createTestEngine, simulateStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd } from './testing/engineTestUtils'

it('accepts confirmed pointer metadata and shows a separate preview before queued material runs', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L')
  engine.setTool('watercolor'); engine.setPencil('normal:100:0:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true
  const source = vi.spyOn(engine['_ribbonPainter']['ctx'], 'drawRibbonNibPass')
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  const complete = vi.spyOn(engine as unknown as { _completeSettle(): void }, '_completeSettle')
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 20, y: 20 }, { x: 32, y: 20 }, { x: 40, y: 20 }])
    expect(engine['_log'].entries.some(e => e.op.type === 'stroke')).toBe(true)
    expect(source).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    expect(engine['_wcCanonical'].pending).toBe(true)
    expect(engine['_wcAsyncPresentations'].size).toBeGreaterThan(0)
    for (const films of engine['_wcAsyncPresentations'].values()) for (const held of films.values()) {
      expect(held.buf.readPixels().some(x => x > 0)).toBe(true)
    }
    for (let tick = 0; tick < 1000 && engine['_wcCanonical'].pending; tick++) {
      while (engine['_settle']) engine['_advanceSettle']()
      const frame = frames.entries().next().value
      if (frame) { frames.delete(frame[0]); frame[1]() }
    }
    expect(engine['_wcAsyncError']).toBeNull()
    expect(engine['_wcCanonical'].pending).toBe(false)
    expect(engine['_wcAsyncPresentations'].size).toBe(0)
    expect(engine['_wcAsyncOwners'].size).toBe(0)
    expect(source).toHaveBeenCalled()
  } finally { source.mockRestore(); complete.mockRestore(); engine.destroy() }
})

it('forgets queued presentation on context loss while retaining the confirmed stroke journal', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor'); engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 24, y: 20 }, { x: 40, y: 20 }])
    const journal = JSON.stringify(engine['_log'].entries.map(e => e.op))
    expect(engine['_wcCanonical'].pending).toBe(true)
    const ready = engine['_wcCanonical'].ready()
    const stale = [...frames.values()][0]
    const draw = vi.spyOn(engine['gl'], 'drawArrays')
    const remove = vi.spyOn(engine['gl'], 'deleteTexture')
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    stale()
    expect(await ready).toBe(false)
    expect(JSON.stringify(engine['_log'].entries.map(e => e.op))).toBe(journal)
    expect(engine['_wcAsyncPresentations'].size).toBe(0)
    expect(engine['_wcAsyncOwners'].size).toBe(0)
    expect(draw).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
    draw.mockRestore(); remove.mockRestore()
  } finally { engine.destroy() }
})

it('makes early Dry accelerate the queued reveal and keeps export behind canonical readiness', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor'); engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  const exported = vi.spyOn(engine['_exporter'], 'exportPNG').mockResolvedValue(null)
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 24, y: 20 }, { x: 40, y: 20 }])
    engine.watercolorDryAll()
    const exporting = engine.exportPNG()
    await Promise.resolve(); await Promise.resolve()
    expect(exported).not.toHaveBeenCalled()
    expect(engine['_wcAsyncDryTo'].size).toBeGreaterThan(0)
    for (let tick = 0; tick < 1000 && engine['_wcCanonical'].pending; tick++) {
      while (engine['_settle']) engine['_advanceSettle']()
      const frame = frames.entries().next().value
      if (frame) { frames.delete(frame[0]); frame[1]() }
    }
    await exporting
    expect(exported).toHaveBeenCalledOnce()
    expect(engine['_washReveals'].size).toBeGreaterThan(0)
    for (const reveal of engine['_washReveals'].values()) expect(reveal.durationMs).toBe(2000)
    expect(engine['_wcAsyncError']).toBeNull()
  } finally { exported.mockRestore(); engine.destroy() }
})

it('keeps two accepted gestures in order and releases their distinct preview owners', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor'); engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 24, y: 20 }, { x: 40, y: 20 }])
    simulateStroke(engine, [{ x: 12, y: 36 }, { x: 24, y: 36 }, { x: 40, y: 36 }])
    const journal = JSON.stringify(engine['_log'].entries.map(e => e.op))
    expect(engine['_log'].entries.filter(e => e.op.type === 'stroke')).toHaveLength(2)
    expect([...engine['_wcAsyncPresentations'].values()].reduce((n, films) => n + films.size, 0)).toBe(2)
    engine.resizeCanvas(80, 64)
    expect(engine['_wcAsyncPresentations'].size).toBe(0)
    for (let tick = 0; tick < 2000 && engine['_wcCanonical'].pending; tick++) {
      while (engine['_settle']) engine['_advanceSettle']()
      const frame = frames.entries().next().value
      if (frame) { frames.delete(frame[0]); frame[1]() }
    }
    expect(engine['_wcCanonical'].pending).toBe(false)
    expect(engine['_wcAsyncOwners'].size).toBe(0)
    expect(engine['_wcAsyncError']).toBeNull()
    expect(JSON.stringify(engine['_log'].entries.map(e => e.op))).toBe(journal)
  } finally { engine.destroy() }
})

it('retains three confirmed chunks of one gesture before any material continuation runs', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor'); engine.setPencil('normal:100:100:PB29:round'); engine.setSize(12)
  engine['_wcAsyncFinish'] = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  const complete = vi.spyOn(engine as unknown as { _completeSettle(): void }, '_completeSettle')
  try {
    simulateStrokeStart(engine, 12, 16)
    for (let leg = 0; leg < 3; leg++) {
      simulateStrokeMove(engine, 24, 16 + leg * 12)
      simulateStrokeMove(engine, 40, 16 + leg * 12)
      if (leg < 2) engine['_flushStrokeChunk']()
    }
    simulateStrokeEnd(engine, 40, 40)
    const ops = engine['_log'].entries.filter(e => e.op.type === 'stroke').map(e => e.op)
    expect(ops).toHaveLength(3)
    expect(new Set(ops.map(op => op.strokeId)).size).toBe(1)
    expect(complete).not.toHaveBeenCalled()
    for (let tick = 0; tick < 3000 && engine['_wcCanonical'].pending; tick++) {
      while (engine['_settle']) engine['_advanceSettle']()
      const frame = frames.entries().next().value
      if (frame) { frames.delete(frame[0]); frame[1]() }
    }
    expect(engine['_wcCanonical'].pending).toBe(false)
    expect(engine['_wcAsyncOwners'].size).toBe(0)
    expect(engine['_wcAsyncError']).toBeNull()
  } finally { complete.mockRestore(); engine.destroy() }
})
