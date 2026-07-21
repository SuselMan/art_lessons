import type { Room, RoomFolder } from '@art-lessons/shared'

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
  // (#211 epic) Optional `owner` relation — only callers that `include: {
  // owner: { select: { name: true } } }` populate `ownerName` on the wire type.
  owner?: { name: string | null } | null
  // (#212) The *caller's own* RoomParticipant.folderId for this room — not a
  // Room column, so callers that resolve it (via a RoomParticipant join) pass
  // it in separately rather than through a Prisma `include` on Room itself.
  folderId?: string | null
}): Room {
  return {
    id: r.id, name: r.name, paper: r.paper as Room['paper'], infinite: r.infinite,
    canvasWidth: r.canvasWidth ?? undefined, canvasHeight: r.canvasHeight ?? undefined,
    hasPassword: r.passwordHash !== null, ownerId: r.ownerId,
    ownerName: r.owner?.name ?? undefined,
    createdAt: r.createdAt.toISOString(),
    thumbnailUpdatedAt: r.thumbnail?.updatedAt.toISOString(),
    folderId: r.folderId ?? undefined,
  }
}

/** Maps a Prisma `RoomFolder` row to the wire `RoomFolder` type (#212). */
export function toWireRoomFolder(f: {
  id: string; userId: string; name: string; parentFolderId: string | null; createdAt: Date
}): RoomFolder {
  return {
    id: f.id, userId: f.userId, name: f.name,
    parentFolderId: f.parentFolderId, createdAt: f.createdAt.toISOString(),
  }
}
