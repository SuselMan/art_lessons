import { describe, expect, it } from 'vitest'

import { CheckpointStore, type Checkpoint, type CheckpointTile } from './checkpointStore'

/** (#494) The engine's checkpoints on their own. Until they left PencilEngine
 *  these rules were only reachable through a WebGL engine and whole-room
 *  scenarios; here each is one assertion. */

function tile(bytes: number): CheckpointTile {
  return { originX: 0, originY: 0, width: 1, height: 1, packed: new Uint8Array(bytes) }
}

function cp(layerId: string, opIds: string[], bytes = 10): Checkpoint {
  return { layerId, opIds, tiles: [tile(bytes)] }
}

describe('the byte budget', () => {
  it('evicts the oldest ordinary checkpoints first', () => {
    const store = new CheckpointStore(25)
    store.add(cp('L', ['a']))
    store.add(cp('L', ['a', 'b']))
    store.add(cp('L', ['a', 'b', 'c']))
    expect(store.all().map(c => c.opIds.length)).toEqual([2, 3])
    expect(store.totalBytes()).toBe(20)
  })

  // Losing a pinned checkpoint loses content, not speed: never evicted, even
  // if that leaves the store over budget.
  it('never evicts a pinned checkpoint, even over budget', () => {
    const store = new CheckpointStore(5)
    store.pinSnapshot('L', [tile(10)], 7)
    store.add(cp('M', ['x']))
    expect(store.all().map(c => c.layerId)).toEqual(['L'])
    expect(store.totalBytes()).toBe(10)
  })

  it('evicts down to a lowered budget at once', () => {
    const store = new CheckpointStore(100)
    store.add(cp('L', ['a']))
    store.add(cp('M', ['b']))
    store.setBudget(10)
    expect(store.all().map(c => c.layerId)).toEqual(['M'])
  })
})

describe('the snapshot checkpoint', () => {
  // (#522) Matched on fromSnapshot, not pinned: two for one layer and the
  // stale one could win and repaint the layer as it was two restores ago.
  it('replaces the layer’s previous one, pinned or not', () => {
    const store = new CheckpointStore(1000)
    store.pinSnapshot('L', [tile(10)], 5)
    store.unpinSnapshot('L')
    store.pinSnapshot('L', [tile(30)], 9)
    const snaps = store.all().filter(c => c.fromSnapshot && c.layerId === 'L')
    expect(snaps).toHaveLength(1)
    expect(snaps[0].coveredSeq).toBe(9)
    expect(snaps[0].pinned).toBe(true)
    expect(store.totalBytes()).toBe(30)
  })

  it('becomes evictable once its layer is gone, and is still found until then', () => {
    const store = new CheckpointStore(0)
    store.pinSnapshot('L', [tile(10)])
    expect(store.hasSnapshotFor('L')).toBe(true)
    store.unpinSnapshot('L')
    expect(store.hasSnapshotFor('L')).toBe(false)
    expect(store.totalBytes()).toBe(0)
  })

  // (#479) Backfill prepends the history the snapshot already contains.
  it('records which backfilled operations its pixels already hold', () => {
    const store = new CheckpointStore(1000)
    store.pinSnapshot('L', [tile(1)], 10)
    store.markCovered([{ id: 'old', seq: 9 }, { id: 'edge', seq: 10 }, { id: 'new', seq: 11 }])
    const covered = store.all()[0].covered!
    expect([...covered].sort()).toEqual(['edge', 'old'])
  })
})

describe('best', () => {
  it('picks the deepest checkpoint that is still the done prefix', () => {
    const store = new CheckpointStore(1000)
    store.add(cp('L', ['a']))
    store.add(cp('L', ['a', 'b']))
    store.add(cp('M', ['a', 'b', 'c']))
    expect(store.best('L', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])?.opIds).toEqual(['a', 'b'])
  })

  // An undone operation shifts the prefix and disqualifies what was baked on it.
  it('refuses a checkpoint whose operations are no longer the prefix', () => {
    const store = new CheckpointStore(1000)
    store.add(cp('L', ['a', 'b']))
    expect(store.best('L', [{ id: 'a' }, { id: 'c' }])).toBeNull()
    expect(store.best('L', [{ id: 'a' }])).toBeNull()
  })

  it('matches a snapshot checkpoint against any history — its prefix is empty', () => {
    const store = new CheckpointStore(1000)
    store.pinSnapshot('L', [tile(1)])
    expect(store.best('L', [{ id: 'x' }])?.fromSnapshot).toBe(true)
  })
})
