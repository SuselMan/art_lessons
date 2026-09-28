import type { FastifyInstance } from 'fastify'
import type { ApiOk } from '@grafetto/shared'

import { apiRoute } from './apiRoute.js'
import { asString, readNullableString } from './input.js'
import { prisma } from './prisma.js'
import { toWireRoom, toWireRoomFolder } from './roomMapper.js'

/** Walks a folder's `parentFolderId` chain up to root, true if `targetId`
 *  appears anywhere in it — used to reject reparenting a folder into its own
 *  descendant (#212). */
async function isDescendantOf(candidateParentId: string, targetId: string): Promise<boolean> {
  let cursor: string | null = candidateParentId
  while (cursor !== null) {
    if (cursor === targetId) return true
    const folder: { parentFolderId: string | null } | null = await prisma.roomFolder.findUnique({
      where: { id: cursor },
      select: { parentFolderId: true },
    })
    if (!folder) return false
    cursor = folder.parentFolderId
  }
  return false
}

/** Folder-scoped organization for "Мои уроки" (#211 epic, issue #212).
 *  Folders are per-user and purely organizational (RoomParticipant.folderId,
 *  not a Room column — see schema.prisma) — never own room data, so deleting
 *  one is always data-safe; the empty-only-delete rule below exists purely to
 *  avoid silently reshuffling a user's own organization. */
export function registerRoomFolderRoutes(app: FastifyInstance): void {
  // Returns only the DIRECT children of one folder level (folders + rooms),
  // not the whole tree — a large room/folder collection must not force
  // fetching everything at once (#211 epic perf discussion). Omitted
  // `folderId` means the root level.
  apiRoute(app, 'GET /api/rooms', async (request) => {
    const folderId = request.query.folderId ?? null

    const [folders, participantRows] = await Promise.all([
      prisma.roomFolder.findMany({
        where: { userId: request.userId, parentFolderId: folderId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.roomParticipant.findMany({
        // (#176) Lessons only. No RoomParticipant row is ever written for a
        // board (see rooms.ts's joinRoom), so this cannot match one today;
        // the filter is here so the list stays honest if that ever changes.
        where: { userId: request.userId, folderId, room: { lessonId: null } },
        include: {
          room: {
            include: { thumbnail: { select: { updatedAt: true } }, owner: { select: { name: true } } },
          },
        },
        orderBy: { room: { createdAt: 'desc' } },
      }),
    ])

    return {
      folders: folders.map(toWireRoomFolder),
      rooms: participantRows.map((p) => toWireRoom({ ...p.room, folderId: p.folderId })),
    }
  })

  apiRoute(app, 'POST /api/rooms/folders', async (request, reply) => {
    // (#623) Read, not assumed: a missing name used to throw on `.trim()`
    // and answer 500.
    const name = asString(request.body?.name)?.trim()
    const parentFolderId = asString(request.body?.parentFolderId)
    if (!name) return reply.code(400).send({ error: 'invalid_name' })

    if (parentFolderId) {
      const parent = await prisma.roomFolder.findUnique({ where: { id: parentFolderId } })
      if (!parent || parent.userId !== request.userId) return reply.code(404).send({ error: 'not_found' })
    }

    const folder = await prisma.roomFolder.create({
      data: { userId: request.userId, name, parentFolderId: parentFolderId ?? null },
    })
    return toWireRoomFolder(folder)
  })

  apiRoute(app, 'PATCH /api/rooms/folders/:id',
    async (request, reply) => {
      const folder = await prisma.roomFolder.findUnique({ where: { id: request.params.id } })
      if (!folder || folder.userId !== request.userId) return reply.code(404).send({ error: 'not_found' })

      // Absent: leave the name alone. Present: it has to be a non-empty string.
      let name: string | undefined
      if (request.body?.name !== undefined) {
        name = asString(request.body.name)?.trim()
        if (!name) return reply.code(400).send({ error: 'invalid_name' })
      }
      const parent = readNullableString(request.body?.parentFolderId)
      if (!parent) return reply.code(400).send({ error: 'invalid_parent' })
      const parentFolderId = parent.value

      if (parentFolderId !== undefined && parentFolderId !== null) {
        if (parentFolderId === folder.id) return reply.code(400).send({ error: 'cycle' })
        const parent = await prisma.roomFolder.findUnique({ where: { id: parentFolderId } })
        if (!parent || parent.userId !== request.userId) return reply.code(404).send({ error: 'not_found' })
        if (await isDescendantOf(parentFolderId, folder.id)) return reply.code(400).send({ error: 'cycle' })
      }

      const updated = await prisma.roomFolder.update({
        where: { id: folder.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(parentFolderId !== undefined ? { parentFolderId } : {}),
        },
      })
      return toWireRoomFolder(updated)
    },
  )

  // Sets/clears the *caller's own* folder placement for one room — the
  // shared primitive behind "move room to folder" (drag&drop, the "Move
  // to..." menu action, and "create room inside this folder", all issues
  // downstream of #212). Only ever touches the caller's own RoomParticipant
  // row, same per-user-organization model as everything else here.
  apiRoute(app, 'PATCH /api/rooms/:id/folder',
    async (request, reply) => {
      const target = readNullableString(request.body?.folderId)
      if (!target || target.value === undefined) return reply.code(400).send({ error: 'invalid_folder' })
      const folderId = target.value
      if (folderId !== null) {
        const folder = await prisma.roomFolder.findUnique({ where: { id: folderId } })
        if (!folder || folder.userId !== request.userId) return reply.code(404).send({ error: 'not_found' })
      }

      const participant = await prisma.roomParticipant.findUnique({
        where: { roomId_userId: { roomId: request.params.id, userId: request.userId } },
      })
      if (!participant) return reply.code(404).send({ error: 'not_found' })

      await prisma.roomParticipant.update({ where: { id: participant.id }, data: { folderId } })
      return { ok: true } satisfies ApiOk
    },
  )

  apiRoute(app, 'DELETE /api/rooms/folders/:id', async (request, reply) => {
    const folder = await prisma.roomFolder.findUnique({ where: { id: request.params.id } })
    if (!folder || folder.userId !== request.userId) return reply.code(404).send({ error: 'not_found' })

    const [childRoomCount, childFolderCount] = await Promise.all([
      prisma.roomParticipant.count({ where: { folderId: folder.id } }),
      prisma.roomFolder.count({ where: { parentFolderId: folder.id } }),
    ])
    if (childRoomCount > 0 || childFolderCount > 0) return reply.code(409).send({ error: 'not_empty' })

    await prisma.roomFolder.delete({ where: { id: folder.id } })
    return { ok: true } satisfies ApiOk
  })
}
