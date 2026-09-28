import type { Operation } from './operations.js'
import type {
  AssignmentSummary, BoardSummary, ClassVisibility, LessonState, Participant, Room, RoomAccessMode, RoomJoinRequest,
} from './room.js'
import type { ToolType } from './stroke.js'
import type { ToggleableTool } from './toolset.js'

/** (#613) The socket contract: join results, cursors and live strokes,
 *  reject reasons, and the two event maps. */

/** Result of a `create_room`/`join_room` attempt. `not_found` means no room
 *  has been registered under that id, in memory or in Postgres (#74);
 *  `wrong_password` means the room exists but the supplied password didn't
 *  match. On success, `userId` is the caller's server-resolved identity
 *  (from the identity cookie, #41) — the client uses this instead of its own
 *  ephemeral Socket.IO connection id for everything identity-shaped (stamping
 *  outgoing operations, engine.setUserId), since that id is otherwise the
 *  only stable one across reconnects. */
/** (#225) Every way a join can fail to seat someone. Three of these are not
 *  really failures of the request but states of the *person* asking, which is
 *  why they are worth distinguishing in the wire contract rather than
 *  collapsing into one refusal — the join screen renders a different thing for
 *  each (#231):
 *
 *  - `access_revoked` — the owner blocked this user from this room. Terminal:
 *    nothing the client can do changes it.
 *  - `login_required` — an `invite_only` room's allow-list is keyed by email,
 *    and this browser is an anonymous guest with none. Signing in is the one
 *    move that can change the answer.
 *  - `pending_approval` — the request has been recorded and is waiting for the
 *    owner. The only one of these that resolves on its own, by someone else's
 *    action.
 *
 *  Deliberately no `access_denied`: a denied request reopens as pending on the
 *  next attempt (see roomAccess.ts), so "denied" is never a state the joiner
 *  sits in and never a thing the client has to render.
 *
 *  (#415, трек #314 §1) `server_busy` — единственная из причин, которая не про
 *  спрашивающего и не про комнату, а про коробку: сервер у потолка кучи, и
 *  холодная загрузка ещё одной комнаты — та самая аллокация, после которой
 *  падает процесс и с ним все идущие уроки разом. Отказать одному входящему
 *  дешевле, и он единственный, кому в этот момент ещё можно помочь.
 *
 *  Проходит только по холодному пути: комната, уже резидентная (то есть
 *  идущий урок), этим гейтом не проверяется вовсе — участник такой комнаты
 *  ничего к куче не добавляет. */
export type JoinDenial =
  | 'not_found'
  | 'wrong_password'
  | 'access_revoked'
  | 'login_required'
  | 'pending_approval'
  | 'server_busy'
  // (#595) A student's personal board, and this person is neither that
  // student nor the teacher, and the lesson does not show work to the class.
  // Only ever the answer for a board of a lesson the caller is already in.
  | 'board_not_visible'

export type JoinResult =
  | { ok: true; userId: string }
  | { ok: false; error: JoinDenial }

/** Peer cursor position (#37). Sent only while the sender is *not* drawing.
 *
 *  (#431) This used to carry a `drawing` flag, and peers froze the cursor dot
 *  wherever it last was for as long as it was true. That was the only sane
 *  choice at the time: the stroke's shape was unknown until the finished
 *  StrokeOperation arrived, so a cursor that kept following the pointer would
 *  have run seconds ahead of its own ink. Freezing was less wrong than lying.
 *
 *  With the stroke streaming live (#429) the flag has nothing left to do, so
 *  it is gone rather than left as a field nobody reads. While the pen is down
 *  a peer's cursor position comes from the last dab it actually painted — the
 *  same packets that draw the ink — which is what makes the dot and the line
 *  it is drawing incapable of disagreeing: they are the same data. And since
 *  the dab stream already carries the position, sending cursor packets during
 *  a stroke would be spending ~30 packets a second to say it again, less
 *  accurately. */
export type CursorMoveData = {
  x: number
  y: number
}

/** (#429) One packet of an in-progress stroke, streamed to the room while the
 *  pen is still down.
 *
 *  This is deliberately **not** an Operation and never enters the log: it is
 *  not assigned a `seq`, not persisted, not acknowledged, and not replayed on
 *  join. The gesture's authoritative record is still the StrokeOperation(s)
 *  emitted at pen-up (and at every STROKE_DAB_CHUNK_LIMIT boundary along the
 *  way) through the ordinary `operation` path. This carries the same dabs
 *  early, so peers can watch the mark appear instead of waiting out the whole
 *  gesture and then watching it replay at its recorded pace — see #428 for the
 *  latency arithmetic that motivated it.
 *
 *  Because the dabs here are the *same* dabs the eventual operation carries —
 *  the engine bakes them once, at paint time — the handoff from streamed ink to
 *  committed ink is exact. That is the difference from the abandoned #37
 *  attempt, which approximated the stroke from cursor positions and visibly
 *  snapped when the real operation landed.
 *
 *  `packetSeq` counts packets within one gesture from 0, so a receiver can tell
 *  "I have every packet so far" from "I missed one". Within a single socket
 *  connection a gap is impossible (TCP does not reorder or drop inside one
 *  connection), so a gap means the connection broke — the same conclusion, and
 *  the same full-resync response, that a gap in `operation_confirmed` already
 *  triggers. It is not a reason to reorder or wait.
 *
 *  Sent reliably, not `volatile`: a receiver paints these dabs straight into
 *  the real layer, so a silently dropped packet would leave a permanently wrong
 *  layer rather than a momentary glitch. Backpressure is handled where it
 *  belongs — the sender coalesces dabs into one packet per interval instead of
 *  emitting per frame. */
export type StrokeLiveData = {
  strokeId: string
  layerId: string
  tool: ToolType
  preset: string
  color: [number, number, number]
  packetSeq: number
  /** Same packing as StrokeOperation.dabsPacked — see packDabs/unpackDabs. */
  dabsPacked: string
  /** (#468) The wash this gesture belongs to, mirroring StrokeOperation.washId.
   *
   *  Only watercolor sets it, and it exists because a wash is the one thing in
   *  this engine that spans *several* strokes: they share one accumulation, so
   *  a peer that groups them differently from the author paints a different
   *  picture. The author decides the grouping (using wall-clock timing a peer
   *  must never see) and stamps the answer here and on the operation, so every
   *  receiver reproduces the decision instead of re-taking it.
   *
   *  It has to ride the *live* packet and not only the operation. A peer paints
   *  from this stream while the pen is still down, and by the time the
   *  operation arrives the stream has usually delivered the whole stroke — so
   *  the operation paints nothing and the grouping it carries is never read.
   *  Measured before this field existed: 84.6% of the mark differed between
   *  author and peer, up to 64/255 per channel. */
  washId?: string
  /** (#432) When the author sent this packet, on the *server's* clock (see
   *  lib/serverClock.ts on the web side). Participants' clocks are not in step
   *  with each other, but each can estimate its offset to the server, so a
   *  peer can take "ink on my screen, server time" minus this and get the
   *  send-to-ink path. Absent until the author's clock has synced once. */
  sentAt?: number
  /** (#432) How long the oldest dab in this packet had been under the pen
   *  when it was sent — the last dab's `t` minus the first's. Added to the
   *  send-to-ink path it gives pen-to-ink for the worst dab of the packet. */
  penAgeMs?: number
}

// (#149 epic) Every SNAPSHOT_SEQ_INTERVAL operations (by the room's global,
// server-assigned seq — see Operation.seq), any client that's caught up to
// that point independently bakes and uploads a full-room pixel+layerState
// snapshot; the server just dedups by (roomId, seq), first arrival wins (see
// apps/server/src/rooms.ts's saveSnapshot). Shared so both the client
// (deciding when to bake) and the server (validating an upload actually
// lands on a real boundary) agree on the same points without coordination.
//
// This bounds *operation count*, not bytes — a fine proxy when most ops are
// small, but a room with few, huge strokes (a long fill/scribble — see
// engine/index.ts's STROKE_DAB_CHUNK_LIMIT) can carry tens of MB in far
// fewer than 300 ops, never crossing even one checkpoint and paying full-
// history replay on every join no matter how big it gets (a real, observed
// case: a room's own load hanging for minutes on 25MB of history in just
// 117 ops). Lowered from 300 to 100 so heavy-content rooms hit a checkpoint
// much sooner; still coarse for a genuinely pathological room, which is why
// Room/index.tsx's handleRoomState now also bakes once, retroactively, the
// first time any client fully catches up a room that has never had a
// snapshot at all — see its own comment.
export const SNAPSHOT_SEQ_INTERVAL = 100

// Result of sending one `Operation` to the server (#289 epic — reliable
// history spec v0.2). Replaces the old "ack always receives the stamped
// copy" contract: every operation now gets an explicit verdict, including
// ones previously rejected in total silence (room/participant freeze,
// owner-lock — see isOperationAllowed in rooms.ts, which used to just
// `return` with no ack at all, indistinguishable from a dropped packet).
// `duplicate: true` on an `ok` result means this exact `Operation.id` had
// already been recorded (see rooms.ts's dedup) — the sender's own retry
// raced its earlier attempt's ack, not a new operation.
export type SendResult =
  | { ok: true; seq: number; duplicate?: boolean }
  | { ok: false; reason: RejectReason }

export type RejectReason =
  | 'room_frozen' | 'participant_frozen' | 'layer_owner_locked' | 'not_owner'
  // (#518) The shared lock (`layer_lock`) — distinct from
  // `layer_owner_locked` because it is a different rule, not a different
  // holder of the same one: it stops painting alone (a locked layer can still
  // be renamed, moved, cleared, duplicated and deleted) and it binds the room
  // owner too, so neither the reason nor the wording for it is the owner
  // lock's.
  | 'layer_locked'
  // (#222) The room is closed for editing (Room.closedAt). Distinct from
  // `room_frozen` on purpose, even though both mean "nobody may draw right
  // now": freeze is a live control the owner is holding down during a lesson,
  // closing is a state the lesson is in — different UI, different wording,
  // and only one of them survives a server restart.
  | 'room_closed'
  // (#595, ADR 015 §3) A student's personal board, and the sender is neither
  // that student nor the teacher. Final, like `room_closed`: nothing the
  // sender can wait out.
  | 'board_not_yours'
  // The operation references a layerId/folderId no longer in the room's
  // alive set (deleted or consumed by a merge) — see rooms.ts's aliveIds.
  | 'target_gone'
  // (#298) This socket has not completed create_room/join_room, so the
  // server has no room to record against. Transient — the client simply sent
  // too early — so the client retries rather than discarding the operation
  // (see TRANSIENT_REJECT_REASONS). It exists at all because the server used
  // to `return` with no ack in this case, which is indistinguishable from a
  // dropped packet: the sender waited out its timeout and retried forever.
  // See socketHandlers.ts's 'operation' handler.
  | 'not_joined'
  // (#495) The server threw while recording or relaying this operation and
  // caught it. Not a verdict on the operation — nobody decided anything, the
  // attempt simply did not complete — so this is transient and the work is
  // kept.
  //
  // It exists for the same reason `not_joined` does: that catch used to log
  // and return without acking, which the sender cannot tell from a lost
  // packet. Worse than the wasted round trips was what it hid — the one
  // handler on the hot path deliberately wrapped in try/catch (#164, so a
  // single bad packet cannot take the process down with it) was also the one
  // place a server-side failure could happen with nothing visible anywhere
  // but a log line. See socketHandlers.ts's 'operation' handler.
  | 'server_error'

/** (#495) The reasons that are not verdicts on the operation.
 *
 *  Every other `RejectReason` is the server having decided something about
 *  this operation — frozen, locked, closed, target gone — and deciding it
 *  again would give the same answer, so the sender drops the work. These two
 *  decided nothing: the attempt did not complete. Retrying is the only
 *  correct response, and discarding a stroke over one would be losing a
 *  user's drawing to a condition that had nothing to do with it.
 *
 *  Lives in the contract rather than in the sender because it *is* the
 *  contract: whether a rejection is final is a property of the reason, and
 *  the alternative — a client-side list of special cases — is how the next
 *  transient reason gets silently treated as final. See Outbox.runAttempt. */
export const TRANSIENT_REJECT_REASONS = ['not_joined', 'server_error'] as const

export function isTransientReject(reason: RejectReason): boolean {
  return (TRANSIENT_REJECT_REASONS as readonly RejectReason[]).includes(reason)
}

export type ServerToClientEvents = {
  // `latestSnapshotSeq` is null until anyone has stored a snapshot for this
  // room (short rooms) — `tailOperations` is then simply the room's entire
  // history, same shape/behavior as before the #149 epic. Once non-null the
  // caller is expected to fetch the stored snapshots itself
  // (GET /api/rooms/:id/snapshots/index, then one blob per layer — #427); the
  // seq is the structure's own, and is what a history backfill anchors on.
  //
  // (#372) What `tailOperations` leaves out is decided per layer, against each
  // layer's own stored coverage, not by one room-wide seq. A room-wide floor
  // is what lost drawing in #369: a layer missing from a snapshot had no
  // pixels *and* was refused the operations that would have rebuilt it.
  //
  // Only *pure* pixel operations are ever omitted (stroke/image_import/
  // layer_clear on a layer covered at or past their seq) — the heavy ones,
  // where all the saving is. Operations carrying pixels *and* something else
  // — `layer_merge` (also structure) and `layer_transform` (several layers at
  // once) — always arrive, because the client needs their other half, and it
  // skips their pixel effect itself against the coverage it actually restored
  // (#374). That coverage travels with the snapshots themselves, per layer, so
  // nothing about it needs saying here: deciding it from what this client
  // really has is what makes a snapshot landing mid-join harmless rather than
  // a double-paint.
  room_state: (state: {
    room: Room; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
    palette: string[]
    // (#254/#255 epic) Room-wide freeze, live in-memory only (never
    // persisted — see rooms.ts's RoomRecord.roomFrozen) — included in the
    // join/reconnect snapshot so a reconnecting client sees the current
    // status immediately, same reasoning as `participants`/`palette` above.
    frozen: boolean
    // (#176, ADR 014) The lesson this board is a page of, its board strip and
    // the teacher's current board. `participants` above are the *lesson's*,
    // each carrying the board they are on. A client that receives this for a
    // board id it reached by URL learns the lesson id here and redirects.
    lesson: LessonState
  }) => void
  // The single channel that drives painting into every client's confirmed
  // buffer — including the author's own (unlike the old `peer_operation`,
  // which `socket.to()` deliberately excluded the sender from). Broadcast
  // via `io.to(roomId)`, one emit per accepted operation, in the exact
  // order the server accepted them — WebSocket/TCP guarantees a single
  // connection never reorders its own message stream, so this is already a
  // strictly seq-ordered feed with no separate reorder buffer needed on the
  // client (reliable history spec v0.2, §11). `seq` is carried at the top
  // level (not just inside `operation`, where it's optional until stamped)
  // so logging/replay/gap-detection never has to reach into the union.
  operation_confirmed: (msg: { seq: number; operation: Operation }) => void
  // (#429) A peer's in-progress stroke, relayed as it is drawn — see
  // StrokeLiveData. Sent via `socket.to`, not `io.to`: unlike
  // operation_confirmed, the author gains nothing from receiving their own
  // (their own ink is already on their own layer, painted at pen time).
  peer_stroke_live: (data: StrokeLiveData & { userId: string }) => void
  peer_stroke_live_end: (data: { userId: string; strokeId: string }) => void
  peer_cursor: (data: CursorMoveData & { userId: string }) => void
  peer_joined: (participant: Participant) => void
  peer_left: (userId: string) => void
  // Broadcast to every participant (including the one who triggered it) after
  // palette_add_color/palette_remove_color is accepted — see
  // DEFAULT_PALETTE_COLORS' doc comment in room.ts for why this isn't an
  // Operation. Always the full current list, not a delta: this is a handful
  // of hex strings, not worth reconciling incrementally.
  palette_updated: (data: { palette: string[] }) => void
  // (#254/#256 epic) Broadcast to the whole room (including the owner who
  // triggered it, same `io.to` reasoning as palette_updated above) whenever
  // `set_room_frozen` is accepted.
  room_frozen_changed: (data: { frozen: boolean }) => void
  // (#548) Broadcast to the whole room after `set_room_tools` is accepted —
  // `io.to`, like the two events above, because the owner who made the change
  // is also a person holding a tool that may have just been taken away.
  //
  // It has to be live rather than something a client learns on its next join:
  // the toolset is a teaching control ("today we work in pencil"), and a
  // control that lands only after everyone reloads is one nobody will reach
  // for mid-lesson. `undefined` is the unrestricted room, same as on `Room`.
  room_tools_changed: (data: { enabledTools?: ToggleableTool[] }) => void
  // (#254/#257 epic) Broadcast to the whole room whenever `set_participant_frozen`
  // is accepted — every participant needs this, not just the target, so
  // ParticipantsPanel can show the frozen indicator for everyone else too.
  participant_frozen_changed: (data: { userId: string; frozen: boolean }) => void
  // (#222) Broadcast to everyone in the room when its closed-for-editing
  // state is toggled. The toggle itself is REST, not a socket event (see
  // roomRoutes.ts): it is owner-only, persisted, and reachable from the
  // lesson list where there is no socket for that room at all. This event
  // exists so people already *inside* the room find out at the moment it
  // happens rather than on the rejection of their next stroke.
  // ISO timestamp while closed, null once reopened — the same shape the
  // wire `Room.closedAt` carries.
  room_closed_changed: (data: { closedAt: string | null }) => void
  // (#227) The three live halves of access control. Everything durable about
  // it is REST (#226) and every decision is re-made from Postgres on the next
  // join (#225) — these exist so nobody has to reload a page to find out
  // something already happened to them.
  //
  // Unlike every event above, these are addressed to a *person*, not to a
  // room: the owner may be looking at their lesson list rather than sitting in
  // the room, and someone waiting for approval was refused entry and is in no
  // socket.io room at all. Each socket therefore also joins a channel of its
  // own userId (see socketHandlers.ts's userChannel), and these are emitted
  // there — which also means every tab that person has open hears it.

  // Sent to the room's owner when someone asks to be let in. Carries the
  // request itself so the panel can render the new row without refetching;
  // `roomId` because an owner with several lessons open needs to know which.
  join_request_created: (data: { roomId: string; request: RoomJoinRequest }) => void
  // Sent when a request is decided — including when the decision was made
  // implicitly, by inviting the address they were queued under. On `approved`
  // the client finishes the join it was refused (it re-emits `join_room`); the
  // server holds nothing open in the meantime, so a client that missed this
  // event while offline simply gets in on its next attempt.
  //
  // (#387) Two audiences, one payload: the asker, whose join screen resolves
  // itself, and the *owner*, whose waiting queue (#380) has to lose the row.
  // The owner needs it because the decision is not always theirs to observe
  // locally — answering from the lesson list, or from a second device, leaves
  // the room's queue showing someone who is already in. `requestId` is what
  // makes that removal exact: without it the receiver knows a request was
  // answered but not which, and can only re-read the whole queue.
  join_request_resolved: (data: { roomId: string; requestId: string; approved: boolean }) => void
  // Sent to someone being removed from a room they are currently in, right
  // before the server takes them out of it. Not a disconnect: their connection
  // stays up so the client can navigate away (and keep working elsewhere)
  // rather than reconnect into a room it is no longer in.
  kicked: (data: { roomId: string }) => void

  // (#176, ADR 014) Boards. Every event below is *social* and travels on the
  // lesson channel, so everyone in the lesson hears it whichever board they
  // are on — same as `peer_joined`/`peer_left`, freeze, tools, closed and
  // palette, which moved to that channel with this epic. Content events
  // (`operation_confirmed`, `peer_stroke_*`, `peer_cursor`) stay on the
  // board's own channel and reach only the sockets on that board.

  // Someone in the lesson moved to another board (a `join_room` on their live
  // socket). Sent to everyone else in the lesson; the mover already knows.
  peer_board_changed: (data: { userId: string; boardId: string }) => void
  // The owner moved (`set_active_board`) — or the active board was deleted,
  // in which case `boardId` is null and means the lesson's own first board.
  // A following student switches on this; the owner never follows.
  active_board_changed: (data: { boardId: string | null }) => void
  // Board CRUD, each the live half of one boardRoutes.ts call. Sent to the
  // whole lesson, the owner who made the change included — they need the same
  // list everyone else ends up with.
  board_created: (data: { board: BoardSummary }) => void
  board_renamed: (data: { boardId: string; name: string }) => void
  // The full strip order, lesson first, not a delta: a handful of ids.
  boards_reordered: (data: { order: string[] }) => void
  // Hard delete, content and all. A socket that was on it has already been
  // moved to the lesson's own board by the server and handed a fresh
  // `room_state` for it before this arrives; the client is free to `join_room`
  // whichever board it would rather be on.
  board_deleted: (data: { boardId: string }) => void

  // (#595, ADR 015 §4) Class mode.

  // The lesson half of `room_state`, alone, rebuilt for this recipient. Sent
  // to each socket in the lesson whenever *which boards it may see* can have
  // changed: an assignment started or ended, the spotlight moved, the
  // visibility setting changed, a latecomer's board was made. Authoritative —
  // replaces the client's strip, assignments, spotlight and visibility.
  lesson_state: (data: { lesson: LessonState }) => void
  // A hand went up or down. On the lesson channel: a raised hand is not
  // private, the class sees it just as it would in a room.
  participant_hand_changed: (data: { userId: string; raised: boolean }) => void
  // A board's preview was re-uploaded. Only to the sockets that may see the
  // board (a student's work is not announced to classmates under
  // `teacher_only`). Before this the strip only ever had the pictures that
  // existed when the lesson was opened.
  board_thumbnail_updated: (data: { boardId: string; updatedAt: string }) => void
}

/** (#595) `assignment_start`'s answer. `busy`: another one is still being
 *  created — a double tap, answered once. */
export type AssignmentStartResult =
  | { ok: true; assignment: AssignmentSummary }
  | { ok: false; error: 'not_owner' | 'busy' | 'server_error' }

export type ClientToServerEvents = {
  /** Registers a new room and joins the calling socket as its `owner` —
   *  the room's `ownerId` is fixed to this socket's connection, deterministic
   *  regardless of when other participants subsequently call `join_room`. */
  create_room: (
    data: {
      room: Pick<Room, 'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight' | 'enabledTools' | 'classVisibility'>
      password?: string
      // (#232) Who may enter, decided at creation rather than only afterwards
      // through the access panel. Omitted means `anyone_with_link`, which is
      // what every room did before this existed.
      //
      // Carried here, on the creation itself, and not applied afterwards over
      // REST: a room that exists open for the moment it takes a second
      // request to land is a room whose link is briefly worth more than its
      // owner intended. The *invites* do go over REST after this (see
      // Room/index.tsx) — they need the normalization and dedup that
      // roomAccessRoutes.ts already owns, and their failure mode is the safe
      // one: an invite-only room with an empty list admits nobody but the
      // owner, rather than admitting everybody.
      accessMode?: RoomAccessMode
      // (#328) The creator's own display name, same field `join_room` has
      // always carried. Before this the server labelled every room owner
      // "Teacher" because this payload had nowhere to put a name — which then
      // showed up verbatim in the participants list, next to everyone else's
      // real name, and flipped to their actual name the moment they reloaded
      // (a reload rejoins through `join_room`, which does carry one).
      name: string
      // Highest operation seq this socket already knows about locally (a
      // reconnecting creator whose tab never really lost its content) — lets
      // the server trim `room_state`'s tailOperations instead of resending
      // everything. Omitted (or 0) means "I have nothing," same as before.
      lastKnownSeq?: number
    },
    ack: (result: JoinResult) => void,
  ) => void
  join_room: (
    data: { roomId: string; password?: string; name: string; lastKnownSeq?: number },
    ack: (result: JoinResult) => void,
  ) => void
  // `ack`, when provided, receives an explicit `SendResult` — accepted
  // (with the real, authoritative `seq`) or rejected (with a reason), never
  // silence. This is bookkeeping only (outbox retry/rollback decisions,
  // local "pending" UI) — it is never what paints an operation into the
  // confirmed buffer; that's `operation_confirmed` alone, which now reaches
  // the author too (reliable history spec v0.2, §7/§9).
  operation: (op: Operation, ack?: (result: SendResult) => void) => void
  // (#429) One packet of the stroke currently under the pen — see
  // StrokeLiveData. No ack: this is not a record, and there is nothing the
  // sender would do differently on a failure. The gesture's real operation
  // follows through `operation` above.
  stroke_live: (data: StrokeLiveData) => void
  // (#432) One round of clock estimation: the server answers with its own
  // Date.now(). The client times the round trip and keeps the fastest of a
  // few, so its offset to the server is known to within half of that.
  clock_sync: (ack: (serverNow: number) => void) => void
  // (#429) The pen came up (or the gesture was abandoned). Lets peers close
  // their bookkeeping for this gesture immediately, rather than inferring the
  // end from the committed operation — which can arrive later, and which a
  // frozen/rejected author may never send at all.
  stroke_live_end: (data: { strokeId: string }) => void
  cursor_move: (data: CursorMoveData) => void
  // Appends one hex color to the room's palette (see DEFAULT_PALETTE_COLORS'
  // doc comment in room.ts). Server dedups and broadcasts the result via
  // palette_updated.
  palette_add_color: (data: { color: string }) => void
  // Removes one hex color from the room's palette. A no-op (still broadcasts
  // the unchanged palette) if the color isn't present.
  palette_remove_color: (data: { color: string }) => void
  // (#254/#256 epic) Owner-only — server verifies `role` itself via
  // getParticipant, never trusts the client (same pattern as
  // `operation_revoke`'s existing role check in socketHandlers.ts). Freezes
  // (or unfreezes) every non-owner participant's operations at once.
  set_room_frozen: (frozen: boolean) => void
  // (#548) Owner-only, same role check as `set_room_frozen`. The payload is
  // whatever the picker had checked; the server runs it through
  // `sanitizeEnabledTools` and broadcasts the result, so what every client
  // ends up holding is the normalized list, never one client's raw claim.
  set_room_tools: (enabledTools: ToggleableTool[] | undefined) => void
  // (#254/#257 epic) Owner-only, same role-check pattern as `set_room_frozen`.
  // Targets one participant without touching the room-wide freeze — the two
  // are independent and can both be active at once. A no-op if `userId` is
  // the room's own owner (see rooms.ts's setParticipantFrozen).
  set_participant_frozen: (data: { userId: string; frozen: boolean }) => void
  // (#176, ADR 014) Owner-only, same role check as `set_room_frozen`. Names
  // the board the teacher is on; the lesson's own id (or null) means its
  // first board. Persisted on the lesson row, so a join or a reload lands on
  // the teacher's board, and broadcast as `active_board_changed`. Ignored for
  // an id that is not a board of this lesson.
  set_active_board: (data: { boardId: string | null }) => void

  // (#595, ADR 015 §4) Class mode. All but `set_hand_raised` are
  // teacher-only (the lesson's owner), checked server-side like every owner
  // control.

  // A new assignment: a blank personal board for every student in the lesson
  // right now, and the class sent there. `name` titles it in the list; the
  // client sends a localised default.
  assignment_start: (data: { name: string }, ack: (result: AssignmentStartResult) => void) => void
  // (ADR 015 §11) Where the class is: an assignment of this lesson — every
  // student to their own board in it, one made for anyone who has none — or
  // null, "Все ко мне", everyone to the teacher's board. Clears the spotlight.
  set_class_location: (data: { assignmentId: string | null }) => void
  // Shows one student's personal board to the whole class, or (null) stops
  // showing it. Any assignment's, wherever the class is.
  set_spotlight: (data: { boardId: string | null }) => void
  // A student's own hand; the teacher may lower (or raise) anyone's by
  // naming them. Ignored for anyone else naming someone else.
  set_hand_raised: (data: { raised: boolean; userId?: string }) => void
  set_class_visibility: (data: { value: ClassVisibility }) => void
}
