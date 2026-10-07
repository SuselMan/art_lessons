import { expect, it, vi } from 'vitest'
import type { Operation, OperationUndoOperation, OperationRedoOperation } from '@grafetto/shared'

import { createTestEngine, dab, makeStroke, readLayerPixels } from '../../engine/testing/engineTestUtils'
import { restoreRoomState, type RestoreRoomStateDeps } from './restoreRoomState'
import { createPendingPreviews } from './net/pendingPreviews'
import { createReplayGate } from './replayGate'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

it('seeds inclusive undo5 before tail redo6 using actual engine history and pixels', async () => {
  const target = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  const source = createTestEngine({ userId: 'A' }, { width: 8, height: 8 }).engine
  target.setBaseLayers(['L']); source.setBaseLayers(['L'])
  const colour = { ...makeStroke('A', 'L', [dab(6, 4, { size: 4, opacity: 0.5 })]), seq: 3 }
  const undo: OperationUndoOperation = { type: 'operation_undo', id: 'u5', userId: 'A', timestamp: 5, seq: 5, targetOpId: colour.id }
  const redo: OperationRedoOperation = { type: 'operation_redo', id: 'r6', userId: 'A', timestamp: 6, seq: 6, targetOpId: colour.id }
  const ops: Operation[] = [
    { ...makeStroke('A', 'L', [dab(2, 4, { size: 4, opacity: 0.5 })]), seq: 1 },
    { ...makeStroke('B', 'L', [dab(4, 4, { size: 4, opacity: 0.5 })]), seq: 2 }, colour,
    { type: 'paper_dry', id: 'd4', userId: 'A', timestamp: 4, seq: 4 }, undo, redo,
  ]
  for (const op of ops) source.appendOperation(op, 'remote')
  const applied: string[] = []
  const deps: RestoreRoomStateDeps = {
    boardId: 'room', restoreFromSnapshot: vi.fn().mockResolvedValue('restored'), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp(op) {
      if (op.id === redo.id) expect(target.getOperations().some(o => o.id === colour.id)).toBe(false)
      applied.push(op.id); target.appendOperation(op, 'remote')
    },
    syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(), dispatchParticipants: vi.fn(),
    setRestoreFailure: vi.fn(), setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(), notifyReplayIncomplete: vi.fn(),
    getSnapshotUploader: () => null, latestKnownSeqRef: { current: 6 }, replayIncompleteRef: { current: false },
    pendingPreviewsRef: { current: createPendingPreviews() }, openTimerRef: { current: null }, replayGate: createReplayGate(),
  }
  await restoreRoomState(target, { latestSnapshotSeq: 5, tailOperations: ops, participants: [], palette: [], frozen: false }, { mode: 'join', alreadyHadSeq: 0 }, deps)
  expect(deps.setRestoreFailure).not.toHaveBeenCalled()
  expect(applied).toEqual(['r6'])
  expect([...readLayerPixels(target, 'L')!]).toEqual([...readLayerPixels(source, 'L')!])
  expect(target.getOperationsSinceRestore().map(op => op.id)).toEqual(['r6'])
})


it.each([
  { name: 'opt-in complete fresh join', enabled: true, mode: 'join' as const, already: 0, snapshot: null, head: 3, paints: 1 },
  { name: 'default OFF', enabled: false, mode: 'join' as const, already: 0, snapshot: null, head: 3, paints: 2 },
  { name: 'catch-up', enabled: true, mode: 'catchup' as const, already: 0, snapshot: null, head: 3, paints: 2 },
  { name: 'already held history', enabled: true, mode: 'join' as const, already: 1, snapshot: null, head: 3, paints: 2 },
  { name: 'snapshot authority present', enabled: true, mode: 'join' as const, already: 0, snapshot: 0, head: 3, paints: 2 },
  { name: 'tail does not reach known head', enabled: true, mode: 'join' as const, already: 0, snapshot: null, head: 4, paints: 2 },
])('clear-prefix gate: $name preserves real history and later undo of clear', async test => {
  const engine = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  engine.setBaseLayers(['L'])
  const wc = (x: number, seq: number): Operation => ({
    ...makeStroke('A', 'L', [dab(x, 4, { size: 2, opacity: 0.5 })]),
    tool: 'watercolor', preset: 'normal:100:60:PB29:round', strokeId: 'gesture-' + seq, seq,
  })
  const before = wc(2, 1), after = wc(6, 3)
  const clear: Operation = { id: 'clear2', type: 'layer_clear', layerId: 'L', userId: 'A', timestamp: 2, seq: 2 }
  const ops = [before, clear, after]
  const internals = engine as unknown as { _paintDabs: (...args: unknown[]) => unknown; _startRebuildJob: (...args: unknown[]) => unknown; _log: { entries: Array<{op: Operation; state: string}>; layerPixelOps: (id: string) => Operation[] } }
  const paint = vi.spyOn(internals, '_paintDabs')
  const replay = vi.spyOn(internals, '_startRebuildJob')
  const deps: RestoreRoomStateDeps = {
    boardId: 'room', diagnosticClearPrefixElision: test.enabled,
    restoreFromSnapshot: vi.fn().mockResolvedValue('none'), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp: op => { engine.appendOperation(op, 'remote') }, syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(),
    dispatchParticipants: vi.fn(), setRestoreFailure: vi.fn(), setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(),
    notifyReplayIncomplete: vi.fn(), getSnapshotUploader: () => null, latestKnownSeqRef: { current: test.head },
    replayIncompleteRef: { current: false }, pendingPreviewsRef: { current: createPendingPreviews() },
    openTimerRef: { current: null }, replayGate: createReplayGate(),
  }
  await restoreRoomState(engine, { latestSnapshotSeq: test.snapshot, tailOperations: ops, participants: [], palette: [], frozen: false }, { mode: test.mode, alreadyHadSeq: test.already }, deps)
  expect(deps.setRestoreFailure).not.toHaveBeenCalled()
  expect(paint).toHaveBeenCalledTimes(test.paints)
  expect(engine.getOperations().map(op => op.id)).toEqual(ops.map(op => op.id))
  expect(internals._log.entries.find(q => q.op.id === before.id)?.state).toBe('done')
  engine.appendOperation({ id: 'undo-clear', type: 'operation_undo', userId: 'A', timestamp: 4, seq: 4, targetOpId: clear.id }, 'remote')
  expect(replay).toHaveBeenCalledWith('L')
  expect(internals._log.layerPixelOps('L').some(op => op.id === before.id)).toBe(true)
  engine.appendOperation({ id: 'redo-clear', type: 'operation_redo', userId: 'A', timestamp: 5, seq: 5, targetOpId: clear.id }, 'remote')
  expect(replay).toHaveBeenCalledTimes(2)
  expect(internals._log.layerPixelOps('L').some(op => op.id === clear.id)).toBe(true)
  expect(engine.getOperations().some(op => op.id === before.id)).toBe(true)
  engine.destroy()
})
