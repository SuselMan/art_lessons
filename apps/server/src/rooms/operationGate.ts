// (#612) Whether an operation may be applied, out of rooms.ts: every gate a
// submitted operation passes — owner-only types, a target that is gone, a
// closed lesson, a board that is not the sender's, a shared lock, a frozen
// room or participant, an owner lock. Pure and synchronous: it reads two
// narrow views of the room record (the board the operation lands on, the
// lesson it belongs to) and never writes. rooms.ts looks the records up.

import type { Operation, Participant, RejectReason, Room } from '@grafetto/shared'
import { operationLayerIds, paintedLayerIds } from '@grafetto/shared'

import { canDrawOnBoard } from './lessons.js'

/** What the gate reads off the board an operation targets. */
export interface GateBoard {
  room: Pick<Room, 'boardOwnerId'>
  /** (#258) Layers the owner reserved. */
  lockedLayerIds: ReadonlySet<string>
  /** (#518) Layers anyone in the room locked. */
  sharedLockedLayerIds: ReadonlySet<string>
  /** (#289) Ids positively alive, and positively destroyed — see structuralLog. */
  aliveIds: ReadonlySet<string>
  deletedIds: ReadonlySet<string>
}

/** What the gate reads off the lesson the board belongs to. */
export interface GateLesson {
  room: Pick<Room, 'ownerId' | 'closedAt'>
  participants: ReadonlyMap<string, Pick<Participant, 'role'>>
  roomFrozen: boolean
  frozenUserIds: ReadonlySet<string>
}

/** The single choke point for "should this operation be applied" (#254
 *  epic) — pure and synchronous so it's unit-testable without a live
 *  socket.io harness (see rooms.test.ts). Folds together every owner-only
 *  runtime privilege check added by the epic:
 *   - `operation_revoke` and `layer_owner_lock` themselves are owner-only to
 *     *send at all* (same role-check shape `operation_revoke` already had
 *     before this epic).
 *   - the room owner's own operations are never rejected by anything below
 *     (an owner can't freeze or lock-out themselves — see
 *     setParticipantFrozen — but this stays an explicit early return rather
 *     than relying on that alone).
 *   - a room closed for editing (#222) rejects every operation from
 *     everyone, the owner included — the one check here that is not a
 *     privilege of the owner but a state of the document.
 *   - room-wide freeze (#256) and this participant's own freeze (#257)
 *     reject *every* operation type, not just drawing ones.
 *   - an owner-locked layer (#258) rejects only operations that target it
 *     (anything carrying a top-level `layerId`, e.g. `stroke`/`image_import`
 *     — see packages/shared's Operation union for the full set).
 *
 *  (#289 epic, reliable history spec v0.2) Returns the specific
 *  `RejectReason` rather than a bare boolean — a rejected operation now gets
 *  an explicit `SendResult` back instead of the silence isOperationAllowed's
 *  boolean used to produce (socketHandlers.ts just `return`ed with no ack at
 *  all, indistinguishable to the sender from a dropped packet). The
 *  `not_owner` fallback for an unknown room is arbitrary/unreachable in
 *  practice — socketHandlers.ts only ever calls this for a roomId a socket
 *  has already successfully joined; recordOperation is the one that throws
 *  for a genuinely missing room. */
export function operationRejectReason(
  record: GateBoard, lesson: GateLesson, userId: string, op: Operation,
): RejectReason | null {
  // (#176) Who is asking, whether the lesson is closed or frozen — the
  // lesson's; what the operation targets and whether that is locked or gone
  // — the board's. Both are read below, from the right record each.
  const participant = lesson.participants.get(userId)
  const isOwner = participant?.role === 'owner'

  if (op.type === 'operation_revoke' && !isOwner) return 'not_owner'
  if (op.type === 'layer_owner_lock' && !isOwner) return 'not_owner'

  // (#289 epic, reliable history spec v0.2 §8) Existence isn't a privilege —
  // checked before the owner short-circuit below, so not even the room's
  // owner can delete/merge/transform a layer that's already gone (a
  // concurrent delete/merge racing this one, the exact class of bug the
  // spec's §5 "merge vs delete" discussion covers). Rejecting outright here,
  // once, on the server, replaces the old behavior of silently accepting
  // both and letting every client's own replay resolve the conflict
  // independently — which could (and did, in the reasoning that led here)
  // resolve differently on different clients.
  if (hasMissingAliveTarget(record, op)) return 'target_gone'

  // (#222) Checked *before* the owner short-circuit below — unlike every
  // other privilege here, closing binds the owner too. The point of a closed
  // lesson is that it has stopped changing: students fork it, and a fork is
  // only a faithful copy of the assignment if the assignment cannot drift
  // afterwards. An owner who wants to correct something reopens the room,
  // which is one toggle away and, being persisted and broadcast, is visible
  // to everyone rather than being a silent exemption. Contrast `room_frozen`
  // below, which is a live control over *other people* and never applies to
  // the person holding it.
  if (lesson.room.closedAt !== undefined) return 'room_closed'

  // (#595, ADR 015 §3) Before the owner short-circuit so the gates read top to
  // bottom — though the teacher passes it anyway: a personal board is its
  // student's and the teacher's, and nobody else's, whatever else is true.
  if (!canDrawOnBoard(userId, record.room, lesson.room.ownerId)) return 'board_not_yours'

  // (#518) Before the owner short-circuit, like `room_closed` above and for a
  // related reason: the shared lock is not a privilege one person holds over
  // others, it is a claim about the layer that everybody in the room can make
  // and everybody can take back — the owner included. An owner exemption here
  // would make it a second owner lock, which the room already has.
  //
  // Narrow on purpose: only the operations that paint (`paintedLayerIds`), so
  // a locked layer can still be renamed, moved, cleared, duplicated and
  // deleted. That is the same line the client draws — see lib/layers/layers.ts's
  // `isLockedAgainst`, which is what stops these ever being sent by a current
  // build. This check is for the ones that are not: an old tab, a replayed
  // packet, anything that has been out of the room while the lock went on.
  if (sharedLockedTargets(record, op)) return 'layer_locked'

  if (isOwner) return null

  if (lesson.roomFrozen) return 'room_frozen'
  if (lesson.frozenUserIds.has(userId)) return 'participant_frozen'
  if (ownerLockedTargets(record, op)) return 'layer_owner_locked'
  return null
}

/** Whether a non-owner's operation touches a layer the owner reserved.
 *
 *  (#412) `layer_opacity` and `layer_visibility` carry a *list* of targets
 *  now, and the plain `'layerId' in op` test below would simply stop seeing
 *  them — turning the mass form into a way around the owner's lock while the
 *  single form stayed correctly refused. A silent privilege escalation is the
 *  worst shape this could have taken, so the two pluralised types are named
 *  explicitly rather than inferred from whether some field happens to exist.
 *
 *  `layer_move` joined them in #413 for the same reason — it carries a group
 *  now — and it was gated before, so leaving it out would have *removed* a
 *  check rather than failed to add one.
 *
 *  (#518) `layer_transform` is now gated too — the question the note below
 *  left open, answered. It carries its targets in `transforms`, so the
 *  `'layerId' in op` test could never see them, and the result was that the
 *  one operation able to move a whole layer bodily across the sheet was the
 *  one operation an owner lock did not stop. `layer_delete` stays out, and
 *  that is still deliberate: destroying a layer is not the same act as
 *  quietly rewriting one, and #289's `aliveIds` gate is what governs it.
 *
 *  Deliberately unchanged for everything else. */
function ownerLockedTargets(record: GateBoard, op: Operation): boolean {
  if (op.type === 'layer_opacity' || op.type === 'layer_visibility' || op.type === 'layer_move') {
    return operationLayerIds(op).some(id => record.lockedLayerIds.has(id))
  }
  if (op.type === 'layer_transform') {
    return paintedLayerIds(op).some(id => record.lockedLayerIds.has(id))
  }
  return 'layerId' in op && record.lockedLayerIds.has(op.layerId)
}

/** (#518) Whether the operation paints into a layer someone in the room has
 *  locked. Reads `paintedLayerIds` rather than any field test of its own —
 *  that is the whole lesson of the note above: a rule written against the
 *  *shape* of an operation stops seeing operations whose shape it did not
 *  anticipate, silently, and in the direction that lets things through. */
function sharedLockedTargets(record: GateBoard, op: Operation): boolean {
  if (record.sharedLockedLayerIds.size === 0) return false
  // `layer_clear` empties a layer from the row's own menu, next to Delete, and
  // is exempt on both sides — see lib/layers/layers.ts's LOCK_EXEMPT_OP_TYPES for the
  // reasoning. Named here rather than shared as a list because the two sides
  // are allowed to disagree in only one direction, and a server that reads its
  // policy from the client's is not a check.
  if (op.type === 'layer_clear') return false
  return paintedLayerIds(op).some(id => record.sharedLockedLayerIds.has(id))
}

/** True if `op` targets an id that can no longer receive it — see
 *  RoomRecord.aliveIds/deletedIds for the two mirrors this reads.
 *
 *  Two classes, deliberately gated against different sets:
 *
 *  1. *Destructive* operations on someone else's reference
 *     (`layer_delete`/`layer_merge`/`layer_duplicate`/`layer_transform`) are gated on
 *     `aliveIds`: a target that isn't positively alive must not be acted
 *     on, whatever the reason (#289 §8).
 *  2. *Content-bearing* operations (`stroke`/`image_import`/`layer_clear`)
 *     are gated on `deletedIds` — a positively-destroyed target only
 *     (#311, revising #289 §4's classification).
 *
 *  §4 originally left class 2 ungated on the grounds that it degrades
 *  gracefully client-side (see engine/index.ts's appendOperation, which
 *  revokes rather than crashes). That reasoning holds for a three-second
 *  drop and fails for a long offline stretch: the operations are accepted,
 *  recorded, broadcast, and then quietly evaporate on every client — the
 *  one path by which a user silently loses drawing they already did. The
 *  author can't even be told, since `target_gone` never fires. Rejecting
 *  instead hands the operations back intact so the client can re-target
 *  them onto a fresh layer (#312).
 *
 *  Property-only operations (`layer_move`/`layer_opacity`/
 *  `layer_visibility`/`layer_rename`) stay ungated: they carry nothing that
 *  can be lost and are fine as last-write-wins, exactly as §4 classified. */
function hasMissingAliveTarget(record: GateBoard, op: Operation): boolean {
  switch (op.type) {
    case 'layer_delete': return op.layerIds.some(id => !record.aliveIds.has(id))
    case 'layer_merge': return op.sources.some(s => !record.aliveIds.has(s.id))
    // (#449) Class 1, with `sourceId` in the role a merge's sources play: it is
    // someone else's reference, and reading a layer that is no longer there
    // would silently produce an empty copy on every client rather than an
    // error the author can see. The copy's own `layerId` is new by
    // construction and is not checked — nothing has created it yet.
    case 'layer_duplicate': return !record.aliveIds.has(op.sourceId)
    case 'layer_transform': return op.transforms.some(t => !record.aliveIds.has(t.layerId))
    case 'stroke':
    case 'image_import':
    case 'layer_clear':
    // (#446) Class 2 as well: a selection operation carries content (pixels
    // moved, erased or pasted) and degrades gracefully client-side, so it is
    // gated on a positively-destroyed target only, never on "not positively
    // alive".
    case 'area_transform':
    case 'area_clear':
    case 'area_paste':
    // (#453) The fill is Class 2 for the same reason: it carries its pixels,
    // so a client that has not caught up simply paints them late rather than
    // resolving a reference that has gone.
    case 'area_fill':
    // (#525) Class 2 as well: a shape carries everything needed to draw it,
    // so a client behind on layer structure paints it late rather than
    // resolving a reference that has gone.
    case 'shape':
    // (#574) Class 2: the filter is its own parameters, and a layer that is
    // gone has nothing left to filter.
    case 'layer_filter': return record.deletedIds.has(op.layerId)
    default: return false
  }
}
