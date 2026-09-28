import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { AssignmentSummary, BoardSummary } from '@grafetto/shared'

import { prisma } from '../db/prisma.js'
import { inheritedBoardFields } from './lessons.js'
import { flushRoomWrites } from './rooms.js'
import { toAssignmentSummary } from './roomLoader.js'

/** (#595, ADR 015 §4) The rows class mode creates: an assignment round and
 *  the personal boards in it. The in-memory side (rooms.ts's class-mode
 *  section) and the announcements (socketHandlers.ts) are the callers'; this
 *  file only writes, so the transaction is readable in one place.
 *
 *  A personal board is an ordinary board of the lesson — its own log, undo,
 *  snapshots and preview, exactly as ADR 014 made them — with an owner and a
 *  round. It is not a page of the strip: `boardOrder` stays 0 and the strip
 *  queries leave it out (boardRoutes.ts). */

const LESSON_FIELDS = {
  id: true, ownerId: true, paper: true, paperColor: true, infinite: true,
  canvasWidth: true, canvasHeight: true, enabledTools: true,
} as const

type Student = { userId: string; name: string }

function personalBoardSummary(row: { id: string; name: string; assignmentId: string | null; boardOwnerId: string | null }): BoardSummary {
  return { id: row.id, name: row.name, order: 0, assignmentId: row.assignmentId ?? undefined, ownerId: row.boardOwnerId ?? undefined }
}

/** Writes a new round and a blank board for each of `students`, and points
 *  the lesson at it — one transaction, so a class never sees a round with half
 *  its boards, and a failure leaves no round at all.
 *
 *  Whether a round may start (none running, the caller is the teacher) is
 *  decided before this, in memory — see rooms.ts's beginAssignmentStart. */
export async function createAssignment(
  lessonId: string, name: string, students: readonly Student[],
): Promise<{ assignment: AssignmentSummary; boards: BoardSummary[] }> {
  // The lesson row may still be a queued write if the round is handed out
  // seconds after the lesson was created (rooms.ts's persistRoomCreate is
  // fire-and-forget); every FK below needs it landed.
  await flushRoomWrites(lessonId)
  const lesson = await prisma.room.findUniqueOrThrow({ where: { id: lessonId }, select: LESSON_FIELDS })
  const last = await prisma.assignment.aggregate({ where: { lessonId }, _max: { order: true } })
  const order = (last._max.order ?? 0) + 1
  const assignmentId = randomUUID()

  const [assignment, boards] = await prisma.$transaction(async tx => {
    const created = await tx.assignment.create({ data: { id: assignmentId, lessonId, name, order } })
    const rows = await Promise.all(students.map(student => tx.room.create({
      data: {
        id: randomUUID(), name: student.name, assignmentId, boardOwnerId: student.userId,
        ...inheritedBoardFields(lesson),
      },
      select: { id: true, name: true, assignmentId: true, boardOwnerId: true },
    })))
    await tx.room.update({ where: { id: lessonId }, data: { activeAssignmentId: assignmentId, spotlightBoardId: null } })
    return [created, rows] as const
  })

  return { assignment: toAssignmentSummary(assignment), boards: boards.map(personalBoardSummary) }
}

/** The latecomer's board (ADR 015 §4): a student who arrives while a round is
 *  running gets theirs on arrival, the same blank board the others got.
 *  Idempotent under a race — two tabs of one student joining at once — by the
 *  `@@unique([assignmentId, boardOwnerId])` constraint: the loser reads back
 *  the winner's row. */
export async function createPersonalBoard(
  lessonId: string, assignmentId: string, student: Student,
): Promise<BoardSummary> {
  const lesson = await prisma.room.findUniqueOrThrow({ where: { id: lessonId }, select: LESSON_FIELDS })
  try {
    const row = await prisma.room.create({
      data: {
        id: randomUUID(), name: student.name, assignmentId, boardOwnerId: student.userId,
        ...inheritedBoardFields(lesson),
      },
      select: { id: true, name: true, assignmentId: true, boardOwnerId: true },
    })
    return personalBoardSummary(row)
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err
    const row = await prisma.room.findUniqueOrThrow({
      where: { assignmentId_boardOwnerId: { assignmentId, boardOwnerId: student.userId } },
      select: { id: true, name: true, assignmentId: true, boardOwnerId: true },
    })
    return personalBoardSummary(row)
  }
}
