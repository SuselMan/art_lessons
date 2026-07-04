import { describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@art-lessons/shared'

import { getParticipant, getRoomSnapshot, joinRoom, leaveRoom, recordOperation } from './rooms.js'

// Each test uses its own roomId — `rooms` is module-level shared state with no
// reset hook, so isolation comes from never reusing a room id across tests.
let nextRoomId = 0
function freshRoomId(): string {
  return `room-${nextRoomId++}`
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
    dabs: overrides.dabs ?? [],
    ...overrides,
  }
}

describe('rooms', () => {
  it('the first joiner becomes teacher, later joiners become students', () => {
    const roomId = freshRoomId()
    const first = joinRoom(roomId, 'u1', 'Alice')
    const second = joinRoom(roomId, 'u2', 'Bob')
    const third = joinRoom(roomId, 'u3', 'Carol')

    expect(first.role).toBe('teacher')
    expect(second.role).toBe('student')
    expect(third.role).toBe('student')
  })

  it('assigns distinct cursor colors by join order, cycling if needed', () => {
    const roomId = freshRoomId()
    const participants = Array.from({ length: 9 }, (_, i) => joinRoom(roomId, `u${i}`, `User ${i}`))
    // 8 named colors; the 9th participant should cycle back to the first color.
    expect(participants[8].color).toBe(participants[0].color)
    expect(new Set(participants.slice(0, 8).map(p => p.color)).size).toBe(8)
  })

  it('getRoomSnapshot reflects current participants and returns defensive copies', () => {
    const roomId = freshRoomId()
    joinRoom(roomId, 'u1', 'Alice')
    joinRoom(roomId, 'u2', 'Bob')

    const snapshot = getRoomSnapshot(roomId)
    expect(snapshot.participants).toHaveLength(2)

    snapshot.participants.push({ userId: 'ghost', name: 'x', role: 'student', color: '#000' })
    expect(getRoomSnapshot(roomId).participants).toHaveLength(2) // mutation didn't leak back
  })

  it('getRoomSnapshot on an unknown room returns empty, not an error', () => {
    expect(getRoomSnapshot('never-joined')).toEqual({ operations: [], participants: [] })
  })

  it('leaveRoom removes the participant; the room resets once empty', () => {
    const roomId = freshRoomId()
    joinRoom(roomId, 'u1', 'Alice')
    leaveRoom(roomId, 'u1')

    expect(getParticipant(roomId, 'u1')).toBeUndefined()
    expect(getRoomSnapshot(roomId)).toEqual({ operations: [], participants: [] })

    // Room was dropped, so a fresh join re-triggers first-joiner-becomes-teacher.
    const rejoined = joinRoom(roomId, 'u2', 'Bob')
    expect(rejoined.role).toBe('teacher')
  })

  it('leaveRoom on an unknown room or participant is a no-op', () => {
    expect(() => leaveRoom('never-joined', 'nobody')).not.toThrow()
  })

  it('recordOperation stamps increasing seq numbers and preserves order', () => {
    const roomId = freshRoomId()
    const a = recordOperation(roomId, stroke({ id: 'a' }))
    const b = recordOperation(roomId, stroke({ id: 'b' }))

    expect(a.seq).toBe(1)
    expect(b.seq).toBe(2)
    expect(getRoomSnapshot(roomId).operations.map(o => o.id)).toEqual(['a', 'b'])
  })

  it('recordOperation returns a stamped copy without mutating the input', () => {
    const roomId = freshRoomId()
    const input = stroke({ id: 'a' })
    const stamped = recordOperation(roomId, input)

    expect(input.seq).toBeUndefined()
    expect(stamped.seq).toBe(1)
  })
})
