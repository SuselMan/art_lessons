import type { Room } from '@art-lessons/shared'

/** Shared by roomRoutes.ts (REST "Мои уроки" list) and rooms.ts (cold-load
 *  from Postgres) so both map a Prisma `Room` row to the wire `Room` type
 *  identically. */
export function toWireRoom(r: {
  id: string; name: string; paper: string; infinite: boolean
  canvasWidth: number | null; canvasHeight: number | null
  passwordHash: string | null; ownerId: string; createdAt: Date
  // (#209) A `select`-based relation, not the full RoomThumbnail row — every
  // call site includes only `{ updatedAt: true }` so the (potentially large)
  // `data` Bytes column is never fetched just to build a room list/card.
  // Optional/nullable so callers that don't need it can omit it entirely.
  thumbnail?: { updatedAt: Date } | null
}): Room {
  return {
    id: r.id, name: r.name, paper: r.paper as Room['paper'], infinite: r.infinite,
    canvasWidth: r.canvasWidth ?? undefined, canvasHeight: r.canvasHeight ?? undefined,
    hasPassword: r.passwordHash !== null, ownerId: r.ownerId,
    createdAt: r.createdAt.toISOString(),
    thumbnailUpdatedAt: r.thumbnail?.updatedAt.toISOString(),
  }
}
