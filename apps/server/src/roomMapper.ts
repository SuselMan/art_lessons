import type { Room } from '@art-lessons/shared'

/** Shared by roomRoutes.ts (REST "Мои уроки" list) and rooms.ts (cold-load
 *  from Postgres) so both map a Prisma `Room` row to the wire `Room` type
 *  identically. */
export function toWireRoom(r: {
  id: string; name: string; paper: string; infinite: boolean
  canvasWidth: number | null; canvasHeight: number | null
  passwordHash: string | null; ownerId: string; createdAt: Date
}): Room {
  return {
    id: r.id, name: r.name, paper: r.paper as Room['paper'], infinite: r.infinite,
    canvasWidth: r.canvasWidth ?? undefined, canvasHeight: r.canvasHeight ?? undefined,
    hasPassword: r.passwordHash !== null, ownerId: r.ownerId,
    createdAt: r.createdAt.toISOString(),
  }
}
