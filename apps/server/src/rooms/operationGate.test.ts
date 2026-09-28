import { describe, expect, it } from 'vitest'

import type { Operation } from '@grafetto/shared'

import { operationRejectReason, type GateBoard, type GateLesson } from './operationGate.js'

/** (#612) The operation gate on plain objects. The rules are covered through
 *  the room API in rooms.test.ts; what this file pins is their *order* — which
 *  gates bind the owner too and which the owner walks past — because that is
 *  the part a reordering would break silently. */

const OWNER = 'owner'
const STUDENT = 'student'

function board(patch: Partial<GateBoard> = {}): GateBoard {
  return {
    room: {},
    lockedLayerIds: new Set(), sharedLockedLayerIds: new Set(),
    aliveIds: new Set(['layer-1', 'background']), deletedIds: new Set(),
    ...patch,
  }
}

function lesson(patch: Partial<GateLesson> = {}): GateLesson {
  return {
    room: { ownerId: OWNER },
    participants: new Map([[OWNER, { role: 'owner' }], [STUDENT, { role: 'member' }]]),
    roomFrozen: false, frozenUserIds: new Set(),
    ...patch,
  }
}

const base = (userId: string) => ({ id: 'x', userId, timestamp: 0 })
const stroke = (userId: string, layerId = 'layer-1'): Operation => ({
  ...base(userId), type: 'stroke', layerId, tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
})
const del = (userId: string, layerId: string): Operation => ({ ...base(userId), type: 'layer_delete', layerIds: [layerId] })
const clear = (userId: string): Operation => ({ ...base(userId), type: 'layer_clear', layerId: 'layer-1' })
const opacity = (userId: string): Operation => ({ ...base(userId), type: 'layer_opacity', layerIds: ['layer-1'], opacity: 0.5 })
const revoke = (userId: string): Operation => ({ ...base(userId), type: 'operation_revoke', targetOpId: 'y' })

const reason = (b: GateBoard, l: GateLesson, op: Operation) => operationRejectReason(b, l, op.userId, op)

describe('owner-only operations', () => {
  it('a revoke from anyone but the owner is refused', () => {
    expect(reason(board(), lesson(), revoke(STUDENT))).toBe('not_owner')
    expect(reason(board(), lesson(), revoke(OWNER))).toBeNull()
  })
})

describe('gates that bind the owner too', () => {
  // Existence is not a privilege (#289 §8).
  it('a target that is gone', () => {
    expect(reason(board(), lesson(), del(OWNER, 'nope'))).toBe('target_gone')
  })

  // (#222) A closed lesson has stopped changing — the owner reopens it first.
  it('a closed lesson', () => {
    expect(reason(board(), lesson({ room: { ownerId: OWNER, closedAt: '2026-09-26T00:00:00Z' } }), stroke(OWNER))).toBe('room_closed')
  })

  // (#518) Not a privilege but a claim anyone may make and take back.
  it('a shared lock on the layer being painted', () => {
    const locked = board({ sharedLockedLayerIds: new Set(['layer-1']) })
    expect(reason(locked, lesson(), stroke(OWNER))).toBe('layer_locked')
  })

  it('a personal board that is someone else’s — but never the teacher', () => {
    const personal = board({ room: { boardOwnerId: 'another-student' } })
    expect(reason(personal, lesson(), stroke(STUDENT))).toBe('board_not_yours')
    expect(reason(personal, lesson(), stroke(OWNER))).toBeNull()
  })
})

describe('gates the owner walks past', () => {
  it('a frozen room and a frozen participant', () => {
    expect(reason(board(), lesson({ roomFrozen: true }), stroke(STUDENT))).toBe('room_frozen')
    expect(reason(board(), lesson({ roomFrozen: true }), stroke(OWNER))).toBeNull()
    expect(reason(board(), lesson({ frozenUserIds: new Set([STUDENT]) }), stroke(STUDENT))).toBe('participant_frozen')
  })

  it('an owner lock — including on the plural forms (#412)', () => {
    const locked = board({ lockedLayerIds: new Set(['layer-1']) })
    expect(reason(locked, lesson(), stroke(STUDENT))).toBe('layer_owner_locked')
    expect(reason(locked, lesson(), opacity(STUDENT))).toBe('layer_owner_locked')
    expect(reason(locked, lesson(), stroke(OWNER))).toBeNull()
  })
})

describe('what the shared lock does not stop', () => {
  // Emptying a layer from its own row menu is exempt (LOCK_EXEMPT_OP_TYPES).
  it('clearing the layer, and structure — a locked layer can still be deleted', () => {
    const locked = board({ sharedLockedLayerIds: new Set(['layer-1']) })
    expect(reason(locked, lesson(), clear(STUDENT))).toBeNull()
    expect(reason(locked, lesson(), del(STUDENT, 'layer-1'))).toBeNull()
  })
})

describe('content on a destroyed layer (#311)', () => {
  // Class 2 is gated on *positively destroyed*, not "not positively alive".
  it('is refused only when the layer is known to be gone', () => {
    expect(reason(board({ deletedIds: new Set(['layer-9']) }), lesson(), stroke(STUDENT, 'layer-9'))).toBe('target_gone')
    expect(reason(board(), lesson(), stroke(STUDENT, 'layer-new'))).toBeNull()
  })
})
