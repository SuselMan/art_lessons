import type { Operation, Participant, Room } from '@art-lessons/shared'

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
  room: Room
  password: string | undefined // plaintext — no auth system yet, LAN MVP only
  operations: Operation[]
  participants: Map<string, Participant> // keyed by userId
  nextSeq: number
}

const rooms = new Map<string, RoomRecord>()

export type JoinRoomOutcome =
  | { ok: true; participant: Participant }
  | { ok: false; error: 'not_found' | 'wrong_password' }

/** Registers a new room and immediately seats its creator as `teacher`.
 *  `ownerId` is fixed here, at creation time, and never changes afterward —
 *  this replaces the old "first socket to join becomes teacher" rule (#39),
 *  which raced whenever more than one person opened a room link around the
 *  same time. `join_room` (below) now only ever produces `student`s.
 *
 *  Room ids are `nanoid(8)` (client-generated) — a collision is astronomically
 *  unlikely, so this intentionally doesn't special-case an id already in use:
 *  it just overwrites, same as any other last-write-wins map insert. Adding a
 *  dedicated "room already exists" error would mean a third `JoinResult`
 *  variant, i.e. touching the frozen `packages/shared` contract for a case
 *  that in practice won't happen — not worth it here. */
export function createRoom(
  roomData: Pick<Room, 'id' | 'name' | 'paper' | 'canvasWidth' | 'canvasHeight'>,
  password: string | undefined,
  ownerId: string,
  ownerName: string,
): { room: Room; participant: Participant } {
  const room: Room = {
    ...roomData,
    hasPassword: !!password,
    ownerId,
    createdAt: new Date().toISOString(),
  }
  const participant: Participant = { userId: ownerId, name: ownerName, role: 'teacher', color: CURSOR_COLORS[0] }
  const participants = new Map<string, Participant>([[ownerId, participant]])
  rooms.set(room.id, { room, password: password || undefined, operations: [], participants, nextSeq: 1 })
  return { room, participant }
}

/** Joins an existing room as a `student` — a plain join never produces a
 *  `teacher` (see `createRoom`). Fails with `not_found` if no room has been
 *  registered under this id yet (or the server restarted — no persistence,
 *  #74), or `wrong_password` if the room requires one and it doesn't match. */
export function joinRoom(roomId: string, userId: string, name: string, password?: string): JoinRoomOutcome {
  const record = rooms.get(roomId)
  if (!record) return { ok: false, error: 'not_found' }
  if (record.room.hasPassword && password !== record.password) return { ok: false, error: 'wrong_password' }

  const color = CURSOR_COLORS[record.participants.size % CURSOR_COLORS.length]
  const participant: Participant = { userId, name, role: 'student', color }
  record.participants.set(userId, participant)
  return { ok: true, participant }
}

/** Removes a participant on disconnect. Drops the room entirely once it's
 *  empty — simple MVP, nothing to persist yet (#32). */
export function leaveRoom(roomId: string, userId: string): void {
  const record = rooms.get(roomId)
  if (!record) return
  record.participants.delete(userId)
  if (record.participants.size === 0) rooms.delete(roomId)
}

export function getParticipant(roomId: string, userId: string): Participant | undefined {
  return rooms.get(roomId)?.participants.get(userId)
}

/** Snapshot for a newly joined participant (#36): the room's metadata plus
 *  everything that happened in it so far, in server-assigned order. Returns
 *  `undefined` for an unregistered room — callers only reach this after a
 *  successful `createRoom`/`joinRoom`, so that should never happen in
 *  practice, but the type keeps that assumption honest rather than silently
 *  fabricating a `Room`. */
export function getRoomSnapshot(
  roomId: string,
): { room: Room; operations: Operation[]; participants: Participant[] } | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  return { room: record.room, operations: [...record.operations], participants: [...record.participants.values()] }
}

/** Appends an operation to the room's log (#34/#35), stamping it with the
 *  next `seq` — the server assigns total order per ADR 002, since clients
 *  only know their own local order. Returns the stamped copy; that copy (not
 *  the raw client payload) is what gets relayed and stored. Only ever called
 *  for a room a socket has already successfully joined, so an unknown roomId
 *  here indicates a caller bug, not a normal runtime condition. */
export function recordOperation(roomId: string, op: Operation): Operation {
  const record = rooms.get(roomId)
  if (!record) throw new Error(`recordOperation: unknown room "${roomId}"`)
  const stamped: Operation = { ...op, seq: record.nextSeq++ }
  record.operations.push(stamped)
  return stamped
}
