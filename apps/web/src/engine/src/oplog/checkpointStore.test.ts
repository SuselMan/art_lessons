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
    expect(store.best('L', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])?.cp.opIds).toEqual(['a', 'b'])
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
    expect(store.best('L', [{ id: 'x' }])?.cp.fromSnapshot).toBe(true)
  })
})

// (#536, §17.55) A checkpoint inside a watercolour wash is no base to replay
// the rest of that wash from, whatever rule took it.
describe('a watercolour wash across a checkpoint', () => {
  const ops = [{ id: 'a', washId: 'W1' }, { id: 'b', washId: 'W1' }, { id: 'c', washId: 'W2' }, { id: 'd' }]

  it('rejects a checkpoint the wash runs through, and takes one before it', () => {
    const store = new CheckpointStore(1000)
    store.add(cp('L', ['a']))
    store.add(cp('L', ['a', 'b']))
    store.add(cp('L', ['a', 'b', 'c']))
    // W2 ends at c, so after c nothing crosses; 'a' alone would split W1.
    expect(store.best('L', ops)?.start).toBe(3)
    const moreOfW2 = [...ops, { id: 'e', washId: 'W2' }]
    expect(store.best('L', moreOfW2)?.start).toBe(2)
  })

  it('says a running rebuild’s checkpoint stopped holding once the wash grows past it', () => {
    const store = new CheckpointStore(1000)
    const at = cp('L', ['a', 'b'])
    store.add(at)
    expect(store.startOf(at, ops)).toBe(2)
    expect(store.startOf(at, [...ops, { id: 'e', washId: 'W1' }])).toBe(-1)
  })

  it('leaves the snapshot floor alone', () => {
    const store = new CheckpointStore(1000)
    store.pinSnapshot('L', [tile(10)], 0)
    expect(store.best('L', ops)?.start).toBe(0)
  })
})

describe('a checkpoint that carries the open washes (§17.56)', () => {
  const ops = [{ id: 'a', washId: 'W1' }, { id: 'b', washId: 'W2' }, { id: 'c', washId: 'W1' }, { id: 'd', washId: 'W2' }]

  it('stands inside the washes it carries, and only those', () => {
    const store = new CheckpointStore(1000)
    store.add({ ...cp('L', ['a', 'b']), washIds: ['W1'] })
    expect(store.best('L', ops)).toBeNull()
    store.add({ ...cp('L', ['a', 'b']), washIds: ['W1', 'W2'] })
    expect(store.best('L', ops)?.start).toBe(2)
  })

  it('frees what it carries when it goes', () => {
    const store = new CheckpointStore(15)
    let freed = 0
    store.add({ ...cp('L', ['a']), dispose: () => { freed++ } })
    store.add(cp('L', ['a', 'b']))
    expect(freed).toBe(1)
    const kept = { ...cp('L', ['a', 'b', 'c'], 1), dispose: () => { freed++ } }
    store.add(kept)
    store.remove(kept)
    expect(freed).toBe(2)
  })
})
