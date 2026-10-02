import { afterEach, expect, it, vi } from 'vitest'

import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady } from './testing/engineTestUtils'

// A rebuild knows the remaining journal. Finished washes with no remaining
// continuation need not be read back merely to make room for the next author.
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it('does not synchronously spill finished one-shot washes during an undo rebuild', async () => {
  const { engine } = createTestEngine({ userId: 'author' }, { width: 64, height: 64 })
  try {
    engine.appendOperation(makeLayerAdd('author', 'L', 'Layer', { seq: 0, timestamp: Date.now() }), 'remote')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    await paperReady(engine)
    vi.useFakeTimers()
    const internal = engine as unknown as {
      _flushOpQueue(): void; _completeSettle(): void; _gpuBudget: number;
      _rebuildJobs: Map<string, unknown>; _inJobStep: boolean;
    }
    for (let i = 0; i < 6; i++) {
      engine.appendOperation(makeStroke(i === 0 ? 'author' : `peer-${i}`, 'L', [
        dab(8 + i * 6, 16, { size: 8 }), dab(10 + i * 6, 24, { size: 8 }),
      ], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: `gesture-${i}`, washId: `wash-${i}`, seq: i + 1, timestamp: Date.now() }), 'remote')
    }
    internal._flushOpQueue()
    internal._completeSettle()
    internal._gpuBudget = 400 * 1024 * 1024
    const gl = (engine as unknown as { gl: WebGLRenderingContext }).gl
    const nativeRead = gl.readPixels.bind(gl)
    const reads: string[] = []
    vi.spyOn(gl, 'readPixels').mockImplementation((...args: Parameters<WebGLRenderingContext['readPixels']>) => {
      if (internal._inJobStep) reads.push(new Error().stack ?? '')
      return nativeRead(...args)
    })
    expect(engine.undo()?.type).toBe('stroke')
    await vi.advanceTimersByTimeAsync(500)
    expect(internal._rebuildJobs.size).toBe(0)
    expect(reads).toEqual([])
  } finally { engine.destroy() }
})

it('keeps a wash that the remaining rebuild journal continues', async () => {
  const { engine } = createTestEngine({ userId: 'author' }, { width: 64, height: 64 })
  try {
    engine.appendOperation(makeLayerAdd('author', 'L', 'Layer', { seq: 0, timestamp: Date.now() }), 'remote')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    await paperReady(engine)
    vi.useFakeTimers()
    const internal = engine as unknown as {
      _flushOpQueue(): void; _completeSettle(): void; _gpuBudget: number;
      _rebuildJobs: Map<string, unknown>;
      _replayRibbonChunks: Map<string, { scratch: { dryCtx: { bounds: { minY: number; maxY: number } } } }>;
    }
    for (let i = 0; i < 6; i++) engine.appendOperation(makeStroke(i === 0 ? 'author' : `peer-${i}`, 'L', [
      dab(8 + i * 6, 16, { size: 8 }), dab(10 + i * 6, 24, { size: 8 }),
    ], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: `gesture-${i}`, washId: `wash-${i}`, seq: i + 1, timestamp: Date.now() }), 'remote')
    engine.appendOperation(makeStroke('peer-1', 'L', [dab(14, 42, { size: 8 }), dab(16, 50, { size: 8 })],
      { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'continued-gesture', washId: 'wash-1', seq: 7, timestamp: Date.now() }), 'remote')
    internal._flushOpQueue(); internal._completeSettle()
    internal._gpuBudget = 400 * 1024 * 1024
    expect(engine.undo()?.type).toBe('stroke')
    await vi.advanceTimersByTimeAsync(500)
    expect(internal._rebuildJobs.size).toBe(0)
    const bounds = internal._replayRibbonChunks.get('wash-1')!.scratch.dryCtx.bounds
    expect(bounds.minY).toBeLessThan(24)
    expect(bounds.maxY).toBeGreaterThan(42)
  } finally { engine.destroy() }
})

it('restarts from history when a retired wash continues while its rebuild is still running', async () => {
  const { engine } = createTestEngine({ userId: 'author' }, { width: 64, height: 64 })
  try {
    engine.appendOperation(makeLayerAdd('author', 'L', 'Layer', { seq: 0, timestamp: Date.now() }), 'remote')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    await paperReady(engine)
    vi.useFakeTimers()
    const internal = engine as unknown as {
      _flushOpQueue(): void; _completeSettle(): void; _gpuBudget: number;
      _lostWashes: Map<string, unknown>;
      _log: { append(op: unknown, placement: { serverSeq: number }): void };
      _rebuildJobs: Map<string, { timer: ReturnType<typeof setTimeout> }>;
      _stepRebuildJob(job: unknown): void;
      _replayRibbonChunks: Map<string, { scratch: { dryCtx: { bounds: { minY: number; maxY: number } } } }>;
    }
    for (let i = 0; i < 6; i++) engine.appendOperation(makeStroke(i === 0 ? 'author' : `peer-${i}`, 'L', [
      dab(8 + i * 6, 16, { size: 8 }), dab(10 + i * 6, 24, { size: 8 }),
    ], { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: `gesture-${i}`, washId: `wash-${i}`, seq: i + 1, timestamp: Date.now() }), 'remote')
    internal._flushOpQueue(); internal._completeSettle()
    internal._gpuBudget = 400 * 1024 * 1024
    const originalBounds = { ...internal._replayRibbonChunks.get('wash-1')!.scratch.dryCtx.bounds }
    let clock = performance.now()
    vi.spyOn(performance, 'now').mockImplementation(() => clock += 16)
    expect(engine.undo()?.type).toBe('stroke')
    const undo = engine.getOperations().findLast(op => op.type === 'operation_undo')!
    engine.confirmOperation(undo.id, 7)
    const step = () => { const job = internal._rebuildJobs.get('L'); if (!job) return; clearTimeout(job.timer); internal._stepRebuildJob(job); clearTimeout(job.timer) }
    for (let i = 0; i < 1000 && !internal._lostWashes.has('wash-1'); i++) step()
    expect(internal._lostWashes.has('wash-1')).toBe(true)
    expect(internal._rebuildJobs.size).toBe(1)
    // Grow the confirmed journal without painting the old screen buffer:
    // the rebuild must recover its own retired state when it reaches this tail.
    internal._log.append(makeStroke('peer-1', 'L', [dab(14, 42, { size: 8 }), dab(16, 50, { size: 8 })],
      { tool: 'watercolor', preset: 'normal:100:70:PB29:round', strokeId: 'late-gesture', washId: 'wash-1', seq: 8, timestamp: Date.now() }), { serverSeq: 8 })
    for (let i = 0; i < 2000 && internal._rebuildJobs.size; i++) { step(); await Promise.resolve() }
    expect(internal._rebuildJobs.size).toBe(0)
    const bounds = internal._replayRibbonChunks.get('wash-1')!.scratch.dryCtx.bounds
    expect(bounds.minY).toBeLessThanOrEqual(originalBounds.minY)
    expect(bounds.maxY).toBeGreaterThan(42)
  } finally { engine.destroy() }
})
