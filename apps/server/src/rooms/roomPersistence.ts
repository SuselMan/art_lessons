import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { readRoomRasterVersion, type Operation, type Room } from '@grafetto/shared'

import { prisma } from '../db/prisma.js'
import { enqueueWrite, type RoomWriteOutcome } from './roomRegistry.js'

/** (#612) The rows a live room writes as it goes — its creation, each
 *  participant, its palette, each operation. Every one is fire-and-forget
 *  through the room's write queue (roomRegistry.ts), never awaited on the
 *  socket path. Moved out of rooms.ts so the loader and the room lifecycle can
 *  both write without importing each other. */

export function persistRoomCreate(room: Room, passwordHash: string | undefined): void {
  enqueueWrite(room.id, () => prisma.room.create({
    data: {
      id: room.id, name: room.name, paper: room.paper, paperColor: room.paperColor ?? null,
      rasterVersion: readRoomRasterVersion(room.rasterVersion),
      infinite: room.infinite,
      canvasWidth: room.canvasWidth ?? null, canvasHeight: room.canvasHeight ?? null,
      passwordHash, accessMode: room.accessMode, ownerId: room.ownerId,
      // (#548) `[]` is the column's own "no restriction" — see schema.prisma.
      enabledTools: room.enabledTools ?? [],
      classVisibility: room.classVisibility ?? 'teacher_only',
    },
  }))
}

/** (#226) `name` is refreshed on every join, not just written once: it is what
 *  this person calls themselves *now*, and the access panel showing a name
 *  they abandoned three lessons ago would be worse than showing none. */
export function passwordGrant(hash: string | null | undefined): string | null {
  return hash ? createHash('sha256').update(hash).digest('hex') : null
}

export function persistParticipant(roomId: string, userId: string, name: string, passwordHash?: string | null): void {
  // Automatic board moves refresh the name, never a password permission.
  const grant = passwordHash === undefined ? {} : { passwordGrant: passwordGrant(passwordHash) }
  enqueueWrite(roomId, () => prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId, name, ...grant },
    update: { lastActiveAt: new Date(), name, ...grant },
  }))
}

export function persistPalette(roomId: string, colors: string[]): void {
  enqueueWrite(roomId, () => prisma.roomPalette.upsert({
    where: { roomId },
    create: { roomId, colors },
    update: { colors },
  }))
}

/** One immutable row projection shared by original insert and explicit repair. */
function operationRow(roomId: string, op: Operation) {
  const layerId = 'layerId' in op ? op.layerId : null
  return {
    id: op.id, seq: op.seq ?? 0, type: op.type, roomId, userId: op.userId,
    layerId, tool: op.type === 'stroke' ? op.tool : null,
    // Keep canonical interfaces acceptable to Prisma JSON without retaining a
    // second packed payload or introducing a looser serialized identity.
    data: op.type === 'canonical_stroke' ? { ...op, frame: { ...op.frame, composition: { ...op.frame.composition } } } : op,
  }
}

/** Indexed columns accompany DB JSON at the loader/repair authority boundary. */
export const canonicalOperationRowSelect = {
  id: true, roomId: true, userId: true, seq: true, type: true, layerId: true, tool: true, data: true,
} as const
export interface CanonicalStoredOperationRow {
  readonly id: string; readonly roomId: string; readonly userId: string; readonly seq: number
  readonly type: string; readonly layerId: string | null; readonly tool: string | null; readonly data: unknown
}
export function verifyCanonicalOperationRow(roomId: string, op: Operation, row: CanonicalStoredOperationRow | null): void {
  if (op?.type !== 'canonical_stroke' || !Number.isSafeInteger(op.seq) || op.seq! < 1)
    throw new TypeError('Canonical persistence requires a stamped operation')
  const expected = operationRow(roomId, op)
  if (!row || row.id !== expected.id || row.roomId !== expected.roomId || row.userId !== expected.userId
    || row.seq !== expected.seq || row.type !== expected.type || row.layerId !== (expected.layerId ?? null)
    || row.tool !== expected.tool || !isDeepStrictEqual(row.data, expected.data))
    throw new Error('Canonical persistence immutable row conflict')
}

export function persistOperation(roomId: string, op: Operation): Promise<RoomWriteOutcome<void>> {
  return enqueueWrite(roomId, async () => {
    await prisma.operation.create({ data: operationRow(roomId, op) })
    // Deliberately do NOT return/retain the ORM's full operation JSON row.
  })
}

/** Explicit canonical repair, not an upsert. The caller must hold the actual
 * resident immutable operation identity; this function confers no authority.
 * Each call schedules ONE attempt on the SAME existing room write queue. */
export function retryCanonicalOperationWrite(roomId: string, op: Operation): Promise<RoomWriteOutcome<void>> {
  if (op?.type !== 'canonical_stroke' || !Number.isSafeInteger(op.seq) || op.seq! < 1)
    throw new TypeError('Canonical persistence requires a stamped operation')
  return enqueueWrite(roomId, async () => {
    const expected = operationRow(roomId, op)
    const read = () => prisma.operation.findUnique({ where: { id: op.id }, select: canonicalOperationRowSelect })
    const verify = (row: Awaited<ReturnType<typeof read>>) => verifyCanonicalOperationRow(roomId, op, row)
    const row = await read()
    if (row) { verify(row); return }
    try { await prisma.operation.create({ data: expected }) }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error
      // A concurrent insert (or uncertain first response) is success ONLY when
      // the complete indexed identity and immutable payload really match.
      verify(await read())
    }
  })
}
