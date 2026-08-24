// (#486) A restored snapshot's structure is the whole pre-log layer set, not
// an addition to whatever the mount already guessed.
//
// Room's mount effect calls initLayer for each layer in makeInitialLayerState()
// — `layer-1` and `background` — before it can know the room has a snapshot.
// If `layer-1` was deleted below the snapshot's structure seq, the operation
// that deleted it is one the server legitimately withholds, so no log this
// client receives can ever retire the buffer. It stays invisible and costs
// nothing anyone can see — until snapshotSync's #386/#462 guard reads
// liveLayerIds() against the store's (correct) LayerState, calls the store
// stale, and refuses every upload the room will ever attempt.
//
// That is not a hypothetical: room U68gWoq- stopped baking at seq 4100 and by
// seq 11291 its join payload was 43 MB, which no client on a real network
// finished receiving.
import { describe, expect, it } from 'vitest'

import { createTestEngine, hasLayerBuffer, makeLayerAdd } from './testing/engineTestUtils'

describe('base layers after a snapshot restore', () => {
  it('retires a layer the restored structure no longer lists', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    // The mount's guess, before anything is known about stored snapshots.
    engine.initLayer('layer-1')
    engine.initLayer('background')
    expect(hasLayerBuffer(engine, 'layer-1')).toBe(true)

    // What the restore found: a structure baked after `layer-1` was deleted.
    engine.setBaseLayers(['kept', 'background'])

    expect(engine.liveLayerIds().sort()).toEqual(['background', 'kept'])
    expect(hasLayerBuffer(engine, 'layer-1')).toBe(false)
  })

  it('keeps the retirement across a structural rebuild', () => {
    // _syncBuffersToLog reseeds from _baseLayerIds, so destroying the buffer
    // alone would only postpone the problem to the next undo of a layer_add.
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('layer-1')
    engine.initLayer('background')
    engine.setBaseLayers(['kept', 'background'])

    // A layer_add is the case that reseeds: undoing it runs _syncBuffersToLog,
    // which rebuilds the whole live set out of _baseLayerIds.
    const added = makeLayerAdd('user-a', 'added')
    engine.appendOperation(added)
    engine.undo()
    engine.redo()

    expect(engine.liveLayerIds()).not.toContain('layer-1')
  })

  it('leaves a layer the restored structure does list alone', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.initLayer('layer-1')
    engine.initLayer('background')

    engine.setBaseLayers(['layer-1', 'background'])

    expect(engine.liveLayerIds().sort()).toEqual(['background', 'layer-1'])
    expect(hasLayerBuffer(engine, 'layer-1')).toBe(true)
  })
})
