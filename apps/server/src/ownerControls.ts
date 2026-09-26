import type { Operation, Participant, RoomAccessMode, ToggleableTool } from '@grafetto/shared'
import { sanitizeEnabledTools } from '@grafetto/shared'

import { prisma } from './prisma.js'
import { enqueueWrite, rooms, socialRecord } from './roomRegistry.js'

/** (#612) What the owner can switch on a live room at runtime (#254 epic):
 *  freeze of the room and of one participant, the toolset, closing for
 *  editing (#222), the access mode and password (#225/#226), and the two
 *  layer locks' mirrors (#258, #518). No role checks here — every caller in
 *  socketHandlers.ts and the routes checks the caller first; this is the
 *  in-memory half they then change. Moved out of rooms.ts. */

// ── Owner runtime privileges (#254 epic) ──────────────────────────────────

export function isRoomFrozen(roomId: string): boolean {
  return socialRecord(roomId)?.roomFrozen ?? false
}

/** (#548) Replaces the room's toolset, in memory and in Postgres. Returns the
 *  sanitized list actually stored — `undefined` for "no restriction" — or
 *  `false` when there is no such room, so the caller can tell "nothing to
 *  broadcast" from "broadcast the unrestricted room".
 *
 *  Sanitizing here rather than trusting the caller is the point: this is the
 *  only door the value comes through, and what the room ends up holding is the
 *  normalized list, never one client's raw claim. Like `setRoomFrozen` it does
 *  not check the caller's role — see socketHandlers.ts. */
export function setRoomTools(roomId: string, enabledTools: unknown): ToggleableTool[] | undefined | false {
  // (#176) The toolset is the lesson's: "today we work in pencil" holds on
  // every page, so it is stored on the lesson row and overlaid onto each
  // board's `room` in getRoomSnapshot.
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  const sanitized = sanitizeEnabledTools(enabledTools)
  lesson.room.enabledTools = sanitized
  const lessonId = lesson.room.id
  enqueueWrite(lessonId, () => prisma.room.update({
    where: { id: lessonId },
    data: { enabledTools: sanitized ?? [] },
  }))
  return sanitized
}

/** Sets the room-wide freeze (#256). Returns `false` for an unknown room
 *  (nothing to set), `true` on success — callers (socketHandlers.ts) only
 *  broadcast `room_frozen_changed` on `true`. No role check here: that's the
 *  caller's job (see socket.on('set_room_frozen', ...) — same division of
 *  responsibility as rooms.ts's recordOperation/isOperationAllowed). */
export function setRoomFrozen(roomId: string, frozen: boolean): boolean {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  lesson.roomFrozen = frozen
  return true
}

/** Sets one participant's freeze (#257), independent of the room-wide flag.
 *  Returns the updated `Participant` on success, or `undefined` if the room
 *  or participant doesn't exist *or* the target is the room's own owner —
 *  the owner can never be frozen, mirroring the "owner never rejects
 *  themselves" invariant `operation_revoke`'s role check already relies on
 *  elsewhere. Like `setRoomFrozen`, does not itself check the *caller's*
 *  role — see socketHandlers.ts. */
export function setParticipantFrozen(roomId: string, userId: string, frozen: boolean): Participant | undefined {
  const lesson = socialRecord(roomId)
  if (!lesson) return undefined
  const participant = lesson.participants.get(userId)
  if (!participant || participant.role === 'owner') return undefined

  if (frozen) lesson.frozenUserIds.add(userId)
  else lesson.frozenUserIds.delete(userId)
  const updated: Participant = { ...participant, frozen }
  lesson.participants.set(userId, updated)
  return updated
}

// ── Closed for editing (#222) ─────────────────────────────────────────────

export function isRoomClosed(roomId: string): boolean {
  const lesson = socialRecord(roomId)
  return lesson !== undefined && lesson.room.closedAt !== undefined
}

/** Mirrors a `Room.closedAt` change into the live in-memory record, so the
 *  very next operation is judged against it (#222). Returns `false` when the
 *  room isn't resident — which is not a failure: a room nobody is connected
 *  to has no in-memory state to correct and no one to broadcast to, and its
 *  next cold load reads the new value straight from Postgres (see
 *  ensureRoomLoaded's toWireRoom). Persisting is the caller's job
 *  (roomRoutes.ts), same division as setRoomFrozen above — with the
 *  difference that this one *is* persisted at all, because a closed lesson
 *  must still be closed after a restart. */
export function setRoomClosed(roomId: string, closedAt: string | null): boolean {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  lesson.room = { ...lesson.room, closedAt: closedAt ?? undefined }
  return true
}

/** Mirrors a `Room.accessMode` change into the live in-memory record (#225),
 *  so the very next join is judged against it rather than against whatever
 *  the room was loaded with. Exactly the same division of labour as
 *  `setRoomClosed` above — persisting belongs to the caller, which will be
 *  #226's `PATCH` endpoint; returning `false` for a non-resident room is not a
 *  failure, since its next cold load reads the stored mode anyway. */
export function setRoomAccessMode(roomId: string, accessMode: RoomAccessMode): boolean {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  lesson.room = { ...lesson.room, accessMode }
  return true
}

/** Mirrors a password change into the live in-memory record (#226), so the
 *  join gate stops accepting the old one immediately instead of at the room's
 *  next cold load. Same caller-persists division as `setRoomClosed` /
 *  `setRoomAccessMode`; `null` removes the password entirely.
 *
 *  Both halves of the record move together on purpose: `passwordHash` is what
 *  the gate compares against, and `room.hasPassword` is what every client is
 *  told — a room that silently kept saying `hasPassword: true` after its
 *  password was removed would have every joiner send one that is no longer
 *  checked, which reads as "the password stopped working". */
export function setRoomPassword(roomId: string, passwordHash: string | null): boolean {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  lesson.passwordHash = passwordHash ?? undefined
  lesson.room = { ...lesson.room, hasPassword: passwordHash !== null }
  return true
}

export function isLayerOwnerLocked(roomId: string, layerId: string): boolean {
  return rooms.get(roomId)?.lockedLayerIds.has(layerId) ?? false
}

/** Updates the server's lightweight owner-lock mirror (#258) — called by
 *  socketHandlers.ts right before recording an accepted `layer_owner_lock`
 *  operation, so the very next operation already sees the new state. A
 *  no-op for an unknown room (recordOperation itself will already have
 *  thrown by the time that could happen in practice). */
export function setLayerOwnerLocked(roomId: string, layerId: string, locked: boolean): void {
  const record = rooms.get(roomId)
  if (!record) return
  if (locked) record.lockedLayerIds.add(layerId)
  else record.lockedLayerIds.delete(layerId)
}

export function isLayerLocked(roomId: string, layerId: string): boolean {
  return rooms.get(roomId)?.sharedLockedLayerIds.has(layerId) ?? false
}

/** (#518) The shared lock's mirror, updated exactly where the owner lock's is
 *  — see setLayerOwnerLocked above. */
export function setLayerLocked(roomId: string, layerId: string, locked: boolean): void {
  const record = rooms.get(roomId)
  if (!record) return
  if (locked) record.sharedLockedLayerIds.add(layerId)
  else record.sharedLockedLayerIds.delete(layerId)
}

/** (#518) Undo/redo of a `layer_lock`, resolved by giving the lock up.
 *
 *  A client folds undo properly: its log knows which entries are `done` and
 *  recomputes the flag from them. The server has no such fold for anything but
 *  structural operations (see `structuralLog`, which exists precisely because
 *  reconstructing undo state is not free), so it cannot say what the flag
 *  became — only that it changed.
 *
 *  Which is why this releases rather than guesses. The mirror's whole job is
 *  to stop a stale or hostile client from painting through a lock everyone
 *  else can see; a lock it lets go of is still enforced on every real client
 *  in the room, whereas a lock it holds after the room has released it refuses
 *  drawing that no padlock on screen accounts for, with no way for the user to
 *  clear it. The next `layer_lock` operation re-establishes the truth either
 *  way — including the one a client sends when someone re-locks the layer.
 *
 *  Cheap to reach and rarely taken: only an undo/redo whose target is itself a
 *  lock operation gets here, which is why the lookup is against
 *  `operationsById` rather than a scan. */
export function releaseLockOnUndo(roomId: string, op: Operation): void {
  if (op.type !== 'operation_undo' && op.type !== 'operation_redo') return
  const record = rooms.get(roomId)
  if (!record) return
  const target = record.operationsById.get(op.targetOpId)
  if (target?.type === 'layer_lock') record.sharedLockedLayerIds.delete(target.layerId)
}
