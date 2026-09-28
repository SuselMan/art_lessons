import type { RefObject } from 'react'

import type { ClientToServerEvents, JoinDenial, Room as RoomEntity, RoomAccessMode } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../../engine'
import { followTarget } from '../../../lib/boards/boards'
import { isTeacherIn, ownBoardIn } from '../../../lib/boards/classMode'
import { addRoomInvite, moveRoomToFolder } from '../../../lib/api/api'
import type { TFunction } from '../../../i18n'
import { notifyError } from '../../../stores/noticeStore'
import { useRoomStore } from '../../../stores/roomStore'
import { canRetryJoinLater, describeJoinError } from './joinError'
import type { Outbox } from './outbox'

/** (#176) How long a page turn waits for unconfirmed operations before moving
 *  the socket anyway — see Outbox.whenIdle for why it is bounded at all. Long
 *  enough for a burst of strokes to be acknowledged on an ordinary
 *  connection; short enough that a dead one does not hold the page. */
export const BOARD_SWITCH_DRAIN_MS = 4000

/** Navigation state CreateRoom hands off to a freshly created room (see
 *  CreateRoom/index.tsx) — its presence is how this component tells "I am
 *  the creator, opening my own room" apart from "I opened someone else's
 *  room link" (no state at all, e.g. a second device). */
export interface CreatorNavState {
  room: Pick<RoomEntity,
    'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight' | 'enabledTools'
    | 'classVisibility'>
  password?: string
  // (#232) Picked on the create form. The mode rides along on `create_room`
  // itself so the room is never briefly open; the invites are sent afterwards
  // over REST, which is where address normalization and dedup live.
  accessMode?: RoomAccessMode
  invites?: string[]
  // (#211 epic, #215) Set when CreateRoom was opened via "New room" while a
  // folder was open on MyLessons — files the freshly created room into it
  // right after create_room succeeds (see the ack handler below).
  folderId?: string
}

export interface JoinFlowDeps {
  /** The id this lesson's socket was opened for — see sessionId in Room. */
  id: string
  isCreator: boolean
  creatorDraft: CreatorNavState | undefined
  /** The two joining emits, handed in rather than a socket, so this can be
   *  driven without one. */
  joinRoom: ClientToServerEvents['join_room']
  createRoom: ClientToServerEvents['create_room']
  /** Whether the socket this flow was built for is still the page's socket. */
  isCurrentSocket: () => boolean
  /** The connection came up: status, "ever connected", the revival's note. */
  noteConnected: () => void
  applyIdentity: (userId: string) => void
  setRoomContentReady: (ready: boolean) => void
  hasJoinedRef: RefObject<boolean>
  lastJoinAttemptRef: RefObject<{ name: string; password?: string } | null>
  myDisplayNameRef: RefObject<string>
  latestKnownSeqRef: RefObject<number>
  lastConfirmedSeqRef: RefObject<number>
  /** Only the two things joining needs: drain after a join, wait before a turn. */
  outboxRef: RefObject<Pick<Outbox, 'resendAll' | 'whenIdle'>>
  wantedBoardRef: RefObject<string | null>
  boardIdRef: RefObject<string | null>
  socketBoardRef: RefObject<string | null>
  isOwnerRef: RefObject<boolean>
  engineRef: RefObject<Pick<PencilEngineAPI, 'resetPeerLiveStrokes'> | null>
  streamedStrokeIdsRef: RefObject<Set<string>>
  tRef: RefObject<TFunction>
}

/** (#493) Getting into the lesson and staying in it, on the socket: the
 *  creator's create_room, a joiner's silent rejoin after a drop, a page turn
 *  onto another board (#176), following the teacher (#595), the full resync
 *  a gap in the confirmed stream calls for (#289 §12), and saying so when a
 *  join is refused somewhere the gate cannot show it (#496).
 *
 *  Out of Room's socket effect. The socket itself is not in here — only the
 *  two emits that join, handed in — so the whole flow can be driven by a
 *  test answering those emits however it likes. */
export function createJoinFlow({
  id, isCreator, creatorDraft, joinRoom, createRoom, isCurrentSocket, noteConnected,
  applyIdentity, setRoomContentReady,
  hasJoinedRef, lastJoinAttemptRef, myDisplayNameRef, latestKnownSeqRef, lastConfirmedSeqRef, outboxRef,
  wantedBoardRef, boardIdRef, socketBoardRef, isOwnerRef, engineRef, streamedStrokeIdsRef, tRef,
}: JoinFlowDeps) {
  /** The board a reconnect or a resync re-joins: the one this client is on
   *  (or heading to), falling back to the URL for the very first join. */
  const currentBoard = () => wantedBoardRef.current ?? boardIdRef.current ?? id
  const joinCredentials = () => lastJoinAttemptRef.current
    ?? { name: myDisplayNameRef.current, password: creatorDraft?.password }

  // Fires on the initial connect *and* on every auto-reconnect (socket.io-
  // client's default behavior). Rejoining after a drop is what gives us the
  // "reasonable MVP" reconnect behavior called for by #84 (full catch-up/
  // session-continuity is #74): the client resyncs from a fresh room_state
  // rather than getting stuck. Identity (#41) comes from the server-
  // resolved cookie identity via each create_room/join_room ack below
  // (applyIdentity), not from socket.id — a fresh socket id churns on every
  // reconnect, which used to mean a reconnecting creator was misjudged as a
  // `student` and operations kept a stale userId; both are fixed now that
  // ownership/authorship key off the same stable id every time.
  /** (#496) A join that came back refused somewhere the join gate cannot
   *  see it — the creator's own `create_room`, a reconnect's silent rejoin,
   *  a gap resync. All three used to end in `console.error` and nothing
   *  else.
   *
   *  The gate is not an option here, and that is the whole difficulty:
   *  `JoinGate` only renders while `config` is null (see the render below),
   *  and on every path this covers the room is already open on screen. So
   *  the refusal has to be told, not shown — the same shape `handleKicked`
   *  settled on for the same reason.
   *
   *  Why it matters more than "an error was swallowed": the failure is
   *  invisible in exactly the way that looks like success. The editor keeps
   *  working, the canvas keeps painting, and the operations pile up in a
   *  queue against a socket that has joined nothing. The user does learn
   *  eventually — the outbox stalls and ConnectionBanner says so — but
   *  minutes later, and phrased as "your work isn't saving" rather than
   *  "you are not in this room". On the creator's path they will have been
   *  drawing into a room the server never created.
   *
   *  `durationMs: null` and a fixed key, like every other notice about a
   *  state rather than an event: it stays until the state changes, and a
   *  reconnect that fails the same way again replaces it instead of
   *  stacking. */
  const reportJoinFailure = (error: JoinDenial, where: string) => {
    console.error(`${where} failed`, error)
    // Clearing the flag is what stops the auto-rejoin from re-asking a
    // settled question on every reconnect — the same thing `handleKicked`
    // does, with the same intent. Which refusals are worth re-asking lives
    // in joinError.ts, next to the other two readings of a reason.
    if (!canRetryJoinLater(error)) hasJoinedRef.current = false
    notifyError(describeJoinError(error, tRef.current), { key: 'join-failed', durationMs: null })
  }

  const handleConnect = () => {
    noteConnected()
    // (#298) resendAll deliberately does NOT happen here any more. It used
    // to, and a fresh connection is precisely the moment the socket has
    // joined nothing — so the whole backlog went out against a socket the
    // server would answer `not_joined` for (or, before that reason
    // existed, not answer at all). Each of the join paths below calls it
    // once its own join has actually succeeded.
    if (isCreator && creatorDraft) {
      if (!hasJoinedRef.current) {
        createRoom(
          {
            room: creatorDraft.room, password: creatorDraft.password,
            // (#232) On the creation itself, so the room is never open for
            // the length of a second request — see the shared contract.
            accessMode: creatorDraft.accessMode,
            name: myDisplayNameRef.current,
            lastKnownSeq: latestKnownSeqRef.current || undefined,
          },
          result => {
            if (result.ok) {
              hasJoinedRef.current = true
              applyIdentity(result.userId)
              void outboxRef.current.resendAll()
              // Best-effort: room creation already succeeded either way, so
              // a failure here just leaves the room at root level (still
              // visible on MyLessons) rather than blocking anything.
              if (creatorDraft.folderId) {
                moveRoomToFolder(id, creatorDraft.folderId).catch(err =>
                  console.error('failed to file newly created room into its folder', err))
              }
              // (#232) The allow-list the creator typed on the create form.
              // Sent one at a time through the same endpoint the access
              // panel uses, so normalization, dedup and validation happen in
              // exactly one place. Failing loudly matters here: the room is
              // already `invite_only`, so an invite that didn't land is a
              // student who will be stuck asking to be let in.
              const invites = creatorDraft.invites ?? []
              if (invites.length > 0) {
                void Promise.allSettled(invites.map(email => addRoomInvite(id, email)))
                  .then(results => {
                    const failed = results.filter(r => r.status === 'rejected').length
                    if (failed > 0) {
                      notifyError(tRef.current('room.invitesFailed', { count: failed }), {
                        key: 'invites-failed', durationMs: null,
                      })
                    }
                  })
              }
            }
            // (#496) The one refusal the server can actually answer here is
            // `server_busy` (#415) — the comment that used to sit here called
            // this practically unreachable and blamed a nanoid collision,
            // which is not something socketHandlers.ts's create_room can
            // return. It is reachable, and it is the worst of the three
            // paths this reports: the creator's `config` comes from
            // navigation state, so the editor renders and paints normally
            // for a room the server declined to create.
            else reportJoinFailure(result.error, 'create_room')
          },
        )
      } else {
        // (#176) Back onto the board this client was on, not the lesson's
        // first: a reconnect must not turn the page.
        joinRoom(
          {
            roomId: currentBoard(), name: myDisplayNameRef.current, password: creatorDraft.password,
            lastKnownSeq: latestKnownSeqRef.current || undefined,
          },
          result => {
            if (result.ok) { applyIdentity(result.userId); void outboxRef.current.resendAll() }
            else reportJoinFailure(result.error, 'join_room on reconnect')
          },
        )
      }
      return
    }

    // Joiner path: the first connect waits for the join-gate form to submit
    // (see handleJoinSubmit). A later reconnect replays the same
    // credentials automatically so an already-joined user isn't dropped
    // back to the gate.
    if (hasJoinedRef.current && lastJoinAttemptRef.current) {
      joinRoom(
          { roomId: currentBoard(), ...lastJoinAttemptRef.current, lastKnownSeq: latestKnownSeqRef.current || undefined },
        result => {
          if (result.ok) { applyIdentity(result.userId); void outboxRef.current.resendAll() }
          else reportJoinFailure(result.error, 'join_room on reconnect')
        },
      )
    }
  }

  /** (#176, ADR 014 §4) Turns the page: asks the server to move this socket
   *  onto `next`. The board's `room_state` comes back through
   *  handleRoomState, which is where the engine is actually swapped (see
   *  enterBoard) — nothing here touches content.
   *
   *  Waits for the outbox first, bounded (see Outbox.whenIdle): an operation
   *  on the wire while the socket moves would be recorded against the next
   *  board. The canvas is blocked for the wait — a stroke drawn *during* it
   *  would go out after the move for the same reason.
   *
   *  Idempotent against the board already shown or already asked for, so the
   *  follow logic can call it on every event that could mean "the teacher
   *  moved" without checking first. */
  const switchBoard = async (next: string) => {
    if (!hasJoinedRef.current) return
    if (next === (wantedBoardRef.current ?? boardIdRef.current)) return
    wantedBoardRef.current = next
    setRoomContentReady(false)
    await outboxRef.current.whenIdle(BOARD_SWITCH_DRAIN_MS)
    // Superseded while waiting — by a later turn, or by the server moving
    // us (a deleted board). The later call owns the emit.
    if (wantedBoardRef.current !== next || !isCurrentSocket()) return
    socketBoardRef.current = null
    joinRoom(
          { roomId: next, ...joinCredentials() },
      result => {
        if (result.ok) { applyIdentity(result.userId); return }
        // Still on the previous board server-side; say so and unblock it.
        if (wantedBoardRef.current === next) {
          wantedBoardRef.current = null
          socketBoardRef.current = boardIdRef.current
          setRoomContentReady(true)
        }
        reportJoinFailure(result.error, 'join_room for a board')
      },
    )
  }

  /** Turns the page to the teacher's board when this client is following
   *  and not already there — see followTarget. Called after every event
   *  that can move the teacher or change what "following" means. */
  const maybeFollow = () => {
    const s = useRoomStore.getState()
    const target = followTarget({
      // (#595) Also read off the roster, not only the ref: this runs from
      // inside the handler that has just delivered the roster, before any
      // render has refreshed the ref, and a teacher who "followed" would now
      // be sent into the spotlight or a student's board.
      following: s.following, isOwner: isOwnerRef.current || isTeacherIn(s), lessonId: s.lessonId,
      activeBoardId: s.activeBoardId, boardId: s.boardId, wantedBoardId: wantedBoardRef.current,
      spotlightBoardId: s.spotlightBoardId,
      ownAssignmentBoardId: ownBoardIn(s.boards, s.activeAssignmentId, s.userId)?.id ?? null,
    })
    if (target) void switchBoard(target)
  }

  // (#289 §12) Re-requests the room's state from scratch-as-of-what-we-
  // have, the same way a reconnect does, without waiting for (or needing)
  // an actual socket drop — the response arrives as an ordinary
  // `room_state`, which handleRoomState already knows how to fold in.
  // Used when the live confirmed stream turns out to have a gap, i.e. the
  // connection was interrupted at some point without this client noticing.
  const requestFullResync = () => {
    lastConfirmedSeqRef.current = 0 // the stream restarts from this room_state
    // (#429) Everything about the live channel describes what this client
    // painted from a stream it is about to stop trusting: the layers get
    // rebuilt from the log, so any pre-painted ink is gone and any claim
    // against it would make the replayed operations skip dabs that are no
    // longer there. Both sides of the bookkeeping reset together.
    engineRef.current?.resetPeerLiveStrokes()
    streamedStrokeIdsRef.current.clear()
    joinRoom(
          { roomId: currentBoard(), ...joinCredentials(), lastKnownSeq: latestKnownSeqRef.current || undefined },
      result => {
        if (result.ok) applyIdentity(result.userId)
        else reportJoinFailure(result.error, 'join_room during gap resync')
      },
    )
  }

  return { currentBoard, joinCredentials, reportJoinFailure, handleConnect, switchBoard, maybeFollow, requestFullResync }
}
