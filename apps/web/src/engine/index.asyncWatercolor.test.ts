import { expect, it, vi } from 'vitest'
import { createTestEngine, simulateStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd, makeLayerAdd, makeStroke, dab } from './testing/engineTestUtils'

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
    const ops = engine['_log'].entries.map(e => e.op).filter(op => op.type === 'stroke')
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

it('accepts and sends a queued layer action before GPU execution and retains it through Undo', async () => {
  const local = vi.fn()
  const { engine } = createTestEngine({ userId: 'owner', onLocalOperation: local }, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor'); engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 40, y: 20 }])
    const add = makeLayerAdd('owner', 'new-layer')
    engine.appendOperation(add, 'local')
    expect(local.mock.calls.filter(([op]) => op.id === add.id)).toHaveLength(1)
    expect(engine['_log'].entries.find(e => e.op.id === add.id)?.state).toBe('done')
    expect(engine['_layers'].has('new-layer')).toBe(false)
    expect(engine.undo()?.id).toBe(add.id)
    expect(engine['_log'].entries.find(e => e.op.id === add.id)?.state).toBe('undone')
    expect(engine['_layers'].has('new-layer')).toBe(false)
    expect(local.mock.calls.filter(([op]) => op.id === add.id)).toHaveLength(1)
  } finally { engine.destroy() }
})

it('retains an ACKed queued layer action on loss and does not send it twice', async () => {
  const local = vi.fn()
  const { engine } = createTestEngine({ userId: 'owner', onLocalOperation: local }, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor'); engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 40, y: 20 }])
    const stroke = engine['_log'].entries.find(e => e.op.type === 'stroke')!
    engine.confirmOperation(stroke.op.id, 1)
    const add = makeLayerAdd('owner', 'new-layer')
    engine.appendOperation(add, 'local'); engine.confirmOperation(add.id, 2)
    const draw = vi.spyOn(engine['gl'], 'drawArrays')
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(engine['_log'].entries.find(e => e.op.id === add.id)).toMatchObject({ state: 'done', pending: false, serverSeq: 2 })
    expect(engine.getOperations().some(op => op.id === add.id)).toBe(true)
    expect(local.mock.calls.filter(([op]) => op.id === add.id)).toHaveLength(1)
    expect(draw).not.toHaveBeenCalled(); draw.mockRestore()
  } finally { engine.destroy() }
})

it('keeps watercolor peer reveal visible without invoking the canonical painter', async () => {
  const applied = vi.fn()
  const { engine } = createTestEngine({ onPreviewApplied: applied }, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine['_wcAsyncFinish'] = true
  const canonical = vi.spyOn(engine as unknown as { _paintDabs(...args: unknown[]): void }, '_paintDabs')
  try {
    const op = makeStroke('peer', 'L', [dab(16, 20, { t: 0 }), dab(32, 20, { t: 10000 })], { tool: 'watercolor', preset: 'normal:100:100:PB29:round' })
    engine.previewOperation(op)
    expect(applied).not.toHaveBeenCalled()
    engine['_stepPeerPreview']('peer')
    expect(engine['_peerPreviews'].get('peer')!.buf.readPixels().some(v => v > 0)).toBe(true)
    expect(canonical).not.toHaveBeenCalled()
    const pencil = makeStroke('pencil-peer', 'L', [dab(16, 32, { t: 0 }), dab(32, 32, { t: 10000 })])
    engine.previewOperation(pencil); engine['_stepPeerPreview']('pencil-peer')
    expect(canonical).toHaveBeenCalled()
  } finally { canonical.mockRestore(); engine.destroy() }
})

it('applies an accepted queued layer action once after the canonical source has landed', async () => {
  const local = vi.fn()
  const { engine } = createTestEngine({ userId: 'owner', onLocalOperation: local }, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor'); engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 40, y: 20 }])
    const add = makeLayerAdd('owner', 'new-layer')
    engine.appendOperation(add, 'local')
    for (let tick = 0; tick < 2000 && engine['_wcCanonical'].pending; tick++) {
      while (engine['_settle']) engine['_advanceSettle']()
      const frame = frames.entries().next().value
      if (frame) { frames.delete(frame[0]); frame[1]() }
    }
    expect(engine['_wcCanonical'].pending).toBe(false)
    expect(engine['_layers'].has('new-layer')).toBe(true)
    expect(engine['_log'].entries.filter(e => e.op.id === add.id)).toHaveLength(1)
    expect(local.mock.calls.filter(([op]) => op.id === add.id)).toHaveLength(1)
  } finally { engine.destroy() }
})

it('holds a committed peer preview until queued canonical work is ready and forgets it safely on loss', async () => {
  let engine: ReturnType<typeof createTestEngine>['engine']
  const applied = vi.fn(op => engine.appendOperation(op, 'remote'))
  const result = createTestEngine({ onPreviewApplied: applied }, { width: 64, height: 64 }); engine = result.engine
  await engine.paperReady()
  engine.initLayer('L'); engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  engine['_wcCanonical'].enqueue({ execute: function* () { yield 0 }, cancel: () => {} })
  try {
    const op = makeStroke('peer', 'L', [dab(16, 20, { t: 0 }), dab(32, 20, { t: 0 })], { tool: 'watercolor', preset: 'normal:100:100:PB29:round', seq: 1 })
    engine.previewOperation(op); engine['_stepPeerPreview']('peer')
    expect(applied).toHaveBeenCalledOnce()
    const held = engine['_peerPreviews'].get('peer')!
    expect(held.waitingCanonical).toBe(true)
    expect(held.queue).toHaveLength(0)
    expect(held.buf.readPixels().some(v => v > 0)).toBe(true)
    expect(engine['_opQueue'].some(x => x.op.id === op.id)).toBe(true)
    const draw = vi.spyOn(engine['gl'], 'drawArrays'), remove = vi.spyOn(engine['gl'], 'deleteTexture')
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(applied).toHaveBeenCalledOnce()
    expect(engine['_log'].entries.find(e => e.op.id === op.id)).toMatchObject({ state: 'done', serverSeq: 1 })
    expect(engine['_peerPreviews'].size).toBe(0)
    expect(draw).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
    draw.mockRestore(); remove.mockRestore()
  } finally { engine.destroy() }
})

it('shows foreign pencil packets without draining a pending solver or claiming ink early', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L'); engine['_wcAsyncFinish'] = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  engine['_wcCanonical'].enqueue({ execute: function* () { yield 0 }, cancel: () => {} })
  const complete = vi.spyOn(engine as unknown as { _completeSettle(): void }, '_completeSettle').mockImplementation(() => { throw new Error('input drained solver') })
  const packet = { strokeId: 'peer-pencil', layerId: 'L', packetSeq: 0, tool: 'pencil' as const, preset: 'HB', color: [0, 0, 0] as [number, number, number], dabs: [dab(16, 20), dab(32, 20)] }
  try {
    engine.appendPeerLiveDabs('peer', packet)
    expect(complete).not.toHaveBeenCalled(); expect(engine['_peerLiveStrokes'].size).toBe(0)
    expect([...engine['_wcAsyncPeerStreams'].values()][0].buf!.readPixels().some(v => v > 0)).toBe(true)
    engine.endPeerLiveStroke('peer', packet.strokeId)
    for (let tick = 0; tick < 100 && engine['_wcCanonical'].pending; tick++) {
      const frame = frames.entries().next().value
      if (frame) { frames.delete(frame[0]); frame[1]() }
    }
    expect(engine['_wcAsyncError']).toBeNull(); expect(engine['_wcAsyncPeerStreams'].size).toBe(0)
    expect([...engine['_peerLiveStrokes'].values()][0]).toMatchObject({ paintedTotal: 2, ended: true })
    expect(complete).not.toHaveBeenCalled()
  } finally { complete.mockRestore(); engine.destroy() }
})

it('fences GPU units and stops when a continuation starts a solver', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  const fence = vi.spyOn(engine['gl'], 'finish'); let steps = 0; let solving = false
  const settle = vi.spyOn(engine, '_settle' as never, 'get').mockImplementation(() => solving ? {} as never : null as never)
  function* work(): Generator<number, void, void> {
    steps++; yield 1
    steps++; solving = true; yield 1
    steps++; yield 1
  }
  try {
    engine['_sliceLimits'].budgetMs = 1000
    engine['_advanceAsyncCanonical'](work(), () => true)
    expect(steps).toBe(2); expect(fence).toHaveBeenCalledTimes(2)
  } finally { settle.mockRestore(); fence.mockRestore(); engine.destroy() }
})

it('forgets queued foreign pencil previews on loss without deleting stale GPU handles', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L'); engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  engine['_wcCanonical'].enqueue({ execute: function* () { yield 0 }, cancel: () => {} })
  try {
    engine.appendPeerLiveDabs('peer', { strokeId: 'p', layerId: 'L', packetSeq: 0, tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [dab(16, 20)] })
    expect(engine['_wcAsyncPeerStreams'].size).toBe(1)
    const remove = vi.spyOn(engine['gl'], 'deleteTexture'), draw = vi.spyOn(engine['gl'], 'drawArrays')
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(engine['_wcAsyncPeerStreams'].size).toBe(0)
    expect(engine['_peerLiveStrokes'].size).toBe(0)
    expect(remove).not.toHaveBeenCalled(); expect(draw).not.toHaveBeenCalled()
    remove.mockRestore(); draw.mockRestore()
  } finally { engine.destroy() }
})

it('keeps unknown and gapped peer streams CPU-only while canonical solver is pending', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L'); engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  const settle = vi.spyOn(engine, '_settle' as never, 'get').mockReturnValue({} as never)
  const complete = vi.spyOn(engine as unknown as { _completeSettle(): void }, '_completeSettle').mockImplementation(() => { throw Error('unexpected drain') })
  const packet = { strokeId: 'gap', layerId: 'L', packetSeq: 5, tool: 'pencil' as const, preset: 'HB', color: [0, 0, 0] as [number, number, number], dabs: [dab(16, 20)] }
  try {
    engine.appendPeerLiveDabs('peer', packet)
    engine.appendPeerLiveDabs('peer', { ...packet, packetSeq: 6 })
    expect(complete).not.toHaveBeenCalled()
    expect([...engine['_peerLiveStrokes'].values()][0]).toMatchObject({ desynced: true, paintedTotal: 0 })
    engine.appendPeerLiveDabs('peer', { ...packet, strokeId: 'next', packetSeq: 0 })
    engine.appendPeerLiveDabs('peer', { ...packet, strokeId: 'next', packetSeq: 2 })
    const cancelled = [...engine['_wcAsyncPeerStreams'].values()][0]
    expect(cancelled.cancelled).toBe(true); expect(cancelled.buf).toBeNull()
    engine.appendPeerLiveDabs('peer', { ...packet, strokeId: 'next', packetSeq: 1 })
    expect(complete).not.toHaveBeenCalled()
    settle.mockRestore()
    engine.resetPeerLiveStrokes()
    engine.appendPeerLiveDabs('peer', { ...packet, strokeId: 'fresh', packetSeq: 0 })
    expect([...engine['_wcAsyncPeerStreams'].values()][0]).toMatchObject({ strokeId: 'fresh', cancelled: false, nextPacketSeq: 1 })
  } finally { settle.mockRestore(); complete.mockRestore(); engine.destroy() }
})

it('keeps canonical tile inputs locked while split presentation admits a new provisional gesture', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor')
  engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true; engine['_settlePlan'].splitQuanta = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  const prepare = vi.spyOn(engine['_settlePlan'], 'prepare')
  const physical = vi.spyOn(engine['_ribbonPainter']['ctx'], 'drawRibbonNibPass')
  const tick = () => { const frame = frames.entries().next().value; if (frame) { frames.delete(frame[0]); frame[1]() } }
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 24, y: 20 }, { x: 40, y: 20 }])
    for (let i = 0; i < 100 && !engine['_settle']; i++) tick()
    const job = engine['_settle']!
    expect(job).not.toBeNull()
    const initial = job.ops.length
    for (let i = 0; i < 2000 && job.ops.length === initial && engine['_settle'] === job; i++) engine['_advanceSettle']()
    expect(job.ops.length).toBeGreaterThan(initial)
    expect(engine['_wcAsyncOwners'].has(job.scratch)).toBe(true)
    const entries = [...job.scratch.tileEntries()]
    const before = entries.flatMap(([, entry]) => [entry.inkLoad, entry.inkColor, entry.solventLoad, entry.coverage].filter(Boolean).map(b => b!.readPixels()))
    const count = physical.mock.calls.length
    simulateStroke(engine, [{ x: 12, y: 36 }, { x: 24, y: 36 }, { x: 40, y: 36 }])
    expect(physical.mock.calls.length).toBe(count)
    const after = entries.flatMap(([, entry]) => [entry.inkLoad, entry.inkColor, entry.solventLoad, entry.coverage].filter(Boolean).map(b => b!.readPixels()))
    expect(after).toEqual(before)
    for (let i = 0; i < 3000 && engine['_wcCanonical'].pending; i++) { while (engine['_settle']) engine['_advanceSettle'](); tick() }
    expect(engine['_wcAsyncError']).toBeNull()
    expect(engine['_wcCanonical'].pending).toBe(false)
    expect(engine['_wcAsyncOwners'].size).toBe(0)
    expect(engine['_log'].entries.filter(e => e.op.type === 'stroke')).toHaveLength(2)
    expect(prepare.mock.calls.length).toBeGreaterThan(0)
    for (const args of prepare.mock.calls) { expect(args[12]).toBeDefined(); expect(args[13]).toBe(true) }
  } finally { prepare.mockRestore(); physical.mockRestore(); engine.destroy() }
})

it('forgets suspended split presentation snapshots on context loss without stale GPU calls', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady()
  engine.initLayer('L'); engine.setActiveLayer('L'); engine.setTool('watercolor')
  engine.setPencil('normal:100:100:PB29:round'); engine.setSize(16)
  engine['_wcAsyncFinish'] = true; engine['_settlePlan'].splitQuanta = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = callback => { frames.set(++next, callback); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  const prepare = vi.spyOn(engine['_settlePlan'], 'prepare')
  const physical = vi.spyOn(engine['_ribbonPainter']['ctx'], 'drawRibbonNibPass')
  const tick = () => { const frame = frames.entries().next().value; if (frame) { frames.delete(frame[0]); frame[1]() } }
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 24, y: 20 }, { x: 40, y: 20 }])
    for (let i = 0; i < 100 && !engine['_settle']; i++) tick()
    const job = engine['_settle']!
    expect(job).not.toBeNull()
    const initial = job.ops.length
    for (let i = 0; i < 2000 && job.ops.length === initial && engine['_settle'] === job; i++) engine['_advanceSettle']()
    expect(job.ops.length).toBeGreaterThan(initial)
    expect(engine['_wcAsyncOwners'].has(job.scratch)).toBe(true)
    const remove = vi.spyOn(engine['gl'], 'deleteTexture')
    const draw = vi.spyOn(engine['gl'], 'drawArrays')
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(engine['_settle']).toBeNull()
    expect(engine['_wcAsyncOwners'].size).toBe(0)
    // The accepted finish remains queued for restoration; its obsolete GPU owner is gone.
    expect(remove).not.toHaveBeenCalled()
    expect(draw).not.toHaveBeenCalled()
    remove.mockRestore(); draw.mockRestore()
  } finally { prepare.mockRestore(); physical.mockRestore(); engine.destroy() }
})

it.each(['L', 'other'])('scopes zero-contact rejection to painted unrecorded peer layer %s', async peerLayer => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L'); engine.initLayer('other'); engine.setActiveLayer('L')
  engine['_wcAsyncFinish'] = true; engine['_wcZeroPigmentContacts'] = true
  const frames = new Map<number, () => void>(); let next = 0
  engine['_wcCanonical']['ctx'].schedule = cb => { frames.set(++next, cb); return next }
  engine['_wcCanonical']['ctx'].unschedule = handle => { frames.delete(handle) }
  const prepare = vi.spyOn(engine['_settlePlan'], 'prepare')
  try {
    engine.appendPeerLiveDabs('peer', { strokeId: 'unrecorded', layerId: peerLayer, packetSeq: 0, tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [dab(20, 20)] })
    expect([...engine['_peerLiveStrokes'].values()][0]).toMatchObject({ paintedTotal: 1, committedOffset: 0 })
    engine.setTool('watercolor'); engine.setPencil('normal:100:0:PB29:round'); engine.setSize(16)
    simulateStroke(engine, [{ x: 12, y: 24 }, { x: 24, y: 24 }, { x: 40, y: 24 }])
    for (let i = 0; i < 2000 && engine['_wcCanonical'].pending; i++) {
      while (engine['_settle']) engine['_advanceSettle']()
      const frame = frames.entries().next().value
      if (frame) { frames.delete(frame[0]); frame[1]() }
    }
    expect(engine['_wcAsyncError']).toBeNull()
    expect(prepare.mock.calls.length).toBeGreaterThan(0)
    for (const args of prepare.mock.calls) expect(args[11]).toBe(peerLayer !== 'L')
  } finally { prepare.mockRestore(); engine.destroy() }
})

for (const [tool, preset] of [['pencil', 'HB'], ['marker', 'normal'], ['eraser', 'HB'], ['smudge', 'HB']] as const) it(`accepts ${tool} during pending canonical work with isolated layer pixels and one logical delivery`, async () => {
  const local = vi.fn()
  const { engine } = createTestEngine({ userId: 'owner', onLocalOperation: local }, { width: 64, height: 64 })
  const { engine: fresh } = createTestEngine({ userId: 'reader' }, { width: 64, height: 64 })
  await Promise.all([engine.paperReady(), fresh.paperReady()])
  for (const e of [engine, fresh]) { e.initLayer('L'); e.setActiveLayer('L') }
  const base = makeStroke('old', 'L', [dab(16, 20), dab(24, 20), dab(32, 20)])
  engine.appendOperation(base, 'remote'); fresh.appendOperation(base, 'remote')
  const pixels = () => engine['_layers'].get('L')!.allResident()[0].buffer.readPixels()
  const before = pixels()
  engine.setTool(tool); engine.setPencil(preset); engine.setSize(12); engine.setColor([.7, .2, .1])
  engine['_wcAsyncFinish'] = true
  const frames = new Map<number, () => void>(); let handle = 0
  engine['_wcCanonical']['ctx'].schedule = cb => { frames.set(++handle, cb); return handle }
  engine['_wcCanonical']['ctx'].unschedule = id => { frames.delete(id) }
  const complete = vi.spyOn(engine as unknown as { _completeSettle(): void }, '_completeSettle')
  engine['_wcCanonical'].enqueue({ execute: function* () { /* Older material request. */ }, cancel: () => {} })
  try {
    simulateStrokeStart(engine, 16, 20)
    expect(engine['_strokeId']).not.toBeNull()
    simulateStrokeMove(engine, 32, 20)
    expect(pixels()).toEqual(before)
    expect(engine['_asyncLocalPreviewTiles']().get('L')?.length).toBeGreaterThan(0)
    if (tool === 'eraser') {
      const preview = engine['_asyncLocalPreviewTiles']().get('L')![0].buffer.readPixels()
      const alpha = (a: Uint8Array) => a.reduce((sum, value, i) => sum + (i % 4 === 3 ? value : 0), 0)
      expect(alpha(preview)).toBeLessThan(alpha(before))
    }
    engine.setColor([0, 1, 0]); engine.setPencil('changed-after-start') // Immutable start settings.
    simulateStrokeEnd(engine, 40, 20)
    expect(local).toHaveBeenCalledTimes(1)
    const recorded = local.mock.calls[0][0]
    expect(recorded.tool).toBe(tool); expect(recorded.preset).toBe(preset); expect(recorded.layerId).toBe('L'); expect(recorded.color).toEqual([.7, .2, .1])
    expect(pixels()).toEqual(before)
    expect(complete).not.toHaveBeenCalled()
    for (let i = 0; i < 1000 && engine['_wcCanonical'].pending; i++) {
      const frame = frames.entries().next().value
      if (frame) { frames.delete(frame[0]); frame[1]() }
      while (engine['_settle']) engine['_advanceSettle']()
    }
    expect(engine['_wcAsyncError']).toBeNull()
    expect(engine['_wcCanonical'].pending).toBe(false)
    expect(engine['_wcAsyncLocalTools'].size).toBe(0)
    expect(engine['_smudge']['imprints'].has('owner:async-preview')).toBe(false)
    expect(engine['_smudge']['replayChunks'].has('owner:async-preview')).toBe(false)
    expect(local).toHaveBeenCalledTimes(1)
    // No ACK was delivered: optimistic visibility must not wait for the server.
    expect(engine['_log'].entries.find(e => e.op.id === recorded.id)).toMatchObject({ state: 'done', pending: true })
    fresh.appendOperation({ ...recorded, seq: 2 }, 'remote')
    expect(pixels()).toEqual(fresh['_layers'].get('L')!.allResident()[0].buffer.readPixels())
  } finally { complete.mockRestore(); engine.destroy(); fresh.destroy() }
})

it('retains accepted other-tool journal on loss and drops only its transient handles', async () => {
  const local = vi.fn()
  const { engine } = createTestEngine({ userId: 'owner', onLocalOperation: local }, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L'); engine.setActiveLayer('L')
  engine.setTool('pencil'); engine.setPencil('HB'); engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  const draw = vi.spyOn(engine['gl'], 'drawArrays'), remove = vi.spyOn(engine['gl'], 'deleteTexture')
  try {
    simulateStroke(engine, [{ x: 12, y: 20 }, { x: 36, y: 20 }])
    expect(local).toHaveBeenCalledTimes(1)
    const id = local.mock.calls[0][0].id
    draw.mockClear(); remove.mockClear()
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(engine['_log'].entries.some(e => e.op.id === id)).toBe(true)
    expect(engine['_wcAsyncLocalTools'].size).toBe(0)
    expect(draw).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
  } finally { draw.mockRestore(); remove.mockRestore(); engine.destroy() }
})

it('limits other-tool preview allocation without losing logical input or forcing canonical work', async () => {
  const local = vi.fn()
  const { engine } = createTestEngine({ onLocalOperation: local }, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L'); engine.setActiveLayer('L')
  engine.setTool('pencil'); engine.setPencil('HB'); engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  const complete = vi.spyOn(engine as unknown as { _completeSettle(): void }, '_completeSettle')
  try {
    simulateStrokeStart(engine, 16, 20)
    const id = engine['_wcAsyncLocalStroke']!, layer = engine['_wcAsyncLocalTools'].get(id)!.layers.get('L')!
    const count = layer.copied.size
    expect(engine['_resolveAsyncLocalTargets'](id, 'L', layer.buffer, { minX: 0, minY: 0, maxX: 100000, maxY: 1000 })).toEqual([])
    expect(layer.copied.size).toBe(count)
    simulateStrokeMove(engine, 32, 20); simulateStrokeEnd(engine, 40, 20)
    expect(local).toHaveBeenCalledTimes(1)
    expect(engine['_log'].entries.some(e => e.op.id === local.mock.calls[0][0].id)).toBe(true)
    expect(complete).not.toHaveBeenCalled()
  } finally { complete.mockRestore(); engine.destroy() }
})

it('keeps both local pencil previews when two strokes wait behind older canonical work', async () => {
  const { engine } = createTestEngine({}, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L'); engine.setActiveLayer('L')
  engine.setTool('pencil'); engine.setPencil('HB'); engine.setSize(8); engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  try {
    simulateStroke(engine, [{ x: 12, y: 16 }, { x: 40, y: 16 }])
    const first = engine['_asyncLocalPreviewTiles']().get('L')![0].buffer.readPixels()
    simulateStroke(engine, [{ x: 12, y: 44 }, { x: 40, y: 44 }])
    const second = engine['_asyncLocalPreviewTiles']().get('L')![0].buffer.readPixels()
    expect(engine['_wcAsyncLocalTools'].size).toBe(2)
    let retained = 0, added = 0
    for (let i = 3; i < first.length; i += 4) {
      if (first[i]) { expect(second[i]).toBeGreaterThanOrEqual(first[i]); retained++ }
      if (!first[i] && second[i]) added++
    }
    expect(retained).toBeGreaterThan(0); expect(added).toBeGreaterThan(0)
  } finally { engine.destroy() }
})


it('retains an earlier preview tile when the next waiting local stroke paints a different tile', async () => {
  const { engine } = createTestEngine({ infinite: true }, { width: 64, height: 64 })
  await engine.paperReady(); engine.initLayer('L'); engine.setActiveLayer('L')
  engine.setTool('pencil'); engine.setPencil('HB'); engine.setSize(8); engine['_wcAsyncFinish'] = true
  engine['_wcCanonical']['ctx'].schedule = () => 1
  engine['_wcCanonical']['ctx'].unschedule = () => {}
  try {
    simulateStroke(engine, [{ x: 12, y: 16 }, { x: 40, y: 16 }])
    const first = engine['_asyncLocalPreviewTiles']().get('L')![0]
    const width = engine['_tileSize']().w
    simulateStroke(engine, [{ x: width + 12, y: 44 }, { x: width + 40, y: 44 }])
    const tiles = engine['_asyncLocalPreviewTiles']().get('L')!
    expect(tiles.some(t => t.buffer === first.buffer)).toBe(true)
    expect(new Set(tiles.map(t => t.originX)).size).toBeGreaterThan(1)
  } finally { engine.destroy() }
})
