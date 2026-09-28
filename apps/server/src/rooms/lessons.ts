import type { ClassVisibility } from '@grafetto/shared'

/** (#176, ADR 014) The one resolution rule boards are built on.
 *
 *  A lesson is a Room with `lessonId` null, and is also its own first board;
 *  every other board is a Room whose `lessonId` names the lesson. Everything
 *  *social* about a room — who may join, who is in it, whether it is closed
 *  or frozen, which tools it offers, its palette — is a fact about the lesson,
 *  and every gate that asks such a question asks it of `lessonOf(room)`.
 *  Everything *content* — operations, snapshots, layer state, thumbnail — is a
 *  fact about the board and is asked of the board itself.
 *
 *  A function rather than a convention because the alternative was every
 *  caller spelling `room.lessonId ?? room.id` for itself, and the first one to
 *  forget the `??` would have a board with its own, empty, allow-list — i.e. a
 *  door into a private lesson that nobody locked. Pure, so the in-memory
 *  record, a Prisma row and a wire `Room` all go through the same line. */
export function lessonOf(room: { id: string; lessonId?: string | null }): string {
  return room.lessonId ?? room.id
}

/** Whether this row is a lesson (and so may own boards, participants, access
 *  rules) rather than a page of one. Depth is exactly one, so "not a board" and
 *  "is a lesson" are the same question. */
export function isLesson(room: { lessonId?: string | null }): boolean {
  return room.lessonId === null || room.lessonId === undefined
}

/** (#595, ADR 015 §3) What decides who may look at a board, in the shape every
 *  caller has on hand — the in-memory records, a Prisma row with its lesson
 *  selected, or a socket's cached view. */
export type BoardVisibilityFacts = {
  board: { id: string; boardOwnerId?: string | null }
  lesson: { ownerId: string; classVisibility?: ClassVisibility | null; spotlightBoardId?: string | null }
}

/** Whether `userId` may see `board`: its content over the socket
 *  (`join_room`), its snapshots and preview over REST, and its existence in
 *  their `lesson_state`. One function for all three, because the three
 *  drifting apart is how a student's work leaks through the one door nobody
 *  re-checked.
 *
 *  A shared board (no `boardOwnerId`) is everyone's in the lesson. A personal
 *  board is its student's and the teacher's; the rest of the class sees it
 *  when the lesson shows work to the class, or while the teacher is showing
 *  this very board to everyone. */
export function canSeeBoard(userId: string, { board, lesson }: BoardVisibilityFacts): boolean {
  if (!board.boardOwnerId) return true
  return userId === lesson.ownerId
    || userId === board.boardOwnerId
    || lesson.classVisibility === 'class'
    || board.id === lesson.spotlightBoardId
}

/** Whether `userId` may draw (or annotate) on `board` at all. Seeing is not
 *  drawing: a classmate who can look at a work under `class` visibility still
 *  cannot touch it. The lesson-wide gates (closed, frozen, locks) come on top
 *  of this, not instead of it. */
export function canDrawOnBoard(userId: string, board: { boardOwnerId?: string | null }, lessonOwnerId: string): boolean {
  return !board.boardOwnerId || userId === board.boardOwnerId || userId === lessonOwnerId
}

/** The columns a new board takes from its lesson — the same set a fork copies
 *  (forkRoutes.ts): a page of the same lesson is the same kind of sheet. Used
 *  by the strip's "+" (boardRoutes.ts) and by class mode's personal boards. */
export function inheritedBoardFields(lesson: {
  id: string; ownerId: string; paper: string; paperColor: string | null; infinite: boolean
  canvasWidth: number | null; canvasHeight: number | null; enabledTools: string[]
}) {
  return {
    lessonId: lesson.id,
    paper: lesson.paper,
    paperColor: lesson.paperColor,
    infinite: lesson.infinite,
    canvasWidth: lesson.canvasWidth,
    canvasHeight: lesson.canvasHeight,
    // Stored for the record; the live value every gate reads is the lesson's
    // (rooms.ts's setRoomTools writes there).
    enabledTools: lesson.enabledTools,
    ownerId: lesson.ownerId,
  }
}
