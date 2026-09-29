import type { RefObject } from 'react'

import type { ClientToServerEvents, JoinDenial, Operation, Participant, ServerToClientEvents } from '@grafetto/shared'

import { entryBoard } from '../../../lib/boards/boards'
import { useRoomStore } from '../../../stores/roomStore'
import { toLessonConfig } from './roomConfig'
import type { SnapshotGate } from './snapshotGate'

/** What a board's `room_state` carries beyond the lesson half — the content
 *  a fresh engine is built from, or stashed until one exists. */
export interface RoomStateStash {
  latestSnapshotSeq: number | null
  tailOperations: Operation[]
  participants: Participant[]
  palette: string[]
  /** (#254/#255) Room-wide freeze at the moment this state was sent. */
  frozen: boolean
}

/** `Engine` is whatever Room's engine is: this handler only asks whether one
 *  exists and hands it on, so it never needs to know. */
export interface RoomStateDeps<Engine> {
  /** The id this lesson's socket was opened for — see sessionId in Room. */
  id: string
  isCreator: boolean
  /** Rewrites the address bar in place (a board link becomes the lesson's). */
  replaceUrl: (path: string) => void
  joinRoom: ClientToServerEvents['join_room']
  joinCredentials: () => { name: string; password?: string }
  applyIdentity: (userId: string) => void
  reportJoinFailure: (error: JoinDenial, where: string) => void
  requestFullResync: () => void
  maybeFollow: () => void
  /** Swaps in a fresh engine for another board — see enterBoard in Room. */
  enterBoard: (board: string, stash: RoomStateStash) => void
  /** Waits for the paper texture; false means it failed and the room says so. */
  awaitPaper: (engine: Engine | null) => Promise<boolean>
  markJoinRestoreDone: () => void
  setRoomContentReady: (ready: boolean) => void
  clearRestoreFailure: () => void
  /** A reconnect's restore into the engine already standing — restoreRoomState. */
  restoreCatchup: (engine: Engine | null, state: RoomStateStash, alreadyHadSeq: number, boardId: string) => Promise<void>
  socketBoardRef: RefObject<string | null>
  wantedBoardRef: RefObject<string | null>
  /** Whether this socket has had its first room_state yet. */
  firstRoomStateReceivedRef: RefObject<boolean>
  /** The creator's own board, seated before any room_state arrived. */
  awaitingSeededBoardStateRef: RefObject<boolean>
  /** Where a room_state waits for an engine that does not exist yet. */
  pendingSnapshotRef: RefObject<RoomStateStash | null>
  latestKnownSeqRef: RefObject<number>
  isOwnerRef: RefObject<boolean>
  engineRef: RefObject<Engine | null>
  snapshotGateRef: RefObject<Pick<SnapshotGate, 'restoreStarted'>>
}

/** (#493) `room_state` — the one event that says where this client is and
 *  what is on the board there. Every branch below is a routing decision:
 *  land on the teacher's board instead of the one the link seated us on
 *  (#176), drop a page turn that has been superseded, enter a new board (or
 *  be evacuated off a deleted one), stash the state for an engine not yet
 *  built, open a genuinely empty room at once, or catch a standing engine up.
 *
 *  Out of Room's socket effect. The lesson half lands in the store first,
 *  whichever board this is for. */
export function createRoomStateHandler<Engine>({
  id, isCreator, replaceUrl, joinRoom, joinCredentials, applyIdentity, reportJoinFailure,
  requestFullResync, maybeFollow, enterBoard, awaitPaper, markJoinRestoreDone, setRoomContentReady,
  clearRestoreFailure, restoreCatchup,
  socketBoardRef, wantedBoardRef, firstRoomStateReceivedRef, awaitingSeededBoardStateRef,
  pendingSnapshotRef, latestKnownSeqRef, isOwnerRef, engineRef, snapshotGateRef,
}: RoomStateDeps<Engine>): ServerToClientEvents['room_state'] {
  return async ({ room, latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen, lesson }) => {
    const store = useRoomStore.getState()
    // (#176) The social half first, whichever board this is for: the
    // strip, the teacher's board and the lesson's roster (everyone in the
    // lesson, each with their board) are the lesson's and always current.
    store.setLesson(lesson)
    store.applyParticipantAction({ type: 'room_state', participants: roomParticipants })
    store.setPalette(palette)
    store.setRoomFrozen(frozen)
    const arrivedBoard = room.id
    socketBoardRef.current = arrivedBoard

    if (!firstRoomStateReceivedRef.current) {
      firstRoomStateReceivedRef.current = true
      // (#176) A board id in the URL — a link copied out of a preview
      // request. The lesson is what the address bar should carry (ADR 014
      // §4); `sessionId` deliberately does not follow this replace, so the
      // socket stays. The board itself is kept: it is the one the link
      // meant.
      const enteredByBoardUrl = room.lessonId !== undefined
      if (enteredByBoardUrl && id !== lesson.id) replaceUrl(`/room/${lesson.id}`)
      // Only a joiner needs this: a creator's config is already known
      // synchronously from navigation state (see creatorDraft/toRoomConfig
      // above) with the exact same fields toLessonConfig would produce
      // here, so writing it a second time says nothing new.
      //
      // It used to be worse than redundant. `config` itself was a dependency
      // of the mount-engine effect, and setRoomInfo always writes a *new*
      // object even when every field is identical (toRoomConfig has no
      // memoization) — which that effect read as "the room changed" and
      // answered by destroying whatever this handler had just restored into
      // the engine, rebuilding it empty. That is why this line is gated
      // rather than unconditional. The gate is no longer what protects the
      // canvas: the effect now depends on the three fields it actually builds
      // from, not on the object (#461, which fixed the same wipe reaching the
      // canvas through setRoomName instead).
      if (!isCreator) store.setRoomInfo(toLessonConfig(room, lesson))
      // (#176) Where to land. The server seats a join on the board it was
      // asked for; the lesson URL asks for the lesson's own first board, and
      // the teacher may well be on another. Ask for that one now and let
      // *its* room_state be the one that builds the engine — this one's
      // content is for a page we are not going to look at.
      const entry = entryBoard({ arrivedBoardId: arrivedBoard, enteredByBoardUrl, lesson })
      store.setFollowing(entry.following)
      if (entry.target !== arrivedBoard && store.boardId === null) {
        wantedBoardRef.current = entry.target
        socketBoardRef.current = null
        joinRoom({ roomId: entry.target, ...joinCredentials() }, result => {
          if (result.ok) { applyIdentity(result.userId); return }
          // Fall back to the board we were seated on: ask for it again so
          // its content arrives through the ordinary path below.
          reportJoinFailure(result.error, 'join_room for the teacher\'s board')
          wantedBoardRef.current = null
          requestFullResync()
        })
        return
      }
    }

    // (#176) A room_state for a board other than the one the engine holds:
    // the first entry (no board yet), a page turn this client asked for,
    // the server moving us off a deleted board, or a new lesson after an
    // in-place navigation. All of them mean a fresh engine — see enterBoard.
    // One that is neither the board we hold nor the one we asked for is a
    // turn already superseded (two quick turns), and is dropped: the state
    // for the board actually wanted is on its way.
    if (arrivedBoard !== store.boardId) {
      if (wantedBoardRef.current !== null && wantedBoardRef.current !== arrivedBoard) return
      // A board we held but never asked to leave: the server evacuated us
      // off a deleted board. The page the student picked by hand is gone
      // with it, so the pick is void and they follow the teacher again —
      // otherwise they would sit on board one chip-less (the teacher
      // happens to be there too) and silently stay behind on the teacher's
      // next turn.
      const evacuated = wantedBoardRef.current === null && store.boardId !== null
      if (evacuated && !isOwnerRef.current) store.setFollowing(true)
      enterBoard(arrivedBoard, { latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen })
      maybeFollow()
      return
    }
    wantedBoardRef.current = null

    // What this socket already had *before* this room_state's own tail —
    // the reconnect fast-path check below needs this, not the value after
    // folding tailOperations' seqs in just below.
    const alreadyHadSeq = latestKnownSeqRef.current
    // Bulk catch-up (join/reconnect), not a live single operation — doesn't
    // trigger snapshotUploader here even if it spans a checkpoint
    // boundary. Any client live at the moment a boundary was actually
    // crossed already baked it (see onLocalOperation/handleOperationConfirmed
    // below); this client wasn't present for it, and doesn't need to
    // retroactively contribute a bake for history it's only now replaying.
    for (const op of tailOperations) latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, op.seq ?? 0)
    // A reconnect while following: the teacher may have moved meanwhile.
    maybeFollow()

    // (#176) The one board whose room_state can arrive with its engine
    // already standing: the creator's own, seated synchronously from
    // navigation state. Every other board is entered through enterBoard
    // above, so past this point a same-board room_state is a reconnect.
    if (awaitingSeededBoardStateRef.current) {
      awaitingSeededBoardStateRef.current = false
      if (!engineRef.current) {
        // Real first join: this is how we learn paper/canvas size — the
        // engine doesn't exist yet to apply `tailOperations` to, so stash
        // them for the mount-engine effect to replay once it does.
        pendingSnapshotRef.current = { latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen }
        return
      }
      // The creator's one legitimate first room_state — arrives *after*
      // the mount-engine effect already ran, since a creator's `config` is
      // known synchronously from navigation state (see the `useState`
      // seeding `room` near this component's top), well before any socket
      // round-trip. Used to be misclassified as a reconnect here (the old
      // check was `!useRoomStore.getState().room`, which that same
      // synchronous seeding already makes truthy for the creator) —
      // needlessly re-locked roomContentReady (setRoomContentReady(false)
      // below) right after the mount effect had already marked it ready,
      // producing a visible "loads fine, then the preloader flashes on
      // for no reason" — reported after #185 made this window visible for
      // the first time (previously silent, just pointer-events:none).
      //
      // That "nothing to restore" assumption only holds for a genuinely
      // brand-new room, though — this exact same branch (fresh refs +
      // engine already mounted) is also what the *creator's own tab
      // reloading an already-drawn-on room* looks like, and there
      // `tailOperations`/`latestSnapshotSeq` are not empty at all. The old
      // code never checked, so a creator's reload silently produced a
      // blank canvas with no restore and no preloader — as if a brand-new
      // room had just been created — dropping whatever was drawn before
      // the reload (still safe on the server/Postgres side, just never
      // fetched back). Tell the two apart by the payload itself: only
      // take the early-return shortcut when there's truly nothing to
      // restore; otherwise fall through into the exact same restore-from-
      // snapshot/replay-tail logic below a real reconnect uses — this
      // engine instance is just as freshly empty as a reconnecting
      // client's would be.
      if (tailOperations.length === 0 && latestSnapshotSeq === null) {
        useRoomStore.getState().applyParticipantAction({ type: 'room_state', participants: roomParticipants })
        useRoomStore.getState().setPalette(palette)
        useRoomStore.getState().setRoomFrozen(frozen)
        // The genuinely-new-room case: roomContentReady now starts
        // `false` for every creator (see its own doc comment), and
        // nothing else sets it for this branch — a real new room has
        // nothing to restore, so it's ready the instant that's confirmed.
        //
        // "Nothing to restore" is not the same as "nothing to wait for",
        // though: the paper texture is a hard prerequisite for drawing at
        // all (the engine drops any stroke that starts before it has
        // loaded — see PaperState.loaded), so this awaits it exactly like
        // every other exit from this handler does. Without the await, a
        // freshly created room dismissed its own preloader mid-download —
        // visibly, since #345 put a real progress bar on it — and opened
        // onto a canvas with no paper on it that quietly ignored the
        // pencil until the remaining ~4 MB landed.
        if (!(await awaitPaper(engineRef.current))) return
        // (#462) A room with no history to replay is caught up the moment
        // that is confirmed — this is the one branch where an empty store is
        // the room rather than a stand-in for it, so the creator's own first
        // checkpoint still bakes normally.
        markJoinRestoreDone()
        setRoomContentReady(true)
        return
      }
    }
    // See the mount-engine effect's own comment on engine.paperReady() —
    // same reasoning applies to a reconnect's full-history replay. A
    // no-op await in the overwhelmingly common case (paper long since
    // loaded by the time a reconnect happens).
    const engine = engineRef.current
    setRoomContentReady(false)
    // (#462) Re-closed for the length of this catch-up, not just on a first
    // join — see snapshotGate.ts's restoreStarted.
    snapshotGateRef.current.restoreStarted()
    // (#533) A previous catch-up's verdict says nothing about this one, and
    // a stale `true` would put the failure screen over the next reconnect
    // blip of a room that is fine. Cleared here rather than only in
    // retryRestore, because an ordinary reconnect is just as much a second
    // attempt as a pressed button is.
    clearRestoreFailure()
    // (#346) Outside the try/finally below, for the same reason as the mount
    // effect's own site: a paper failure must leave the room closed and
    // explained, not opened and mute.
    if (!(await awaitPaper(engine))) return
    // (#493) The restore itself — snapshot, tail, backfill — is Room's
    // restoreRoomState, handed in with everything it needs.
    await restoreCatchup(engine, {
      latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen,
    }, alreadyHadSeq, arrivedBoard)
  }
}
