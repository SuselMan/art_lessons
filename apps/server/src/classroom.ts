import type { AssignmentSummary, BoardSummary, ClassVisibility, LessonState } from '@grafetto/shared'

import { prisma } from './prisma.js'
import { canSeeBoard } from './lessons.js'
import { enqueueWrite, lessonRecordOf, rooms, socialRecord, type RoomRecord } from './roomRegistry.js'

/** (#612) A live lesson's classroom: its board strip and which board the class
 *  is on (#176, ADR 014), and class mode — assignments, spotlight, hands,
 *  visibility (#595, ADR 015). What a resident lesson record holds about them
 *  and what each recipient of `room_state` / `lesson_state` is allowed to see.
 *  Rows are written by boardRoutes.ts and classMode.ts; this is the in-memory
 *  half they report to. Moved out of rooms.ts. */

/** (#595) The lesson half of `room_state`, for one recipient — see the shared
 *  `LessonState`. Every personal board this person may not see is left out
 *  entirely, not just its picture: under `teacher_only` a classmate's board id
 *  is itself a thing they have no use for. */
export function lessonStateFor(lesson: RoomRecord, viewerId: string): LessonState {
  const facts = lessonVisibility(lesson)
  return {
    id: lesson.room.id,
    boards: lesson.boards.filter(b => canSeeBoard(viewerId, { board: { id: b.id, boardOwnerId: b.ownerId }, lesson: facts })),
    activeBoardId: lesson.room.activeBoardId ?? null,
    assignments: lesson.assignments,
    activeAssignmentId: lesson.activeAssignmentId,
    spotlightBoardId: lesson.spotlightBoardId,
    classVisibility: facts.classVisibility,
    handsRaised: [...lesson.handsRaised],
  }
}

function lessonVisibility(lesson: RoomRecord): {
  ownerId: string; classVisibility: ClassVisibility; spotlightBoardId: string | null
} {
  return {
    ownerId: lesson.room.ownerId,
    classVisibility: lesson.room.classVisibility ?? 'teacher_only',
    spotlightBoardId: lesson.spotlightBoardId,
  }
}

/** (#595) `LessonState` for `viewerId`, for the `lesson_state` event. */
export function getLessonStateFor(lessonId: string, viewerId: string): LessonState | undefined {
  const lesson = socialRecord(lessonId)
  return lesson && lessonStateFor(lesson, viewerId)
}

// ── Boards (#176, ADR 014) ─────────────────────────────────────────────────
//
// The mirrors boardRoutes.ts calls after each Postgres write, same
// caller-persists division as setRoomClosed: the route owns the row, this
// file owns what a live lesson is told. Each is a no-op for a lesson that is
// not resident — its next cold load reads the rows.

/** The lesson's strip, for a route that has to compute a new order from the
 *  current one without a round trip. Undefined when not resident. */
export function getLessonBoards(roomId: string): BoardSummary[] | undefined {
  return socialRecord(roomId)?.boards
}

/** Records the owner's move (`set_active_board`) on the lesson and persists
 *  it, so the next joiner lands there. Returns the value stored — the
 *  lesson's own board is stored as `null`, so the wire never carries two
 *  spellings of "the first board" — or `false` when `boardId` is not a board
 *  of this lesson (a client naming a board it just deleted, or another
 *  lesson's) and nothing was changed. */
export function setActiveBoard(roomId: string, boardId: string | null): string | null | false {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  const lessonId = lesson.room.id
  const stored = boardId === lessonId ? null : boardId
  // (#595, ADR 015 §4) Shared boards only. The teacher visiting a student's
  // personal board is an ordinary `join_room`, not a page turn for the class:
  // stored here, it would send every following student — and every later
  // joiner and reload — onto somebody else's work.
  if (stored !== null && !lesson.boards.some(b => b.id === stored && !b.ownerId)) return false
  lesson.room = { ...lesson.room, activeBoardId: stored ?? undefined }
  enqueueWrite(lessonId, () => prisma.room.update({ where: { id: lessonId }, data: { activeBoardId: stored } }))
  return stored
}

export function noteBoardCreated(lessonId: string, board: BoardSummary): void {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return
  lesson.boards = [...lesson.boards.filter(b => b.id !== board.id), board].sort((a, b) => a.order - b.order)
}

export function noteBoardRenamed(lessonId: string, boardId: string, name: string): void {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return
  lesson.boards = lesson.boards.map(b => b.id === boardId ? { ...b, name } : b)
  // The board's own `room` is what its room_state sends; the lesson's `room`
  // doubles as its first board's, so a rename of the lesson lands there too.
  const board = rooms.get(boardId)
  if (board) board.room = { ...board.room, name }
}

/** `order` is the whole strip, lesson first, as boardRoutes.ts wrote it. */
export function noteBoardsReordered(lessonId: string, order: readonly string[]): void {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return
  const position = new Map(order.map((id, index) => [id, index]))
  lesson.boards = lesson.boards
    .map(b => ({ ...b, order: position.get(b.id) ?? b.order }))
    .sort((a, b) => a.order - b.order)
  for (const b of lesson.boards) {
    const board = rooms.get(b.id)
    if (board) board.room = { ...board.room, boardOrder: b.order }
  }
}

/** Forgets a deleted board: off the strip, out of memory, and no longer the
 *  active one. Returns whether it *was* the active board, so the caller can
 *  say so to the lesson — the socket layer has already moved everyone who was
 *  on it (see socketHandlers.ts's evacuateBoard), so the record is dropped
 *  outright rather than waited out: its pending writes target a row that no
 *  longer exists. */
export function noteBoardDeleted(lessonId: string, boardId: string): { wasActive: boolean } {
  const lesson = rooms.get(lessonId)
  if (boardId !== lessonId) rooms.delete(boardId)
  if (!lesson || lesson.lessonId !== null || boardId === lessonId) return { wasActive: false }
  lesson.boards = lesson.boards.filter(b => b.id !== boardId)
  const wasActive = lesson.room.activeBoardId === boardId
  if (wasActive) lesson.room = { ...lesson.room, activeBoardId: undefined }
  return { wasActive }
}

// ── Class mode (#595, ADR 015) ─────────────────────────────────────────────
//
// The in-memory half of assignments, spotlight, hands and visibility, with
// the same caller-persists split the board mirrors above use where a row has
// to be *created* (classMode.ts owns the transaction, this module is told), and
// write-through here where it is only a column of the lesson.

/** Whether `userId` may see the resident board `roomId` — see lessons.ts's
 *  canSeeBoard. False for a room that is not resident: every caller has just
 *  loaded it, or is asking on behalf of someone who would have to be on it. */
export function canSeeResidentBoard(roomId: string, userId: string): boolean {
  const record = rooms.get(roomId)
  if (!record) return false
  return canSeeBoard(userId, { board: record.room, lesson: lessonVisibility(lessonRecordOf(record)) })
}

/** Whether `userId` may see board `boardId` of `lessonId`, answered from the
 *  lesson's strip cache — for a board that need not itself be resident, such
 *  as one whose preview just arrived. False for a board the lesson does not
 *  list. */
export function canSeeLessonBoard(lessonId: string, boardId: string, userId: string): boolean {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return false
  const board = lesson.boards.find(b => b.id === boardId)
  if (!board) return false
  return canSeeBoard(userId, { board: { id: board.id, boardOwnerId: board.ownerId }, lesson: lessonVisibility(lesson) })
}

export type Classroom = {
  lessonId: string
  ownerId: string
  activeAssignmentId: string | null
  /** Students present right now (members, not the teacher), in join order. */
  students: Array<{ userId: string; name: string }>
}

/** The facts class mode's socket handlers act on, for any board of a lesson. */
export function getClassroom(roomId: string): Classroom | undefined {
  const lesson = socialRecord(roomId)
  if (!lesson) return undefined
  return {
    lessonId: lesson.room.id,
    ownerId: lesson.room.ownerId,
    activeAssignmentId: lesson.activeAssignmentId,
    students: [...lesson.participants.values()]
      .filter(p => p.role === 'member')
      .map(p => ({ userId: p.userId, name: p.name })),
  }
}

/** Claims the right to create an assignment. False while another creation is
 *  still writing — a double tap makes one. The claim is released by
 *  `noteAssignmentStarted` or `abortAssignmentStart`. */
export function beginAssignmentStart(lessonId: string): boolean {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return false
  if (lesson.assignmentStarting) return false
  lesson.assignmentStarting = true
  return true
}

export function abortAssignmentStart(lessonId: string): void {
  const lesson = rooms.get(lessonId)
  if (lesson) lesson.assignmentStarting = false
}

/** The round classMode.ts just wrote, with its personal boards. The lesson
 *  row's own pointer was written in the same transaction. */
export function noteAssignmentStarted(lessonId: string, assignment: AssignmentSummary, boards: BoardSummary[]): void {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return
  lesson.assignmentStarting = false
  lesson.assignments = [...lesson.assignments.filter(a => a.id !== assignment.id), assignment]
    .sort((a, b) => a.order - b.order)
  lesson.activeAssignmentId = assignment.id
  lesson.spotlightBoardId = null
  for (const board of boards) noteBoardCreated(lessonId, board)
}

/** (ADR 015 §11) Moves the class: to an assignment of this lesson, or
 *  (null) to the teacher's board — "Все ко мне". The spotlight comes down
 *  with any move. False, nothing changed, for an assignment this lesson does
 *  not have, or for the place the class already is. Nothing ends: the
 *  assignment stays in the list, its boards the students'. */
export function setClassLocation(lessonId: string, assignmentId: string | null): boolean {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return false
  if (assignmentId !== null && !lesson.assignments.some(a => a.id === assignmentId)) return false
  if (lesson.activeAssignmentId === assignmentId) return false
  lesson.activeAssignmentId = assignmentId
  lesson.spotlightBoardId = null
  enqueueWrite(lessonId, () => prisma.room.update({
    where: { id: lessonId }, data: { activeAssignmentId: assignmentId, spotlightBoardId: null },
  }))
  return true
}

/** The personal board `userId` has in round `assignmentId`, if any. */
export function personalBoardIn(lessonId: string, assignmentId: string, userId: string): BoardSummary | undefined {
  return rooms.get(lessonId)?.boards.find(b => b.assignmentId === assignmentId && b.ownerId === userId)
}

/** Puts a student's personal board in front of the class, or (null) takes it
 *  down. Any assignment's (ADR 015 §11: "show everyone" works wherever the
 *  class is). False — nothing changed — for anything that is not a personal
 *  board of this lesson: a shared board is already everyone's. */
export function setSpotlight(lessonId: string, boardId: string | null): boolean {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return false
  if (boardId !== null) {
    const board = lesson.boards.find(b => b.id === boardId)
    if (!board || !board.assignmentId) return false
  }
  if (lesson.spotlightBoardId === boardId) return false
  lesson.spotlightBoardId = boardId
  enqueueWrite(lessonId, () => prisma.room.update({ where: { id: lessonId }, data: { spotlightBoardId: boardId } }))
  return true
}

/** A hand up or down. Only for someone present — a hand is a gesture in the
 *  room — and only when it changes. */
export function setHandRaised(lessonId: string, userId: string, raised: boolean): boolean {
  const lesson = socialRecord(lessonId)
  if (!lesson || !lesson.participants.has(userId)) return false
  if (lesson.handsRaised.has(userId) === raised) return false
  if (raised) lesson.handsRaised.add(userId)
  else lesson.handsRaised.delete(userId)
  return true
}

export function setClassVisibility(lessonId: string, value: ClassVisibility): boolean {
  const lesson = rooms.get(lessonId)
  if (!lesson || lesson.lessonId !== null) return false
  if ((lesson.room.classVisibility ?? 'teacher_only') === value) return false
  lesson.room = { ...lesson.room, classVisibility: value }
  enqueueWrite(lessonId, () => prisma.room.update({ where: { id: lessonId }, data: { classVisibility: value } }))
  return true
}

/** A board's preview was just stored: the strip cache learns its new key and
 *  the caller learns which lesson to announce it in. Undefined when no
 *  resident lesson lists the board — nobody is there to tell. */
export function noteBoardThumbnail(boardId: string, updatedAt: string): string | undefined {
  const own = rooms.get(boardId)
  const candidates = own ? [lessonRecordOf(own)] : [...rooms.values()].filter(r => r.lessonId === null)
  for (const lesson of candidates) {
    if (!lesson.boards.some(b => b.id === boardId)) continue
    lesson.boards = lesson.boards.map(b => b.id === boardId ? { ...b, thumbnailUpdatedAt: updatedAt } : b)
    return lesson.room.id
  }
  return undefined
}
