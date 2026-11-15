import { expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { OperationLog } from './OperationLog'
import { makeStroke, dab } from '../../testing/engineTestUtils'

const stroke = (id: string, userId = 'A', strokeId = id) => makeStroke(userId, 'L', [dab(8, 8, { size: 8 })], { id, strokeId, timestamp: 100 })
const control = (id: string, type: 'operation_undo' | 'operation_redo' | 'operation_revoke', targetOpId: string): Operation => ({ id, type, userId: 'A', targetOpId, timestamp: 101 })

it.each(['operation_undo', 'operation_revoke'] as const)('a rejected %s remains inert in every historical cut', type => {
  const log = new OperationLog(), a = stroke('a'), change = control('rejected', type, a.id)
  log.append(a, { serverSeq: 1 }); log.append(change, { pending: true })
  if (type === 'operation_undo') log.applyUndo(a.id, 'A'); else log.revoke(a.id)
  expect(log.rejectPending(change.id)?.id).toBe(change.id)
  expect(log.rejectPending(change.id)).toBeNull()
  for (const cut of [1, 2, 3, 100]) {
    const prefix = log.historicalPrefix(cut)
    expect(prefix.layerPixelOps('L').map(op => op.id)).toEqual(['a'])
    expect(prefix.pixelOpDoneCount('L')).toBe(1)
  }
  expect(log.entries.find(e => e.op.id === change.id)).toMatchObject({ state: 'gone', goneReason: 'reject' })
})

it('an accepted revoke remains irreversible after unrelated history arrives', () => {
  const log = new OperationLog(), a = stroke('a'), change = control('accepted-revoke', 'operation_revoke', a.id)
  log.append(a, { serverSeq: 2 }); log.append(change, { serverSeq: 3 }); log.revoke(a.id)
  log.absorbHistorical([stroke('older', 'B')].map(op => ({ ...op, seq: 1 })))
  expect(log.entries.find(e => e.op.id === a.id)).toMatchObject({ state: 'gone', goneReason: 'revoke' })
  expect(log.redo('A')).toBeNull()
  expect(log.historicalPrefix(100).layerPixelOps('L').map(op => op.id)).toEqual(['older'])
})

it('rejecting only one chunk preserves every other accepted identity', () => {
  const log = new OperationLog()
  const first = stroke('first', 'A', 'G'), middle = stroke('middle', 'A', 'G'), last = stroke('last', 'A', 'G')
  log.append(first, { serverSeq: 2 }); log.append(middle, { pending: true }); log.append(last, { pending: true })
  log.confirm(last.id, 3)
  log.rejectPending(middle.id)
  log.absorbHistorical([{ ...stroke('older', 'B'), seq: 1 }])
  expect(log.layerPixelOps('L').map(op => op.id)).toEqual(['older', 'first', 'last'])
  expect(new Set(log.entries.map(e => e.op.id)).size).toBe(4)
  expect(log.historicalPrefix(100).layerPixelOps('L').map(op => op.id)).toEqual(['older', 'first', 'last'])
})

it.each(['history', 'ack'] as const)('authoritative %s of the same ID overrides local rejection', source => {
  const log = new OperationLog(), a = stroke('a'), change = control('undo', 'operation_undo', a.id)
  log.append(a, { serverSeq: 1 }); log.append(change, { pending: true }); log.applyUndo(a.id, 'A')
  log.rejectPending(change.id)
  expect(log.layerPixelOps('L')).toHaveLength(1)
  if (source === 'history') log.absorbHistorical([{ ...change, seq: 2 }]); else log.confirm(change.id, 2)
  expect(log.layerPixelOps('L')).toHaveLength(0)
  expect(log.entries.find(e => e.op.id === change.id)).toMatchObject({ serverSeq: 2 })
  expect(log.entries.find(e => e.op.id === change.id)?.pending).not.toBe(true)
  expect(log.isPending(change.id)).toBe(false)
  expect(log.entries.find(e => e.op.id === change.id)?.goneReason).not.toBe('reject')
})

it('history refolding never coalesces additional accepted slider IDs', () => {
  const log = new OperationLog()
  const a: Operation = { id: 'slider-a', type: 'layer_opacity', userId: 'A', timestamp: 1, layerId: 'L', opacity: 0.4, seq: 1 }
  const b: Operation = { ...a, id: 'slider-b', timestamp: 2, opacity: 0.7, seq: 2 }
  log.absorbHistorical([a, b])
  expect(log.entries.map(e => e.op.id)).toEqual(['slider-a', 'slider-b'])
  expect(log.historicalPrefix(100).entries.map(e => e.op.id)).toEqual(['slider-a', 'slider-b'])
})

// Independent oracle: a refused event never entered the accepted journal.
// Compare late local repair against replaying only accepted events from scratch.
it.each([7, 19, 41, 73, 101, 809])('rejection order converges to accepted-only history (seed %i)', seed => {
  let randomState = seed
  const random = () => (randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 2 ** 32
  const actual = new OperationLog()
  const events: Operation[] = []
  const refused: string[] = []
  const apply = (log: OperationLog, op: Operation, pending: boolean) => {
    log.append(op, pending ? { pending: true } : { serverSeq: events.indexOf(op) + 1 }, false)
    if (op.type === 'operation_undo') log.applyUndo(op.targetOpId, op.userId)
    else if (op.type === 'operation_redo') log.applyRedo(op.targetOpId, op.userId)
    else if (op.type === 'operation_revoke') log.revoke(op.targetOpId)
  }
  for (let i = 0; i < 100; i++) {
    const author = random() < 0.75 ? 'A' : 'B'
    const target = random() < 0.5 ? actual.undoTarget(author) : actual.redoTarget(author)
    const type = target && random() < 0.65
      ? (actual.entries.find(e => e.op.id === target.id)?.state === 'undone' ? 'operation_redo' : 'operation_undo')
      : 'stroke'
    const op = type === 'stroke' ? stroke(`s-${i}`, author)
      : { ...control(`c-${i}`, type, target!.id), userId: author }
    events.push(op)
    apply(actual, op, true)
    if (random() < 0.3) refused.push(op.id)
  }
  // Refusals arrive independently of the order in which actions were made.
  for (let i = refused.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[refused[i], refused[j]] = [refused[j], refused[i]]
  }
  for (const id of refused) actual.rejectPending(id)
  const expected = new OperationLog()
  for (const op of events) if (!refused.includes(op.id)) apply(expected, op, false)
  const states = (log: OperationLog) => log.entries.filter(e => !refused.includes(e.op.id))
    .map(e => [e.op.id, e.state, e.goneReason])
  expect(states(actual)).toEqual(states(expected))
  for (const cut of [10, 30, 60, 100]) {
    const prefixExpected = new OperationLog()
    for (const op of events.slice(0, cut)) if (!refused.includes(op.id)) apply(prefixExpected, op, false)
    expect(states(actual.historicalPrefix(cut))).toEqual(states(prefixExpected))
  }
  expect(actual.pixelOpDoneCount('L')).toBe(expected.pixelOpDoneCount('L'))
  expect(actual.layerPixelOps('L').map(op => op.id)).toEqual(expected.layerPixelOps('L').map(op => op.id))
})
