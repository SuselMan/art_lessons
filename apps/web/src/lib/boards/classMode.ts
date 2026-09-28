import type { BoardSummary, Participant } from '@grafetto/shared'

// (#595, ADR 015 §6) Class mode's reading of the lesson's board list, as pure
// functions — the same reason lib/boards/boards.ts exists. The server has already
// filtered the list for this person (a classmate's personal board is simply
// absent under `teacher_only`), so nothing here decides *access*; it decides
// what goes where on screen.

/** Whether a board is a student's own page in an assignment round. */
export function isPersonalBoard(board: Pick<BoardSummary, 'ownerId'>): boolean {
  return board.ownerId !== undefined
}

/** The lesson's pages — what the board strip shows. Personal boards have a
 *  grid of their own; twenty of them in the strip would bury the pages. */
export function stripBoards(boards: readonly BoardSummary[]): BoardSummary[] {
  return boards.filter(b => !isPersonalBoard(b))
}

/** `userId`'s board in round `assignmentId`, if they have one. */
export function ownBoardIn(
  boards: readonly BoardSummary[], assignmentId: string | null, userId: string,
): BoardSummary | undefined {
  if (!assignmentId) return undefined
  return boards.find(b => b.assignmentId === assignmentId && b.ownerId === userId)
}

export type GridTile = {
  board: BoardSummary
  /** The student is in the lesson right now. */
  present: boolean
  handRaised: boolean
}

/** The class grid of round `assignmentId`: one tile per personal board the
 *  client can see, raised hands first (that is who is waiting for the
 *  teacher), then by name — the order a teacher walks the room in, and the
 *  order the ‹ › arrows on a student's board follow. */
export function classGrid(
  boards: readonly BoardSummary[], assignmentId: string | null,
  presentUserIds: ReadonlySet<string>, handsRaised: readonly string[],
): GridTile[] {
  if (!assignmentId) return []
  const hands = new Set(handsRaised)
  return boards
    .filter(b => b.assignmentId === assignmentId && b.ownerId !== undefined)
    .map(board => ({ board, present: presentUserIds.has(board.ownerId!), handRaised: hands.has(board.ownerId!) }))
    .sort((a, b) => {
      if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1
      return a.board.name.localeCompare(b.board.name)
    })
}

/** The board ‹ or › leads to from `boardId` in the grid's order, wrapping
 *  round — "walk the class". Null when the grid has nothing else. */
export function neighbourInGrid(tiles: readonly GridTile[], boardId: string, step: -1 | 1): string | null {
  if (tiles.length === 0) return null
  const at = tiles.findIndex(t => t.board.id === boardId)
  if (at < 0) return tiles[step === 1 ? 0 : tiles.length - 1].board.id
  if (tiles.length === 1) return null
  return tiles[(at + step + tiles.length) % tiles.length].board.id
}

/** What the chip says to a student who is not where following would take
 *  them (ADR 015 §6): back to their own work while a round runs, the
 *  teacher's showing of someone's work while one is spotlit, otherwise the
 *  plain "teacher is on …" of ADR 014. */
export type FollowChip =
  | { kind: 'spotlight'; name: string }
  | { kind: 'ownWork' }
  | { kind: 'teacher'; name: string }

export function followChip(input: {
  destination: string
  spotlightBoardId: string | null
  ownAssignmentBoardId: string | null
  boards: readonly BoardSummary[]
}): FollowChip | null {
  const board = input.boards.find(b => b.id === input.destination)
  if (input.destination === input.spotlightBoardId) return board ? { kind: 'spotlight', name: board.name } : null
  if (input.destination === input.ownAssignmentBoardId) return { kind: 'ownWork' }
  return board ? { kind: 'teacher', name: board.name } : null
}

/** Whether the board this client is on is somebody else's personal board —
 *  one it may look at (the server let it in) but not draw on: the server
 *  refuses with `board_not_yours`, and the client shows it as closed rather
 *  than letting strokes vanish. The teacher draws everywhere. */
export function isForeignPersonalBoard(
  board: Pick<BoardSummary, 'ownerId'> | undefined, userId: string, isTeacher: boolean,
): boolean {
  return !!board?.ownerId && board.ownerId !== userId && !isTeacher
}

/** (#595) Whether the store's own roster names this client the lesson's
 *  teacher. For the socket handlers, which can run between the roster
 *  arriving and the render that refreshes `isOwnerRef`. */
export function isTeacherIn(s: { participants: readonly Participant[]; userId: string }): boolean {
  return s.participants.some(p => p.userId === s.userId && p.role === 'owner')
}
