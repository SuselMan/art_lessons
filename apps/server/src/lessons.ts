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
