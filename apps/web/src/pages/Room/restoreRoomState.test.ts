import { expect, it, vi } from 'vitest'
import type { Operation, OperationUndoOperation, OperationRedoOperation } from '@grafetto/shared'

import { createTestEngine, dab, makeStroke, readLayerPixels } from '../../engine/testing/engineTestUtils'
import { restoreRoomState, type RestoreRoomStateDeps } from './restoreRoomState'
import { createPendingPreviews } from './net/pendingPreviews'
import { createReplayGate } from './replayGate'
import { createConfirmedStreamHandler } from './net/confirmedStream'
import { createSnapshotUploader } from './net/snapshotSync'

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


it('drains the real confirmed stream before requesting first snapshot at the advanced watermark', async () => {
  const engine = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  engine.setBaseLayers(['L'])
  const before: Operation = { ...makeStroke('A', 'L', [dab(2, 4)]), tool: 'watercolor', strokeId: 'before', seq: 1 }
  const clear: Operation = { id: 'clear2', type: 'layer_clear', layerId: 'L', userId: 'A', timestamp: 2, seq: 2 }
  const after: Operation = { ...makeStroke('A', 'L', [dab(6, 4)]), tool: 'watercolor', strokeId: 'after', seq: 3 }
  const undo: OperationUndoOperation = { id: 'peerUndo4', type: 'operation_undo', userId: 'A', timestamp: 4, targetOpId: clear.id }
  const latestKnownSeqRef = { current: 3 }, lastConfirmedSeqRef = { current: 3 }
  const replayGate = createReplayGate<{ seq: number; operation: Operation }>()
  const pendingPreviewsRef = { current: createPendingPreviews() }
  const appliedOpIdsRef = { current: new Set<string>() }
  const apply = (op: Operation) => {
    if (op.id === undo.id) expect((engine as unknown as { _skippedInBatch: Set<string> })._skippedInBatch.size).toBe(0)
    appliedOpIdsRef.current.add(op.id); engine.appendOperation(op, 'remote')
  }
  const resync = vi.fn(), uploader = createSnapshotUploader('room')
  const arm = vi.spyOn(uploader, 'requestFirstSnapshot')
  const observe = vi.spyOn(uploader, 'onSeqObserved')
  const confirm = createConfirmedStreamHandler({
    engineRef: { current: engine }, latestKnownSeqRef, lastConfirmedSeqRef, replayGate, pendingPreviewsRef, appliedOpIdsRef,
    catchingUpRef: { current: false }, streamedStrokeIdsRef: { current: new Set<string>() }, deferredOpsQueueRef: { current: [] },
    previewScheduleRef: { current: null }, confirmOwnOperation: vi.fn(), markLayerActive: vi.fn(),
    applyRemoteOp: apply, syncFromLog: vi.fn(), checkSnapshotBoundary: vi.fn(), requestFullResync: resync,
  })
  const deps: RestoreRoomStateDeps = {
    boardId: 'room', diagnosticClearPrefixElision: true,
    restoreFromSnapshot: vi.fn().mockResolvedValue('none'), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp(op) { apply(op); if (op.id === before.id) { confirm({ seq: 4, operation: undo }); expect(latestKnownSeqRef.current).toBe(3) } },
    syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(), dispatchParticipants: vi.fn(), setRestoreFailure: vi.fn(),
    setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(), notifyReplayIncomplete: vi.fn(), getSnapshotUploader: () => uploader,
    latestKnownSeqRef, replayIncompleteRef: { current: false }, pendingPreviewsRef, openTimerRef: { current: null },
    replayGate: replayGate as RestoreRoomStateDeps['replayGate'],
  }
  try {
    await restoreRoomState(engine, { latestSnapshotSeq: null, tailOperations: [before, clear, after], participants: [], palette: [], frozen: false }, { mode: 'join', alreadyHadSeq: 0 }, deps)
    expect(deps.setRestoreFailure).not.toHaveBeenCalled(); expect(resync).not.toHaveBeenCalled()
    expect(lastConfirmedSeqRef.current).toBe(4); expect(latestKnownSeqRef.current).toBe(4)
    expect(arm).toHaveBeenCalledOnce(); expect(observe.mock.calls[0]?.slice(0, 2)).toEqual([0, 4])
    const log = (engine as unknown as { _log: { entries: Array<{ op: Operation; state: string }> } })._log.entries
    expect(log.map(q => q.op.id)).toEqual([before.id, clear.id, after.id, undo.id])
    expect(log.find(q => q.op.id === clear.id)?.state).toBe('undone')
  } finally { engine.destroy() }
})

it.each(['restored', 'failed'] as const)('records only successfully restored server history for reconnect (%s, #739)', async status => {
  const engine = createTestEngine({ userId: 'reader' }, { width: 8, height: 8 }).engine
  const op: Operation = { type: 'layer_add', id: 'layer6', seq: 106048, userId: 'A', timestamp: 6, layerId: 'L', name: 'Layer' }
  const deps: RestoreRoomStateDeps = {
    boardId: 'room', restoreFromSnapshot: vi.fn().mockResolvedValue(status), backfillHistory: vi.fn().mockResolvedValue(undefined),
    applyRemoteOp: vi.fn(), syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(), dispatchParticipants: vi.fn(),
    setRestoreFailure: vi.fn(), setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(), notifyReplayIncomplete: vi.fn(),
    getSnapshotUploader: () => null, latestKnownSeqRef: { current: 0 }, replayIncompleteRef: { current: false },
    pendingPreviewsRef: { current: createPendingPreviews() }, openTimerRef: { current: null }, replayGate: createReplayGate(),
  }
  try {
    await restoreRoomState(engine, { latestSnapshotSeq: 106000, tailOperations: [op], participants: [], palette: [], frozen: false },
      { mode: 'join', alreadyHadSeq: 0 }, deps)
    expect(deps.latestKnownSeqRef.current).toBe(status === 'restored' ? 106048 : 0)
    if (status === 'restored') {
      await restoreRoomState(engine, { latestSnapshotSeq: 106000, tailOperations: [], participants: [], palette: [], frozen: false },
        { mode: 'catchup', alreadyHadSeq: deps.latestKnownSeqRef.current }, deps)
      expect(deps.restoreFromSnapshot).toHaveBeenCalledOnce()
    }
  } finally { engine.destroy() }
})
