import { expect, it, vi } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { createTestEngine, makeLayerAdd } from './testing/engineTestUtils'

/** A header whose material must never be inspected by the legacy renderer. */
function canonical(): Operation {
  return Object.defineProperty({ type: 'canonical_stroke', id: 'canonical', userId: 'user', timestamp: 1, seq: 2, layerId: 'L' }, 'frame', {
    enumerable: true, get() { throw new Error('Material decoded before renderer admission') },
  }) as Operation
}
it.each(['local', 'remote'] as const)('rejects a canonical %s append before queue, log, GL or callbacks', source => {
  const local = vi.fn(), queued = vi.fn(), { engine, canvas } = createTestEngine({ onLocalOperation: local, onQueuedOperationApplied: queued })
  const gl = canvas.getContext('webgl')!, draw = vi.spyOn(gl, 'drawArrays'), upload = vi.spyOn(gl, 'texImage2D')
  const internals = engine as unknown as { _flushOpQueue: () => void }, flush = vi.spyOn(internals, '_flushOpQueue')
  try {
    expect(() => engine.appendOperation(canonical(), source)).toThrow('not supported by this renderer')
    expect(flush).not.toHaveBeenCalled()
    expect(engine.getOperations()).toEqual([])
    expect(local).not.toHaveBeenCalled(); expect(queued).not.toHaveBeenCalled()
    expect(draw).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled()
  } finally { engine.destroy() }
})
it('rejects an entire mixed historical page before admitting its legacy prefix', () => {
  const { engine, canvas } = createTestEngine(), gl = canvas.getContext('webgl')!
  const internals = engine as unknown as { _snapshotIO: { absorbHistorical: (ops: Operation[]) => void } }
  const absorb = vi.spyOn(internals._snapshotIO, 'absorbHistorical'), draw = vi.spyOn(gl, 'drawArrays')
  try {
    expect(() => engine.absorbHistoricalOperations([makeLayerAdd('user', 'L'), canonical()])).toThrow('not supported by this renderer')
    expect(absorb).not.toHaveBeenCalled(); expect(draw).not.toHaveBeenCalled()
    expect(engine.getOperations()).toEqual([])
    engine.appendOperation(makeLayerAdd('user', 'legacy'))
    expect(engine.getOperations().map(op => op.type)).toEqual(['layer_add'])
  } finally { engine.destroy() }
})
it.each([false, true])('rejects canonical dependency restore atomically before preload or prefix changes (structure=%s)', async replayStructure => {
  const { engine, canvas } = createTestEngine(), gl = canvas.getContext('webgl')!
  const preload = vi.spyOn(engine, 'preloadImages'), absorb = vi.spyOn(engine, 'absorbHistoricalOperations'), draw = vi.spyOn(gl, 'drawArrays')
  try {
    const rejected = engine.restoreHistoricalOperations([makeLayerAdd('user', 'L'), canonical()], replayStructure)
    // Admission executes synchronously before the method's first await. The
    // independent paper-loader microtask may redraw during an async assertion.
    expect(draw).not.toHaveBeenCalled()
    await expect(rejected).rejects.toThrow('not supported by this renderer')
    expect(preload).not.toHaveBeenCalled(); expect(absorb).not.toHaveBeenCalled()
    expect(engine.getOperations()).toEqual([])
  } finally { engine.destroy() }
})
