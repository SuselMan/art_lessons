import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

import { forkSeedUserId, type Operation } from '@grafetto/shared'
import { prisma } from './prisma.js'
import { canSeeBoard, isLesson, lessonOf } from './lessons.js'
import { toWireRoom } from './roomMapper.js'
import { flushRoomWrites } from './rooms.js'
import { residentOperationWhere } from './snapshotCoverage.js'

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
 *  (#568, ADR 014 §5) With boards there are two things "fork" can mean, and
 *  the two callers already differ in intent:
 *
 *   - `scope: 'board'` — the student's «взять в работу» from inside a closed
 *     lesson. The sheet they are looking at, whichever board of the lesson it
 *     is, becomes a standalone room of their own (`lessonId: null`). One
 *     board, seeded exactly as before.
 *   - `scope: 'lesson'` — «Форк» from «Мои уроки». The lesson and every board
 *     of it, in one transaction: each board is seeded by the same procedure,
 *     the copies point at the new lesson with their order kept, and
 *     `activeBoardId` is remapped to the copy of the board it named. This is
 *     what a lesson *template* (#107) is — a prepared set of boards a teacher
 *     forks and then teaches from.
 *
 *  The seeding of one board (`prepareSeed`/`writeSeed`) is the same code in
 *  both cases; the lesson fork is that procedure in a loop. The social side
 *  is written once, on the new lesson, because that is where every gate reads
 *  it (lessons.ts's `lessonOf`): boards get no participant row, no palette.
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

export type ForkScope = 'lesson' | 'board'

function isForkScope(value: unknown): value is ForkScope {
  return value === 'lesson' || value === 'board'
}

/** Copying the log means new primary keys, and three operation types point at
 *  another operation by id (`operation_undo`/`_redo`/`_revoke`). Left
 *  unmapped they would point into the *source* room's log — ids that exist,
 *  in another room, which is worse than dangling. */
const OP_ID_REFERENCING_TYPES = new Set(['operation_undo', 'operation_redo', 'operation_revoke'])

/** The primary key a copied operation gets: a pure function of the source id
 *  and the fork's id. Pure on purpose — the bulk of the log is copied inside
 *  Postgres (`md5(o."id" || fork)`, see `writeSeed`) and the few referencing
 *  rows are rewritten here, and the two have to agree about what every id
 *  became without a map crossing the wire. Unique per (source row, fork), and
 *  nothing reads an operation id as anything but an opaque string. */
export function copiedOperationId(sourceOpId: string, forkId: string): string {
  return createHash('md5').update(sourceOpId + forkId).digest('hex')
}

function remapOperation(op: Operation, forkId: string, seedUserId: string, copiedIds: ReadonlySet<string>): Operation | null {
  const next = { ...op, id: copiedOperationId(op.id, forkId), userId: seedUserId } as Operation

  if (OP_ID_REFERENCING_TYPES.has(op.type) && 'targetOpId' in op) {
    // Its target didn't come along — it sits below the snapshot and isn't
    // structural, so the snapshot already contains the result of this undo
    // having happened. Carrying the record forward with a stale or invented
    // id could only misfire; dropping it changes nothing about how the fork
    // renders.
    if (!copiedIds.has(op.targetOpId)) return null
    return { ...next, targetOpId: copiedOperationId(op.targetOpId, forkId) } as Operation
  }
  return next
}

/** (#568) Ids per `INSERT ... SELECT`. Prisma binds each id as its own
 *  parameter and Postgres takes 32 767 of them per statement; a room nobody
 *  ever snapshotted copies its whole log, and the largest lesson on record
 *  held 22 603 rows. */
const BULK_COPY_CHUNK = 10_000

/** Everything one board's copy needs, read and rewritten in memory before
 *  the transaction opens — so the transaction's 30 s hold only the writes. */
type BoardSeed = {
  layerState: { seq: number; state: Prisma.InputJsonValue } | null
  /** Source `RoomLayerSnapshot` ids to copy — the newest row per layer. */
  snapshotIds: string[]
  /** Source operation ids Postgres copies on its own (`writeSeed`). */
  bulkOperationIds: string[]
  /** The rows that had to be rewritten here — the ones naming another
   *  operation by id — ready for `createMany`. */
  operationRows: Prisma.OperationCreateManyInput[]
}

async function prepareSeed(sourceId: string, forkId: string): Promise<BoardSeed> {
  // The source's own writes are queued, not synchronous (see rooms.ts's
  // enqueueWrite). Forking a lesson seconds after the last stroke would
  // otherwise copy a room that Postgres doesn't fully know about yet, and
  // lose exactly the work that was freshest. Per board: each has its own
  // queue.
  await flushRoomWrites(sourceId)

  const [layerSnapshots, layerState] = await Promise.all([
    // (#418) Metadata only — deliberately no `data`. A layer's snapshot is
    // megabytes of gzipped tiles, and the only place those bytes are going
    // is another row of this same table, so reading them here would drag
    // the entire picture through this process's heap to hand it straight
    // back to Postgres. The copy is an INSERT ... SELECT in `writeSeed`; all
    // this query has to answer is which rows to copy and what seq they cover.
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
  // operations those pixels don't already account for.
  //
  // Per layer, never by a room-wide seq. A layer nobody snapshotted keeps
  // every one of its operations, which is what a fork of a room whose
  // structure outran its bakes depends on — the case #369 got wrong.
  const coveredSeqByLayer = new Map(
    [...newestPerLayer.values()].map(row => [row.layerId, row.seq] as const),
  )

  // (#418) The exclusion goes into the query, not into a `.filter` on its
  // result — the same thing `loadResidentOperations` does and for the same
  // reason, which is why both ask `residentOperationWhere` rather than each
  // writing it out. Reading the whole log first is what this route used to
  // do, and on a real lesson it is not a rounding error: F4uw21Ob held
  // 22 603 operations and 418 MB of stroke payload, of which 995 rows and
  // 4.4 MB survive the window. The other 414 MB became JS objects for the
  // sole purpose of being discarded, and took the server's 2 GB with them —
  // one student pressing "fork" killed the process for every room on it.
  //
  // (#498) And this window, not the finer one. There are two, they answer
  // different questions, and a fork is the one place that must not confuse
  // them:
  //
  //   - `residentOperationWhere` — what Postgres has to KEEP. Structural
  //     operations are never in it, however old they are, because
  //     `aliveIds`/`deletedIds`/`lockedLayerIds` exist only as a fold over
  //     the stored log (see rooms.ts's RESIDENT_OP_TYPES).
  //   - `isCoveredBySnapshot` — what a reader is SENT. It additionally
  //     withholds anything a stored layerState already accounts for, which
  //     for a joining client is right: it seeds its structure from that
  //     layerState, so it needs no `layer_add` to know a layer exists.
  //
  // A fork wrote the second one to disk, and the server never gets a
  // layerState to seed from — it folds. So every structural operation below
  // `layerState.seq` was dropped on the way in, and the copy came up
  // believing layers it was visibly rendering did not exist. The lesson
  // Ilya forked lost the `layer_merge` that created "grdients" (seq 11557,
  // structure at 22400): the layer drew, and deleting it answered
  // `target_gone` — "another participant already deleted this layer" —
  // forever. That is #291's bug, arrived at from the other end.
  //
  // (#568) And, like the snapshot query above, ids only — no `data`. The
  // stroke payloads are copied inside Postgres (`writeSeed`), for the same
  // reason the pixels are: measured on a laptop, 2 000 rows of 5 KB strokes
  // took 5.6 s to go out through Prisma's `createMany` and 0.33 s as one
  // `INSERT ... SELECT`, and a lesson fork pays that per board. What this
  // query answers is *which* rows the window admits — the rule stays in
  // `residentOperationWhere`, asked of Postgres, and the copy names the rows
  // it chose.
  const resident = await prisma.operation.findMany({
    where: residentOperationWhere(sourceId, coveredSeqByLayer),
    select: { id: true, type: true },
    orderBy: { seq: 'asc' },
  })
  const copiedIds = new Set(resident.map(row => row.id))
  const bulkOperationIds = resident.filter(row => !OP_ID_REFERENCING_TYPES.has(row.type)).map(row => row.id)
  const referencingIds = resident.filter(row => OP_ID_REFERENCING_TYPES.has(row.type)).map(row => row.id)

  // The rows that name another operation are the one part of the log that
  // SQL cannot rewrite blindly: a target below the window is dropped, not
  // remapped (see `remapOperation`). They carry no stroke payload, so
  // reading them is cheap — and they are the only rows read in full.
  const referencing = referencingIds.length > 0
    ? await prisma.operation.findMany({ where: { id: { in: referencingIds } }, orderBy: { seq: 'asc' } })
    : []

  const seedUserId = forkSeedUserId(forkId)
  const operationRows: Prisma.OperationCreateManyInput[] = []
  for (const row of referencing) {
    // The client replays `data`, not the columns (see loadResidentOperations)
    // — so the identity rewrite has to happen inside the stored operation
    // itself. Rewriting only the columns would produce a fork that looks
    // reseated in the database and still replays as the teacher's own log,
    // which is precisely the undo hazard this is here to remove.
    const remapped = remapOperation(row.data as Operation, forkId, seedUserId, copiedIds)
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

  return {
    layerState: layerState ? { seq: layerState.seq, state: layerState.state as Prisma.InputJsonValue } : null,
    snapshotIds: [...newestPerLayer.values()].map(row => row.id),
    bulkOperationIds,
    operationRows,
  }
}

/** The content half of one board's copy. Runs after the Room row exists —
 *  every table here has a foreign key to it. */
async function writeSeed(tx: Prisma.TransactionClient, forkId: string, seed: BoardSeed): Promise<void> {
  if (seed.layerState) {
    await tx.roomLayerState.create({ data: { roomId: forkId, seq: seed.layerState.seq, state: seed.layerState.state } })
  }
  if (seed.snapshotIds.length > 0) {
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
      WHERE s."id" IN (${Prisma.join(seed.snapshotIds)})
    `
  }
  // (#568) The log, the same way: the stroke payloads are read and rewritten
  // inside Postgres, and this process only names the rows. The identity
  // rewrite happens in the SELECT list — a new key (`copiedOperationId`, the
  // same function spelled in SQL), the fork's id, its seed user — and the
  // same two fields inside `data`, because the client replays `data`, not
  // the columns (see loadResidentOperations). `||` on jsonb replaces
  // top-level keys, which is exactly the two this touches.
  const seedUserId = forkSeedUserId(forkId)
  for (let at = 0; at < seed.bulkOperationIds.length; at += BULK_COPY_CHUNK) {
    const chunk = seed.bulkOperationIds.slice(at, at + BULK_COPY_CHUNK)
    await tx.$executeRaw`
      INSERT INTO "Operation" ("id", "seq", "type", "roomId", "userId", "layerId", "tool", "data")
      SELECT md5(o."id" || ${forkId}), o."seq", o."type", ${forkId}, ${seedUserId}, o."layerId", o."tool",
             o."data" || jsonb_build_object('id', md5(o."id" || ${forkId}), 'userId', ${seedUserId})
      FROM "Operation" o
      WHERE o."id" IN (${Prisma.join(chunk)})
    `
  }
  if (seed.operationRows.length > 0) await tx.operation.createMany({ data: seed.operationRows })
}

/** The columns of a Room row a copy takes from its source board. Canvas
 *  shape has to match or the seeded snapshot wouldn't line up with it. */
type SourceBoard = {
  id: string; name: string; paper: string; paperColor: string | null; infinite: boolean
  canvasWidth: number | null; canvasHeight: number | null; boardOrder: number
}

function copiedBoardData(board: SourceBoard, forkId: string, name: string, ownerId: string, enabledTools: string[]) {
  return {
    id: forkId,
    name,
    paper: board.paper,
    paperColor: board.paperColor,
    infinite: board.infinite,
    canvasWidth: board.canvasWidth,
    canvasHeight: board.canvasHeight,
    ownerId,
    // (#548) The toolset comes with the copy. A fork is the student's own
    // room, but it is the *teacher's* assignment: "do this in pencil" has to
    // survive being handed out, or the constraint holds only for whoever
    // never forked. Always the lesson's — that is the live value every gate
    // reads (rooms.ts's setRoomTools writes there), a board's own column is
    // only a record of it.
    enabledTools,
    // Provenance is per board: a copied board remembers the board it was
    // copied from, not the lesson.
    parentRoomId: board.id,
  }
}

export function registerForkRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string }; Body?: { name?: string; scope?: unknown } }>('/api/rooms/:id/fork', async (request, reply) => {
    const sourceId = request.params.id
    const userId = request.userId

    // Default `'board'`: the older caller — «взять в работу» — sent no scope
    // and meant exactly this, so an old client keeps its behaviour.
    const scope = request.body?.scope ?? 'board'
    if (!isForkScope(scope)) return reply.code(400).send({ error: 'invalid_scope' })

    const source = await prisma.room.findUnique({ where: { id: sourceId } })
    if (!source) return reply.code(404).send({ error: 'not_found' })

    // Being able to fork a room means being in it. Until real access control
    // lands (#224-#227) participation is the only membership fact there is,
    // and it is the same gate the snapshot routes already use — without it,
    // knowing a room id would be enough to pull a password-protected room's
    // content out through a copy of it. Membership is a fact about the
    // *lesson* (ADR 014 §2): a board has no participant rows of its own, so a
    // board id is answered by its lesson's.
    const lessonId = lessonOf(source)
    const [lesson, membership] = await Promise.all([
      isLesson(source) ? Promise.resolve(source) : prisma.room.findUnique({ where: { id: lessonId } }),
      prisma.roomParticipant.findUnique({ where: { roomId_userId: { roomId: lessonId, userId } } }),
    ])
    // A board whose lesson row is gone cannot exist (the FK cascades), but a
    // board found a moment before its lesson's delete landed can.
    if (!lesson) return reply.code(404).send({ error: 'not_found' })
    if (!membership && lesson.ownerId !== userId) return reply.code(403).send({ error: 'forbidden' })
    // (#595) «Взять в работу» from a classmate's personal board is taking a
    // copy of work the lesson does not show you. The same rule as looking.
    if (scope === 'board' && !canSeeBoard(userId, { board: source, lesson })) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    // Which boards travel. For a lesson fork the given id may be any board of
    // it — the whole lesson goes either way, lesson first so the boards'
    // `lessonId` has a row to point at when they are written.
    const sourceBoards: SourceBoard[] = scope === 'lesson'
      // (#595, ADR 015 §7) The lesson's pages only. Assignments and personal
      // boards are one class's work on one day, not part of the lesson as a
      // template.
      ? [lesson, ...await prisma.room.findMany({ where: { lessonId: lesson.id, assignmentId: null }, orderBy: { boardOrder: 'asc' } })]
      : [source]

    const forkId = randomUUID().slice(0, 12)
    // Copies of secondary boards get full uuids, as boardRoutes gives new
    // boards — only the lesson's id is ever typed or shared as a link.
    const forkIdOf = new Map<string, string>(sourceBoards.map((board, index) => [board.id, index === 0 ? forkId : randomUUID()]))

    // One board at a time: a seed is ids plus the few referencing rows, so
    // this is cheap to hold, but each one starts with a flush of that
    // board's write queue and a walk of its log, and a lesson's worth of
    // those fired at once would contend with every live room's own writes.
    const seeds = new Map<string, BoardSeed>()
    for (const board of sourceBoards) seeds.set(board.id, await prepareSeed(board.id, forkIdOf.get(board.id)!))

    // Palette is the lesson's (a board has none), and so is the folder — the
    // one from the caller's own participant row on the lesson.
    const palette = await prisma.roomPalette.findUnique({ where: { roomId: lesson.id }, select: { colors: true } })
    const name = request.body?.name?.trim() || sourceBoards[0].name
    const folderId = membership?.folderId ?? null

    // One transaction: a fork that exists with half its content would look
    // like a lesson someone had already erased most of — and a lesson fork
    // with half its boards would be a course with pages torn out.
    await prisma.$transaction(async tx => {
      const [first, ...rest] = sourceBoards
      await tx.room.create({
        data: {
          ...copiedBoardData(first, forkId, name, userId, lesson.enabledTools),
          // The copy is a lesson whichever board it came from: a standalone
          // room (`scope: 'board'`), or the lesson of the copied boards below.
          lessonId: null,
          boardOrder: 0,
          // Remapped to the copy of the board it named; null when it named
          // nothing, or a board deleted since (the pointer is not a relation,
          // see schema.prisma).
          activeBoardId: scope === 'lesson' && lesson.activeBoardId
            ? forkIdOf.get(lesson.activeBoardId) ?? null
            : null,
        },
      })
      // (#552) The copy is filed where its source is filed. `folderId` lives
      // on the participant row, not on the room (folders are per-user, see
      // roomFolderRoutes.ts), so a fork created without it lands at the root
      // of "Мои уроки" — a teacher copying a lesson out of a course folder
      // got the copy back in a different place from the original every time.
      // The value is this user's own placement of the source, which is the
      // only folder we may write here: another participant's is theirs.
      await tx.roomParticipant.create({ data: { roomId: forkId, userId, folderId } })
      if (palette) await tx.roomPalette.create({ data: { roomId: forkId, colors: palette.colors } })
      await writeSeed(tx, forkId, seeds.get(first.id)!)

      for (const board of rest) {
        const boardForkId = forkIdOf.get(board.id)!
        await tx.room.create({
          data: {
            ...copiedBoardData(board, boardForkId, board.name, userId, lesson.enabledTools),
            lessonId: forkId,
            boardOrder: board.boardOrder,
          },
        })
        await writeSeed(tx, boardForkId, seeds.get(board.id)!)
      }
    }, {
      // Prisma's default is 5 s, and this is the one route that writes a
      // whole room in a single statement batch — thousands of operation rows
      // plus a server-side copy of every layer's pixels. A fork that has
      // finished its work and then gets rolled back for taking six seconds
      // on a two-core box is a lesson the student is simply told they can't
      // have. A lesson fork multiplies that by its boards, which is why the
      // log is copied inside Postgres too (#568, see writeSeed): measured
      // with scripts/measureFork.ts on a laptop, 5 boards × 2 000 resident
      // strokes × 2 MB of snapshots took 1.8 s this way and 28 s through
      // `createMany` — the ceiling would have held for a five-board lesson
      // and no more. Re-run that script before touching this number.
      timeout: 30_000,
    })

    const created = await prisma.room.findUniqueOrThrow({ where: { id: forkId } })
    // (#552) With its placement, so the caller can put the card where the copy
    // really is instead of assuming the folder it is looking at — from search
    // results those are two different folders.
    return reply.code(201).send({ room: toWireRoom({ ...created, folderId }) })
  })
}
