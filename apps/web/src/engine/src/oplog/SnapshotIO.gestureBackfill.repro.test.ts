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
  }
}
function actualBackfill() {
  const log = new OperationLog(), covered = vi.fn(), preload = vi.fn()
  fold(log, [B, U]) // Actual joined tail excludes snapshot-prefix A.
  const ctx = { log: () => log, checkpoints: () => ({ markCovered: covered }), preloadImages: preload } as unknown as SnapshotIOContext
  new SnapshotIO(ctx).absorbHistorical([A]) // REAL SnapshotIO, no algorithm copy.
  return { log, covered, preload }
}
it('reproduces current split-gesture backfill state and replay input mismatch through actual SnapshotIO', () => {
  const whole = new OperationLog(); fold(whole, [A, B, U])
  const { log, covered, preload } = actualBackfill()
  expect(whole.entries.filter(e => e.op.type === 'stroke').map(e => [e.op.id, e.state])).toEqual([['A', 'undone'], ['B', 'undone']])
  expect(log.entries.filter(e => e.op.type === 'stroke').map(e => [e.op.id, e.state])).toEqual([['A', 'done'], ['B', 'undone']])
  expect(whole.layerPixelOps('L')).toHaveLength(0)
  expect(log.layerPixelOps('L').map(op => op.id)).toEqual(['A'])
  expect(log.pixelOpDoneCount('L')).toBe(1)
  expect(covered).toHaveBeenCalledWith([A]); expect(preload).toHaveBeenCalledWith([A])
})
it.fails('backfill must preserve logical whole-gesture Undo across snapshot prefix and joined tail (known defect)', () => {
  const whole = new OperationLog(); fold(whole, [A, B, U])
  const { log } = actualBackfill()
  expect(log.layerPixelOps('L').map(op => op.id)).toEqual(whole.layerPixelOps('L').map(op => op.id))
})
