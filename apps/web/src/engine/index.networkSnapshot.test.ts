// Engine-level tests for #149's bakeNetworkSnapshot — the network-upload
// counterpart to _takeCheckpoint's local undo checkpoint (same allResident()
// tile gather, just serialized via snapshotCodec instead of kept in memory).
import { describe, expect, it } from 'vitest'

import { createTestEngine, dab, makeLayerAdd, makeStroke, readTilePixels } from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/snapshotCodec'

describe('bakeNetworkSnapshot (#149)', () => {
  it('returns null for a layer with no pixel content yet', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
  })

  it('returns null for an unknown layer id', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    expect(engine.bakeNetworkSnapshot('nonexistent')).toBeNull()
  })

  it('encodes exactly the resident tile pixels a stroke actually painted', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))

    const baked = engine.bakeNetworkSnapshot('L')
    expect(baked).not.toBeNull()

    const { tiles } = decodeLayerTiles(baked!, 0)
    expect(tiles).toHaveLength(1)
    expect([...tiles[0].pixels]).toEqual([...readTilePixels(engine, 'L', 0, 0, 8, 8)!])
  })

  it('reflects the layer state at call time, not a stale cache', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    const first = engine.bakeNetworkSnapshot('L')!

    engine.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
    const second = engine.bakeNetworkSnapshot('L')!

    const firstPixels = decodeLayerTiles(first, 0).tiles[0].pixels
    const secondPixels = decodeLayerTiles(second, 0).tiles[0].pixels
    expect([...secondPixels]).not.toEqual([...firstPixels]) // a second overlapping stroke darkened it further
  })
})
