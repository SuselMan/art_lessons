import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'
import { clipTileToPage } from './retileSnapshot'
import { SnapshotIO, type SnapshotIOContext } from '../oplog/SnapshotIO'
import { encodeLayerTiles } from '../oplog/snapshotCodec'

function fixture() {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const source = Uint8Array.from({ length: 8 * 8 * 4 }, (_, i) => (i * 31 + (i >>> 3)) & 255)
  // The production mock intentionally ignores x/y. Model GL's tight region
  // read explicitly here; this proves coordinates, not a physical driver.
  const read = vi.spyOn(gl, 'readPixels').mockImplementation((x, y, width, height, _format, _type, destination) => {
    const out = destination as Uint8Array
    for (let r = 0; r < height; r++) {
      out.set(source.subarray(((y + r) * 8 + x) * 4, ((y + r) * 8 + x + width) * 4), r * width * 4)
    }
  })
  return { gl, source, read, buffer: new AccumulationBuffer(gl, 8, 8) }
}

it('matches full-read/clip bytes for asymmetric right, bottom, corner and origin cases', () => {
  const { source, buffer } = fixture()
  for (const [originX, originY, pageW, pageH] of [[0, 0, 8, 8], [8, 0, 11, 8], [0, 8, 8, 11], [8, 8, 11, 11], [-8, -8, 3, 3], [16, 0, 11, 8]]) {
    const expected = clipTileToPage(originX, originY, 8, 8, source, { w: pageW, h: pageH })
    expect(buffer.readPixelsRegion(0, 8 - expected.height, expected.width, expected.height)).toEqual(expected.pixels)
  }
})

it('owns distinct outputs and skips zero-area reads', () => {
  const { buffer, read } = fixture()
  const first = buffer.readPixelsRegion(0, 5, 3, 3)
  const second = buffer.readPixelsRegion(0, 5, 3, 3)
  expect(first.buffer).not.toBe(second.buffer)
  second.fill(0)
  expect(first.some(x => x !== 0)).toBe(true)
  const count = read.mock.calls.length
  expect(buffer.readPixelsRegion(0, 0, 0, 8)).toHaveLength(0)
  expect(buffer.readPixelsRegion(0, 8, 8, 0)).toHaveLength(0)
  expect(read).toHaveBeenCalledTimes(count)
})

it('bakes the same encoded snapshot while reading only clipped geometry', () => {
  const { buffer, source, read } = fixture()
  const markPublished = vi.fn()
  const ctx = { infinite: false, pageSize: () => ({ w: 11, h: 11 }), quiet: () => true,
    settled: () => true, ledger: { mayPublish: () => true, markPublished },
    layer: () => ({ allResident: () => [{ buffer, originX: 8, originY: 8 }] }),
  } as unknown as SnapshotIOContext
  const result = new SnapshotIO(ctx).bake('A')
  expect(result).toEqual(encodeLayerTiles([clipTileToPage(8, 8, 8, 8, source, { w: 11, h: 11 })]))
  expect(read.mock.calls.map(c => c.slice(0, 4))).toEqual([[0, 5, 3, 3]])
  expect(markPublished).toHaveBeenCalledWith('A')
})

it('restores pack alignment and framebuffer cleanup when a tight odd-width read throws', () => {
  const { gl, buffer, read } = fixture()
  Object.defineProperty(gl, 'PACK_ALIGNMENT', { value: 0x0d05 })
  vi.spyOn(gl, 'getParameter').mockReturnValue(8)
  const pack = vi.spyOn(gl, 'pixelStorei')
  const bind = vi.spyOn(gl, 'bindFramebuffer')
  read.mockImplementation(() => { throw Error('read interrupted') })
  expect(() => buffer.readPixelsRegion(0, 5, 3, 3)).toThrow('read interrupted')
  expect(pack.mock.calls).toEqual([[gl.PACK_ALIGNMENT, 4], [gl.PACK_ALIGNMENT, 8]])
  expect(bind.mock.calls.at(-1)).toEqual([gl.FRAMEBUFFER, null])
})

it('keeps full/infinite reads on the original API and leaves empty extents unpublished', () => {
  for (const [infinite, originX] of [[true, 8], [false, 0], [false, 16]] as const) {
    const { buffer, source } = fixture()
    const full = vi.spyOn(buffer, 'readPixels')
    const region = vi.spyOn(buffer, 'readPixelsRegion')
    const markPublished = vi.fn()
    const ctx = { infinite, pageSize: () => ({ w: 8, h: 8 }), quiet: () => true,
      settled: () => true, ledger: { mayPublish: () => true, markPublished },
      layer: () => ({ allResident: () => [{ buffer, originX, originY: 0 }] }),
    } as unknown as SnapshotIOContext
    const result = new SnapshotIO(ctx).bake('A')
    if (infinite || originX === 0) {
      expect(result).toEqual(encodeLayerTiles([{ originX, originY: 0, width: 8, height: 8, pixels: source }]))
      expect(full).toHaveBeenCalledOnce()
      expect(region).not.toHaveBeenCalled()
    } else {
      expect(result).toBeNull()
      expect(markPublished).not.toHaveBeenCalled()
    }
  }
})
