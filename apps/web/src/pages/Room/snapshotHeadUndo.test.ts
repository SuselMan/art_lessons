import { expect, it, vi } from 'vitest'

import { SNAPSHOT_SEQ_INTERVAL, type Operation } from '@grafetto/shared'

import { createTestEngine, dab, makeStroke, readLayerPixels } from '../../engine/testing/engineTestUtils'
import { decodeLayerTiles } from '../../engine/src/oplog/snapshotCodec'
import { createPendingPreviews } from './net/pendingPreviews'
import { walkHistoryBackward } from './net/snapshotRestore'
import { createReplayGate } from './replayGate'
import { restoreRoomState, type RestoreRoomStateDeps } from './restoreRoomState'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

/** #789 and #673: use the actual snapshot, engine journal and exclusive
 *  history walk. The cursor and the resulting Undo target must agree, not
 *  merely the number of requests made by a mocked restore. */
it.each([
  { head: 20, tailCount: 0, duplicateHead: false },
  { head: 20, tailCount: 0, duplicateHead: true },
  { head: 100, tailCount: 12, duplicateHead: false },
  { head: 120, tailCount: 3, duplicateHead: false },
])('restores the snapshot head into Undo history: %j', async ({ head, tailCount, duplicateHead }) => {
  const { engine: source } = createTestEngine({ userId: 'author' })
  const { engine: reader } = createTestEngine({ userId: 'author' })
  source.setBaseLayers(['L'])
  reader.setBaseLayers(['L'])
  const operations: Operation[] = Array.from({ length: head + tailCount }, (_, index) => ({
    ...makeStroke('author', 'L', [dab(2 + index % 4, 4, { size: 2, opacity: 0.5 })]),
    id: `stroke-${index + 1}`, seq: index + 1, timestamp: index + 1,
  }))
  try {
    for (const op of operations.slice(0, head)) source.appendOperation(op, 'remote')
    const snapshot = source.bakeLayerByFullReplay('L')
    expect(snapshot).not.toBeNull()
    const tiles = decodeLayerTiles(snapshot!, 0).tiles
    const queries: Array<{ before: number; limit: number }> = []
    let backfill = Promise.resolve()
    const deps: RestoreRoomStateDeps = {
      boardId: 'snapshot-head',
      restoreFromSnapshot: async engine => {
        engine.restoreLayerFromSnapshot('L', tiles, head)
        return 'restored'
      },
      backfillHistory: (_board, engine, from) => {
        backfill = walkHistoryBackward('snapshot-head', from, SNAPSHOT_SEQ_INTERVAL,
          page => {
            const before = readLayerPixels(reader, 'L')
            engine.absorbHistoricalOperations(page)
            // Filling the Undo journal must not paint the snapshotted ink twice.
            expect(readLayerPixels(reader, 'L')).toEqual(before)
          },
          async (_room, before, limit = SNAPSHOT_SEQ_INTERVAL) => {
            queries.push({ before, limit })
            return operations.filter(op => op.seq! < before).slice(-limit)
          })
        return backfill
      },
      applyRemoteOp: op => { reader.appendOperation(op, 'remote') },
      syncFromLogNow: vi.fn(), markJoinRestoreDone: vi.fn(), dispatchParticipants: vi.fn(),
      setRestoreFailure: vi.fn(), setRoomContentReady: vi.fn(), finishOpenTimer: vi.fn(),
      notifyReplayIncomplete: vi.fn(), getSnapshotUploader: () => null,
      latestKnownSeqRef: { current: head + tailCount }, replayIncompleteRef: { current: false },
      pendingPreviewsRef: { current: createPendingPreviews() }, openTimerRef: { current: null },
      replayGate: createReplayGate(),
    }
    const tail = operations.slice(duplicateHead ? head - 1 : head)
    await restoreRoomState(reader, {
      latestSnapshotSeq: head, tailOperations: tail, participants: [], palette: [], frozen: false,
    }, { mode: 'join', alreadyHadSeq: 0 }, deps)
    await backfill

    expect(deps.setRestoreFailure).not.toHaveBeenCalled()
    const expectedHistory = operations.slice(Math.max(0, head - SNAPSHOT_SEQ_INTERVAL))
    expect(reader.getOperations().map(op => op.id)).toEqual(expectedHistory.map(op => op.id))
    expect(queries[0].before).toBe(head + 1)
    expect(queries.reduce((total, query) => total + query.limit, 0)).toBeLessThanOrEqual(SNAPSHOT_SEQ_INTERVAL)
    // Undo the tail, then the head itself. This was stroke-19 (or 99)
    // before the fix even though the snapshot still visibly contained 20/100.
    for (let index = operations.length; index >= head; index--) {
      expect(reader.undo()?.id).toBe(`stroke-${index}`)
    }
    expect(reader.redo()?.id).toBe(`stroke-${head}`)
  } finally {
    source.destroy()
    reader.destroy()
  }
})
