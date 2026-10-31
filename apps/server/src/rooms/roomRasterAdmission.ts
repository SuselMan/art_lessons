import { LEGACY_ROOM_RASTER_VERSION, STRAIGHT_ROOM_RASTER_VERSION, readRoomRasterVersion } from '@grafetto/shared'
import { prisma } from '../db/prisma.js'

/** Fail closed until every authoritative writer supports the new encoding. */
export function supportsCurrentRoomRaster(value: unknown,fullHistoryFormat:'frames-v1'|'mixed-v2'='frames-v1'): boolean {
  if(fullHistoryFormat!=='frames-v1'&&fullHistoryFormat!=='mixed-v2')return false
  try {const raster=readRoomRasterVersion(value);return raster===LEGACY_ROOM_RASTER_VERSION||fullHistoryFormat==='mixed-v2'&&raster===STRAIGHT_ROOM_RASTER_VERSION}catch{return false}
}

/** Read the pixel-owning board, never a client claim or its social lesson. */
export async function admitsStoredRoomRaster(roomId: string,fullHistoryFormat:'frames-v1'|'mixed-v2'='frames-v1'): Promise<boolean> {
  if(fullHistoryFormat!=='frames-v1'&&fullHistoryFormat!=='mixed-v2')return false
  const row = await prisma.room.findUnique({ where: { id: roomId }, select: { rasterVersion: true } })
  // Missing rows may be created, but creation always pins the server default.
  return row===null||supportsCurrentRoomRaster(row.rasterVersion,fullHistoryFormat)
}
