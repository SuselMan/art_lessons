import type { Operation, Participant, ParticipantRole } from '@art-lessons/shared'

// In-memory room store (#32). Rooms exist only as long as at least one socket
// is connected to them — no persistence. A Redis-backed store is a later
// concern once multi-process/server scaling is needed.

// Cursor colors (#39) — cycled by join order. Purely data at this point; a UI
// consumes this to render peer cursors, which is out of scope here.
const CURSOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#a855f7', '#ec4899',
]

interface RoomRecord {
  operations: Operation[]
  participants: Map<string, Participant> // keyed by userId
  nextSeq: number
}

const rooms = new Map<string, RoomRecord>()

function getOrCreateRoom(roomId: string): RoomRecord {
  let room = rooms.get(roomId)
  if (!room) {
    room = { operations: [], participants: new Map(), nextSeq: 1 }
    rooms.set(roomId, room)
  }
  return room
}

/** Registers a new participant in the room (auto-creating it on first join —
 *  there is no room-creation/password flow server-side yet, that's a separate
 *  concern). The first participant to join becomes `teacher` (#39); everyone
 *  after is `student`. */
export function joinRoom(roomId: string, userId: string, name: string): Participant {
  const room = getOrCreateRoom(roomId)
  const role: ParticipantRole = room.participants.size === 0 ? 'teacher' : 'student'
  const color = CURSOR_COLORS[room.participants.size % CURSOR_COLORS.length]
  const participant: Participant = { userId, name, role, color }
  room.participants.set(userId, participant)
  return participant
}

/** Removes a participant on disconnect. Drops the room entirely once it's
 *  empty — simple MVP, nothing to persist yet (#32). */
export function leaveRoom(roomId: string, userId: string): void {
  const room = rooms.get(roomId)
  if (!room) return
  room.participants.delete(userId)
  if (room.participants.size === 0) rooms.delete(roomId)
}

export function getParticipant(roomId: string, userId: string): Participant | undefined {
  return rooms.get(roomId)?.participants.get(userId)
}

/** Snapshot for a newly joined participant (#36): everything that happened in
 *  the room so far, in server-assigned order. */
export function getRoomSnapshot(roomId: string): { operations: Operation[]; participants: Participant[] } {
  const room = rooms.get(roomId)
  if (!room) return { operations: [], participants: [] }
  return { operations: [...room.operations], participants: [...room.participants.values()] }
}

/** Appends an operation to the room's log (#34/#35), stamping it with the
 *  next `seq` — the server assigns total order per ADR 002, since clients
 *  only know their own local order. Returns the stamped copy; that copy (not
 *  the raw client payload) is what gets relayed and stored. */
export function recordOperation(roomId: string, op: Operation): Operation {
  const room = getOrCreateRoom(roomId)
  const stamped: Operation = { ...op, seq: room.nextSeq++ }
  room.operations.push(stamped)
  return stamped
}
