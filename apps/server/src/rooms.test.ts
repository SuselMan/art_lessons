import { describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@art-lessons/shared'

import { createRoom, getParticipant, getRoomSnapshot, joinRoom, leaveRoom, recordOperation } from './rooms.js'

// Each test uses its own roomId — `rooms` is module-level shared state with no
// reset hook, so isolation comes from never reusing a room id across tests.
let nextRoomId = 0
function freshRoomId(): string {
  return `room-${nextRoomId++}`
}

function roomDraft(id: string) {
  return { id, name: 'Still life', paper: 'rough' as const, canvasWidth: 1240, canvasHeight: 1754 }
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

describe('createRoom', () => {
  it('seats the creator as teacher and fixes ownerId', () => {
    const roomId = freshRoomId()
    const { room, participant } = createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher')

    expect(room.ownerId).toBe('owner-1')
    expect(room.id).toBe(roomId)
    expect(participant.role).toBe('teacher')
    expect(participant.userId).toBe('owner-1')
  })

  it('derives hasPassword from whether a password was given', () => {
    const openId = freshRoomId()
    const protectedId = freshRoomId()
    const open = createRoom(roomDraft(openId), undefined, 'owner-1', 'Teacher')
    const guarded = createRoom(roomDraft(protectedId), 'secret', 'owner-2', 'Teacher')

    expect(open.room.hasPassword).toBe(false)
    expect(guarded.room.hasPassword).toBe(true)
  })

  it("ownerId does not shift when other participants join afterward", () => {
    const roomId = freshRoomId()
    const { room } = createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher')
    joinRoom(roomId, 'student-1', 'Alice')
    joinRoom(roomId, 'student-2', 'Bob')

    expect(getRoomSnapshot(roomId)?.room.ownerId).toBe('owner-1')
    expect(room.ownerId).toBe('owner-1')
  })
})

describe('joinRoom', () => {
  it('fails with not_found when the room was never created', () => {
    const result = joinRoom(freshRoomId(), 'u1', 'Alice')
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('fails with wrong_password when the room requires one and it does not match', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), 'secret', 'owner-1', 'Teacher')

    expect(joinRoom(roomId, 'u1', 'Alice', 'nope')).toEqual({ ok: false, error: 'wrong_password' })
    expect(joinRoom(roomId, 'u1', 'Alice')).toEqual({ ok: false, error: 'wrong_password' })
  })

  it('succeeds when the password matches', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), 'secret', 'owner-1', 'Teacher')

    const result = joinRoom(roomId, 'u1', 'Alice', 'secret')
    expect(result).toEqual({ ok: true, participant: expect.objectContaining({ userId: 'u1', role: 'student' }) })
  })

  it('never assigns teacher, regardless of join order', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher')
    const first = joinRoom(roomId, 'u1', 'Alice')
    const second = joinRoom(roomId, 'u2', 'Bob')

    expect(first.ok && first.participant.role).toBe('student')
    expect(second.ok && second.participant.role).toBe('student')
  })

  it('assigns distinct cursor colors by join order, cycling if needed', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher')
    const joiners = Array.from({ length: 8 }, (_, i) => joinRoom(roomId, `u${i}`, `User ${i}`))
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
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher')
    joinRoom(roomId, 'u1', 'Alice')

    const snapshot = getRoomSnapshot(roomId)
    expect(snapshot?.room.id).toBe(roomId)
    expect(snapshot?.participants).toHaveLength(2)

    snapshot?.participants.push({ userId: 'ghost', name: 'x', role: 'student', color: '#000' })
    expect(getRoomSnapshot(roomId)?.participants).toHaveLength(2) // mutation didn't leak back
  })

  it('returns undefined for an unregistered room', () => {
    expect(getRoomSnapshot('never-created')).toBeUndefined()
  })
})

describe('leaveRoom', () => {
  it('removes the participant; the room (including its metadata) is dropped once empty', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher')
    leaveRoom(roomId, 'owner-1')

    expect(getParticipant(roomId, 'owner-1')).toBeUndefined()
    expect(getRoomSnapshot(roomId)).toBeUndefined()

    // Room is gone entirely — a plain join_room can no longer find it.
    expect(joinRoom(roomId, 'u1', 'Alice')).toEqual({ ok: false, error: 'not_found' })
  })

  it('is a no-op on an unknown room or participant', () => {
    expect(() => leaveRoom('never-created', 'nobody')).not.toThrow()
  })
})

describe('recordOperation', () => {
  it('stamps increasing seq numbers and preserves order', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher')
    const a = recordOperation(roomId, stroke({ id: 'a' }))
    const b = recordOperation(roomId, stroke({ id: 'b' }))

    expect(a.seq).toBe(1)
    expect(b.seq).toBe(2)
    expect(getRoomSnapshot(roomId)?.operations.map(o => o.id)).toEqual(['a', 'b'])
  })

  it('returns a stamped copy without mutating the input', () => {
    const roomId = freshRoomId()
    createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher')
    const input = stroke({ id: 'a' })
    const stamped = recordOperation(roomId, input)

    expect(input.seq).toBeUndefined()
    expect(stamped.seq).toBe(1)
  })

  it('throws for a room that was never created', () => {
    expect(() => recordOperation(freshRoomId(), stroke())).toThrow()
  })
})
