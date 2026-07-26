import { afterEach, describe, expect, it } from 'vitest'

import type {
  LayerAddOperation, LayerDeleteOperation, LayerMergeOperation, LayerOwnerLockOperation, LayerTransformOperation,
  LayerVisibilityOperation, Operation, StrokeOperation,
} from '@art-lessons/shared'
import { INITIAL_LAYER_ID } from '@art-lessons/shared'

import {
  _flushPendingWrites, createRoom, findDuplicateOperation, getOperationRejectReason,
  getParticipant, getRoomSnapshot, isLayerOwnerLocked, isOperationAllowed, isRoomFrozen, joinRoom, leaveRoom,
  recordOperation, releaseRoomIfUnused, setLayerOwnerLocked, setParticipantFrozen, setRoomFrozen, updateAliveIds,
} from './rooms.js'

// Each test uses its own roomId — `rooms` is module-level shared state with no
// reset hook, so isolation comes from never reusing a room id across tests.
let nextRoomId = 0
const createdRoomIds: string[] = []
function freshRoomId(): string {
  const id = `room-${nextRoomId++}`
  createdRoomIds.push(id)
  return id
}

// createRoom/recordOperation/etc. all fire off a Postgres write that's bound
// to reject in this test environment (no real DB) — enqueueWrite catches
// that internally, but the rejection is still async, and if it settles after
// a test (or the whole file) has already torn down, vitest reports it as an
// unhandled error and the run exits non-zero despite every test having
// passed. Draining every room created this test before moving on keeps that
// settling inside the test it belongs to.
afterEach(async () => {
  await Promise.all(createdRoomIds.splice(0).map(_flushPendingWrites))
})

function roomDraft(id: string) {
  return { id, name: 'Still life', paper: 'coarse-streak' as const, infinite: false, canvasWidth: 1240, canvasHeight: 1754 }
}

function stroke(overrides: Partial<StrokeOperation> = {}): StrokeOperation {
  return {
    id: overrides.id ?? 'op-1',
    type: 'stroke',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-1',
    tool: overrides.tool ?? 'pencil',
    preset: overrides.preset ?? 'HB',
    color: overrides.color ?? [0.14, 0.14, 0.17],
    dabs: overrides.dabs ?? [],
    ...overrides,
  }
}

function layerOwnerLock(overrides: Partial<LayerOwnerLockOperation> = {}): LayerOwnerLockOperation {
  return {
    id: overrides.id ?? 'op-lock-1',
    type: 'layer_owner_lock',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-1',
    locked: overrides.locked ?? true,
    ...overrides,
  }
}

function layerVisibility(overrides: Partial<LayerVisibilityOperation> = {}): LayerVisibilityOperation {
  return {
    id: overrides.id ?? 'op-vis-1',
    type: 'layer_visibility',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-1',
    visible: overrides.visible ?? false,
    ...overrides,
  }
}

function layerAdd(overrides: Partial<LayerAddOperation> = {}): LayerAddOperation {
  return {
    id: overrides.id ?? 'op-add-1',
    type: 'layer_add',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-1',
    name: overrides.name ?? 'Layer',
    ...overrides,
  }
}

function layerDelete(overrides: Partial<LayerDeleteOperation> = {}): LayerDeleteOperation {
  return {
    id: overrides.id ?? 'op-del-1',
    type: 'layer_delete',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerIds: overrides.layerIds ?? ['layer-1'],
    ...overrides,
  }
}

function layerMerge(overrides: Partial<LayerMergeOperation> = {}): LayerMergeOperation {
  return {
    id: overrides.id ?? 'op-merge-1',
    type: 'layer_merge',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-merged',
    name: overrides.name ?? 'Merged',
    sources: overrides.sources ?? [{ id: 'layer-1', opacity: 1 }, { id: 'layer-2', opacity: 1 }],
    parentId: overrides.parentId ?? null,
    index: overrides.index ?? 0,
    ...overrides,
  }
}

function layerTransform(overrides: Partial<LayerTransformOperation> = {}): LayerTransformOperation {
  return {
    id: overrides.id ?? 'op-transform-1',
    type: 'layer_transform',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    transforms: overrides.transforms ?? [{ layerId: 'layer-1', matrix: [1, 0, 0, 1, 0, 0] }],
    ...overrides,
  }
}

// Deterministic per-userId socket id for tests that don't care about the
// exact value, just that join/leave agree on it — matches the shape a real
// socket.io `socket.id` has (an opaque string), just readable here. `suffix`
// distinguishes two overlapping sockets for the same userId (a page
// refresh, a reconnect) in the #164 tests below.
function sock(userId: string, suffix = ''): string {
  return `sock-${userId}${suffix}`
}

describe('createRoom', () => {
  it('seats the creator as owner and fixes ownerId', () => {
    const roomId = freshRoomId()
    const { room, participant } = createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(room.ownerId).toBe('owner-1')
    expect(room.id).toBe(roomId)
    expect(participant.role).toBe('owner')
    expect(participant.userId).toBe('owner-1')
  })

  it('calling it again for the same id+owner rejoins without wiping content (#116 reload bug)', () => {
    // Browsers keep history.state across a same-entry reload, so the
    // creator's own client-side "isCreator" state survives a page refresh
    // too and re-emits create_room for the same id instead of join_room —
    // this used to unconditionally overwrite the room, discarding whatever
    // had already been drawn.
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    recordOperation(roomId, stroke({ id: 'a' }))

    const second = createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(second.participant.role).toBe('owner')
    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['a'])
  })

  it('a different owner claiming the same id still overwrites (real collision, unchanged behavior)', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    recordOperation(roomId, stroke({ id: 'a' }))

    const second = createRoom(roomDraft(roomId), undefined, 'owner-2', 'Teacher', sock('owner-2'))

    expect(second.room.ownerId).toBe('owner-2')
    expect(getRoomSnapshot(roomId)?.tailOperations).toEqual([])
  })

  it('derives hasPassword from whether a password was given', () => {
    const openId = freshRoomId()
    const protectedId = freshRoomId()
    const open = createRoom(roomDraft(openId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const guarded = createRoom(roomDraft(protectedId), 'secret', 'owner-2', 'Teacher', sock('owner-2'))

    expect(open.room.hasPassword).toBe(false)
    expect(guarded.room.hasPassword).toBe(true)
  })

  it("ownerId does not shift when other participants join afterward", () => {
    const roomId = freshRoomId()
    const { room } = createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    joinRoom(roomId, 'student-2', 'Bob', undefined, sock('student-2'))

    expect(getRoomSnapshot(roomId)?.room.ownerId).toBe('owner-1')
    expect(room.ownerId).toBe('owner-1')
  })
})

describe('joinRoom', () => {
  it('fails with not_found when the room was never created', () => {
    const result = joinRoom(freshRoomId(), 'u1', 'Alice', undefined, sock('u1'))
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('fails with wrong_password when the room requires one and it does not match', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), 'secret', 'owner-1', 'Teacher', sock('owner-1'))

    expect(joinRoom(roomId, 'u1', 'Alice', 'nope', sock('u1'))).toEqual({ ok: false, error: 'wrong_password' })
    expect(joinRoom(roomId, 'u1', 'Alice', undefined, sock('u1'))).toEqual({ ok: false, error: 'wrong_password' })
  })

  it('succeeds when the password matches', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), 'secret', 'owner-1', 'Teacher', sock('owner-1'))

    const result = joinRoom(roomId, 'u1', 'Alice', 'secret', sock('u1'))
    expect(result).toEqual({ ok: true, participant: expect.objectContaining({ userId: 'u1', role: 'member' }) })
  })

  it('never assigns owner to a non-owner, regardless of join order', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const first = joinRoom(roomId, 'u1', 'Alice', undefined, sock('u1'))
    const second = joinRoom(roomId, 'u2', 'Bob', undefined, sock('u2'))

    expect(first.ok && first.participant.role).toBe('member')
    expect(second.ok && second.participant.role).toBe('member')
  })

  it("assigns owner when the room's owner rejoins via join_room (#41 identity fix)", () => {
    // The client always goes through join_room, never create_room again, for
    // a returning owner (reconnect after a drop, or just reopening the link
    // later) — see rooms.ts createRoom's doc comment. Before identity was
    // stable, this always fell through to `member`.
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const rejoin = joinRoom(roomId, 'owner-1', 'Teacher', undefined, sock('owner-1', '-2'))

    expect(rejoin.ok && rejoin.participant.role).toBe('owner')
  })

  it('assigns distinct cursor colors by join order, cycling if needed', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const joiners = Array.from({ length: 8 }, (_, i) => joinRoom(roomId, `u${i}`, `User ${i}`, undefined, sock(`u${i}`)))
    const colors = joiners.map(r => r.ok && r.participant.color)
    // Owner took the first color at creation; 8 members plus the owner cycle
    // through the 8-color palette, so the 8th joiner (index 7) should repeat
    // the owner's color.
    expect(colors[7]).toBe(getParticipant(roomId, 'owner-1')?.color)
  })
})

describe('getRoomSnapshot', () => {
  it('reflects room metadata and current participants, as defensive copies', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'u1', 'Alice', undefined, sock('u1'))

    const snapshot = getRoomSnapshot(roomId)
    expect(snapshot?.room.id).toBe(roomId)
    expect(snapshot?.participants).toHaveLength(2)

    snapshot?.participants.push({ userId: 'ghost', name: 'x', role: 'member', color: '#000', frozen: false })
    expect(getRoomSnapshot(roomId)?.participants).toHaveLength(2) // mutation didn't leak back
  })

  it('returns undefined for an unregistered room', () => {
    expect(getRoomSnapshot('never-created')).toBeUndefined()
  })

  // #149/#166: no RoomSnapshot storage exists yet, so latestSnapshotSeq is
  // always null and lastKnownSeq is the only thing trimming tailOperations —
  // this is the reconnect-cost fix, already live ahead of the rest of the
  // #149 epic.
  it('is null and returns the full history when lastKnownSeq is omitted', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    recordOperation(roomId, stroke({ id: 'a' }))
    recordOperation(roomId, stroke({ id: 'b' }))

    const snapshot = getRoomSnapshot(roomId)
    expect(snapshot?.latestSnapshotSeq).toBeNull()
    expect(snapshot?.tailOperations.map(o => o.id)).toEqual(['a', 'b'])
  })

  it('trims tailOperations to only what is after lastKnownSeq', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const a = recordOperation(roomId, stroke({ id: 'a' }))
    recordOperation(roomId, stroke({ id: 'b' }))
    recordOperation(roomId, stroke({ id: 'c' }))

    const snapshot = getRoomSnapshot(roomId, a.seq)
    expect(snapshot?.tailOperations.map(o => o.id)).toEqual(['b', 'c'])
  })

  it('returns nothing when lastKnownSeq is already caught up to the latest operation', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const a = recordOperation(roomId, stroke({ id: 'a' }))

    expect(getRoomSnapshot(roomId, a.seq)?.tailOperations).toEqual([])
  })
})

describe('leaveRoom', () => {
  it('removes the participant; the room (including its metadata) is dropped once empty', async () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    expect(leaveRoom(roomId, 'owner-1', sock('owner-1'))).toBe(true)
    expect(getParticipant(roomId, 'owner-1')).toBeUndefined()

    // Eviction is deferred until this room's pending Postgres writes settle
    // (so a fast reconnect right after leaving finds it still live) — see
    // leaveRoom's doc comment. _flushPendingWrites waits for that same point
    // without needing a real database.
    await _flushPendingWrites(roomId)
    expect(getRoomSnapshot(roomId)).toBeUndefined()

    // Room is gone entirely — a plain join_room can no longer find it.
    expect(joinRoom(roomId, 'u1', 'Alice', undefined, sock('u1'))).toEqual({ ok: false, error: 'not_found' })
  })

  it('a reconnect during the deferred-eviction window keeps the room (and its operations) live, not reloaded', async () => {
    // This is the exact bug this deferral fixes: create, draw, and leave (page
    // refresh) all happen faster than Postgres can be expected to durably
    // have the stroke — without deferred eviction, the reconnect below would
    // fall through to ensureRoomLoaded's cold Postgres read and could come
    // back missing the operation despite it never really being lost.
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    recordOperation(roomId, stroke({ id: 'a' }))
    leaveRoom(roomId, 'owner-1', sock('owner-1')) // eviction deferred, not immediate — no await yet
    const rejoin = joinRoom(roomId, 'owner-1', 'Teacher', undefined, sock('owner-1', '-2'))

    expect(rejoin).toEqual({ ok: true, participant: expect.objectContaining({ role: 'owner' }) })
    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['a'])
  })

  it('is a no-op on an unknown room or participant', () => {
    expect(() => leaveRoom('never-created', 'nobody', 'sock-x')).not.toThrow()
    expect(leaveRoom('never-created', 'nobody', 'sock-x')).toBe(false)
  })

  // #164: the actual bug — a stale/superseded socket's belated disconnect
  // must not evict a participant (or the room) a *newer* socket for the
  // same user has already re-joined through. This is what let a live
  // socket's next recordOperation throw on a room no longer in the Map,
  // crashing the whole process (an uncaught exception in a socket.io
  // handler with no try/catch — see socketHandlers.ts's own #164 comment).
  describe('#164: stale/superseded socket disconnect', () => {
    it('a stale disconnect (old socket, after a newer one already joined) is a no-op — participant stays, room stays live', () => {
      const roomId = freshRoomId()
      createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1', '-old'))
      // Page refresh: a new socket joins for the same room+userId before the
      // old tab's connection has actually dropped.
      joinRoom(roomId, 'owner-1', 'Teacher', undefined, sock('owner-1', '-new'))

      // The OLD socket's disconnect arrives late.
      const actuallyLeft = leaveRoom(roomId, 'owner-1', sock('owner-1', '-old'))

      expect(actuallyLeft).toBe(false)
      expect(getParticipant(roomId, 'owner-1')).toBeDefined()
      expect(getRoomSnapshot(roomId)).toBeDefined()
      // The live (new) socket can still record operations — this is the
      // exact call that used to throw once the room had been wrongly
      // evicted by the stale disconnect.
      expect(() => recordOperation(roomId, stroke({ id: 'a' }))).not.toThrow()
    })

    it("the newer socket's own eventual disconnect still removes the participant normally", () => {
      const roomId = freshRoomId()
      createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1', '-old'))
      joinRoom(roomId, 'owner-1', 'Teacher', undefined, sock('owner-1', '-new'))
      leaveRoom(roomId, 'owner-1', sock('owner-1', '-old')) // stale, ignored

      const actuallyLeft = leaveRoom(roomId, 'owner-1', sock('owner-1', '-new'))

      expect(actuallyLeft).toBe(true)
      expect(getParticipant(roomId, 'owner-1')).toBeUndefined()
    })

    it('a stale disconnect for one participant does not affect a different, still-present participant', () => {
      const roomId = freshRoomId()
      createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
      joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1', '-old'))
      joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1', '-new'))

      leaveRoom(roomId, 'student-1', sock('student-1', '-old')) // stale

      expect(getParticipant(roomId, 'owner-1')).toBeDefined()
      expect(getParticipant(roomId, 'student-1')).toBeDefined()
    })
  })
})

describe('recordOperation', () => {
  it('stamps increasing seq numbers and preserves order', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const a = recordOperation(roomId, stroke({ id: 'a' }))
    const b = recordOperation(roomId, stroke({ id: 'b' }))

    expect(a.seq).toBe(1)
    expect(b.seq).toBe(2)
    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['a', 'b'])
  })

  it('returns a stamped copy without mutating the input', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const input = stroke({ id: 'a' })
    const stamped = recordOperation(roomId, input)

    expect(input.seq).toBeUndefined()
    expect(stamped.seq).toBe(1)
  })

  it('throws for a room that was never created', () => {
    expect(() => recordOperation(freshRoomId(), stroke())).toThrow()
  })
})

// (#292) getOperationsBefore's tests moved to roomSnapshots.test.ts. It used
// to read `record.operations`, which made it testable in this file's
// all-in-memory style; it now queries Postgres (the resident set is a window
// around the latest snapshot, and this endpoint serves exactly what that
// window excludes), so it belongs with the other DB-awaiting functions,
// where prisma is mocked.

// #254/#256: room-wide freeze — a plain in-memory flag, never persisted.
describe('setRoomFrozen / isRoomFrozen', () => {
  it('freezes and unfreezes the whole room', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(isRoomFrozen(roomId)).toBe(false)
    expect(setRoomFrozen(roomId, true)).toBe(true)
    expect(isRoomFrozen(roomId)).toBe(true)
    expect(setRoomFrozen(roomId, false)).toBe(true)
    expect(isRoomFrozen(roomId)).toBe(false)
  })

  it('is a no-op (returns false) for an unknown room', () => {
    expect(setRoomFrozen('never-created', true)).toBe(false)
    expect(isRoomFrozen('never-created')).toBe(false)
  })
})

// #254/#257: point freeze — independent of setRoomFrozen, and must survive a
// reconnect (frozenUserIds, not the live Participant record itself — see
// rooms.ts's own doc comment on why).
describe('setParticipantFrozen', () => {
  it('freezes a member and is reflected on their Participant record', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))

    const updated = setParticipantFrozen(roomId, 'student-1', true)
    expect(updated?.frozen).toBe(true)
    expect(getParticipant(roomId, 'student-1')?.frozen).toBe(true)
  })

  it('unfreezes a previously frozen member', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    setParticipantFrozen(roomId, 'student-1', true)

    const updated = setParticipantFrozen(roomId, 'student-1', false)
    expect(updated?.frozen).toBe(false)
    expect(getParticipant(roomId, 'student-1')?.frozen).toBe(false)
  })

  it('never freezes the room owner — no-op', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(setParticipantFrozen(roomId, 'owner-1', true)).toBeUndefined()
    expect(getParticipant(roomId, 'owner-1')?.frozen).toBe(false)
  })

  it('leaves other participants unaffected', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    joinRoom(roomId, 'student-2', 'Bob', undefined, sock('student-2'))

    setParticipantFrozen(roomId, 'student-1', true)

    expect(getParticipant(roomId, 'student-1')?.frozen).toBe(true)
    expect(getParticipant(roomId, 'student-2')?.frozen).toBe(false)
    expect(getParticipant(roomId, 'owner-1')?.frozen).toBe(false)
  })

  it('returns undefined for an unknown room or participant', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(setParticipantFrozen('never-created', 'owner-1', true)).toBeUndefined()
    expect(setParticipantFrozen(roomId, 'ghost', true)).toBeUndefined()
  })

  it('survives a disconnect/reconnect (join_room) — the whole point of keying it by userId, not the live Participant record', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1', '-old'))
    setParticipantFrozen(roomId, 'student-1', true)

    // Reconnect: a brand-new socket, brand-new join_room call — a naive
    // "frozen lives on the Participant object" design would silently reset
    // this to false right here.
    const rejoin = joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1', '-new'))

    expect(rejoin.ok && rejoin.participant.frozen).toBe(true)
    expect(getParticipant(roomId, 'student-1')?.frozen).toBe(true)
  })
})

// #254/#258: owner-lock tracking — mirrors just the set of locked layer ids,
// updated by socketHandlers.ts right before recording an accepted
// layer_owner_lock operation.
describe('setLayerOwnerLocked / isLayerOwnerLocked', () => {
  it('locks and unlocks a layer', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(isLayerOwnerLocked(roomId, 'layer-1')).toBe(false)
    setLayerOwnerLocked(roomId, 'layer-1', true)
    expect(isLayerOwnerLocked(roomId, 'layer-1')).toBe(true)
    setLayerOwnerLocked(roomId, 'layer-1', false)
    expect(isLayerOwnerLocked(roomId, 'layer-1')).toBe(false)
  })

  it('only affects the targeted layer id', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    setLayerOwnerLocked(roomId, 'layer-1', true)
    expect(isLayerOwnerLocked(roomId, 'layer-2')).toBe(false)
  })

  it('is a no-op for an unknown room', () => {
    expect(() => setLayerOwnerLocked('never-created', 'layer-1', true)).not.toThrow()
    expect(isLayerOwnerLocked('never-created', 'layer-1')).toBe(false)
  })
})

// #254 epic: the single choke point socketHandlers.ts's 'operation' handler
// delegates to for every owner-only runtime privilege check.
describe('isOperationAllowed', () => {
  it('allows a plain operation from an unfrozen, unlocked member', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))

    expect(isOperationAllowed(roomId, 'student-1', stroke({ userId: 'student-1' }))).toBe(true)
  })

  it('always allows the owner\'s own operations, frozen room/self/locked layer notwithstanding', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    setRoomFrozen(roomId, true)
    setLayerOwnerLocked(roomId, 'layer-1', true)

    expect(isOperationAllowed(roomId, 'owner-1', stroke({ userId: 'owner-1' }))).toBe(true)
  })

  it('rejects operation_revoke from a non-owner', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))

    const revoke: Operation = { id: 'r1', type: 'operation_revoke', userId: 'student-1', timestamp: 0, targetOpId: 'x' }
    expect(isOperationAllowed(roomId, 'student-1', revoke)).toBe(false)
  })

  it('allows operation_revoke from the owner', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    const revoke: Operation = { id: 'r1', type: 'operation_revoke', userId: 'owner-1', timestamp: 0, targetOpId: 'x' }
    expect(isOperationAllowed(roomId, 'owner-1', revoke)).toBe(true)
  })

  it('rejects layer_owner_lock from a non-owner', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))

    expect(isOperationAllowed(roomId, 'student-1', layerOwnerLock({ userId: 'student-1' }))).toBe(false)
  })

  it('allows layer_owner_lock from the owner', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(isOperationAllowed(roomId, 'owner-1', layerOwnerLock({ userId: 'owner-1' }))).toBe(true)
  })

  it('rejects every operation type from a non-owner while the room is frozen', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    setRoomFrozen(roomId, true)

    expect(isOperationAllowed(roomId, 'student-1', stroke({ userId: 'student-1' }))).toBe(false)
    expect(isOperationAllowed(roomId, 'student-1', layerVisibility({ userId: 'student-1' }))).toBe(false)
  })

  it('room-wide freeze does not affect the owner', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    setRoomFrozen(roomId, true)

    expect(isOperationAllowed(roomId, 'owner-1', stroke({ userId: 'owner-1' }))).toBe(true)
  })

  it('rejects a frozen participant\'s own operations', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    setParticipantFrozen(roomId, 'student-1', true)

    expect(isOperationAllowed(roomId, 'student-1', stroke({ userId: 'student-1' }))).toBe(false)
  })

  it('does not affect an unfrozen participant when another one is frozen', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    joinRoom(roomId, 'student-2', 'Bob', undefined, sock('student-2'))
    setParticipantFrozen(roomId, 'student-1', true)

    expect(isOperationAllowed(roomId, 'student-2', stroke({ userId: 'student-2' }))).toBe(true)
  })

  it('rejects only operations targeting the locked layer, not other layers', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    setLayerOwnerLocked(roomId, 'layer-locked', true)

    expect(isOperationAllowed(roomId, 'student-1', stroke({ userId: 'student-1', layerId: 'layer-locked' }))).toBe(false)
    expect(isOperationAllowed(roomId, 'student-1', stroke({ userId: 'student-1', layerId: 'layer-open' }))).toBe(true)
  })

  it('an owner-locked layer does not block operations that carry no layerId', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    setLayerOwnerLocked(roomId, 'layer-1', true)

    const undo: Operation = { id: 'u1', type: 'operation_undo', userId: 'student-1', timestamp: 0, targetOpId: 'x' }
    expect(isOperationAllowed(roomId, 'student-1', undo)).toBe(true)
  })

  it('returns false for an unknown room', () => {
    expect(isOperationAllowed('never-created', 'someone', stroke())).toBe(false)
  })
})

// (#289 epic, reliable history spec v0.2 §8) getOperationRejectReason is the
// same choke point as isOperationAllowed above, just returning *why* rather
// than a bare boolean — a rejected operation now gets an explicit SendResult
// back instead of silence.
describe('getOperationRejectReason', () => {
  it('returns null for an allowed operation', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))

    expect(getOperationRejectReason(roomId, 'student-1', stroke({ userId: 'student-1' }))).toBeNull()
  })

  it('reports room_frozen for a non-owner while the room is frozen', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    setRoomFrozen(roomId, true)

    expect(getOperationRejectReason(roomId, 'student-1', stroke({ userId: 'student-1' }))).toBe('room_frozen')
  })

  it('reports participant_frozen for a frozen participant\'s own operation', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    setParticipantFrozen(roomId, 'student-1', true)

    expect(getOperationRejectReason(roomId, 'student-1', stroke({ userId: 'student-1' }))).toBe('participant_frozen')
  })

  it('reports layer_owner_locked for an operation targeting a locked layer', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))
    setLayerOwnerLocked(roomId, 'layer-locked', true)

    expect(getOperationRejectReason(roomId, 'student-1', stroke({ userId: 'student-1', layerId: 'layer-locked' })))
      .toBe('layer_owner_locked')
  })

  it('reports not_owner for operation_revoke/layer_owner_lock from a non-owner', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))

    const revoke: Operation = { id: 'r1', type: 'operation_revoke', userId: 'student-1', timestamp: 0, targetOpId: 'x' }
    expect(getOperationRejectReason(roomId, 'student-1', revoke)).toBe('not_owner')
    expect(getOperationRejectReason(roomId, 'student-1', layerOwnerLock({ userId: 'student-1' }))).toBe('not_owner')
  })
})

// (#289 epic, reliable history spec v0.2 §10) findDuplicateOperation backs
// the server-side dedup: a retried send must resolve to the same seq, not
// record the same content a second time.
describe('findDuplicateOperation', () => {
  it('returns undefined for an operation id never recorded', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(findDuplicateOperation(roomId, 'never-sent')).toBeUndefined()
  })

  it('finds a previously recorded operation by its client-generated id', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const stamped = recordOperation(roomId, stroke({ id: 'dup-1', userId: 'owner-1' }))

    const found = findDuplicateOperation(roomId, 'dup-1')
    expect(found?.seq).toBe(stamped.seq)
  })

  it('returns undefined for an unknown room', () => {
    expect(findDuplicateOperation('never-created', 'op-1')).toBeUndefined()
  })
})

// (#289 epic, reliable history spec v0.2 §8) The one place besides the
// owner-lock mirror the server inspects operation *content* — rejects
// layer_delete/layer_merge/layer_transform outright when they reference an
// id updateAliveIds doesn't currently know as alive, instead of silently
// accepting a race (concurrent delete + merge of the same layer) that used
// to resolve independently, and possibly differently, on every client.
describe('getOperationRejectReason — target_gone', () => {
  it('allows layer_delete targeting a layer updateAliveIds already knows about', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-new' }))

    expect(getOperationRejectReason(roomId, 'owner-1', layerDelete({ layerIds: ['layer-new'] }))).toBeNull()
  })

  // Regression: the room's two baked-in layers (`IMPLICIT_LAYER_IDS`) exist
  // from seq 0 with no `layer_add` in the log to prove it, so seeding
  // aliveIds from the log alone made deleting the initial layer — the one
  // every drawing actually starts on — permanently impossible.
  it('allows deleting the baked-in initial layer, which no layer_add ever created', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(getOperationRejectReason(roomId, 'owner-1', layerDelete({ layerIds: [INITIAL_LAYER_ID] }))).toBeNull()
  })

  it('allows merging the baked-in initial layer with a later one', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-new' }))

    const merge = layerMerge({ sources: [{ id: INITIAL_LAYER_ID, opacity: 1 }, { id: 'layer-new', opacity: 1 }] })
    expect(getOperationRejectReason(roomId, 'owner-1', merge)).toBeNull()
  })

  it('allows transforming the baked-in initial layer', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    const transform = layerTransform({ transforms: [{ layerId: INITIAL_LAYER_ID, matrix: [1, 0, 0, 1, 0, 0] }] })
    expect(getOperationRejectReason(roomId, 'owner-1', transform)).toBeNull()
  })

  it('rejects layer_delete targeting a layer that was never added', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(getOperationRejectReason(roomId, 'owner-1', layerDelete({ layerIds: ['never-added'] })))
      .toBe('target_gone')
  })

  it('rejects layer_merge when a source was already deleted (the delete-vs-merge race)', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-a' }))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-b' }))
    updateAliveIds(roomId, layerDelete({ layerIds: ['layer-b'] })) // raced in first

    const merge = layerMerge({ sources: [{ id: 'layer-a', opacity: 1 }, { id: 'layer-b', opacity: 1 }] })
    expect(getOperationRejectReason(roomId, 'owner-1', merge)).toBe('target_gone')
  })

  it('allows layer_merge when every source is still alive', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-a' }))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-b' }))

    const merge = layerMerge({ sources: [{ id: 'layer-a', opacity: 1 }, { id: 'layer-b', opacity: 1 }] })
    expect(getOperationRejectReason(roomId, 'owner-1', merge)).toBeNull()
  })

  it('rejects layer_transform targeting an id that does not exist', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    const transform = layerTransform({ transforms: [{ layerId: 'never-added', matrix: [1, 0, 0, 1, 0, 0] }] })
    expect(getOperationRejectReason(roomId, 'owner-1', transform)).toBe('target_gone')
  })

  it('rejects target_gone even for the room owner — existence is not a privilege', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(getOperationRejectReason(roomId, 'owner-1', layerDelete({ layerIds: ['never-added'] })))
      .toBe('target_gone')
  })

  it('does not gate operation types outside delete/merge/transform', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    joinRoom(roomId, 'student-1', 'Alice', undefined, sock('student-1'))

    // A stroke on a nonexistent layer degrades gracefully client-side (see
    // engine/index.ts's appendOperation) — the server never rejects it.
    expect(getOperationRejectReason(roomId, 'student-1', stroke({ userId: 'student-1', layerId: 'never-added' })))
      .toBeNull()
  })
})

describe('updateAliveIds', () => {
  it('adds layer_add/folder_add ids, removes layer_delete ids', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-x' }))

    expect(getOperationRejectReason(roomId, 'owner-1', layerDelete({ layerIds: ['layer-x'] }))).toBeNull()

    updateAliveIds(roomId, layerDelete({ layerIds: ['layer-x'] }))
    expect(getOperationRejectReason(roomId, 'owner-1', layerDelete({ layerIds: ['layer-x'] })))
      .toBe('target_gone')
  })

  it('layer_merge adds the merged result and removes every source', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-a' }))
    updateAliveIds(roomId, layerAdd({ layerId: 'layer-b' }))
    updateAliveIds(roomId, layerMerge({
      layerId: 'layer-merged', sources: [{ id: 'layer-a', opacity: 1 }, { id: 'layer-b', opacity: 1 }],
    }))

    expect(getOperationRejectReason(roomId, 'owner-1', layerDelete({ layerIds: ['layer-a'] }))).toBe('target_gone')
    expect(getOperationRejectReason(roomId, 'owner-1', layerDelete({ layerIds: ['layer-merged'] }))).toBeNull()
  })

  it('is a no-op for an unknown room', () => {
    expect(() => updateAliveIds('never-created', layerAdd())).not.toThrow()
  })
})

// (#292) ensureRoomLoaded has to run before joinRoom (the password it checks
// lives in the record that load produces), so a rejected join used to leave
// a fully populated room in memory with nobody in it — and leaveRoom, the
// only thing that evicts, never fires for someone who never got in.
// Note on coverage: the end-to-end path this exists for — ensureRoomLoaded
// materialises a room, joinRoom then rejects the password, nobody is left in
// it — lives in socketHandlers.ts, which has no test harness here. What
// follows pins the eviction primitive itself.
describe('releaseRoomIfUnused', () => {
  it('evicts a resident room that has no participants left', async () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), 'hunter2', 'owner-1', 'Teacher', sock('owner-1'))
    // leaveRoom drops the last participant but defers the eviction itself
    // behind this room's pending writes, so right here the room is still
    // resident with zero participants — the same shape a rejected join
    // leaves behind.
    leaveRoom(roomId, 'owner-1', sock('owner-1'))
    expect(getRoomSnapshot(roomId)).toBeDefined()

    releaseRoomIfUnused(roomId)
    await _flushPendingWrites(roomId)
    expect(getRoomSnapshot(roomId)).toBeUndefined()
  })

  it('leaves a room alone while anyone is still in it', async () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    releaseRoomIfUnused(roomId)
    await _flushPendingWrites(roomId)
    expect(getRoomSnapshot(roomId)).toBeDefined()
    expect(getParticipant(roomId, 'owner-1')).toBeDefined()
  })

  it('is a no-op on a room that was never loaded', () => {
    expect(() => releaseRoomIfUnused('never-created')).not.toThrow()
  })

  it('does not disturb a room someone rejoined during the eviction window', async () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    leaveRoom(roomId, 'owner-1', sock('owner-1'))
    joinRoom(roomId, 'owner-1', 'Teacher', undefined, sock('owner-1', '-2'))

    releaseRoomIfUnused(roomId)
    await _flushPendingWrites(roomId)
    expect(getRoomSnapshot(roomId)).toBeDefined()
  })
})
