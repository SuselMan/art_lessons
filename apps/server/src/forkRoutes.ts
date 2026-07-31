import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'

import { forkSeedUserId, type Operation } from '@grafetto/shared'
import { prisma } from './prisma.js'
import { toWireRoom } from './roomMapper.js'
import { flushRoomWrites } from './rooms.js'

/** Forking a room (#317) — the mechanism the homework model runs on (release
 *  track #314 §4: a lesson is closed for editing, and each student works in
 *  their own fork of it).
 *
 *  A fork is not a new kind of thing. It is an ordinary room that happens to
 *  start with content: the source's latest snapshot plus the operations that
 *  snapshot doesn't cover, copied into new rows. That choice is what keeps
 *  this small — the joining client's cold-load path (snapshot + tail) already
 *  exists for reconnecting to a long room (#149), and a fork simply arrives
 *  as one, so nothing new has to learn how to seed a canvas.
 *
 *  What deliberately does NOT come across: the password (the fork belongs to
 *  whoever made it, and inheriting a lesson's password would lock them out of
 *  their own work), `closedAt` (a fork exists to be drawn in), and the
 *  thumbnail (it will be re-baked from the fork's own content).
 */

/** Copying the log means new primary keys, and three operation types point at
 *  another operation by id (`operation_undo`/`_redo`/`_revoke`). Left
 *  unmapped they would point into the *source* room's log — ids that exist,
 *  in another room, which is worse than dangling. */
const OP_ID_REFERENCING_TYPES = new Set(['operation_undo', 'operation_redo', 'operation_revoke'])

function remapOperation(op: Operation, newId: string, seedUserId: string, idMap: Map<string, string>): Operation | null {
  const next = { ...op, id: newId, userId: seedUserId } as Operation

  if (OP_ID_REFERENCING_TYPES.has(op.type) && 'targetOpId' in op) {
    const mapped = idMap.get(op.targetOpId)
    // Its target didn't come along — it sits below the snapshot and isn't
    // structural, so the snapshot already contains the result of this undo
    // having happened. Carrying the record forward with a stale or invented
    // id could only misfire; dropping it changes nothing about how the fork
    // renders.
    if (!mapped) return null
    return { ...next, targetOpId: mapped } as Operation
  }
  return next
}

export function registerForkRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string }; Body?: { name?: string } }>('/api/rooms/:id/fork', async (request, reply) => {
    const sourceId = request.params.id
    const userId = request.userId

    // Being able to fork a room means being in it. Until real access control
    // lands (#224-#227) participation is the only membership fact there is,
    // and it is the same gate the snapshot routes already use — without it,
    // knowing a room id would be enough to pull a password-protected room's
    // content out through a copy of it.
    const [source, membership] = await Promise.all([
      prisma.room.findUnique({ where: { id: sourceId } }),
      prisma.roomParticipant.findUnique({ where: { roomId_userId: { roomId: sourceId, userId } } }),
    ])
    if (!source) return reply.code(404).send({ error: 'not_found' })
    if (!membership && source.ownerId !== userId) return reply.code(403).send({ error: 'forbidden' })

    // The source's own writes are queued, not synchronous (see rooms.ts's
    // enqueueWrite). Forking a lesson seconds after the last stroke would
    // otherwise copy a room that Postgres doesn't fully know about yet, and
    // lose exactly the work that was freshest.
    await flushRoomWrites(sourceId)

    const [layerSnapshots, layerState] = await Promise.all([
      prisma.roomLayerSnapshot.findMany({ where: { roomId: sourceId }, orderBy: { seq: 'desc' } }),
      prisma.roomLayerState.findUnique({ where: { roomId: sourceId } }),
    ])
    // Newest row per layer — retention keeps up to two (see rooms.ts's
    // SNAPSHOT_RETENTION_PER_LAYER), and a fork only needs each layer's
    // current pixels.
    const newestPerLayer = new Map<string, (typeof layerSnapshots)[number]>()
    for (const row of layerSnapshots) if (!newestPerLayer.has(row.layerId)) newestPerLayer.set(row.layerId, row)

    // (#371) Every operation comes across, and for now that is the whole log.
    // Coverage is per layer, so "what a fork can safely skip" is per layer
    // too — a question #372 answers. Copying everything is the one choice
    // that cannot silently drop content in the meantime, which is exactly
    // what #369 did by trusting a single room-wide snapshot seq.
    //
    // Whatever narrowing #372 restores here must keep `RESIDENT_OP_TYPES` at
    // any age: `aliveIds`/`deletedIds`/`lockedLayerIds` are rebuilt by folding
    // the log, so a fork missing the `layer_add` of an older layer would
    // render that layer fine and then refuse to ever delete it
    // (`target_gone`, the shape of #291's bug).
    const rows = await prisma.operation.findMany({
      where: { roomId: sourceId },
      orderBy: { seq: 'asc' },
    })

    const forkId = randomUUID().slice(0, 12)
    const seedUserId = forkSeedUserId(forkId)

    const idMap = new Map<string, string>()
    for (const row of rows) idMap.set(row.id, randomUUID())

    const operationRows: Prisma.OperationCreateManyInput[] = []
    for (const row of rows) {
      // The client replays `data`, not the columns (see loadResidentOperations)
      // — so the identity rewrite has to happen inside the stored operation
      // itself. Rewriting only the columns would produce a fork that looks
      // reseated in the database and still replays as the teacher's own log,
      // which is precisely the undo hazard this is here to remove.
      const remapped = remapOperation(row.data as Operation, idMap.get(row.id)!, seedUserId, idMap)
      if (!remapped) continue
      operationRows.push({
        id: remapped.id,
        seq: row.seq,
        type: row.type,
        roomId: forkId,
        userId: seedUserId,
        layerId: row.layerId,
        tool: row.tool,
        data: remapped as unknown as Prisma.InputJsonValue,
      })
    }

    const palette = await prisma.roomPalette.findUnique({ where: { roomId: sourceId }, select: { colors: true } })
    const name = request.body?.name?.trim() || source.name

    // One transaction: a fork that exists with half its content would look
    // like a lesson someone had already erased most of.
    await prisma.$transaction(async tx => {
      await tx.room.create({
        data: {
          id: forkId,
          name,
          paper: source.paper,
          paperColor: source.paperColor,
          infinite: source.infinite,
          canvasWidth: source.canvasWidth,
          canvasHeight: source.canvasHeight,
          ownerId: userId,
          parentRoomId: source.id,
        },
      })
      await tx.roomParticipant.create({ data: { roomId: forkId, userId } })
      if (palette) await tx.roomPalette.create({ data: { roomId: forkId, colors: palette.colors } })
      if (layerState) {
        await tx.roomLayerState.create({
          data: { roomId: forkId, seq: layerState.seq, state: layerState.state as Prisma.InputJsonValue },
        })
      }
      if (newestPerLayer.size > 0) {
        await tx.roomLayerSnapshot.createMany({
          data: [...newestPerLayer.values()].map(row => ({
            roomId: forkId,
            layerId: row.layerId,
            seq: row.seq,
            data: row.data,
            hash: row.hash,
            // Not inherited. Verification means "two clients independently
            // baked this and agreed"; nobody has baked anything in this room
            // yet, and the flag is what licenses deleting the operations a
            // snapshot claims to cover (see pruneOperationsBeforeSnapshot).
            verification: 'unverified',
          })),
        })
      }
      if (operationRows.length > 0) await tx.operation.createMany({ data: operationRows })
    })

    const created = await prisma.room.findUniqueOrThrow({ where: { id: forkId } })
    return reply.code(201).send({ room: toWireRoom(created) })
  })
}
