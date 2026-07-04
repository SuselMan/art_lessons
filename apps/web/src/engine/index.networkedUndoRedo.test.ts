// Engine-level tests for #103: undo/redo must be visible to every
// participant, not just the author. Before this change, PencilEngine#undo()/
// redo() mutated the local OperationLog directly and never fired
// onLocalOperation, so nothing was ever broadcast — a real cross-client
// desync (Room's networking code is otherwise fully generic and needed zero
// changes for this: undo/redo just became another Operation flowing through
// the exact same appendOperation()/onLocalOperation/appendOperation(op,
// 'remote') pipes as everything else).
//
// These tests simulate two participants with two independent PencilEngine
// instances sharing nothing but the operation stream (exactly how Room.tsx's
// applyRemoteOp/onLocalOperation bridge a real client to the socket): one
// engine is "the author" (calls undo()/redo() for real), the other is "a
// peer" that only ever receives whatever the author's engine broadcasts via
// onLocalOperation, applied through appendOperation(op, 'remote') — the same
// call Room.tsx's applyRemoteOp makes for a real peer_operation.
import { describe, expect, it } from 'vitest'

import type { Operation } from '@art-lessons/shared'

import {
  createTestEngine, dab, fillStroke, hasLayerBuffer, makeLayerAdd, makeLayerDelete,
  makeStroke, readLayerPixels,
} from './testing/engineTestUtils'

/** Wires up an "author" engine whose every locally-originated operation
 *  (including, after #103, undo()/redo()'s own operation_undo/operation_redo
 *  wrapper) is captured — standing in for Room.tsx's
 *  onLocalOperation -> socket.emit('operation', op). */
function createAuthorEngine(userId: string, size: { width: number; height: number }) {
  const broadcast: Operation[] = []
  const { engine } = createTestEngine({ userId, onLocalOperation: op => broadcast.push(op) }, size)
  return { engine, broadcast }
}

/** Applies every operation broadcast so far (that this peer hasn't already
 *  seen) to a peer engine — standing in for Room.tsx's applyRemoteOp, minus
 *  the id-dedupe guard (not needed here: each op is only ever fed once). */
function relayTo(peer: ReturnType<typeof createTestEngine>['engine'], broadcast: Operation[], fromIndex: number): number {
  for (let i = fromIndex; i < broadcast.length; i++) peer.appendOperation(broadcast[i], 'remote')
  return broadcast.length
}

describe('#103: undo is broadcast and a peer converges to the same pixel state', () => {
  it('a stroke undo/redo on the author engine reaches a peer engine that only ever applies broadcast ops', () => {
    const size = { width: 8, height: 8 }
    const { engine: author, broadcast } = createAuthorEngine('student-1', size)
    const { engine: peer } = createTestEngine({ userId: 'student-1' }, size)
    let relayed = 0

    author.appendOperation(makeLayerAdd('student-1', 'L'))
    author.appendOperation(fillStroke('student-1', 'L', 4, 4, 3))
    relayed = relayTo(peer, broadcast, relayed)
    const painted = readLayerPixels(author, 'L')!
    expect(painted.some(v => v > 0)).toBe(true)
    expect(readLayerPixels(peer, 'L')).toEqual(painted)

    // The author undoes their stroke. Before #103 this would only ever
    // change `author`'s own buffer — the whole point of this test is that
    // it must also change `peer`'s.
    expect(author.undo()?.type).toBe('stroke')
    relayed = relayTo(peer, broadcast, relayed)
    expect(readLayerPixels(author, 'L')!.every(v => v === 0)).toBe(true)
    expect(readLayerPixels(peer, 'L')!.every(v => v === 0)).toBe(true) // <- would fail pre-#103

    // Symmetric check for redo.
    expect(author.redo()?.type).toBe('stroke')
    relayed = relayTo(peer, broadcast, relayed)
    expect(readLayerPixels(author, 'L')).toEqual(painted)
    expect(readLayerPixels(peer, 'L')).toEqual(painted)
    void relayed
  })

  it('a structural undo (layer_delete) reaches a peer: buffer lifecycle converges, not just the author\'s', () => {
    const size = { width: 8, height: 8 }
    const { engine: author, broadcast } = createAuthorEngine('student-1', size)
    const { engine: peer } = createTestEngine({ userId: 'student-1' }, size)
    let relayed = 0

    author.appendOperation(makeLayerAdd('student-1', 'L'))
    author.appendOperation(fillStroke('student-1', 'L', 4, 4, 3))
    const painted = readLayerPixels(author, 'L')!
    author.appendOperation(makeLayerDelete('student-1', ['L']))
    relayed = relayTo(peer, broadcast, relayed)
    expect(hasLayerBuffer(author, 'L')).toBe(false)
    expect(hasLayerBuffer(peer, 'L')).toBe(false)

    expect(author.undo()?.type).toBe('layer_delete')
    relayed = relayTo(peer, broadcast, relayed)
    // Peer's buffer must come back too, with the real content — not just
    // the author's local view of it.
    expect(hasLayerBuffer(peer, 'L')).toBe(true)
    expect(readLayerPixels(peer, 'L')).toEqual(painted)
    expect(readLayerPixels(author, 'L')).toEqual(painted)

    expect(author.redo()?.type).toBe('layer_delete')
    relayed = relayTo(peer, broadcast, relayed)
    expect(hasLayerBuffer(author, 'L')).toBe(false)
    expect(hasLayerBuffer(peer, 'L')).toBe(false)
    void relayed
  })

  it('multi-step redo does not wipe its own remaining redo stack (regression: append() side effect)', () => {
    // Reproduces the bug this feature introduced and then fixed: broadcasting
    // undo/redo as logged operations means they flow through
    // OperationLog.append(), whose "author's undone entries become gone"
    // rule must not treat an operation_redo as "the user did something new"
    // — otherwise the very first redo() call wipes every other undone entry
    // for that user (including the one it just redid, and everything still
    // waiting to be redone after it).
    const size = { width: 8, height: 8 }
    const { engine } = createTestEngine({ userId: 'student-1' }, size)
    engine.appendOperation(makeLayerAdd('student-1', 'L'))

    const strokes = Array.from({ length: 5 }, (_, i) =>
      makeStroke('student-1', 'L', [dab(1 + i, 1, { size: 2, opacity: 1 })]))
    for (const s of strokes) engine.appendOperation(s)

    for (let i = 0; i < 5; i++) expect(engine.undo()?.type).toBe('stroke')
    for (let i = 0; i < 5; i++) expect(engine.redo()?.type).toBe('stroke') // used to fail after the 1st iteration

    expect(engine.getOperations().filter(op => op.type === 'stroke')).toHaveLength(5)
  })

  it('a peer cannot forge an undo of another user\'s operation (OperationLog.applyUndo\'s author guard)', () => {
    const size = { width: 8, height: 8 }
    const { engine } = createTestEngine({ userId: 'teacher' }, size)
    engine.appendOperation(makeLayerAdd('student-1', 'L'))
    const stroke = fillStroke('student-1', 'L', 4, 4, 3)
    engine.appendOperation(stroke)
    const painted = readLayerPixels(engine, 'L')!

    // A forged operation_undo claiming to be from a different user than the
    // one who actually authored the target stroke.
    engine.appendOperation({
      id: 'forged-undo', type: 'operation_undo', userId: 'teacher', timestamp: 0, targetOpId: stroke.id,
    })
    // Must have no effect: the stroke is still authored by student-1, not teacher.
    expect(readLayerPixels(engine, 'L')).toEqual(painted)
    expect(engine.getOperations().some(op => op.id === stroke.id)).toBe(true)
  })
})
