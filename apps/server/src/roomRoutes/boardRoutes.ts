import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ApiOk, BoardSummary } from '@grafetto/shared'

import { apiRoute } from '../http/apiRoute.js'
import { prisma } from '../db/prisma.js'
import { isLesson } from '../rooms/lessons.js'
import { noteBoardCreated, noteBoardDeleted, noteBoardRenamed, noteBoardsReordered } from '../rooms/classroom.js'
import { flushRoomWrites } from '../rooms/rooms.js'

/** Board CRUD (#176, ADR 014 §3 — "Права"). Creating, renaming, reordering
 *  and deleting the pages of a lesson; all owner-only, all on the *lesson's*
 *  id, all REST for the reason every other persisted owner control is REST
 *  (#222, #226): the row is the truth, and the people inside the lesson learn
 *  about it through the notifier below.
 *
 *  A board is an ordinary `Room` row with `lessonId` set. It inherits paper,
 *  colour, canvas shape and the toolset from the lesson at creation — the
 *  same fields a fork copies (forkRoutes.ts) — and nothing social: it has no
 *  password, participants, invites or access mode of its own, because those
 *  are the lesson's and every gate reads them there (lessons.ts). Depth is
 *  one: a board's lesson must itself be a lesson, and the routes refuse to
 *  nest.
 *
 *  Deletion is hard and cascades (see schema.prisma's `LessonBoards`), so the
 *  client confirms first. The lesson itself is never deletable here — it is
 *  the first board and the lesson at once, and `DELETE /api/rooms/:id` is how
 *  a whole lesson goes. */

/** (#176) The live half, injected the same way `RoomAccessNotifier` is, so
 *  this file knows nothing about socket.io and boardRoutes.test.ts runs
 *  without a socket harness. index.ts supplies the real one.
 *
 *  `evacuateBoard` is the one that is awaited: it moves every socket off a
 *  board that is about to be forgotten, and the record is dropped only after
 *  it has (see rooms.ts's noteBoardDeleted). The rest are fire-and-forget
 *  announcements. */
export type BoardNotifier = {
  boardCreated: (lessonId: string, board: BoardSummary) => void
  boardRenamed: (lessonId: string, boardId: string, name: string) => void
  boardsReordered: (lessonId: string, order: string[]) => void
  boardDeleted: (lessonId: string, boardId: string) => void
  activeBoardChanged: (lessonId: string, boardId: string | null) => void
  evacuateBoard: (lessonId: string, boardId: string) => Promise<void>
}

type LessonRow = {
  id: string; name: string; ownerId: string; paper: string; paperColor: string | null; infinite: boolean
  canvasWidth: number | null; canvasHeight: number | null; enabledTools: string[]; activeBoardId: string | null
}

const LESSON_SELECT = {
  id: true, name: true, ownerId: true, lessonId: true, paper: true, paperColor: true, infinite: true,
  canvasWidth: true, canvasHeight: true, enabledTools: true, activeBoardId: true,
} as const

/** Resolves the lesson and proves the caller owns it, or sends the response
 *  itself and returns null — same shape as roomAccessRoutes.ts's
 *  `requireOwnedRoom`. 404 for a row that isn't there, 400 for one that is a
 *  board (depth one — see the file comment), 403 for one that isn't theirs. */
async function requireOwnedLesson(
  request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply,
): Promise<LessonRow | null> {
  const room = await prisma.room.findUnique({ where: { id: request.params.id }, select: LESSON_SELECT })
  if (!room) {
    await reply.code(404).send({ error: 'not_found' })
    return null
  }
  if (!isLesson(room)) {
    await reply.code(400).send({ error: 'not_a_lesson' })
    return null
  }
  if (room.ownerId !== request.userId) {
    await reply.code(403).send({ error: 'forbidden' })
    return null
  }
  return room
}

/** The strip as Postgres has it, lesson first. Same query rooms.ts's cold
 *  load runs; here because reordering has to start from the stored order, not
 *  from whatever a client last saw. */
async function loadStrip(lessonId: string): Promise<BoardSummary[]> {
  const rows = await prisma.room.findMany({
    // (#595) Pages of the lesson only: a student's personal board is not in
    // the strip, and its `boardOrder` means nothing (classMode.ts).
    where: { OR: [{ id: lessonId }, { lessonId, assignmentId: null }] },
    orderBy: { boardOrder: 'asc' },
    select: { id: true, name: true, boardOrder: true, thumbnail: { select: { updatedAt: true } } },
  })
  return rows.map(row => ({
    id: row.id, name: row.name, order: row.boardOrder,
    thumbnailUpdatedAt: row.thumbnail?.updatedAt.toISOString(),
  }))
}

export function registerBoardRoutes(app: FastifyInstance, notify?: BoardNotifier): void {
  apiRoute(app, 'POST /api/rooms/:id/boards', async (request, reply) => {
    const lesson = await requireOwnedLesson(request, reply)
    if (!lesson) return reply

    const requested = request.body?.name
    if (requested !== undefined && (typeof requested !== 'string' || !requested.trim())) {
      return reply.code(400).send({ error: 'invalid_name' })
    }

    // The lesson row itself may still be a queued write if the owner is
    // creating a board seconds after creating the lesson (rooms.ts's
    // persistRoomCreate is fire-and-forget); the FK below needs it landed.
    await flushRoomWrites(lesson.id)

    const last = await prisma.room.aggregate({ where: { lessonId: lesson.id, assignmentId: null }, _max: { boardOrder: true } })
    const boardOrder = (last._max.boardOrder ?? 0) + 1
    // Default name: the lesson's, numbered — locale-neutral, and what the
    // strip would show for an unnamed page anyway. The client can rename.
    const name = typeof requested === 'string' ? requested.trim() : `${lesson.name} ${boardOrder + 1}`

    const created = await prisma.room.create({
      data: {
        id: randomUUID(),
        name,
        lessonId: lesson.id,
        boardOrder,
        // Inherited from the lesson, as a fork inherits them: a page of the
        // same lesson is the same kind of sheet.
        paper: lesson.paper,
        paperColor: lesson.paperColor,
        infinite: lesson.infinite,
        canvasWidth: lesson.canvasWidth,
        canvasHeight: lesson.canvasHeight,
        // Stored for the record; the live value every gate reads is the
        // lesson's (rooms.ts's setRoomTools writes there).
        enabledTools: lesson.enabledTools,
        ownerId: lesson.ownerId,
      },
      select: { id: true, name: true, boardOrder: true },
    })

    const board: BoardSummary = { id: created.id, name: created.name, order: created.boardOrder }
    noteBoardCreated(lesson.id, board)
    notify?.boardCreated(lesson.id, board)
    return reply.code(201).send(board)
  })

  // Rename and/or reorder. Both fields optional and independently applied;
  // the lesson itself can be renamed here (its name is the first board's
  // name) but not moved — it is always first.
  apiRoute(app, 'PATCH /api/rooms/:id/boards/:boardId', async (request, reply) => {
      const lesson = await requireOwnedLesson(request, reply)
      if (!lesson) return reply
      const { boardId } = request.params

      const { name, order } = request.body ?? {}
      const wantsName = name !== undefined
      const wantsOrder = order !== undefined
      if (!wantsName && !wantsOrder) return reply.code(400).send({ error: 'nothing_to_update' })
      if (wantsName && (typeof name !== 'string' || !name.trim())) return reply.code(400).send({ error: 'invalid_name' })

      const strip = await loadStrip(lesson.id)
      const current = strip.find(b => b.id === boardId)
      if (!current) return reply.code(404).send({ error: 'not_found' })

      let nextOrder: string[] | null = null
      if (wantsOrder) {
        if (boardId === lesson.id) return reply.code(400).send({ error: 'lesson_is_first' })
        if (typeof order !== 'number' || !Number.isInteger(order) || order < 1 || order >= strip.length) {
          return reply.code(400).send({ error: 'invalid_order' })
        }
        const rest = strip.filter(b => b.id !== boardId)
        rest.splice(order, 0, current)
        nextOrder = rest.map(b => b.id)
        // Rewrite every position that changed, in one transaction so the strip
        // never reads half-moved. The lesson stays at 0 by construction.
        const changed = rest
          .map((b, index) => ({ id: b.id, index }))
          .filter(({ id, index }) => strip.find(b => b.id === id)?.order !== index)
        await prisma.$transaction(changed.map(({ id, index }) =>
          prisma.room.update({ where: { id }, data: { boardOrder: index } })))
        noteBoardsReordered(lesson.id, nextOrder)
        notify?.boardsReordered(lesson.id, nextOrder)
      }

      if (wantsName) {
        const trimmed = (name as string).trim()
        await prisma.room.update({ where: { id: boardId }, data: { name: trimmed } })
        noteBoardRenamed(lesson.id, boardId, trimmed)
        notify?.boardRenamed(lesson.id, boardId, trimmed)
        current.name = trimmed
      }

      const finalOrder = nextOrder ?? strip.map(b => b.id)
      return {
        board: { ...current, order: finalOrder.indexOf(boardId) },
        order: finalOrder,
      }
    },
  )

  apiRoute(app, 'DELETE /api/rooms/:id/boards/:boardId', async (request, reply) => {
      const lesson = await requireOwnedLesson(request, reply)
      if (!lesson) return reply
      const { boardId } = request.params
      if (boardId === lesson.id) return reply.code(400).send({ error: 'cannot_delete_lesson' })

      const board = await prisma.room.findUnique({ where: { id: boardId }, select: { id: true, lessonId: true } })
      if (!board || board.lessonId !== lesson.id) return reply.code(404).send({ error: 'not_found' })

      // Row first, so no join can land on the board while its sockets are
      // being moved off it: `ensureRoomLoaded` finds nothing and answers
      // not_found. The cascade takes operations, snapshots, layer state and
      // thumbnail with it; the lesson's pointer to it goes in the same step.
      const wasActiveInDb = lesson.activeBoardId === boardId
      await prisma.$transaction([
        prisma.room.delete({ where: { id: boardId } }),
        ...(wasActiveInDb
          ? [prisma.room.update({ where: { id: lesson.id }, data: { activeBoardId: null } })]
          : []),
      ])

      // Then the live side: everyone on it moved to the lesson's first board
      // and handed a room_state for it, then the record forgotten.
      await notify?.evacuateBoard(lesson.id, boardId)
      const { wasActive } = noteBoardDeleted(lesson.id, boardId)
      notify?.boardDeleted(lesson.id, boardId)
      if (wasActive || wasActiveInDb) notify?.activeBoardChanged(lesson.id, null)
      return { ok: true } satisfies ApiOk
    },
  )
}
