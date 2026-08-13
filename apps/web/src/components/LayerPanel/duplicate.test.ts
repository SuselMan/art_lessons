// (#449) buildDuplicateOps — the panel's half of "Duplicate": which operations
// one click costs, and in which order.
//
// Worth testing apart from the reducer it feeds because the interesting case is
// a folder, where the answer is a *sequence* whose order is load-bearing: a
// container has to exist before anything is placed in it, and the children have
// to arrive at ascending indices or replay rebuilds the subtree in a different
// order than the original. Both are invisible to a test that only checks the
// final state of one operation.
import { describe, expect, it } from 'vitest'

import type { LayerFolder, LayerItem, LayerState, RasterLayer } from '@grafetto/shared'

import { applyContentOp } from '../../lib/layers'
import { buildDuplicateOps } from './duplicate'

function layer(id: string, overrides: Partial<RasterLayer> = {}): RasterLayer {
  return { kind: 'layer', id, name: id, opacity: 1, visible: true, ...overrides }
}

function folder(id: string, children: string[], overrides: Partial<LayerFolder> = {}): LayerFolder {
  return { kind: 'folder', id, name: id, opacity: 1, visible: true, collapsed: false, children, ...overrides }
}

/** Folds a built op list into a real LayerState, the way every client does —
 *  the only honest way to assert on an *ordered* list of structural ops. */
function fold(items: Record<string, LayerItem>, rootOrder: string[], ops: ReturnType<typeof buildDuplicateOps>['ops']): LayerState {
  let state: LayerState = { items, rootOrder, activeId: rootOrder[0] ?? '', selectedIds: [] }
  ops.forEach((draft, i) => {
    state = applyContentOp(state, { id: `op-${i}`, userId: 'u1', timestamp: i, ...draft })
  })
  return state
}

describe('buildDuplicateOps: a layer', () => {
  it('costs exactly one layer_duplicate carrying the source\'s appearance', () => {
    const items = { a: layer('a', { opacity: 0.4, visible: false }) }
    const { ops, newId } = buildDuplicateOps(items, 'a', null, 0, 'a copy')

    expect(ops).toEqual([{
      type: 'layer_duplicate', layerId: newId, sourceId: 'a', name: 'a copy',
      sourceOpacity: 0.4, sourceVisible: false, parentId: null, index: 0,
    }])
  })

  it('returns nothing for an id that is not there', () => {
    expect(buildDuplicateOps({}, 'ghost', null, 0, 'ghost copy').ops).toEqual([])
  })
})

describe('buildDuplicateOps: a folder', () => {
  it('costs one folder_add for a plain empty folder and nothing else', () => {
    const items = { f: folder('f', []) }
    const { ops, newId } = buildDuplicateOps(items, 'f', null, 0, 'f copy')

    expect(ops).toEqual([{ type: 'folder_add', layerId: newId, name: 'f copy', parentId: null, index: 0 }])
  })

  it('rebuilds the whole subtree, in the same top→bottom order, under fresh ids', () => {
    const items = {
      f: folder('f', ['a', 'inner', 'b']),
      a: layer('a'),
      inner: folder('inner', ['c']),
      c: layer('c'),
      b: layer('b'),
    }
    const { ops, newId } = buildDuplicateOps(items, 'f', null, 0, 'f copy')
    const next = fold({ ...items }, ['f'], ops)

    const copy = next.items[newId] as LayerFolder
    expect(copy.kind).toBe('folder')
    expect(copy.children).toHaveLength(3)

    const [firstId, innerId, lastId] = copy.children
    expect(next.items[firstId].name).toBe('a')
    expect(next.items[lastId].name).toBe('b')

    const innerCopy = next.items[innerId] as LayerFolder
    expect(innerCopy.kind).toBe('folder')
    expect(innerCopy.name).toBe('inner')
    expect(innerCopy.children.map(id => next.items[id].name)).toEqual(['c'])

    // Nothing in the copy shares an id with the original — otherwise a stroke
    // on one would land on both.
    const originalIds = new Set(Object.keys(items))
    const copiedIds = [newId, ...copy.children, ...innerCopy.children]
    for (const id of copiedIds) expect(originalIds.has(id)).toBe(false)

    // …and the original is untouched by any of it.
    expect((next.items.f as LayerFolder).children).toEqual(['a', 'inner', 'b'])
  })

  it('carries a folder\'s opacity and visibility, which folder_add itself cannot', () => {
    const items = { f: folder('f', [], { opacity: 0.3, visible: false }) }
    const { ops, newId } = buildDuplicateOps(items, 'f', null, 0, 'f copy')
    const copy = fold({ ...items }, ['f'], ops).items[newId]

    expect(copy.opacity).toBe(0.3)
    expect(copy.visible).toBe(false)
    // The two extra operations exist only because they change something —
    // a plain folder above still costs exactly one.
    expect(ops).toHaveLength(3)
  })

  it('renames only the row that was duplicated, never its descendants', () => {
    const items = { f: folder('f', ['a']), a: layer('a') }
    const { ops, newId } = buildDuplicateOps(items, 'f', null, 0, 'f copy')
    const next = fold({ ...items }, ['f'], ops)

    const copy = next.items[newId] as LayerFolder
    expect(copy.name).toBe('f copy')
    expect(next.items[copy.children[0]].name).toBe('a')
  })

  it('lands the copy at the requested slot inside another folder', () => {
    const items = {
      outer: folder('outer', ['x', 'f', 'y']),
      x: layer('x'), y: layer('y'),
      f: folder('f', []),
    }
    // Exactly how handleDuplicate drives it: the source's own container and
    // the source's own index, which puts the copy directly above it.
    const { ops, newId } = buildDuplicateOps(items, 'f', 'outer', 1, 'f copy')
    const next = fold({ ...items }, ['outer'], ops)

    expect((next.items.outer as LayerFolder).children).toEqual(['x', newId, 'f', 'y'])
  })
})
