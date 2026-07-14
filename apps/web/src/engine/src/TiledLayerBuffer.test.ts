import { describe, expect, it } from 'vitest'

import { MockGL } from '../testing/mockGL'
import { TiledLayerBuffer } from './TiledLayerBuffer'
import { TILE_SIZE } from './tileMath'

function gl(): WebGLRenderingContext { return new MockGL() as unknown as WebGLRenderingContext }

describe('TiledLayerBuffer', () => {
  it('creates no tiles until something resolves a paint target', () => {
    const buf = new TiledLayerBuffer(gl())
    expect(buf.tileCount).toBe(0)
  })

  it('resolveForPaint creates the tile(s) a rect overlaps, on demand', () => {
    const buf = new TiledLayerBuffer(gl())
    const targets = buf.resolveForPaint({ minX: 10, minY: 10, maxX: 20, maxY: 20 })
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ originX: 0, originY: 0 })
    expect(buf.tileCount).toBe(1)
  })

  it('resolveForPaint spans multiple tiles for a rect crossing a boundary, without losing any', () => {
    const buf = new TiledLayerBuffer(gl())
    const half = TILE_SIZE / 2
    const targets = buf.resolveForPaint({
      minX: TILE_SIZE - half, minY: TILE_SIZE - half, maxX: TILE_SIZE + half, maxY: TILE_SIZE + half,
    })
    expect(targets).toHaveLength(4)
    expect(buf.tileCount).toBe(4)
    const origins = targets.map(t => `${t.originX},${t.originY}`).sort()
    expect(origins).toEqual([
      `0,0`, `0,${TILE_SIZE}`, `${TILE_SIZE},0`, `${TILE_SIZE},${TILE_SIZE}`,
    ].sort())
  })

  it('resolveVisible never creates a tile that does not already exist', () => {
    const buf = new TiledLayerBuffer(gl())
    const targets = buf.resolveVisible({ minX: 0, minY: 0, maxX: 10, maxY: 10 })
    expect(targets).toHaveLength(0)
    expect(buf.tileCount).toBe(0)
  })

  it('resolveVisible finds a tile once it has been created by resolveForPaint', () => {
    const buf = new TiledLayerBuffer(gl())
    buf.resolveForPaint({ minX: 5, minY: 5, maxX: 15, maxY: 15 })
    const targets = buf.resolveVisible({ minX: 0, minY: 0, maxX: 20, maxY: 20 })
    expect(targets).toHaveLength(1)
  })

  it('reuses the same buffer across repeated resolves for the same tile', () => {
    const buf = new TiledLayerBuffer(gl())
    const a = buf.resolveForPaint({ minX: 1, minY: 1, maxX: 2, maxY: 2 })[0]
    const b = buf.resolveForPaint({ minX: 3, minY: 3, maxX: 4, maxY: 4 })[0]
    expect(a.buffer).toBe(b.buffer)
    expect(buf.tileCount).toBe(1)
  })

  it('clear() drops every resident tile', () => {
    const buf = new TiledLayerBuffer(gl())
    buf.resolveForPaint({ minX: 0, minY: 0, maxX: 10, maxY: 10 })
    buf.resolveForPaint({ minX: TILE_SIZE + 1, minY: 0, maxX: TILE_SIZE + 2, maxY: 1 })
    expect(buf.tileCount).toBe(2)
    buf.clear()
    expect(buf.tileCount).toBe(0)
    expect(buf.resolveVisible({ minX: 0, minY: 0, maxX: 10, maxY: 10 })).toHaveLength(0)
  })

})
