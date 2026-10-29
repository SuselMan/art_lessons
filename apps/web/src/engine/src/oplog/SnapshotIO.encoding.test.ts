import { expect, it, vi } from 'vitest'
import type { RasterPixelEncoding } from '@grafetto/shared'
import { MockGL } from '../../testing/mockGL'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { unpackTilePixels } from '../buffers/pinnedTiles'
import { SnapshotIO } from './SnapshotIO'
import { SnapshotLedger } from './snapshotLedger'
import { CheckpointStore } from './checkpointStore'
import { OperationLog } from './OperationLog'

function setup(encoding: RasterPixelEncoding) {
  const gl = new MockGL() as unknown as WebGLRenderingContext
  const layer = new TiledLayerBuffer(gl, 2, 2, undefined, undefined, undefined, encoding)
  const ledger = new SnapshotLedger(), checkpoints = new CheckpointStore(1024), log = new OperationLog()
  const io = new SnapshotIO({ gl, infinite: false, ledger, pageSize: () => ({ w: 2, h: 2 }), tileSize: () => ({ w: 2, h: 2 }),
    layer: () => layer, log: () => log, checkpoints: () => checkpoints, quiet: () => true, settled: () => true,
    scratchLayer: () => layer, applyPixelOp: () => {}, preloadImages: () => {} })
  return { gl, layer, ledger, checkpoints, io }
}
const pixels = new Uint8Array([17, 29, 41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const tiles = [{ originX: 0, originY: 0, width: 2, height: 2, pixels }]
it.each(['premultiplied-rgba8', 'straight-rgba8'] as const)('rejects encoding mismatch before GL, coverage or checkpoint mutation: %s', encoding => {
  const s = setup(encoding), resolve = vi.spyOn(s.layer, 'resolveForPaint'), error = vi.spyOn(s.gl, 'getError')
  const incoming = encoding === 'straight-rgba8' ? 'premultiplied-rgba8' : 'straight-rgba8'
  try {
    for (const installOnly of [false, true]) expect(() => s.io.restore('L', tiles, 42, installOnly, incoming)).toThrow('does not match')
    expect(resolve).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled()
    expect(s.layer.tileCount).toBe(0); expect(s.ledger.hasCoverage('L')).toBe(false)
    expect(s.ledger.pixelRevision('L')).toBe(0); expect(s.checkpoints.all()).toHaveLength(0)
    expect(s.io.takeRestoreAudit()).toEqual([])
  } finally { resolve.mockRestore(); error.mockRestore(); s.layer.destroy() }
})
it('requires explicit straight encoding and retains the exact hidden RGBA checkpoint bytes', () => {
  const s = setup('straight-rgba8')
  try {
    expect(() => s.io.restore('L', tiles, 42)).toThrow('does not match')
    s.io.restore('L', tiles, 42, false, 'straight-rgba8')
    expect(s.ledger.hasCoverage('L')).toBe(true)
    const checkpoint = s.checkpoints.all()[0]
    expect([...unpackTilePixels(checkpoint.tiles[0].packed, pixels.length)]).toEqual([...pixels])
    expect(s.layer.getContentBoundsWorld()).toEqual({ minX: 0, minY: 1, maxX: 1, maxY: 2 })
  } finally { s.layer.destroy() }
})
