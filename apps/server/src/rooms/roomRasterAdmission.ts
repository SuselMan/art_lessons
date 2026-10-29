import { LEGACY_ROOM_RASTER_VERSION, readRoomRasterVersion } from '@grafetto/shared'
import { prisma } from '../db/prisma.js'

/** Fail closed until every authoritative writer supports the new encoding. */
export function supportsCurrentRoomRaster(value: unknown): boolean {
  try { return readRoomRasterVersion(value) === LEGACY_ROOM_RASTER_VERSION } catch { return false }
}

/** Read the pixel-owning board, never a client claim or its social lesson. */
export async function admitsStoredRoomRaster(roomId: string): Promise<boolean> {
  const row = await prisma.room.findUnique({ where: { id: roomId }, select: { rasterVersion: true } })
  // Missing rows may be created, but creation always pins the server default.
  return row === null || supportsCurrentRoomRaster(row.rasterVersion)
}
