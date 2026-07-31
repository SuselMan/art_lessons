// (#374) What a restored snapshot's coverage lets the engine skip.
//
// The server withholds pure pixel operations a layer's stored pixels already
// account for (rooms.ts's isCoveredBySnapshot), so those never arrive. Two
// kinds cannot be withheld and therefore do arrive covered: `layer_merge`,
// which is also a structural fact the client needs, and `layer_transform`,
// which can name several layers at once and so may be covered for some of them
// and not others. Replaying either one's pixel half onto a layer restored past
// it paints something that already happened.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, dab, fillStroke, hasLayerBuffer, makeLayerAdd, makeLayerMerge, makeLayerTransform, makeStroke,
  readLayerPixels,
} from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/snapshotCodec'

/** Bakes `layerId` and restores those exact pixels back into a fresh engine's
 *  same-named layer, at `coveredSeq` — the shape a real join has, minus the
 *  network. */
function tilesOf(engine: ReturnType<typeof createTestEngine>['engine'], layerId: string) {
  const baked = engine.bakeNetworkSnapshot(layerId)
  return baked ? decodeLayerTiles(baked, 0).tiles : []
}

describe('a merge a restored snapshot already accounts for', () => {
  it('keeps the restored pixels instead of compositing over them', () => {
    // Bake what the merge result is *supposed* to look like, from a room that
    // really performed it.
    const source = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    source.engine.appendOperation(makeLayerAdd('user-a', 'A'))
    source.engine.appendOperation(makeLayerAdd('user-a', 'B'))
    source.engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))
    source.engine.appendOperation(makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]))
    const merged = tilesOf(source.engine, 'M')
    expect(merged.length).toBeGreaterThan(0)

    // A joining client: the merge result arrives as restored pixels, and the
    // merge operation itself arrives afterwards in the tail.
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.initLayer('B')
    engine.initLayer('M')
    engine.restoreLayerFromSnapshot('M', merged, 100)
    const restored = readLayerPixels(engine, 'M')!.slice()

    engine.appendOperation({
      ...makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]),
      seq: 50,
    })

    // The sources are empty on this client (their own strokes were withheld —
    // they are covered by M's pixels), so compositing would have wiped M.
    expect([...readLayerPixels(engine, 'M')!]).toEqual([...restored])
  })

  it('still consumes the sources, so nothing shows up twice', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.initLayer('B')
    engine.initLayer('M')
    engine.restoreLayerFromSnapshot('M', [
      { originX: 0, originY: 0, width: 8, height: 8, pixels: new Uint8Array(8 * 8 * 4).fill(200) },
    ], 100)

    engine.appendOperation({
      ...makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]),
      seq: 50,
    })

    expect(hasLayerBuffer(engine, 'A')).toBe(false)
    expect(hasLayerBuffer(engine, 'B')).toBe(false)
    expect(hasLayerBuffer(engine, 'M')).toBe(true)
  })

  it('composites normally when the merge is newer than the coverage', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.initLayer('M')
    engine.restoreLayerFromSnapshot('M', [
      { originX: 0, originY: 0, width: 8, height: 8, pixels: new Uint8Array(8 * 8 * 4) },
    ], 100)
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))

    // seq 150 is past this layer's coverage of 100, so it is a real merge.
    engine.appendOperation({
      ...makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]),
      seq: 150,
    })

    expect(readLayerPixels(engine, 'M')!.some(v => v !== 0)).toBe(true)
  })

  it('composites normally when nothing was restored for the layer at all', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))

    engine.appendOperation({
      ...makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]),
      seq: 50,
    })

    expect(readLayerPixels(engine, 'M')!.some(v => v !== 0)).toBe(true)
  })
})

describe('a transform a restored snapshot already accounts for', () => {
  const shift = [1, 0, 0, 1, 3, 0] as const

  it('leaves a covered layer alone', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.appendOperation(makeStroke('user-a', 'A', [dab(2, 4, { size: 3, pressure: 1, opacity: 1 })]))
    engine.restoreLayerFromSnapshot('A', tilesOf(engine, 'A'), 100)
    const before = readLayerPixels(engine, 'A')!.slice()

    engine.appendOperation({
      ...makeLayerTransform('user-a', [{ layerId: 'A', matrix: [...shift] as never }]),
      seq: 50,
    })

    expect([...readLayerPixels(engine, 'A')!]).toEqual([...before])
  })

  // The reason this is per entry rather than per operation: one transform can
  // name a layer restored past it and another that was never restored at all.
  it('still applies to the layers of the same operation that are not covered', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.initLayer('B')
    engine.appendOperation(makeStroke('user-a', 'A', [dab(2, 4, { size: 3, pressure: 1, opacity: 1 })]))
    engine.appendOperation(makeStroke('user-a', 'B', [dab(2, 4, { size: 3, pressure: 1, opacity: 1 })]))
    engine.restoreLayerFromSnapshot('A', tilesOf(engine, 'A'), 100)
    const coveredBefore = readLayerPixels(engine, 'A')!.slice()
    const uncoveredBefore = readLayerPixels(engine, 'B')!.slice()

    engine.appendOperation({
      ...makeLayerTransform('user-a', [
        { layerId: 'A', matrix: [...shift] as never },
        { layerId: 'B', matrix: [...shift] as never },
      ]),
      seq: 50,
    })

    expect([...readLayerPixels(engine, 'A')!]).toEqual([...coveredBefore])
    expect([...readLayerPixels(engine, 'B')!]).not.toEqual([...uncoveredBefore])
  })

  it('applies to a covered layer when the transform is newer than the coverage', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.appendOperation(makeStroke('user-a', 'A', [dab(2, 4, { size: 3, pressure: 1, opacity: 1 })]))
    engine.restoreLayerFromSnapshot('A', tilesOf(engine, 'A'), 100)
    const before = readLayerPixels(engine, 'A')!.slice()

    engine.appendOperation({
      ...makeLayerTransform('user-a', [{ layerId: 'A', matrix: [...shift] as never }]),
      seq: 150,
    })

    expect([...readLayerPixels(engine, 'A')!]).not.toEqual([...before])
  })
})

// (#374) The server withholds pure pixel operations a layer's coverage
// accounts for, so one arriving means the two disagreed — a second client
// uploading a snapshot between this one's room_state and its snapshot fetch is
// enough. Deciding from what was actually restored makes that harmless.
describe('a pure pixel operation the restored pixels already contain', () => {
  it('does not paint a stroke twice', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.appendOperation(makeStroke('user-a', 'A', [dab(4, 4, { size: 4, pressure: 1, opacity: 0.5 })]))
    engine.restoreLayerFromSnapshot('A', tilesOf(engine, 'A'), 100)
    const restored = readLayerPixels(engine, 'A')!.slice()

    engine.appendOperation({
      ...makeStroke('user-a', 'A', [dab(4, 4, { size: 4, pressure: 1, opacity: 0.5 })]),
      seq: 50,
    })

    expect([...readLayerPixels(engine, 'A')!]).toEqual([...restored])
  })

  // Not merely skipped: left `done` in the log it would be replayed on top of
  // the pinned snapshot checkpoint the next time this layer rebuilds, which is
  // the same double-paint one step later.
  it('survives a rebuild without reappearing', () => {
    // Baked elsewhere on purpose: a real joining client's log holds none of
    // the operations below its snapshot, so replay must not find them there.
    const source = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    source.engine.initLayer('A')
    source.engine.appendOperation(makeStroke('user-a', 'A', [dab(4, 4, { size: 4, pressure: 1, opacity: 0.5 })]))
    const baked = tilesOf(source.engine, 'A')

    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.restoreLayerFromSnapshot('A', baked, 100)
    const restored = readLayerPixels(engine, 'A')!.slice()

    engine.appendOperation({
      ...makeStroke('user-a', 'A', [dab(4, 4, { size: 4, pressure: 1, opacity: 0.5 })]),
      seq: 50,
    })
    // A later stroke and its undo force the rebuild path over this layer.
    engine.appendOperation({
      ...makeStroke('user-b', 'A', [dab(1, 1, { size: 2, pressure: 1, opacity: 1 })]),
      seq: 200,
    })
    engine.undo()

    expect([...readLayerPixels(engine, 'A')!]).toEqual([...restored])
  })

  it('still paints a stroke made after the coverage', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.appendOperation(makeStroke('user-a', 'A', [dab(4, 4, { size: 4, pressure: 1, opacity: 0.5 })]))
    engine.restoreLayerFromSnapshot('A', tilesOf(engine, 'A'), 100)
    const restored = readLayerPixels(engine, 'A')!.slice()

    engine.appendOperation({
      ...makeStroke('user-a', 'A', [dab(4, 4, { size: 4, pressure: 1, opacity: 0.5 })]),
      seq: 150,
    })

    expect([...readLayerPixels(engine, 'A')!]).not.toEqual([...restored])
  })

  it('does not let a covered layer_clear wipe the restored pixels', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.appendOperation(makeStroke('user-a', 'A', [dab(4, 4, { size: 4, pressure: 1, opacity: 1 })]))
    engine.restoreLayerFromSnapshot('A', tilesOf(engine, 'A'), 100)
    const restored = readLayerPixels(engine, 'A')!.slice()

    engine.appendOperation({
      id: 'clear-1', type: 'layer_clear', userId: 'user-a', timestamp: 0, layerId: 'A', seq: 50,
    })

    expect([...readLayerPixels(engine, 'A')!]).toEqual([...restored])
  })
})

// Restoring without a coverage seq is what every caller outside the snapshot
// path does, and it must leave behaviour exactly as it was before #374.
describe('restoring without a coverage seq', () => {
  it('covers nothing, so a merge composites as it always did', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))
    engine.initLayer('M')
    engine.restoreLayerFromSnapshot('M', [
      { originX: 0, originY: 0, width: 8, height: 8, pixels: new Uint8Array(8 * 8 * 4) },
    ])

    engine.appendOperation({
      ...makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]),
      seq: 50,
    })

    expect(readLayerPixels(engine, 'M')!.some(v => v !== 0)).toBe(true)
  })
})
