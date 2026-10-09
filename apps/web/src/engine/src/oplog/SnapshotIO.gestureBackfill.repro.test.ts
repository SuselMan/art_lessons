import { expect, it, vi } from 'vitest'
import type { Operation, StrokeOperation } from '@grafetto/shared'
import { OperationLog } from './OperationLog'
import { SnapshotIO, type SnapshotIOContext } from './SnapshotIO'

const chunk = (id: string, seq: number): StrokeOperation => ({ id, seq, type: 'stroke', userId: 'u', timestamp: seq, layerId: 'L', tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [{ x: seq * 10, y: 10, pressure: 1, tiltX: 0, tiltY: 0, size: 4, aspectRatio: 1, angle: 0, opacity: 1, t: seq }], strokeId: 'G' })
const A = chunk('A', 1), B = chunk('B', 2)
const U: Operation = { id: 'U', seq: 3, type: 'operation_undo', userId: 'u', timestamp: 3, targetOpId: 'B' }
function fold(log: OperationLog, ops: Operation[]) {
  for (const op of ops) {
    log.append(op, { serverSeq: op.seq })
    if (op.type === 'operation_undo') log.applyUndo(op.targetOpId, op.userId)
    else if (op.type === 'operation_redo') log.applyRedo(op.targetOpId, op.userId)
  }
}
function actualBackfill() {
  const log = new OperationLog(), covered = vi.fn(), preload = vi.fn()
  fold(log, [B, U]) // Actual joined tail excludes snapshot-prefix A.
  const ctx = { log: () => log, checkpoints: () => ({ markCovered: covered }), preloadImages: preload } as unknown as SnapshotIOContext
  new SnapshotIO(ctx).absorbHistorical([A]) // REAL SnapshotIO, no algorithm copy.
  return { log, covered, preload }
}
it('repairs split-gesture backfill state and replay input through actual SnapshotIO', () => {
  const whole = new OperationLog(); fold(whole, [A, B, U])
  const { log, covered, preload } = actualBackfill()
  expect(whole.entries.filter(e => e.op.type === 'stroke').map(e => [e.op.id, e.state])).toEqual([['A', 'undone'], ['B', 'undone']])
  expect(log.entries.filter(e => e.op.type === 'stroke').map(e => [e.op.id, e.state])).toEqual([['A', 'undone'], ['B', 'undone']])
  expect(whole.layerPixelOps('L')).toHaveLength(0)
  expect(log.layerPixelOps('L').map(op => op.id)).toEqual([])
  expect(log.pixelOpDoneCount('L')).toBe(0)
  expect(covered).toHaveBeenCalledWith([A]); expect(preload).toHaveBeenCalledWith([A])
})
it('backfill must preserve logical whole-gesture Undo across snapshot prefix and joined tail', () => {
  const whole = new OperationLog(); fold(whole, [A, B, U])
  const { log } = actualBackfill()
  expect(log.layerPixelOps('L').map(op => op.id)).toEqual(whole.layerPixelOps('L').map(op => op.id))
})

function absorb(log: OperationLog, ops: Operation[]) {
  const ctx = { log: () => log, checkpoints: () => ({ markCovered() {} }), preloadImages() {} } as unknown as SnapshotIOContext
  const io = new SnapshotIO(ctx); io.absorbHistorical(ops); return io
}
const states = (log: OperationLog) => log.entries.filter(e => e.op.type === 'stroke').map(e => [e.op.id, e.state])
it('redo, multiple pages and repeats match whole fold without count drift', () => {
  const R: Operation = { id: 'R', seq: 4, type: 'operation_redo', userId: 'u', timestamp: 4, targetOpId: 'B' }
  const whole = new OperationLog(); fold(whole, [A, B, U, R])
  const log = new OperationLog(); fold(log, [B, R]); absorb(log, [U]); absorb(log, [A]); absorb(log, [A, U])
  expect(states(log)).toEqual(states(whole)); expect(log.pixelOpDoneCount('L')).toBe(2)
  expect(log.entries).toHaveLength(4)
})
it('same strokeId foreign user and foreign control cannot flip target gesture', () => {
  const F = { ...A, id: 'F', userId: 'foreign', seq: 0 }, X = { ...U, id: 'X', userId: 'foreign', seq: 4 }
  const log = new OperationLog(); fold(log, [B, U, X]); absorb(log, [F, A])
  expect(states(log)).toEqual([['F', 'done'], ['A', 'undone'], ['B', 'undone']])
  expect(log.pixelOpDoneCount('L')).toBe(1)
})
it('late chunk after undo branches prior prefix away, preserving pending metadata', () => {
  const beforeUndo = { ...U, targetOpId: 'A', seq: 2 }, late = { ...B, seq: 3 }
  const log = new OperationLog(); log.append(late, { pending: true }); const pendingBefore = { ...log.entries[0] }
  absorb(log, [A, beforeUndo])
  expect(states(log)).toEqual([['A', 'gone'], ['B', 'done']]); expect(log.pixelOpDoneCount('L')).toBe(1)
  const entry = log.entries.find(e => e.op.id === 'B')!
  expect(entry.pending).toBe(pendingBefore.pending); expect(entry.serverSeq).toBe(pendingBefore.serverSeq)
  expect(log.confirm('B', 3)).not.toBeNull(); expect(log.entries.find(e => e.op.id === 'B')?.serverSeq).toBe(3)
})
it('rejected control tombstone is not replayed; unrelated gone source stays gone', () => {
  const log = new OperationLog(); fold(log, [B, U]); log.applyRedo('B', 'u'); log.revoke('U')
  const other = { ...B, id: 'other', strokeId: 'otherGesture', seq: 4 }; log.append(other, { serverSeq: 4 }); log.revoke('other')
  absorb(log, [A])
  expect(states(log)).toEqual([['A', 'done'], ['B', 'done'], ['other', 'gone']])
  expect(log.entries.find(e => e.op.id === 'U')?.state).toBe('gone'); expect(log.pixelOpDoneCount('L')).toBe(2)
})

it('historical control without new chunk reconciles held gesture; revoke stays per entry', () => {
  const log = new OperationLog(); fold(log, [A, B]); absorb(log, [U])
  expect(states(log)).toEqual([['A', 'undone'], ['B', 'undone']]); expect(log.pixelOpDoneCount('L')).toBe(0)
  const other = new OperationLog(); fold(other, [A, B]); const revoke: Operation = { id: 'V', seq: 3, type: 'operation_revoke', userId: 'teacher', timestamp: 3, targetOpId: 'A' }; absorb(other, [revoke])
  expect(states(other)).toEqual([['A', 'gone'], ['B', 'done']]); expect(other.pixelOpDoneCount('L')).toBe(1)
})
it('unknown prefix undo witness cannot revive held undone state', () => {
  const log = new OperationLog(); fold(log, [B]); log.applyUndo('B', 'u') // Missing historical control in this bounded log.
  const io = absorb(log, [A])
  expect(io.historicalGestureUnresolved()).toHaveLength(1)
  expect(states(log)).toEqual([['B', 'undone']])
  expect(log.pixelOpDoneCount('L')).toBe(0)
})

it('older historical Undo is not a witness for authoritative later held undone chunk', () => {
  const later = { ...B, seq: 3 }, oldUndo = { ...U, seq: 2, targetOpId: 'A' }
  const log = new OperationLog(); fold(log, [later]); log.applyUndo('B', 'u') // Actual later control remains outside known bounded readset.
  const prior = log.entries.map(e => ({ ...e, op: { ...e.op } })), revision = log.revision
  const io = absorb(log, [A, oldUndo])
  expect(log.entries).toEqual(prior); expect(log.revision).toBe(revision)
  expect(log.entries.find(e => e.op.id === 'B')?.state).toBe('undone')
  expect(io.historicalGestureUnresolved()).toHaveLength(1)
  expect(log.pixelOpDoneCount('L')).toBe(0)
  expect(log.layerPixelOps('L')).toHaveLength(0)
})

it('uncertain page is not checkpoint-covered/preloaded or counted; retry succeeds when witness arrives', () => {
  const log = new OperationLog(); fold(log, [B]); log.applyUndo('B', 'u')
  const covered = vi.fn(), preload = vi.fn(), ctx = { log: () => log, checkpoints: () => ({ markCovered: covered }), preloadImages: preload } as unknown as SnapshotIOContext
  const io = new SnapshotIO(ctx); io.absorbHistorical([A])
  expect(covered).not.toHaveBeenCalled(); expect(preload).not.toHaveBeenCalled(); expect(log.entries).toHaveLength(1)
  io.absorbHistorical([A, U])
  expect(io.historicalGestureUnresolved()).toEqual([]); expect(states(log)).toEqual([['A', 'undone'], ['B', 'undone']]); expect(log.pixelOpDoneCount('L')).toBe(0)
  expect(covered).toHaveBeenCalledOnce(); expect(preload).toHaveBeenCalledOnce()
  io.absorbHistorical([A, U]); expect(covered).toHaveBeenCalledOnce(); expect(preload).toHaveBeenCalledOnce(); expect(log.pixelOpDoneCount('L')).toBe(0)
})

it('known later Redo cannot contradict held undone terminal state with unknown still-later Undo', () => {
  const log = new OperationLog(); fold(log, [B]); log.applyUndo('B', 'u')
  const R: Operation = { id: 'R', seq: 3, type: 'operation_redo', userId: 'u', timestamp: 3, targetOpId: 'B' }
  const prior = log.entries.map(e => ({ ...e, op: { ...e.op } })), revision = log.revision
  const io = absorb(log, [A, R])
  expect(io.historicalGestureUnresolved()).toHaveLength(1); expect(log.entries).toEqual(prior); expect(log.revision).toBe(revision)
  expect(log.layerPixelOps('L')).toEqual([]); expect(log.pixelOpDoneCount('L')).toBe(0)
})
