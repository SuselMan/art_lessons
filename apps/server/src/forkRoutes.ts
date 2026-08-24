import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

import { forkSeedUserId, type Operation } from '@grafetto/shared'
import { prisma } from './prisma.js'
import { toWireRoom } from './roomMapper.js'
import { flushRoomWrites, isCoveredBySnapshot, residentOperationWhere } from './rooms.js'

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
 *  their own work), `closedAt` (a fork exists to be drawn in), the thumbnail
 *  (it will be re-baked from the fork's own content), and — same reasoning as
 *  the password — `accessMode` and the access rows behind it (#224). The
 *  invites, join requests and blocks belong to the lesson they were decided
 *  for, not to a student's copy of it; and since they don't travel, an
 *  inherited `invite_only` would mean a room with an empty allow-list, i.e.
 *  homework the teacher would have to queue up to see. The fork takes the
 *  column default (`anyone_with_link`), and its owner can close it down
 *  themselves.
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
      // (#418) Metadata only — deliberately no `data`. A layer's snapshot is
      // megabytes of gzipped tiles, and the only place those bytes are going
      // is another row of this same table, so reading them here would drag
      // the entire picture through this process's heap to hand it straight
      // back to Postgres. The copy is an INSERT ... SELECT below; all this
      // query has to answer is which rows to copy and what seq they cover.
      prisma.roomLayerSnapshot.findMany({
        where: { roomId: sourceId },
        select: { id: true, layerId: true, seq: true },
        orderBy: { seq: 'desc' },
      }),
      prisma.roomLayerState.findUnique({ where: { roomId: sourceId } }),
    ])
    // Newest row per layer — retention keeps up to two (see rooms.ts's
    // SNAPSHOT_RETENTION_PER_LAYER), and a fork only needs each layer's
    // current pixels.
    const newestPerLayer = new Map<string, (typeof layerSnapshots)[number]>()
    for (const row of layerSnapshots) if (!newestPerLayer.has(row.layerId)) newestPerLayer.set(row.layerId, row)

    // (#372) A fork is seeded with the snapshot rows copied below plus the
    // operations those pixels don't already account for — the same rule the
    // live server serves a joining client by, deliberately the same function
    // rather than a second reading of it.
    //
    // Per layer, never by a room-wide seq. A layer nobody snapshotted keeps
    // every one of its operations, which is what a fork of a room whose
    // structure outran its bakes depends on — the case #369 got wrong.
    // Structural operations (`RESIDENT_OP_TYPES`) are never coverable and so
    // always come across: `aliveIds`/`deletedIds`/`lockedLayerIds` are rebuilt
    // by folding the log, and a fork missing the `layer_add` of an older layer
    // would render that layer fine and then refuse to ever delete it
    // (`target_gone`, the shape of #291's bug).
    const coveredSeqByLayer = new Map(
      [...newestPerLayer.values()].map(row => [row.layerId, row.seq] as const),
    )

    // (#418) The exclusion goes into the query, not into a `.filter` on its
    // result — the same thing `loadResidentOperations` does and for the same
    // reason, which is why both now ask `residentOperationWhere` rather than
    // each writing it out. Reading the whole log first is what this route
    // used to do, and on a real lesson it is not a rounding error: F4uw21Ob
    // held 22 603 operations and 418 MB of stroke payload, of which 995 rows
    // and 4.4 MB survive the window. The other 414 MB became JS objects for
    // the sole purpose of being discarded three lines below, and took the
    // server's 2 GB with them — one student pressing "fork" killed the
    // process for every room on it.
    const allRows = await prisma.operation.findMany({
      where: residentOperationWhere(sourceId, coveredSeqByLayer),
      orderBy: { seq: 'asc' },
    })
    // null when there is no readable structure — see rooms.ts's layerStateIdsOf
    // for why that must not be confused with "every layer is gone".
    const storedItems = (layerState?.state as { items?: Record<string, unknown> } | undefined)?.items
    const layerStateIds = storedItems ? new Set(Object.keys(storedItems)) : null
    const rows = allRows.filter(row =>
      !isCoveredBySnapshot(coveredSeqByLayer, row.data as Operation, layerState?.seq ?? null, layerStateIds))

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
        // (#418) Raw, because this is the one statement whose entire point is
        // that the bytes never come out of Postgres: the blob is read and
        // rewritten inside the database, and this process only ever names the
        // rows. Everything the copy changes is in the SELECT list — a fresh
        // primary key, the fork's id, and the verification below.
        //
        // `verification` is not inherited. It means "two clients
        // independently baked this and agreed"; nobody has baked anything in
        // this room yet, and the flag is what licenses deleting the
        // operations a snapshot claims to cover (see
        // pruneOperationsBeforeSnapshot).
        await tx.$executeRaw`
          INSERT INTO "RoomLayerSnapshot" ("id", "roomId", "layerId", "seq", "data", "hash", "verification")
          SELECT gen_random_uuid()::text, ${forkId}, s."layerId", s."seq", s."data", s."hash", 'unverified'
          FROM "RoomLayerSnapshot" s
          WHERE s."id" IN (${Prisma.join([...newestPerLayer.values()].map(row => row.id))})
        `
      }
      if (operationRows.length > 0) await tx.operation.createMany({ data: operationRows })
    }, {
      // Prisma's default is 5 s, and this is the one route that writes a
      // whole room in a single statement batch — thousands of operation rows
      // plus a server-side copy of every layer's pixels. A fork that has
      // finished its work and then gets rolled back for taking six seconds
      // on a two-core box is a lesson the student is simply told they can't
      // have.
      timeout: 30_000,
    })

    const created = await prisma.room.findUniqueOrThrow({ where: { id: forkId } })
    return reply.code(201).send({ room: toWireRoom(created) })
  })
}
