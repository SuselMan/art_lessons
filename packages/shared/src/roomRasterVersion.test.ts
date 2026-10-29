import { describe, expect, it } from 'vitest'
import { isRasterPixelEncoding, isRoomRasterVersion, readRoomRasterVersion, roomRasterPixelEncoding } from './roomRasterVersion.js'

describe('pinned room raster interpretation', () => {
  it('reads absent historical metadata as legacy without treating unknown values as legacy', () => {
    for (const value of [undefined, null, 'legacy-pm8-v1']) expect(readRoomRasterVersion(value)).toBe('legacy-pm8-v1')
    for (const value of ['', 'straight-rgba8-v2', 0, {}, false]) {
      expect(isRoomRasterVersion(value)).toBe(false)
      expect(() => readRoomRasterVersion(value)).toThrow()
    }
  })
  it('maps both explicit contracts to their exact four-byte interpretation', () => {
    expect(roomRasterPixelEncoding(readRoomRasterVersion('straight-rgba8-v1'))).toBe('straight-rgba8')
    expect(roomRasterPixelEncoding(readRoomRasterVersion(undefined))).toBe('premultiplied-rgba8')
    expect(isRasterPixelEncoding('straight-rgba8')).toBe(true)
    expect(isRasterPixelEncoding('rgba8')).toBe(false)
    expect(() => roomRasterPixelEncoding('future' as never)).toThrow()
  })
})
