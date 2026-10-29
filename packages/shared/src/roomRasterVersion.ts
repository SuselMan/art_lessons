/** Immutable room raster contract. Missing historical metadata means legacy only. */
export const LEGACY_ROOM_RASTER_VERSION = 'legacy-pm8-v1' as const
export const STRAIGHT_ROOM_RASTER_VERSION = 'straight-rgba8-v1' as const
export const ROOM_RASTER_VERSIONS = [LEGACY_ROOM_RASTER_VERSION, STRAIGHT_ROOM_RASTER_VERSION] as const
export type RoomRasterVersion = typeof ROOM_RASTER_VERSIONS[number]
export const RASTER_PIXEL_ENCODINGS = ['premultiplied-rgba8', 'straight-rgba8'] as const
export type RasterPixelEncoding = typeof RASTER_PIXEL_ENCODINGS[number]

export function isRoomRasterVersion(value: unknown): value is RoomRasterVersion {
  return value === LEGACY_ROOM_RASTER_VERSION || value === STRAIGHT_ROOM_RASTER_VERSION
}

export function isRasterPixelEncoding(value: unknown): value is RasterPixelEncoding {
  return value === 'premultiplied-rgba8' || value === 'straight-rgba8'
}

export function readRoomRasterVersion(value: unknown): RoomRasterVersion {
  if (value === undefined || value === null) return LEGACY_ROOM_RASTER_VERSION
  if (!isRoomRasterVersion(value)) throw new TypeError('Unsupported room raster version')
  return value
}

export function roomRasterPixelEncoding(version: RoomRasterVersion): RasterPixelEncoding {
  if (!isRoomRasterVersion(version)) throw new TypeError('Unsupported room raster version')
  return version === LEGACY_ROOM_RASTER_VERSION ? 'premultiplied-rgba8' : 'straight-rgba8'
}
