// (#373) The completeness check for `isLayerDirty`.
//
// Baking only the layers that changed is only safe if "changed" is never
// missed. A path that mutates a layer's pixels without marking it dirty does
// not fail loudly — it produces a stored snapshot that quietly no longer
// matches the layer it claims to be, and the next client to restore it sees
// the wrong drawing. So every way pixels can change gets a case here, and a
// new one is expected to arrive with its own.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, dab, fillStroke, makeLayerAdd, makeLayerMerge, makeLayerTransform, makeStroke,
} from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/snapshotCodec'

function freshEngine() {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
  engine.appendOperation(makeLayerAdd('user-a', 'A'))
  return engine
}

describe('isLayerDirty', () => {
  it('is false for a layer nobody has painted', () => {
    const engine = freshEngine()
    expect(engine.isLayerDirty('A')).toBe(false)
  })

  it('is false for a layer that does not exist', () => {
    expect(freshEngine().isLayerDirty('nope')).toBe(false)
  })

  it('goes false again once the layer has been baked', () => {
    const engine = freshEngine()
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))
    expect(engine.isLayerDirty('A')).toBe(true)

    engine.bakeNetworkSnapshot('A')

    expect(engine.isLayerDirty('A')).toBe(false)
  })

  it('does not report one layer dirty because another one is', () => {
    const engine = freshEngine()
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))

    expect(engine.isLayerDirty('A')).toBe(true)
    expect(engine.isLayerDirty('B')).toBe(false)
  })
})

describe('isLayerDirty — every way pixels can change', () => {
  /** Bakes `layerId` so it starts clean, runs `mutate`, and reports whether
   *  the engine noticed. */
  function afterMutation(mutate: (engine: ReturnType<typeof freshEngine>) => void): boolean {
    const engine = freshEngine()
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))
    engine.bakeNetworkSnapshot('A')
    expect(engine.isLayerDirty('A')).toBe(false)
    mutate(engine)
    return engine.isLayerDirty('A')
  }

  it('notices a remote stroke', () => {
    expect(afterMutation(engine => {
      engine.appendOperation(makeStroke('user-b', 'A', [dab(2, 2, { size: 3, pressure: 1, opacity: 1 })]))
    })).toBe(true)
  })

  it('notices a layer_clear', () => {
    expect(afterMutation(engine => {
      engine.appendOperation({
        id: 'clear-1', type: 'layer_clear', userId: 'user-b', timestamp: 0, layerId: 'A',
      })
    })).toBe(true)
  })

  it('notices a layer_transform', () => {
    expect(afterMutation(engine => {
      engine.appendOperation(makeLayerTransform('user-b', [{ layerId: 'A', matrix: [1, 0, 0, 1, 2, 0] }]))
    })).toBe(true)
  })

  // The case a comparison of log counts cannot see: undo removes pixels
  // without adding an operation, and "undid one, drew one" leaves every count
  // exactly where it was.
  it('notices an undo', () => {
    expect(afterMutation(engine => { engine.undo() })).toBe(true)
  })

  it('notices a redo', () => {
    expect(afterMutation(engine => { engine.undo(); engine.bakeNetworkSnapshot('A'); engine.redo() })).toBe(true)
  })

  it('notices a local stroke drawn with the pointer', () => {
    const engine = freshEngine()
    engine.setActiveLayer('A')
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))
    engine.bakeNetworkSnapshot('A')

    // Same path a real pen-down/move/up takes into the layer buffer.
    engine.appendOperation(makeStroke('user-a', 'A', [dab(1, 1, { size: 2, pressure: 1, opacity: 1 })]))

    expect(engine.isLayerDirty('A')).toBe(true)
  })

  it('notices a merge, on the layer it produced', () => {
    const engine = freshEngine()
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))

    engine.appendOperation(makeLayerMerge('user-a', 'M', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]))

    expect(engine.isLayerDirty('M')).toBe(true)
  })
})

// (#373/#374) A layer restored from a snapshot is by definition already stored
// — re-baking and re-uploading the whole room every client just downloaded is
// exactly the cost this is meant to remove.
describe('isLayerDirty — after restoring a snapshot', () => {
  function bakedTiles() {
    const engine = freshEngine()
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))
    return decodeLayerTiles(engine.bakeNetworkSnapshot('A')!, 0).tiles
  }

  it('is clean immediately after a restore', () => {
    const tiles = bakedTiles()
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.restoreLayerFromSnapshot('A', tiles, 100)

    expect(engine.isLayerDirty('A')).toBe(false)
  })

  it('becomes dirty again on the first change after a restore', () => {
    const tiles = bakedTiles()
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.restoreLayerFromSnapshot('A', tiles, 100)

    engine.appendOperation({
      ...makeStroke('user-b', 'A', [dab(1, 1, { size: 2, pressure: 1, opacity: 1 })]),
      seq: 200,
    })

    expect(engine.isLayerDirty('A')).toBe(true)
  })
})

// (#369) The guard this replaced read "no operations of mine mention this
// layer" as "this layer is empty". The log is a bounded window, so a layer
// restored from a snapshot rather than painted satisfied that test while
// holding a full drawing — and was then left out of the next snapshot
// entirely.
describe('bakeNetworkSnapshot judges content from the buffer, not the log', () => {
  it('bakes a layer whose pixels came from a restore and never from an operation', () => {
    const source = freshEngine()
    source.appendOperation(fillStroke('user-a', 'A', 4, 4, 6))
    const tiles = decodeLayerTiles(source.bakeNetworkSnapshot('A')!, 0).tiles

    const { engine } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
    engine.initLayer('A')
    engine.restoreLayerFromSnapshot('A', tiles, 100)

    const baked = engine.bakeNetworkSnapshot('A')
    expect(baked).not.toBeNull()
    expect([...decodeLayerTiles(baked!, 0).tiles[0].pixels]).toEqual([...tiles[0].pixels])
  })
})
