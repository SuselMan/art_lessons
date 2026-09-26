import type { Server, DefaultEventsMap } from 'socket.io'
import type { FastifyBaseLogger } from 'fastify'
import type { ClientToServerEvents, Operation, ServerToClientEvents } from '@grafetto/shared'
import { isClassVisibility, isRoomAccessMode, sanitizeEnabledTools, SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'

import {
  abortAssignmentStart, beginAssignmentStart, canSeeLessonBoard, canSeeResidentBoard, getClassroom, getLessonStateFor,
  noteAssignmentStarted, noteBoardCreated, personalBoardIn, setActiveBoard, setClassLocation, setClassVisibility,
  setHandRaised, setSpotlight,
} from './classroom.js'
import {
  addPaletteColor, createRoom, evictIdleRooms, getParticipant, getRoomBacklog, getRoomGate, getRoomSnapshot,
  isRoomResident, joinRoom, leaveRoom, releaseRoomIfUnused, removePaletteColor,
} from './rooms.js'
import { findDuplicateOperation, getOperationRejectReason, recordOperation, updateAliveIds } from './operationLog.js'
import { ensureRoomLoaded } from './roomLoader.js'
import {
  releaseLockOnUndo, setLayerLocked, setLayerOwnerLocked, setParticipantFrozen, setRoomFrozen, setRoomTools,
} from './ownerControls.js'
import { createAssignment, createPersonalBoard } from './classMode.js'
import { checkJoinAccess } from './roomAccess.js'
import { resolveSocketIdentity } from './identity.js'
import { isBanned, isIpBanned } from './bans.js'
import { handshakeIp, recordSighting } from './sessions.js'
import { pressureOf, readMemory } from './memory.js'
import { describeClient } from './clientDescription.js'
import { createSnapshotLagWatch } from './snapshotLagWatch.js'
import { reportException, reportIssue } from './instrument.js'

/** Per-connection state. `userId` is resolved once, in the `io.use()`
 *  middleware below, from the same identity cookie (#41) that HTTP routes
 *  use — never re-derived per event, and never trusted from a client-
 *  supplied Operation's own `userId` field for authorization (role checks
 *  below always go through `getParticipant`, keyed by this). */
export interface SocketData {
  // (#176) The *board* this socket draws on — its content channel. For a
  // lesson with one board it is the lesson id.
  roomId?: string
  // (#176) The lesson the socket is in — its social channel (see
  // lessonChannel). Set with `roomId` and outlives board switches.
  lessonId?: string
  userId?: string
  // (#590) The handshake's client address, so an IP ban can close the sockets
  // already open from it (adminRoutes.ts).
  ip?: string
}

/** (#328) Last resort when a client sends a blank display name. The client
 *  always has something to send (an account name, or a per-device "Guest-XXXX"
 *  — see the web app's `resolveDisplayName`), so this is a guard against a
 *  malformed payload, not a name anyone should normally see. */
const FALLBACK_PARTICIPANT_NAME = 'Guest'

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>

/** (#415, трек #314 §1) Пускать ли ещё одну холодную загрузку комнаты в кучу.
 *
 *  Возвращает `true` во всех случаях кроме одного: куча выше
 *  `MEMORY_ADMIT_PCT`, комната не резидентна, и освободить оказалось нечего.
 *  Тогда — отказ, и это дешевле любой альтернативы: `ensureRoomLoaded` для
 *  комнаты без снапшотного покрытия тянет её историю целиком, то есть ровно та
 *  аллокация, на которой процесс падает вместе со всеми идущими уроками.
 *
 *  Три решения, каждое из которых легко принять неправильно:
 *
 *  **Резидентная комната не проверяется.** Урок уже идёт, его страницы уже в
 *  куче, и вернувшийся после обрыва планшет не добавляет к ней ничего. Гейт
 *  здесь означал бы выгонять с урока за чужую нагрузку.
 *
 *  **Сначала вытеснение, отказ — только если оно ничего не дало.** Резидентная
 *  комната без участников не нужна никому по определению, и отдать её раньше,
 *  чем отказать живому человеку, — единственный правильный порядок.
 *
 *  **После удачного вытеснения пускаем, не перечитывая кучу.** Перечитали бы —
 *  отказали бы всё равно: `used_heap_size` падает не в момент, когда ссылки
 *  отпущены, а когда до них дойдёт сборщик, и «освободил и всё равно отказал»
 *  было бы поведением, которое не чинится ничем. */
function admitRoomLoad(roomId: string, log: FastifyBaseLogger): boolean {
  if (isRoomResident(roomId)) return true
  const before = readMemory()
  if (pressureOf(before) !== 'critical') return true

  const released = evictIdleRooms()
  log.warn({ roomId, released, heapUsedPct: before.heapUsedPct, heapUsedMb: before.heapUsedMb },
    released > 0
      ? 'memory critical on cold room load — released idle rooms'
      : 'memory critical on cold room load — nothing to release')
  return released > 0
}

/** (#227) The socket.io room every connection joins for its own user id, so
 *  access-control events can be addressed to a *person* rather than to a room
 *  — the owner may be on the lesson list, and someone waiting for approval was
 *  refused and is in no room at all. Prefixed so it can never collide with a
 *  real room id (those are nanoids/uuids, never containing a colon).
 *
 *  One channel, every tab: someone with the lesson open on a tablet and the
 *  list open on a laptop is one person, and both should learn they were let
 *  in. */
export function userChannel(userId: string): string {
  return `user:${userId}`
}

/** (#176, ADR 014 §3) The socket.io room everyone in a lesson is in, whatever
 *  board they are on — where the *social* events go: presence, freeze, tools,
 *  closed, palette, the board strip. Content events (`operation_confirmed`,
 *  live strokes, cursors) stay on the board's own channel, which is the raw
 *  board id exactly as before boards existed.
 *
 *  Prefixed, like `userChannel`, and for a sharper reason than collision
 *  avoidance: a lesson's own first board *is* the lesson, so its content
 *  channel is the lesson id itself. Sending social events to that raw id
 *  would reach only the people on board one; sending content there under the
 *  lesson's name would paint board one's strokes onto every other board. The
 *  two channels have to be different strings. */
export function lessonChannel(lessonId: string): string {
  return `lesson:${lessonId}`
}

/** (#227) Removes someone from a room they are currently sitting in, as the
 *  live half of `POST /api/rooms/:id/kick` (#226). The durable half — the
 *  `RoomBlock` row — is what actually keeps them out; this is what makes it
 *  happen now rather than at their next reconnect.
 *
 *  Deliberately `leave`, not `disconnect`: the block is scoped to one room,
 *  and their connection is also how they see their lesson list, sign in, or
 *  open something else. Dropping the whole socket would also have them
 *  reconnect automatically and re-attempt the room they were just removed
 *  from, which is a reconnect loop rather than a removal.
 *
 *  A no-op for someone who isn't connected, or is connected but somewhere
 *  else. */
export async function removeUserFromRoom(io: AppServer, lessonId: string, userId: string): Promise<void> {
  for (const socket of await io.in(userChannel(userId)).fetchSockets()) {
    // (#176) A kick is from the lesson, whichever board they are on: the
    // block is written under the lesson and the gate reads it for every board.
    if (socket.data.lessonId !== lessonId) continue
    const boardId = socket.data.roomId ?? lessonId

    // Told before being moved, so the client can react to a room it is still
    // nominally in rather than to having silently stopped receiving anything.
    socket.emit('kicked', { roomId: lessonId })
    void socket.leave(boardId)
    void socket.leave(lessonChannel(lessonId))
    socket.data.roomId = undefined
    socket.data.lessonId = undefined

    // Same bookkeeping a disconnect does — without it the room keeps a
    // participant nobody can remove, and never reaches the empty state that
    // lets it be evicted.
    if (leaveRoom(boardId, userId, socket.id)) io.to(lessonChannel(lessonId)).emit('peer_left', userId)
  }
}

/** (#176) Moves every socket on `boardId` back onto the lesson's own first
 *  board — the live half of `DELETE /api/rooms/:id/boards/:boardId`, run
 *  before the record is forgotten (see rooms.ts's noteBoardDeleted).
 *
 *  Each socket gets the full treatment a `join_room` would give it: seated on
 *  the lesson's board, channels swapped, a fresh `room_state` so the client is
 *  looking at real content rather than a board that no longer exists, and the
 *  lesson told where they went. The `board_deleted` broadcast follows from the
 *  route; a client that would rather be on the teacher's board than the first
 *  one is free to `join_room` there when it arrives. Not disconnecting, for
 *  the same reason `removeUserFromRoom` doesn't: the connection is also their
 *  seat in the lesson. */
export async function evacuateBoard(io: AppServer, lessonId: string, boardId: string): Promise<void> {
  if (boardId === lessonId) return
  for (const socket of await io.in(boardId).fetchSockets()) {
    const userId = socket.data.userId
    if (!userId || socket.data.roomId !== boardId) continue

    const name = getParticipant(lessonId, userId)?.name ?? FALLBACK_PARTICIPANT_NAME
    const result = joinRoom(lessonId, userId, name, socket.id)
    void socket.leave(boardId)
    socket.data.roomId = lessonId
    if (!result.ok) continue
    socket.join(lessonId)
    const snapshot = getRoomSnapshot(lessonId, undefined, userId)
    if (snapshot) socket.emit('room_state', snapshot)
    io.to(lessonChannel(lessonId)).except(socket.id).emit('peer_board_changed', { userId, boardId: lessonId })
  }
}

/** (#595, ADR 015 §4) Hands every socket in the lesson its own, freshly
 *  built `lesson_state`. The one way the *set of boards someone may see* is
 *  updated live — a round handed out or ended, the spotlight moved, the
 *  visibility setting flipped, a latecomer's board made — because that set is
 *  different for every recipient, and a broadcast delta would either leak a
 *  classmate's board or need a filter per event anyway. A class is tens of
 *  sockets and these events are rare, so rebuilding is the cheap option. */
export async function sendLessonState(io: AppServer, lessonId: string): Promise<void> {
  for (const socket of await io.in(lessonChannel(lessonId)).fetchSockets()) {
    const userId = socket.data.userId
    if (!userId) continue
    const lesson = getLessonStateFor(lessonId, userId)
    if (lesson) socket.emit('lesson_state', { lesson })
  }
}

/** (#595) Sends `board_thumbnail_updated` to the sockets in the lesson that
 *  may see the board — see lessons.ts's canSeeBoard. Everything about a
 *  personal board that is not for the whole class goes this way. */
export async function announceBoardThumbnail(
  io: AppServer, lessonId: string, boardId: string, updatedAt: string,
): Promise<void> {
  for (const socket of await io.in(lessonChannel(lessonId)).fetchSockets()) {
    const userId = socket.data.userId
    if (userId && canSeeLessonBoard(lessonId, boardId, userId)) socket.emit('board_thumbnail_updated', { boardId, updatedAt })
  }
}

/** (#595) Personal boards being written right now, by `assignmentId:userId`,
 *  so one student opening two tabs mid-round makes one request, not two. The
 *  unique constraint would catch the second either way; this keeps it from
 *  having to. */
const personalBoardsInFlight = new Set<string>()

export function registerRoomHandlers(io: AppServer, log: FastifyBaseLogger): void {
  // (#480) Один на процесс, как и io: состояние в нём — «о чём по этой
  // комнате уже отчитались», и оно должно переживать отдельное соединение.
  const lagWatch = createSnapshotLagWatch()

  /** Every student present gets a board in the assignment the class is on,
   *  if they have none yet — see givePersonalBoard. */
  const giveMissingBoards = (lessonId: string) => {
    for (const student of getClassroom(lessonId)?.students ?? []) {
      void givePersonalBoard(lessonId, student).catch(err => {
        log.error({ err, lessonId, userId: student.userId }, 'failed to create a missing personal board')
        reportException(err, { lessonId, userId: student.userId })
      })
    }
  }

  /** (#595, ADR 015 §4, §11) A student in the lesson while the class is on an
   *  assignment, with no board in it yet — a latecomer, or someone absent when
   *  it was handed out — gets one, and everyone who may see it is told. A
   *  no-op for anyone who already has theirs — which is every reconnect and
   *  every page turn. Nobody gets a board they are not present for: an absent
   *  student is not an empty tile. */
  const givePersonalBoard = async (lessonId: string, student: { userId: string; name: string }) => {
    const classroom = getClassroom(lessonId)
    const assignmentId = classroom?.activeAssignmentId
    if (!classroom || !assignmentId || student.userId === classroom.ownerId) return
    if (personalBoardIn(lessonId, assignmentId, student.userId)) return
    const key = `${assignmentId}:${student.userId}`
    if (personalBoardsInFlight.has(key)) return
    personalBoardsInFlight.add(key)
    try {
      const board = await createPersonalBoard(lessonId, assignmentId, student)
      // The round may have ended while the row was being written; the board
      // is theirs either way and is recorded, but nobody is sent to it.
      noteBoardCreated(lessonId, board)
      await sendLessonState(io, lessonId)
      log.info({ lessonId, assignmentId, userId: student.userId, boardId: board.id }, 'personal board created for a latecomer')
    } finally {
      personalBoardsInFlight.delete(key)
    }
  }

  /** (#480) Растёт ли в комнате хвост, не покрытый снапшотами. Вызывается на
   *  границе выпечки, а не по таймеру: во-первых, здесь вообще нет
   *  периодических задач (`evictIdleRooms` тоже висит на событии), во-вторых,
   *  ровно в этот момент число и могло перевалить порог. Сто операций между
   *  проверками — это единицы раз в минуту на идущем уроке. */
  const checkSnapshotLag = (roomId: string) => {
    const backlog = getRoomBacklog(roomId)
    if (!backlog) return
    const lagging = lagWatch.observe(backlog)
    if (!lagging) return
    log.warn(lagging, 'snapshot backlog growing — nobody is baking for this room')
    reportIssue('snapshot backlog growing', lagging)
  }

  // Runs once per connection, before 'connection' fires, so every handler
  // below can assume socket.data.userId is already set. Reads the same
  // cookie identityHook/authRoutes use (see resolveSocketIdentity's doc
  // comment for the one edge case: a socket connecting before the client's
  // warm-up `GET /api/me` ever ran).
  io.use((socket, next) => {
    // (#590) Before resolving anyone, for the reason identityHook gives: an
    // address ban is aimed at whoever arrives without a cookie.
    const ip = handshakeIp(socket.handshake.headers, socket.handshake.address)
    if (isIpBanned(ip)) return next(new Error('banned'))
    resolveSocketIdentity(socket.handshake.headers.cookie)
      .then(({ userId, deviceId }) => {
        // (#587) Same refusal identityHook gives over HTTP. A socket that is
        // already connected when the ban lands is closed by the admin route
        // (adminRoutes.ts); this is the door for the reconnect after it.
        if (isBanned(userId)) return next(new Error('banned'))
        socket.data.userId = userId
        socket.data.ip = ip
        recordSighting({ userId, deviceId, ip, userAgent: socket.handshake.headers['user-agent'] })
        next()
      })
      .catch(next)
  })

  io.on('connection', (socket) => {
    // (#480) Устройство здесь же, рядом с userId — см. clientDescription.ts:
    // до этого связать одно с другим можно было только склейкой с nginx по
    // времени хендшейка.
    const client = describeClient(socket.handshake.headers['user-agent'])
    log.info(
      { socketId: socket.id, userId: socket.data.userId, ...client, transport: socket.conn.transport.name },
      'socket connected',
    )

    // (#227) Before any handler runs: this connection is reachable by who it
    // belongs to, not only by which room it later joins. Everything
    // access-control has to tell one person travels this way.
    socket.join(userChannel(socket.data.userId!))

    // Registers a brand-new room and seats the caller as its `owner` (#39
    // fix: ownership is now fixed at creation time, not "whoever joins
    // first"). (#328) The payload now carries the creator's own display name,
    // same as `join_room` — it used to not, and the owner was labelled
    // "Teacher" here as a result.
    socket.on('create_room', async ({ room, password, name, accessMode, lastKnownSeq }, ack) => {
      const userId = socket.data.userId!
      // Same reload-safety as join_room below: the creator's own tab can
      // legitimately emit create_room again for a room that already exists
      // (browsers keep history.state across a reload — see createRoom's doc
      // comment on rooms.ts), so this needs the same cold-load-from-Postgres
      // chance to recognize that before createRoom decides whether it's
      // actually new.
      //
      // (#415) И тот же гейт по памяти, что у `join_room`: путь именно этот —
      // холодная загрузка существующей комнаты, — так что «создание» здесь
      // способно стоить ровно столько же, сколько вход. Новую комнату гейт
      // тоже может отвести, и это правильнее, чем завести урок в процессе,
      // который до его середины не доживёт.
      if (!admitRoomLoad(room.id, log)) {
        log.warn({ socketId: socket.id, roomId: room.id, userId }, 'create_room refused — server busy')
        ack({ ok: false, error: 'server_busy' })
        return
      }
      await ensureRoomLoaded(room.id)
      // No one else is in the room yet, so there's no peer_joined broadcast
      // to make — unlike join_room below, the returned participant is unused.
      // Same defensive trim/fallback `join_room` gets from the gate's own
      // validation — a socket is not a form, and an empty label would leave a
      // nameless row in every participants list in the room.
      // (#232) Checked rather than trusted: the wire type is a compile-time
      // promise about a payload we don't compile. A bogus mode would reach a
      // Postgres enum that cannot hold it, and since the room row is written
      // fire-and-forget (rooms.ts), the room would end up live in memory with
      // nothing behind it. Anything unrecognised — including absent — is the
      // open room this has always created.
      createRoom(
        // (#548) Sanitized on the way in for the same reason `accessMode` is
        // checked: a socket payload is not compiled by us, and this list is
        // written into the row fire-and-forget. `sanitizeEnabledTools` drops
        // ids it doesn't know and refuses a set with no drawing tool left,
        // so what lands is always a toolset a room can be used with.
        { ...room, enabledTools: sanitizeEnabledTools(room.enabledTools) },
        password, userId, name?.trim() || FALLBACK_PARTICIPANT_NAME, socket.id,
        isRoomAccessMode(accessMode) ? accessMode : 'anyone_with_link',
      )
      socket.data.roomId = room.id
      socket.data.lessonId = room.id

      // Same ordering guarantee as join_room below (#36): join the Socket.IO
      // room and emit the snapshot synchronously, before yielding back to the
      // event loop, so nothing else can interleave between them.
      socket.join(room.id)
      socket.join(lessonChannel(room.id))
      const snapshot = getRoomSnapshot(room.id, lastKnownSeq, userId)
      if (snapshot) socket.emit('room_state', snapshot)

      log.info({ socketId: socket.id, roomId: room.id, userId }, 'socket created room')
      ack({ ok: true, userId })
    })

    socket.on('join_room', async ({ roomId, name, password, lastKnownSeq }, ack) => {
      const userId = socket.data.userId!
      // (#415) Единственная проверка, стоящая *перед* загрузкой, а не после:
      // всё остальное решает, можно ли этому человеку в эту комнату, а это —
      // выдержит ли коробка саму загрузку. Порядок обязателен, гейт после
      // `ensureRoomLoaded` уже оплатил бы аллокацию, от которой защищает.
      if (!admitRoomLoad(roomId, log)) {
        log.warn({ socketId: socket.id, roomId, userId }, 'join_room refused — server busy')
        ack({ ok: false, error: 'server_busy' })
        return
      }
      // Repopulates the in-memory room from Postgres (#74) if this is the
      // first time this process has touched it this session — a cold server
      // start, or the room went idle and was evicted (see leaveRoom). A
      // no-op, synchronously fast, when the room's already live.
      await ensureRoomLoaded(roomId)

      const displayName = name?.trim() || FALLBACK_PARTICIPANT_NAME

      // (#225) Access is decided here and only here — blocks, password,
      // access mode, waiting queue. `joinRoom` below does the seating and
      // trusts this completely, so nothing may seat a participant without
      // having come through it first. The `await` sits before `socket.join`
      // and the snapshot emit, leaving #36's ordering guarantee (those two
      // happen with no yield between them) exactly as it was.
      const access = await checkJoinAccess(roomId, userId, displayName, password)
      if (!access.ok) {
        // (#227) Someone just joined the queue — tell the owner, wherever they
        // are, before releasing the room. Emitted to their own channel rather
        // than into the room: an owner deciding who gets into a lesson is
        // usually looking at the lesson, not drawing in it.
        // (#176) Addressed by the lesson: the request row was written under
        // it, and the owner's queue is per lesson, not per board.
        const gate = getRoomGate(roomId)
        if (access.queued && gate) {
          io.to(userChannel(gate.ownerId)).emit('join_request_created', { roomId: gate.lessonId, request: access.queued })
        }
        // (#292) The load above just pulled this room into memory, and a
        // rejected join means nobody is in it — without this it would sit
        // there, fully populated, until the process restarted. No-op if
        // anyone else is actually present.
        releaseRoomIfUnused(roomId)
        log.info({ socketId: socket.id, roomId, userId, error: access.error }, 'join_room refused')
        // Only the reason travels back, never `queued`: it is the server's own
        // bookkeeping, and the asker learns their fate through
        // `join_request_resolved`, not through the refusal.
        ack({ ok: false, error: access.error })
        return
      }

      // (#595, ADR 015 §3) Being let into the lesson is not being let onto
      // every board of it: a classmate's personal board is theirs and the
      // teacher's unless the lesson shows work to the class. After the lesson
      // gate, so the answer is only ever given to someone who is in.
      if (!canSeeResidentBoard(roomId, userId)) {
        releaseRoomIfUnused(roomId)
        log.info({ socketId: socket.id, roomId, userId }, 'join_room refused — personal board not visible')
        ack({ ok: false, error: 'board_not_visible' })
        return
      }

      const result = joinRoom(roomId, userId, displayName, socket.id)
      if (!result.ok) {
        releaseRoomIfUnused(roomId)
        log.info({ socketId: socket.id, roomId, error: result.error }, 'join_room rejected')
        ack(result)
        return
      }

      const { lessonId } = result
      const previousRoomId = socket.data.roomId
      const previousLessonId = socket.data.lessonId

      // (#292) A socket that joins a second room must leave the first, or
      // the first keeps a participant nobody can ever remove: `disconnect`
      // below reads this single field, so it would only ever leave the last
      // room joined, and the earlier one could never reach zero
      // participants — the sole condition under which a room is evicted.
      //
      // (#176) "Second room" means second *lesson*. A `join_room` for another
      // board of the same lesson is a page turn, not a departure: `joinRoom`
      // above already moved the seat, and the only thing to leave is the old
      // board's content channel, below.
      if (previousLessonId && previousLessonId !== lessonId) {
        if (previousRoomId && leaveRoom(previousRoomId, userId, socket.id)) {
          socket.to(lessonChannel(previousLessonId)).emit('peer_left', userId)
        }
        void socket.leave(lessonChannel(previousLessonId))
      }
      if (previousRoomId && previousRoomId !== roomId) void socket.leave(previousRoomId)
      socket.data.roomId = roomId
      socket.data.lessonId = lessonId

      // Join the Socket.IO room and emit the snapshot synchronously, in that
      // order, before yielding back to the event loop (#36). Socket.io/Node
      // run all of this on one thread with no `await` in between, so no
      // 'operation' from another socket can be relayed to the room between
      // `socket.join` and `socket.emit('room_state', ...)` — this socket is
      // already a member by the time any such relay could happen, and the
      // snapshot read happens before that relay's write, so nothing is
      // double-delivered or lost.
      //
      // (#176) Two channels: the board's for content, the lesson's for
      // everything social. Joining a socket.io room it is already in is a
      // no-op, so a page turn simply keeps the lesson channel.
      socket.join(roomId)
      socket.join(lessonChannel(lessonId))
      const snapshot = getRoomSnapshot(roomId, lastKnownSeq, userId)
      if (snapshot) socket.emit('room_state', snapshot)
      // (#176) Someone the lesson already had, now on a different board, is
      // announced as having moved; everyone else — first join or a reconnect
      // to the same board — as having joined, exactly as before.
      const switched = result.previousBoardId !== undefined && result.previousBoardId !== roomId
      if (switched) socket.to(lessonChannel(lessonId)).emit('peer_board_changed', { userId, boardId: roomId })
      else socket.to(lessonChannel(lessonId)).emit('peer_joined', result.participant)

      log.info({ socketId: socket.id, roomId, lessonId, userId, role: result.participant.role }, 'socket joined room')
      ack({ ok: true, userId })

      // (#595, ADR 015 §4) A student arriving mid-round gets their board now,
      // the same blank one everybody else got when it was handed out. After
      // the ack: the join itself is complete and must not wait on a write.
      if (result.participant.role === 'member') {
        void givePersonalBoard(lessonId, { userId, name: displayName }).catch(err => {
          log.error({ err, lessonId, userId }, 'failed to create a latecomer\'s personal board')
          reportException(err, { lessonId, userId })
        })
      }
    })

    // Operation relay (#34/#35, reworked by #289 — reliable history spec
    // v0.2): broadcast to *every* socket in the room, including the sender,
    // and append to the room's log, which backs the #36 snapshot.
    //
    // (#289 §7/§11) `operation_confirmed` replaces `peer_operation` as the
    // one and only channel that ever paints into a client's confirmed
    // buffer — sent via `io.to`, not `socket.to`, specifically so the
    // author receives their own operation through the exact same
    // WebSocket-ordered stream as everyone else's, instead of learning
    // their own seq from a separate ack that could race ahead of an
    // earlier peer operation still in flight. The direct `ack` is now pure
    // bookkeeping (`SendResult`) — never a paint trigger.
    //
    // (#254 epic) `getOperationRejectReason` is the single choke point for
    // every owner-only runtime privilege this epic adds on top of the
    // original `operation_revoke`-only check (#73): room-wide freeze
    // (#256), per-participant freeze (#257), and owner-locked layers
    // (#258) — see its own doc comment in rooms.ts. Rejections now get an
    // explicit `SendResult: { ok: false, reason }` instead of the old
    // silent drop (indistinguishable from a lost packet to the sender —
    // an outbox retry loop needs to tell the two apart).
    //
    // (#289 §10) `findDuplicateOperation` dedups by the client-generated
    // `Operation.id` before ever assigning a new seq — a retried send
    // (outbox timeout racing an ack that was merely slow) must resolve to
    // the same seq, not record the stroke a second time.
    //
    // #164: wrapped in try/catch as a defensive backstop — an uncaught
    // exception inside a socket.io event handler isn't caught by the
    // framework, it propagates straight to the Node process and crashes
    // it, taking down every room and every connected user for one bad
    // packet on one socket. recordOperation throwing for a roomId that
    // isn't (or is no longer) in the in-memory Map was the concrete case
    // that happened in production (root cause fixed separately in
    // leaveRoom/currentSocketForParticipant — see rooms.ts — but this stays
    // as a backstop against *any* unexpected throw here, not just that one).
    socket.on('operation', (op: Operation, ack) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) {
        // (#298) Must ack. Returning silently here is indistinguishable from
        // a dropped packet, so the sender's outbox waited out its timeout and
        // retried — forever, since nothing about this socket was going to
        // change on its own. Observed on a real tablet: 384 operations at
        // 42-49 attempts each, every reconnect blasting all of them at a
        // socket that had not joined yet, ~55 MB of stroke JSON serialized
        // per round. That allocation storm is what the low-memory killer
        // eventually shot the renderer for.
        log.warn({ socketId: socket.id }, 'operation received before join_room, rejecting')
        ack?.({ ok: false, reason: 'not_joined' })
        return
      }

      try {
        const existing = findDuplicateOperation(roomId, op.id)
        if (existing) {
          ack?.({ ok: true, seq: existing.seq!, duplicate: true })
          return
        }

        const reason = getOperationRejectReason(roomId, userId, op)
        if (reason) {
          log.warn(
            { socketId: socket.id, roomId, userId, opId: op.id, opType: op.type, reason },
            'rejected operation (role/freeze/owner-lock check)',
          )
          ack?.({ ok: false, reason })
          return
        }

        // (#254/#258) Keeps the server's owner-lock mirror in sync the
        // instant this op is accepted, so the very next operation on this
        // socket connection already sees it — must run before
        // recordOperation, not after, though the two never race each other
        // either way (single-threaded, no `await` in between).
        if (op.type === 'layer_owner_lock') setLayerOwnerLocked(roomId, op.layerId, op.locked)
        // (#518) The shared lock's mirror, kept in step the same way. Undo and
        // redo of one are handled next to it rather than folded in — see
        // releaseLockOnUndo for why the server gives the lock up rather than
        // trying to reconstruct what the flag became.
        if (op.type === 'layer_lock') setLayerLocked(roomId, op.layerId, op.locked)
        releaseLockOnUndo(roomId, op)
        // (#289 epic) Same reasoning, for the aliveIds mirror
        // getOperationRejectReason's target_gone check above just read.
        updateAliveIds(roomId, op)

        const stamped = recordOperation(roomId, op)
        ack?.({ ok: true, seq: stamped.seq! })
        io.to(roomId).emit('operation_confirmed', { seq: stamped.seq!, operation: stamped })
        // (#480) После рассылки, а не до: проверка — наблюдение за комнатой, и
        // задерживать ею доставку операции незачем.
        if (stamped.seq! % SNAPSHOT_SEQ_INTERVAL === 0) checkSnapshotLag(roomId)
      } catch (err) {
        const context = { socketId: socket.id, roomId, userId, opId: op.id, opType: op.type }
        log.error({ ...context, err }, 'failed to record/relay operation')
        // (#495) Both halves of this used to be missing, and they fail the
        // same way for the same reason: nobody outside this process learned
        // that an operation had been dropped.
        //
        // The ack, because silence is the one answer the sender cannot read.
        // It has no way to tell a refusal from a lost packet, so it waits out
        // its 5-second timeout and retries — for an operation the server has
        // already thrown on once. The very case #298 fixed ten lines up, and
        // for the same reason: a handler that returns without acking is
        // indistinguishable from a dead socket. `server_error` is transient
        // (see TRANSIENT_REJECT_REASONS), so the client keeps the work and
        // backs off instead of discarding a stroke over our failure.
        //
        // The report, because this catch is where the hot path's exceptions
        // go to be invisible. It exists so one bad packet cannot take the
        // process down with it (#164) — which also means the process stays up
        // and Sentry, which only hears about 5xx and crashes, hears nothing.
        // A lesson can lose every stroke of a layer this way and produce no
        // signal at all beyond a log line on the VPS nobody is reading.
        reportException(err, context)
        ack?.({ ok: false, reason: 'server_error' })
      }
    })

    // (#429) Live stroke relay. Deliberately the thinnest handler in this
    // file: no log append, no seq, no dedup, no persistence, no ack — a
    // packet is forwarded to the rest of the room and forgotten. The
    // gesture's authoritative record still arrives through `operation`
    // above; this only gets the same dabs to peers early enough to watch.
    //
    // Cheapness is the point, not an aesthetic. #424 measured that a drawing
    // room's ceiling is CPU, and that the walk from "48 ms" to "seconds" is
    // a few percent of load — so a channel that multiplies packet *count*
    // must divide per-packet *work*. Recording these as operations instead
    // (the "just lower STROKE_DAB_CHUNK_LIMIT" alternative) would have
    // multiplied the expensive half by the same factor.
    //
    // What it does *not* skip is the permission gate. A packet is run through
    // the same getOperationRejectReason every operation goes through, on a
    // stand-in stroke op built from the packet's own fields — rather than
    // re-checking freeze/closed/owner-lock by hand here, which is how two
    // copies of one rule drift apart. Without it a frozen or locked-out
    // author's ink would still appear live on every peer's canvas and only
    // disappear once their operation came back rejected — the "drawing into
    // the void" failure of #254, with the void now visible to the whole room.
    // The stand-in carries no dabs: nothing in that gate reads them.
    socket.on('stroke_live', data => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) return
      const standIn: Operation = {
        id: data.strokeId, type: 'stroke', userId, timestamp: 0,
        layerId: data.layerId, tool: data.tool, preset: data.preset, color: data.color, dabs: [],
      }
      if (getOperationRejectReason(roomId, userId, standIn)) return
      socket.to(roomId).emit('peer_stroke_live', { ...data, userId })
    })

    socket.on('stroke_live_end', ({ strokeId }) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) return
      socket.to(roomId).emit('peer_stroke_live_end', { userId, strokeId })
    })

    // (#254/#256 epic) Room-wide freeze — owner-only, same role-check shape
    // as operation_revoke had before isOperationAllowed absorbed it above
    // (this event is its own socket message, not an Operation, so it needs
    // its own check). Broadcasts to the *whole* room via `io.to`, not
    // `socket.to` — same reasoning as palette_add_color/palette_remove_color
    // below: the owner who triggered it needs the same confirmation every
    // other participant gets, not to be excluded from it.
    //
    // (#176) Every owner control below is a fact about the *lesson* and goes
    // to the lesson channel: a freeze holds on every board, so everyone in the
    // lesson has to hear it, not just the people on the owner's page.
    socket.on('set_room_frozen', frozen => {
      const { roomId, userId, lessonId } = socket.data
      if (!roomId || !userId || !lessonId) return
      const participant = getParticipant(roomId, userId)
      if (participant?.role !== 'owner') {
        log.warn({ socketId: socket.id, roomId, userId }, 'rejected set_room_frozen from non-owner participant')
        return
      }
      if (setRoomFrozen(roomId, frozen)) io.to(lessonChannel(lessonId)).emit('room_frozen_changed', { frozen })
    })

    // (#176, ADR 014 §3) The owner turned the page. Persisted on the lesson
    // row so a join or a reload lands where the teacher is, and broadcast so
    // students who are following turn with them. Owner-only for the same
    // reason freeze is: this decides where the class looks.
    socket.on('set_active_board', ({ boardId }) => {
      const { roomId, userId, lessonId } = socket.data
      if (!roomId || !userId || !lessonId) return
      const participant = getParticipant(roomId, userId)
      if (participant?.role !== 'owner') {
        log.warn({ socketId: socket.id, roomId, userId }, 'rejected set_active_board from non-owner participant')
        return
      }
      const stored = setActiveBoard(lessonId, boardId)
      if (stored === false) {
        log.warn({ socketId: socket.id, lessonId, userId, boardId }, 'rejected set_active_board for a board not in this lesson')
        return
      }
      io.to(lessonChannel(lessonId)).emit('active_board_changed', { boardId: stored })
    })

    // (#548) The room's toolset. Owner-only, same shape as `set_room_frozen`
    // above — and broadcast to the whole room including the owner, because a
    // tool being taken away is something every client has to act on locally
    // (a hand holding it switches to another), the sender included.
    socket.on('set_room_tools', enabledTools => {
      const { roomId, userId, lessonId } = socket.data
      if (!roomId || !userId || !lessonId) return
      const participant = getParticipant(roomId, userId)
      if (participant?.role !== 'owner') {
        log.warn({ socketId: socket.id, roomId, userId }, 'rejected set_room_tools from non-owner participant')
        return
      }
      const stored = setRoomTools(roomId, enabledTools)
      if (stored === false) return
      io.to(lessonChannel(lessonId)).emit('room_tools_changed', { enabledTools: stored })
    })

    // (#254/#257 epic) Point freeze — same owner-only shape as
    // set_room_frozen above. setParticipantFrozen itself refuses to freeze
    // the room's owner (see rooms.ts), so no separate check is needed here
    // for that case.
    socket.on('set_participant_frozen', ({ userId: targetUserId, frozen }) => {
      const { roomId, userId, lessonId } = socket.data
      if (!roomId || !userId || !lessonId) return
      const participant = getParticipant(roomId, userId)
      if (participant?.role !== 'owner') {
        log.warn(
          { socketId: socket.id, roomId, userId, targetUserId },
          'rejected set_participant_frozen from non-owner participant',
        )
        return
      }
      const updated = setParticipantFrozen(roomId, targetUserId, frozen)
      if (updated) io.to(lessonChannel(lessonId)).emit('participant_frozen_changed', { userId: targetUserId, frozen })
    })

    // Bonus: cursor relay follows the exact same broadcast pattern and adds
    // no real risk, so it's wired alongside the operation relay even though
    // it wasn't one of the five issues.
    socket.on('cursor_move', (data) => {
      const { roomId, userId } = socket.data
      if (!roomId || !userId) return
      socket.to(roomId).emit('peer_cursor', { ...data, userId })
    })

    // (#190 epic) Palette changes broadcast to the *whole* room via `io.to`,
    // not `socket.to` like every other event above — unlike an operation or
    // cursor move, the participant who triggered this must also see the
    // resulting palette (it's not something their own client already
    // applied optimistically), so the sender needs the same `palette_updated`
    // every other peer gets, not to be excluded from it.
    //
    // (#176) One palette per lesson, so the lesson channel — the colours a
    // class mixed on page one are the colours it wants on page two.
    socket.on('palette_add_color', ({ color }) => {
      const { roomId, lessonId } = socket.data
      if (!roomId || !lessonId) return
      const palette = addPaletteColor(roomId, color)
      if (palette) io.to(lessonChannel(lessonId)).emit('palette_updated', { palette })
    })

    socket.on('palette_remove_color', ({ color }) => {
      const { roomId, lessonId } = socket.data
      if (!roomId || !lessonId) return
      const palette = removePaletteColor(roomId, color)
      if (palette) io.to(lessonChannel(lessonId)).emit('palette_updated', { palette })
    })

    // ── Class mode (#595, ADR 015 §4) ─────────────────────────────────────
    // Teacher-only except for a student's own hand. "Teacher" is the lesson's
    // owner, checked through `getParticipant` like every owner control above
    // — never the client's word.

    const isTeacher = (roomId: string, userId: string) => getParticipant(roomId, userId)?.role === 'owner'

    // A new assignment. The rows are written first (one transaction, see
    // classMode.ts), then the lesson learns about them: each socket its own
    // lesson_state, in which a following student finds their board and goes.
    // The class is sent there whatever it was doing — a new assignment is
    // handed out to be worked on.
    socket.on('assignment_start', async ({ name }, ack) => {
      const { roomId, userId, lessonId } = socket.data
      const reply = typeof ack === 'function' ? ack : () => {}
      if (!roomId || !userId || !lessonId || !isTeacher(roomId, userId)) {
        reply({ ok: false, error: 'not_owner' })
        return
      }
      if (!beginAssignmentStart(lessonId)) {
        reply({ ok: false, error: 'busy' })
        return
      }
      const title = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : '—'
      try {
        const students = getClassroom(lessonId)?.students ?? []
        const { assignment, boards } = await createAssignment(lessonId, title, students)
        noteAssignmentStarted(lessonId, assignment, boards)
        await sendLessonState(io, lessonId)
        log.info({ lessonId, assignmentId: assignment.id, boards: boards.length }, 'assignment started')
        reply({ ok: true, assignment })
        // Anyone who arrived while the rows were being written was not in
        // `students`, and their join found the class somewhere else. Sweep once
        // more now that it is here.
        giveMissingBoards(lessonId)
      } catch (err) {
        abortAssignmentStart(lessonId)
        log.error({ err, lessonId }, 'failed to start an assignment')
        reportException(err, { lessonId })
        reply({ ok: false, error: 'server_error' })
      }
    })

    // (ADR 015 §11) Moves the class: "Все ко мне" (null) or "Вернуть всех
    // сюда" (an assignment). Everyone hears where the class is now; a student
    // with no board in that assignment — absent when it was handed out — gets
    // one right after.
    socket.on('set_class_location', ({ assignmentId }) => {
      const { roomId, userId, lessonId } = socket.data
      if (!roomId || !userId || !lessonId || !isTeacher(roomId, userId)) return
      if (assignmentId !== null && typeof assignmentId !== 'string') return
      if (!setClassLocation(lessonId, assignmentId)) return
      void sendLessonState(io, lessonId)
      if (assignmentId !== null) giveMissingBoards(lessonId)
    })

    socket.on('set_spotlight', ({ boardId }) => {
      const { roomId, userId, lessonId } = socket.data
      if (!roomId || !userId || !lessonId || !isTeacher(roomId, userId)) return
      if (boardId !== null && typeof boardId !== 'string') return
      if (!setSpotlight(lessonId, boardId)) return
      // Visibility changes with it: under `teacher_only` the spotlit board is
      // the one personal board a classmate may see, and only while it is lit.
      void sendLessonState(io, lessonId)
    })

    // A student raises or lowers their own hand; the teacher may lower (or
    // raise) anyone's. Everyone in the lesson hears it — a hand in a room is
    // not private.
    socket.on('set_hand_raised', ({ raised, userId: target }) => {
      const { roomId, userId, lessonId } = socket.data
      if (!roomId || !userId || !lessonId || typeof raised !== 'boolean') return
      const whose = target ?? userId
      if (whose !== userId && !isTeacher(roomId, userId)) return
      if (setHandRaised(lessonId, whose, raised)) {
        io.to(lessonChannel(lessonId)).emit('participant_hand_changed', { userId: whose, raised })
      }
    })

    socket.on('set_class_visibility', ({ value }) => {
      const { roomId, userId, lessonId } = socket.data
      if (!roomId || !userId || !lessonId || !isTeacher(roomId, userId) || !isClassVisibility(value)) return
      if (setClassVisibility(lessonId, value)) void sendLessonState(io, lessonId)
    })

    socket.on('disconnect', (reason) => {
      const { roomId, userId, lessonId } = socket.data
      if (roomId && userId) {
        // #164: leaveRoom returns false for a stale/superseded socket (a
        // newer socket for this same room+userId already took over — see
        // its own doc comment) — must not broadcast peer_left in that case,
        // the user is still very much present via that newer socket.
        const actuallyLeft = leaveRoom(roomId, userId, socket.id)
        if (actuallyLeft) socket.to(lessonChannel(lessonId ?? roomId)).emit('peer_left', userId)
        // (#480) Только если комната действительно ушла из памяти. Забывать
        // на каждом разрыве нельзя: урок 21.08 состоял из десяти
        // переподключений, и дедуп сторожа сбрасывался бы каждым из них,
        // превращая одно наблюдение в десять писем.
        if (!isRoomResident(roomId)) lagWatch.forget(roomId)
      }
      // (#480) Транспорт именно на разрыве: на подключении он всегда
      // `polling` (апгрейд до вебсокета идёт следом), и только здесь видно,
      // на чём соединение прожило свою жизнь. Сессия, целиком просидевшая на
      // polling, — это заметно другой урок по отзывчивости, и до сих пор
      // отличить её можно было только по ритму запросов в nginx.
      log.info({ socketId: socket.id, reason, transport: socket.conn.transport.name }, 'socket disconnected')
    })
  })
}
