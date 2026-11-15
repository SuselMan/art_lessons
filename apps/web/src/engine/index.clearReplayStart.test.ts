import { afterEach, expect, it, vi } from 'vitest'
import type { LayerClearOperation } from '@grafetto/shared'
import { OperationLog } from './src/oplog/OperationLog'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'
import { createTestEngine, dab, makeLayerAdd, makeStroke, paperReady, readTilePixels } from './testing/engineTestUtils'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it('skips cleared paint in a fresh rebuild, but restores it if the clear is undone during that rebuild', async () => {
  const { engine } = createTestEngine({ userId: 'author' }, { width: 32, height: 32 })
  try {
    engine.appendOperation(makeLayerAdd('author', 'L', 'Layer', { seq: 1 }), 'remote')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    await paperReady(engine)
    vi.useFakeTimers()
    const internal = engine as unknown as {
      _log: OperationLog;
      _startRebuildJob(layerId: string): void;
      _stepRebuildJob(job: unknown): void;
      _rebuildJobs: Map<string, { timer: ReturnType<typeof setTimeout>; start: number }>;
      _applyPixelOp(...args: unknown[]): void;
    }
    const old = makeStroke('author', 'L', [dab(6, 6, { size: 8, opacity: 1 })], { seq: 2, strokeEnd: true })
    const clear: LayerClearOperation = { id: 'clear-boundary', type: 'layer_clear', userId: 'author', layerId: 'L', timestamp: 0, seq: 3 }
    const tail = makeStroke('author', 'L', [dab(25, 25, { size: 8, opacity: 1 })], { seq: 4, strokeEnd: true })
    for (const op of [old, clear, tail]) internal._log.append(op, { serverSeq: op.seq })
    const apply = vi.spyOn(internal, '_applyPixelOp')
    const finish = () => {
      for (let i = 0; i < 100 && internal._rebuildJobs.size; i++) {
        const job = internal._rebuildJobs.get('L')!
        clearTimeout(job.timer)
        internal._stepRebuildJob(job)
      }
      expect(internal._rebuildJobs.size).toBe(0)
    }
    internal._startRebuildJob('L')
    expect(internal._rebuildJobs.get('L')!.start).toBe(1)
    finish()
    expect(apply.mock.calls.map(args => (args[2] as { id: string }).id)).not.toContain(old.id)
    const cleared = readTilePixels(engine, 'L', 0, 0, 32, 32)!.slice()
    expect(Array.from(cleared)).toEqual(Array.from(decodeLayerTiles(engine.bakeLayerByFullReplay('L')!, 0).tiles[0].pixels))
    internal._startRebuildJob('L')
    internal._log.applyUndo(clear.id, 'author')
    finish() // The changed boundary invalidates and restarts the sliced job.
    const restored = readTilePixels(engine, 'L', 0, 0, 32, 32)!
    expect(Array.from(restored)).not.toEqual(Array.from(cleared))
    expect(Array.from(restored)).toEqual(Array.from(decodeLayerTiles(engine.bakeLayerByFullReplay('L')!, 0).tiles[0].pixels))
    expect(internal._log.entries.map(entry => entry.op.id)).toContain(old.id)
  } finally { engine.destroy() }
})
