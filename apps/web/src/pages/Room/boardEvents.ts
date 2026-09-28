import type { RefObject } from 'react'

import type { ServerToClientEvents } from '@grafetto/shared'

import { isTeacherIn } from '../../lib/boards/classMode'
import { useRoomStore } from '../../stores/roomStore'

export type BoardEventHandlers = Pick<ServerToClientEvents,
  | 'peer_board_changed' | 'active_board_changed' | 'board_created' | 'board_renamed' | 'boards_reordered'
  | 'board_deleted' | 'lesson_state' | 'participant_hand_changed' | 'board_thumbnail_updated'>

export interface BoardEventDeps {
  /** Turns the page to the teacher's board when this client is following and
   *  not already there. Called after every event that can move the teacher or
   *  change what "following" means. */
  maybeFollow: () => void
  /** The board a page turn in flight is heading to, or null. */
  wantedBoardRef: RefObject<string | null>
  /** The board the socket is on server-side, or null mid-turn. */
  socketBoardRef: RefObject<string | null>
  boardIdRef: RefObject<string | null>
  /** Unblocks the canvas that a page turn blocked. */
  setRoomContentReady: (ready: boolean) => void
  isOwnerRef: RefObject<boolean>
}

/** (#176, ADR 014 §3; #595, ADR 015 §4) Boards and class mode on the socket.
 *  All of these travel on the lesson channel, so they arrive whichever board
 *  this client is on.
 *
 *  (#493) Out of Room's socket effect. What comes back is the handlers, not a
 *  registration: the `socket.on` table stays in Room, where every event the
 *  page answers is listed in one place, and a test can call a handler directly
 *  without a socket. Nearly all of it is the store; the rest — the page turn
 *  in flight and following — belongs to the effect and comes in. */
export function createBoardEventHandlers({
  maybeFollow, wantedBoardRef, socketBoardRef, boardIdRef, setRoomContentReady, isOwnerRef,
}: BoardEventDeps): BoardEventHandlers {
  return {
    // Someone else turned a page. Their cursor and live ink stop arriving on
    // their own (content is per board channel); the roster is what has to be
    // told, so the strip and the participants list can say who is where.
    peer_board_changed: ({ userId, boardId: peerBoard }) => {
      useRoomStore.getState().applyParticipantAction({ type: 'peer_board_changed', userId, boardId: peerBoard })
    },

    // The teacher moved (or their board was deleted — null means the
    // lesson's first board). A following student goes with them; everyone
    // else just sees the marker move in the strip.
    active_board_changed: ({ boardId: active }) => {
      useRoomStore.getState().setActiveBoardId(active)
      maybeFollow()
    },

    board_created: ({ board }) => {
      useRoomStore.getState().applyBoardsAction({ type: 'board_created', board })
    },
    board_renamed: ({ boardId: renamed, name }) => {
      useRoomStore.getState().applyBoardsAction({ type: 'board_renamed', boardId: renamed, name })
      // The lesson's own name is also its first board's — keep the header in
      // step with the strip.
      if (renamed === useRoomStore.getState().lessonId) useRoomStore.getState().setRoomName(name)
    },
    boards_reordered: ({ order }) => {
      useRoomStore.getState().applyBoardsAction({ type: 'boards_reordered', order })
    },
    // Hard delete. If this client was on it, the server has already moved the
    // socket to the lesson's first board and sent that board's room_state
    // ahead of this event — enterBoard ran from there, and the only thing
    // left is to stop showing a page that no longer exists. A turn still in
    // flight towards it is dropped for the same reason.
    board_deleted: ({ boardId: deleted }) => {
      useRoomStore.getState().applyBoardsAction({ type: 'board_deleted', boardId: deleted })
      if (wantedBoardRef.current === deleted) {
        wantedBoardRef.current = null
        socketBoardRef.current = boardIdRef.current
        setRoomContentReady(true)
      }
      maybeFollow()
    },

    // (#595, ADR 015 §4) Class mode. `lesson_state` is the lesson half of
    // room_state, alone and rebuilt for this client, sent whenever the set of
    // boards it may see can have changed.
    lesson_state: ({ lesson }) => {
      const s = useRoomStore.getState()
      const teacher = isOwnerRef.current || isTeacherIn(s)
      // The teacher calling the class somewhere — handing out a round,
      // calling everyone back, showing one work to all — is a call to
      // *everyone*, including a student who had wandered off to another
      // page: following comes back on. Anything else (a latecomer's board
      // appearing, the visibility setting) leaves a hand-picked board alone.
      const called = lesson.activeAssignmentId !== s.activeAssignmentId
        || (lesson.spotlightBoardId !== s.spotlightBoardId && lesson.spotlightBoardId !== null)
      // A board this client is on, or on its way to, that it may no longer
      // see (the spotlight went dark on a classmate's work): nothing to stay
      // for, so it goes where following leads.
      const here = wantedBoardRef.current ?? s.boardId
      const lost = here !== null && !lesson.boards.some(b => b.id === here)
      s.setLesson(lesson)
      if (!teacher && (called || lost)) s.setFollowing(true)
      maybeFollow()
    },
    participant_hand_changed: ({ userId: whose, raised }) => {
      useRoomStore.getState().setHandRaised(whose, raised)
    },
    // Somebody's board has a new picture — the strip and the grid re-fetch it.
    board_thumbnail_updated: ({ boardId: baked, updatedAt }) => {
      useRoomStore.getState().applyBoardsAction({ type: 'thumbnail_baked', boardId: baked, at: updatedAt })
    },
  }
}
