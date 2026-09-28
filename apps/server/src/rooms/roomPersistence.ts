import type { Operation, Room } from '@grafetto/shared'

import { prisma } from '../db/prisma.js'
import { enqueueWrite } from './roomRegistry.js'

/** (#612) The rows a live room writes as it goes — its creation, each
 *  participant, its palette, each operation. Every one is fire-and-forget
 *  through the room's write queue (roomRegistry.ts), never awaited on the
 *  socket path. Moved out of rooms.ts so the loader and the room lifecycle can
 *  both write without importing each other. */

export function persistRoomCreate(room: Room, passwordHash: string | undefined): void {
  enqueueWrite(room.id, () => prisma.room.create({
    data: {
      id: room.id, name: room.name, paper: room.paper, paperColor: room.paperColor ?? null,
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
export function persistParticipant(roomId: string, userId: string, name: string): void {
  enqueueWrite(roomId, () => prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId, name },
    update: { lastActiveAt: new Date(), name },
  }))
}

export function persistPalette(roomId: string, colors: string[]): void {
  enqueueWrite(roomId, () => prisma.roomPalette.upsert({
    where: { roomId },
    create: { roomId, colors },
    update: { colors },
  }))
}

export function persistOperation(roomId: string, op: Operation): void {
  const layerId = 'layerId' in op ? op.layerId : null
  enqueueWrite(roomId, () => prisma.operation.create({
    data: {
      id: op.id, seq: op.seq ?? 0, type: op.type, roomId, userId: op.userId,
      layerId, tool: op.type === 'stroke' ? op.tool : null,
      data: op,
    },
  }))
}
