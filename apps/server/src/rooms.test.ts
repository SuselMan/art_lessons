import { afterEach, describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@art-lessons/shared'

import {
  _flushPendingWrites, createRoom, getOperationsBefore, getParticipant, getRoomSnapshot, joinRoom, leaveRoom,
  recordOperation,
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
  return { id, name: 'Still life', paper: 'rough' as const, infinite: false, canvasWidth: 1240, canvasHeight: 1754 }
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

// Deterministic per-userId socket id for tests that don't care about the
// exact value, just that join/leave agree on it — matches the shape a real
// socket.io `socket.id` has (an opaque string), just readable here. `suffix`
// distinguishes two overlapping sockets for the same userId (a page
// refresh, a reconnect) in the #164 tests below.
function sock(userId: string, suffix = ''): string {
  return `sock-${userId}${suffix}`
}

describe('createRoom', () => {
  it('seats the creator as teacher and fixes ownerId', () => {
    const roomId = freshRoomId()
    const { room, participant } = createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))

    expect(room.ownerId).toBe('owner-1')
    expect(room.id).toBe(roomId)
    expect(participant.role).toBe('teacher')
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

    expect(second.participant.role).toBe('teacher')
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
    expect(result).toEqual({ ok: true, participant: expect.objectContaining({ userId: 'u1', role: 'student' }) })
  })

  it('never assigns teacher to a non-owner, regardless of join order', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const first = joinRoom(roomId, 'u1', 'Alice', undefined, sock('u1'))
    const second = joinRoom(roomId, 'u2', 'Bob', undefined, sock('u2'))

    expect(first.ok && first.participant.role).toBe('student')
    expect(second.ok && second.participant.role).toBe('student')
  })

  it("assigns teacher when the room's owner rejoins via join_room (#41 identity fix)", () => {
    // The client always goes through join_room, never create_room again, for
    // a returning owner (reconnect after a drop, or just reopening the link
    // later) — see rooms.ts createRoom's doc comment. Before identity was
    // stable, this always fell through to `student`.
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const rejoin = joinRoom(roomId, 'owner-1', 'Teacher', undefined, sock('owner-1', '-2'))

    expect(rejoin.ok && rejoin.participant.role).toBe('teacher')
  })

  it('assigns distinct cursor colors by join order, cycling if needed', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    const joiners = Array.from({ length: 8 }, (_, i) => joinRoom(roomId, `u${i}`, `User ${i}`, undefined, sock(`u${i}`)))
    const colors = joiners.map(r => r.ok && r.participant.color)
    // Owner took the first color at creation; 8 students plus the owner cycle
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

    snapshot?.participants.push({ userId: 'ghost', name: 'x', role: 'student', color: '#000' })
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

    expect(rejoin).toEqual({ ok: true, participant: expect.objectContaining({ role: 'teacher' }) })
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

// #169 background backfill: purely in-memory (record.operations already
// holds the room's full history — see ensureRoomLoaded), so unlike
// saveSnapshot/getLatestSnapshot this needs no Postgres mocking.
describe('getOperationsBefore', () => {
  it('returns every operation strictly before beforeSeq when it all fits in one page', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    recordOperation(roomId, stroke({ id: 'a' })) // seq 1
    recordOperation(roomId, stroke({ id: 'b' })) // seq 2
    recordOperation(roomId, stroke({ id: 'c' })) // seq 3
    recordOperation(roomId, stroke({ id: 'd' })) // seq 4

    expect(getOperationsBefore(roomId, 4, 500).map(o => o.id)).toEqual(['a', 'b', 'c'])
  })

  it('caps a page to the last `limit` operations before beforeSeq — the page immediately preceding it', () => {
    // Anchored at beforeSeq and walking backward (not forward from a
    // cursor): the client always merges a page at the very front of its
    // log, so pages must arrive oldest-page-last, newest-before-the-anchor-
    // first — see the function's own doc comment.
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    for (let i = 0; i < 5; i++) recordOperation(roomId, stroke({ id: `op-${i}` })) // seq 1..5

    expect(getOperationsBefore(roomId, 100, 2).map(o => o.id)).toEqual(['op-3', 'op-4'])
  })

  it('walking a room\'s full history backward, page by page, eventually reaches an empty page', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', sock('owner-1'))
    for (let i = 0; i < 5; i++) recordOperation(roomId, stroke({ id: `op-${i}` })) // seq 1..5

    const page1 = getOperationsBefore(roomId, 6, 2)
    expect(page1.map(o => o.id)).toEqual(['op-3', 'op-4'])
    const page2 = getOperationsBefore(roomId, page1[0].seq!, 2)
    expect(page2.map(o => o.id)).toEqual(['op-1', 'op-2'])
    const page3 = getOperationsBefore(roomId, page2[0].seq!, 2)
    expect(page3.map(o => o.id)).toEqual(['op-0'])
    expect(getOperationsBefore(roomId, page3[0].seq!, 2)).toEqual([])
  })

  it('returns nothing for an unknown room', () => {
    expect(getOperationsBefore('never-created', 100, 500)).toEqual([])
  })
})
