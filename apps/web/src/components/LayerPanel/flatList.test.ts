import { describe, expect, it } from 'vitest'

import type { LayerFolder, LayerItem, LayerState, RasterLayer } from '@art-lessons/shared'

import { S_BOT, buildFlatList, buildDropZoneMap, reconstructHierarchy } from './flatList'

function layer(id: string, overrides: Partial<RasterLayer> = {}): RasterLayer {
  return { kind: 'layer', id, name: id, opacity: 1, visible: true, ...overrides }
}

function folder(id: string, children: string[], overrides: Partial<LayerFolder> = {}): LayerFolder {
  return { kind: 'folder', id, name: id, opacity: 1, visible: true, collapsed: false, children, ...overrides }
}

function stateOf(items: Record<string, LayerItem>, rootOrder: string[]): LayerState {
  return { items, rootOrder, activeId: rootOrder[0] ?? '', selectedIds: [] }
}

describe('buildFlatList', () => {
  it('expands root layers and open folders with a trailing sentinel per folder', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b']), a: layer('a'), b: layer('b'), c: layer('c') },
      ['f1', 'c'],
    )
    const flat = buildFlatList(state)
    expect(flat).toEqual([
      { id: 'f1', kind: 'folder', depth: 0 },
      { id: 'a', kind: 'layer', depth: 1 },
      { id: 'b', kind: 'layer', depth: 1 },
      { id: `${S_BOT}f1`, kind: 'sentinel', depth: 0 },
      { id: 'c', kind: 'layer', depth: 0 },
    ])
  })

  it('still emits the folder + sentinel pair for a collapsed folder, but skips its children', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b'], { collapsed: true }), a: layer('a'), b: layer('b') },
      ['f1'],
    )
    const flat = buildFlatList(state)
    expect(flat).toEqual([
      { id: 'f1', kind: 'folder', depth: 0 },
      { id: `${S_BOT}f1`, kind: 'sentinel', depth: 0 },
    ])
  })

  it('skips ids in rootOrder/children that no longer exist in items', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'ghost-child']), a: layer('a') },
      ['f1', 'ghost-root'],
    )
    const flat = buildFlatList(state)
    expect(flat.map(e => e.id)).toEqual(['f1', 'a', `${S_BOT}f1`])
  })

  it('emits a flat, un-nested entry for a plain layer at root', () => {
    const state = stateOf({ a: layer('a') }, ['a'])
    expect(buildFlatList(state)).toEqual([{ id: 'a', kind: 'layer', depth: 0 }])
  })
})

describe('buildFlatList / reconstructHierarchy round-trip', () => {
  it('reconstructs an equivalent structure from an untouched flat list (open folder, nested + root layers)', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b']), a: layer('a'), b: layer('b'), c: layer('c') },
      ['f1', 'c'],
    )
    const flat = buildFlatList(state)
    const { rootOrder, items } = reconstructHierarchy(flat.map(e => e.id), state.items)

    expect(rootOrder).toEqual(['f1', 'c'])
    expect((items.f1 as LayerFolder).children).toEqual(['a', 'b'])
    expect(items.a).toEqual(state.items.a)
    expect(items.c).toEqual(state.items.c)
  })

  it('round-trips multiple folders and interleaved root layers', () => {
    const state = stateOf(
      {
        f1: folder('f1', ['a']), f2: folder('f2', ['b', 'c']),
        a: layer('a'), b: layer('b'), c: layer('c'), d: layer('d'),
      },
      ['d', 'f1', 'f2'],
    )
    const flat = buildFlatList(state)
    const { rootOrder, items } = reconstructHierarchy(flat.map(e => e.id), state.items)

    expect(rootOrder).toEqual(['d', 'f1', 'f2'])
    expect((items.f1 as LayerFolder).children).toEqual(['a'])
    expect((items.f2 as LayerFolder).children).toEqual(['b', 'c'])
  })

  it('discards the sentinel ids themselves and never leaks them into rootOrder or children', () => {
    const state = stateOf({ f1: folder('f1', ['a']), a: layer('a') }, ['f1'])
    const flat = buildFlatList(state)
    const { rootOrder, items } = reconstructHierarchy(flat.map(e => e.id), state.items)

    expect(rootOrder.some(id => id.startsWith(S_BOT))).toBe(false)
    expect((items.f1 as LayerFolder).children.some(id => id.startsWith(S_BOT))).toBe(false)
  })

  it('reordering a flat list (moving a root layer above a folder) reorders rootOrder accordingly', () => {
    const state = stateOf(
      { f1: folder('f1', ['a']), a: layer('a'), c: layer('c') },
      ['f1', 'c'],
    )
    const flat = buildFlatList(state)
    const ids = flat.map(e => e.id)
    // Move 'c' (last entry) to the very front.
    const reordered = [ids[ids.length - 1], ...ids.slice(0, ids.length - 1)]
    const { rootOrder } = reconstructHierarchy(reordered, state.items)
    expect(rootOrder).toEqual(['c', 'f1'])
  })

  it('a collapsed folder\'s children never appear in the flat list, so reconstructHierarchy preserves them via the merge fallback', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b'], { collapsed: true }), a: layer('a'), b: layer('b'), c: layer('c') },
      ['f1', 'c'],
    )
    const flat = buildFlatList(state)
    expect(flat.some(e => e.id === 'a' || e.id === 'b')).toBe(false) // collapsed: children not rendered

    // Simulate dragging 'c' above the collapsed folder — flatIds now has no
    // trace of 'a'/'b' at all, yet they must survive reconstruction.
    const ids = flat.map(e => e.id)
    const reordered = ['c', ...ids.filter(id => id !== 'c')]
    const { rootOrder, items } = reconstructHierarchy(reordered, state.items)

    expect(rootOrder).toEqual(['c', 'f1'])
    expect((items.f1 as LayerFolder).children).toEqual(['a', 'b'])
  })

  it('dropping a new item between a collapsed folder\'s header and sentinel merges it on top of the existing (hidden) children', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b'], { collapsed: true }), a: layer('a'), b: layer('b'), c: layer('c') },
      ['f1', 'c'],
    )
    // Flat list for a collapsed folder is just [f1, __bot_f1] — simulate a
    // drag that drops 'c' between the header and the sentinel.
    const ids = ['f1', 'c', `${S_BOT}f1`]
    const { items } = reconstructHierarchy(ids, state.items)
    expect((items.f1 as LayerFolder).children).toEqual(['c', 'a', 'b'])
  })
})

describe('buildDropZoneMap', () => {
  it('maps a folder header to null (root), and its children + sentinel to the folder id', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b']), a: layer('a'), b: layer('b'), c: layer('c') },
      ['f1', 'c'],
    )
    const flat = buildFlatList(state)
    const zones = buildDropZoneMap(flat)
    expect(zones.f1).toBeNull()
    expect(zones.a).toBe('f1')
    expect(zones.b).toBe('f1')
    expect(zones[`${S_BOT}f1`]).toBe('f1')
    expect(zones.c).toBeNull()
  })

  it('resets to root-level zone after a sentinel closes a folder', () => {
    const state = stateOf(
      { f1: folder('f1', ['a']), f2: folder('f2', ['b']), a: layer('a'), b: layer('b') },
      ['f1', 'f2'],
    )
    const flat = buildFlatList(state)
    const zones = buildDropZoneMap(flat)
    expect(zones.f2).toBeNull()
    expect(zones.b).toBe('f2')
  })
})
