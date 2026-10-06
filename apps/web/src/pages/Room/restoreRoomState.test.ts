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
