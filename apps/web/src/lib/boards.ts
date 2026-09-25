import type { BoardSummary } from '@grafetto/shared'

// (#176, ADR 014) The board strip and the follow rule, as pure functions —
// the same reason participants.ts exists: the socket handlers in Room/index.tsx
// fold these events into the store, and the folding has to be testable
// without a socket or the 8000-line page around it.

export type BoardsAction =
  // The whole strip, as `room_state.lesson.boards` carries it on every join
  // and reconnect. Authoritative — replaces what we had.
  | { type: 'lesson'; boards: BoardSummary[] }
  | { type: 'board_created'; board: BoardSummary }
  | { type: 'board_renamed'; boardId: string; name: string }
  // The full order, lesson first — see the shared `boards_reordered` event.
  | { type: 'boards_reordered'; order: string[] }
  | { type: 'board_deleted'; boardId: string }
  // A board's preview was re-uploaded: by this client (its own upload
  // answered ok), or by anyone, announced as `board_thumbnail_updated`
  // (#595). Either way the strip and the class grid re-fetch the picture.
  | { type: 'thumbnail_baked'; boardId: string; at: string }

export function sortBoards(boards: readonly BoardSummary[]): BoardSummary[] {
  return [...boards].sort((a, b) => a.order - b.order)
}

export function boardsReducer(state: BoardSummary[], action: BoardsAction): BoardSummary[] {
  switch (action.type) {
    case 'lesson':
      return sortBoards(action.boards)
    case 'board_created': {
      // The REST reply and the broadcast both deliver the new board, and the
      // owner who created it receives both — so this has to be a merge.
      const { board } = action
      const without = state.filter(b => b.id !== board.id)
      return sortBoards([...without, board])
    }
    case 'board_renamed':
      return state.map(b => (b.id === action.boardId ? { ...b, name: action.name } : b))
    case 'boards_reordered': {
      const position = new Map(action.order.map((id, index) => [id, index]))
      // A board the order does not name (a create that raced the reorder)
      // keeps its place after everything named, rather than vanishing.
      return sortBoards(state.map(b => ({
        ...b, order: position.get(b.id) ?? action.order.length + b.order,
      })))
    }
    case 'board_deleted':
      return state.filter(b => b.id !== action.boardId)
    case 'thumbnail_baked':
      return state.map(b => (b.id === action.boardId ? { ...b, thumbnailUpdatedAt: action.at } : b))
  }
}

/** The board the teacher is on. `activeBoardId` null means the lesson's own
 *  first board — see the shared `Room.activeBoardId`. */
export function teacherBoardId(lesson: { id: string; activeBoardId: string | null }): string {
  return lesson.activeBoardId ?? lesson.id
}

/** What `set_active_board` carries for a board: the lesson's own board is
 *  stored as null server-side, and sending its id instead would be a second
 *  spelling of the same fact. */
export function activeBoardPayload(boardId: string, lessonId: string): string | null {
  return boardId === lessonId ? null : boardId
}

/** Where a client ends up when it enters a lesson, given the board its first
 *  `room_state` was for.
 *
 *  Entering by the lesson's URL lands on the teacher's board (ADR 014 §3),
 *  whichever board the server seated us on first. Entering by a *board's* URL
 *  (`room.lessonId` set — a link copied out of a preview request) means that
 *  board, and following is only on if that happens to be the teacher's: a
 *  client that followed would leave the very board it was sent to. */
export function entryBoard(input: {
  arrivedBoardId: string
  enteredByBoardUrl: boolean
  lesson: { id: string; activeBoardId: string | null }
}): { target: string; following: boolean } {
  const teacher = teacherBoardId(input.lesson)
  if (input.enteredByBoardUrl) {
    return { target: input.arrivedBoardId, following: input.arrivedBoardId === teacher }
  }
  return { target: teacher, following: true }
}

/** The board a following client should switch to now, or null to stay.
 *
 *  Null whenever the client is not following, is the owner (who never
 *  follows — they *are* the teacher), does not know the lesson yet, or is
 *  already on (or already on its way to) the teacher's board. */
export function followTarget(input: {
  following: boolean
  isOwner: boolean
  lessonId: string | null
  activeBoardId: string | null
  boardId: string | null
  wantedBoardId: string | null
  // (#595) Class mode — see followDestination. Optional so a caller that
  // knows nothing of it keeps the plain "teacher's board" rule.
  spotlightBoardId?: string | null
  ownAssignmentBoardId?: string | null
}): string | null {
  if (!input.following || input.isOwner || !input.lessonId) return null
  const destination = followDestination({
    lessonId: input.lessonId, activeBoardId: input.activeBoardId,
    spotlightBoardId: input.spotlightBoardId ?? null, ownAssignmentBoardId: input.ownAssignmentBoardId ?? null,
  })
  const heading = input.wantedBoardId ?? input.boardId
  return heading === destination ? null : destination
}

/** (#595, ADR 015 §6) Where "following the teacher" leads a student right
 *  now. The one the teacher is showing everyone, if any; else, while a round
 *  runs, the student's own board in it; else the teacher's board — exactly
 *  ADR 014's rule, which is what is left once class mode steps aside. */
export function followDestination(input: {
  lessonId: string
  activeBoardId: string | null
  spotlightBoardId: string | null
  ownAssignmentBoardId: string | null
}): string {
  return input.spotlightBoardId
    ?? input.ownAssignmentBoardId
    ?? teacherBoardId({ id: input.lessonId, activeBoardId: input.activeBoardId })
}

/** Whether a hand-picked board leaves following on.
 *
 *  Picking any other board is stepping away from the teacher, and the chip
 *  that brings the student back exists for exactly that. Picking the
 *  teacher's own board *is* coming back — reading it as "you left following"
 *  would put the chip up on a board the student shares with the teacher. */
export function followingAfterPick(pickedBoardId: string, teacherBoard: string): boolean {
  return pickedBoardId === teacherBoard
}

/** The strip order after moving `boardId` one step, or null when it cannot
 *  move: the lesson's own board is pinned first (its `boardOrder` is always
 *  0 server-side), and nothing moves past an end. */
export function movedOrder(
  boards: readonly BoardSummary[], boardId: string, direction: -1 | 1, lessonId: string,
): string[] | null {
  const ids = sortBoards(boards).map(b => b.id)
  const from = ids.indexOf(boardId)
  const to = from + direction
  if (boardId === lessonId || from < 0 || to < 1 || to >= ids.length) return null
  ids.splice(from, 1)
  ids.splice(to, 0, boardId)
  return ids
}
