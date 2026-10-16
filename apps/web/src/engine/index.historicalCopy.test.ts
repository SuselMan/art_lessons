import { describe, expect, it } from 'vitest'
import {
  createTestEngine, fillStroke, makeLayerAdd, makeLayerDuplicate, readLayerPixels,
} from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'

describe('historical copy source', () => {
  it('does not seed an old copy from a newer source snapshot', () => {
    const { engine } = createTestEngine({ userId: 'A' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('A', 'source'), 'remote')
    engine.appendOperation(fillStroke('A', 'source', 4, 4, 3), 'remote')
    engine.appendOperation(makeLayerDuplicate('B', 'copy', 'source'), 'remote')
    const copied = readLayerPixels(engine, 'copy')!
    engine.appendOperation(fillStroke('A', 'source', 12, 12, 3), 'remote')
    engine.restoreLayerFromSnapshot('source', [{
      originX: 0, originY: 0, width: 16, height: 16,
      pixels: readLayerPixels(engine, 'source')!,
    }], 3)

    const replay = engine.bakeLayerByFullReplay('copy')!
    expect(replay).not.toBeNull()
    expect(decodeLayerTiles(replay, 0).tiles[0].pixels).toEqual(copied)
  })

  it('keeps live and replay copies equal after the source author undoes their earlier stroke', () => {
    const { engine } = createTestEngine({ userId: 'A' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('A', 'source'), 'remote')
    engine.appendOperation(fillStroke('A', 'source', 6, 6, 4), 'remote')
    engine.appendOperation(makeLayerDuplicate('B', 'copy', 'source'), 'remote')
    const copied = readLayerPixels(engine, 'copy')!
    expect(copied.some(value => value !== 0)).toBe(true)

    expect(engine.undo()?.type).toBe('stroke')
    expect(readLayerPixels(engine, 'copy')).toEqual(copied)
    const replay = engine.bakeLayerByFullReplay('copy')!
    expect(replay).not.toBeNull()
    const tiles = decodeLayerTiles(replay, 0).tiles
    expect(tiles).toHaveLength(1)
    expect(tiles[0].pixels).toEqual(copied)
  })
})
