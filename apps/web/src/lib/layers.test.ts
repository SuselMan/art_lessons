import { describe, expect, it } from 'vitest'

import type {
  LayerFolder, LayerItem, LayerState, RasterLayer,
  LayerAddOperation, FolderAddOperation, LayerDeleteOperation,
  LayerMoveOperation, LayerOpacityOperation, LayerVisibilityOperation,
  LayerRenameOperation, LayerMergeOperation,
} from '@grafetto/shared'
import { BACKGROUND_LAYER_ID } from '@grafetto/shared'

import {
  applyContentOp, replayLayerState, overlayLocalFields, sanitizeSelection,
  removeItems, parentOf, computeCompositeOrder, computeMergeOrder, getVisibleOrder,
  collectDescendants, isLayerLocked, isEffectivelyVisible, placementAbove, rootPlacementAbove,
} from './layers'

function layer(id: string, overrides: Partial<RasterLayer> = {}): RasterLayer {
  return { kind: 'layer', id, name: id, opacity: 1, visible: true, ...overrides }
}

function folder(id: string, children: string[], overrides: Partial<LayerFolder> = {}): LayerFolder {
  return { kind: 'folder', id, name: id, opacity: 1, visible: true, collapsed: false, children, ...overrides }
}

function stateOf(items: Record<string, LayerItem>, rootOrder: string[], extra: Partial<LayerState> = {}): LayerState {
  return { items, rootOrder, activeId: rootOrder[0] ?? BACKGROUND_LAYER_ID, selectedIds: [], ...extra }
}

const baseOp = { id: 'op', userId: 'u1', timestamp: 0 }

describe('applyContentOp', () => {
  // No placement fields at all: how every layer_add in the log looked before
  // #378, and they have to keep replaying to the top or already-recorded
  // rooms would come back with a different layer order than they were drawn in.
  it('layer_add inserts at the top of rootOrder and is a no-op if the id already exists', () => {
    const state = stateOf({ [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID) }, [BACKGROUND_LAYER_ID])
    const op: LayerAddOperation = { ...baseOp, type: 'layer_add', layerId: 'l1', name: 'Layer 1' }

    const next = applyContentOp(state, op)
    expect(next.rootOrder).toEqual(['l1', BACKGROUND_LAYER_ID])
    expect(next.items.l1).toMatchObject({ kind: 'layer', name: 'Layer 1' })

    expect(applyContentOp(next, op)).toBe(next) // duplicate add is a no-op (same reference)
  })

  it('layer_add honors an index, landing above the row that held it', () => {
    const state = stateOf(
      { a: layer('a'), b: layer('b'), [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID) },
      ['a', 'b', BACKGROUND_LAYER_ID],
    )
    const op: LayerAddOperation = { ...baseOp, type: 'layer_add', layerId: 'n', name: 'N', parentId: null, index: 1 }
    expect(applyContentOp(state, op).rootOrder).toEqual(['a', 'n', 'b', BACKGROUND_LAYER_ID])
  })

  it('layer_add with a parentId lands inside that folder', () => {
    const state = stateOf({ f1: folder('f1', ['a', 'b']), a: layer('a'), b: layer('b') }, ['f1'])
    const op: LayerAddOperation = { ...baseOp, type: 'layer_add', layerId: 'n', name: 'N', parentId: 'f1', index: 1 }

    const next = applyContentOp(state, op)
    expect(next.rootOrder).toEqual(['f1'])
    expect((next.items.f1 as LayerFolder).children).toEqual(['a', 'n', 'b'])
  })

  // The background's index is the one placement that cannot be taken
  // literally: it owns the bottom slot, so "above the active layer" with the
  // background selected has to resolve above it, never below.
  it('layer_add anchored on the background still lands above it', () => {
    const state = stateOf(
      { a: layer('a'), [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID) },
      ['a', BACKGROUND_LAYER_ID],
    )
    const op: LayerAddOperation = { ...baseOp, type: 'layer_add', layerId: 'n', name: 'N', parentId: null, index: 1 }
    expect(applyContentOp(state, op).rootOrder).toEqual(['a', 'n', BACKGROUND_LAYER_ID])
  })

  it('folder_add creates an empty folder at the top', () => {
    const state = stateOf({}, [])
    const op: FolderAddOperation = { ...baseOp, type: 'folder_add', layerId: 'f1', name: 'Folder 1' }
    const next = applyContentOp(state, op)
    expect(next.items.f1).toMatchObject({ kind: 'folder', children: [] })
    expect(next.rootOrder).toEqual(['f1'])
  })

  it('folder_add honors an index', () => {
    const state = stateOf({ a: layer('a'), b: layer('b') }, ['a', 'b'])
    const op: FolderAddOperation = { ...baseOp, type: 'folder_add', layerId: 'f1', name: 'F', index: 1 }
    expect(applyContentOp(state, op).rootOrder).toEqual(['a', 'f1', 'b'])
  })

  it('layer_delete removes the layer from items, rootOrder, and any containing folder', () => {
    const state = stateOf(
      { f1: folder('f1', ['l1']), l1: layer('l1') },
      ['f1'],
    )
    const op: LayerDeleteOperation = { ...baseOp, type: 'layer_delete', layerIds: ['l1'] }
    const next = applyContentOp(state, op)
    expect(next.items.l1).toBeUndefined()
    expect((next.items.f1 as LayerFolder).children).toEqual([])
  })

  it('layer_delete never removes the background layer even if targeted', () => {
    const state = stateOf({ [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID) }, [BACKGROUND_LAYER_ID])
    const op: LayerDeleteOperation = { ...baseOp, type: 'layer_delete', layerIds: [BACKGROUND_LAYER_ID] }
    expect(applyContentOp(state, op).items[BACKGROUND_LAYER_ID]).toBeDefined()
  })

  it('layer_move relocates a layer into a folder at the given index', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b']), a: layer('a'), b: layer('b'), c: layer('c') },
      ['f1', 'c'],
    )
    const op: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'c', parentId: 'f1', index: 1 }
    const next = applyContentOp(state, op)
    expect((next.items.f1 as LayerFolder).children).toEqual(['a', 'c', 'b'])
    expect(next.rootOrder).toEqual(['f1'])
  })

  it('layer_move to root respects the background layer\'s reserved bottom slot', () => {
    const state = stateOf(
      { [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID), a: layer('a') },
      ['a', BACKGROUND_LAYER_ID],
    )
    const op: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'a', parentId: null, index: 5 }
    const next = applyContentOp(state, op)
    // index 5 is clamped, but background must stay last regardless.
    expect(next.rootOrder).toEqual(['a', BACKGROUND_LAYER_ID])
  })

  it('layer_move rejects moving the background layer, or nesting a folder inside a folder', () => {
    const state = stateOf(
      { [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID), f1: folder('f1', []), f2: folder('f2', []) },
      [BACKGROUND_LAYER_ID, 'f1', 'f2'],
    )
    const moveBg: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: BACKGROUND_LAYER_ID, parentId: null, index: 0 }
    expect(applyContentOp(state, moveBg)).toBe(state)

    const nestFolder: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'f2', parentId: 'f1', index: 0 }
    expect(applyContentOp(state, nestFolder)).toBe(state)
  })

  it('layer_move falls back to root top if the target folder vanished from history', () => {
    const state = stateOf({ a: layer('a') }, ['a'])
    const op: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'a', parentId: 'ghost-folder', index: 0 }
    const next = applyContentOp(state, op)
    expect(next.rootOrder).toEqual(['a'])
  })

  it('layer_opacity, layer_visibility, layer_rename update the target and no-op on missing ids', () => {
    const state = stateOf({ a: layer('a') }, ['a'])

    const opacityOp: LayerOpacityOperation = { ...baseOp, type: 'layer_opacity', layerId: 'a', opacity: 0.3 }
    expect((applyContentOp(state, opacityOp).items.a as RasterLayer).opacity).toBe(0.3)

    const visOp: LayerVisibilityOperation = { ...baseOp, type: 'layer_visibility', layerId: 'a', visible: false }
    expect((applyContentOp(state, visOp).items.a as RasterLayer).visible).toBe(false)

    const renameOp: LayerRenameOperation = { ...baseOp, type: 'layer_rename', layerId: 'a', name: 'New' }
    expect((applyContentOp(state, renameOp).items.a as RasterLayer).name).toBe('New')

    const missing: LayerOpacityOperation = { ...baseOp, type: 'layer_opacity', layerId: 'ghost', opacity: 0.9 }
    expect(applyContentOp(state, missing)).toBe(state)
  })

  it('layer_merge removes sources and inserts the merged layer at the given position', () => {
    const state = stateOf({ a: layer('a'), b: layer('b') }, ['a', 'b'])
    const op: LayerMergeOperation = {
      ...baseOp, type: 'layer_merge', layerId: 'merged', name: 'Merged',
      sources: [{ id: 'a', opacity: 1 }, { id: 'b', opacity: 1 }], parentId: null, index: 0,
    }
    const next = applyContentOp(state, op)
    expect(next.items.a).toBeUndefined()
    expect(next.items.b).toBeUndefined()
    expect(next.rootOrder).toEqual(['merged'])
  })

  // #75 investigation: "merge down inside a folder puts the merged layer at
  // the wrong index". This drives the reducer exactly the way LayerPanel's
  // handleMergeDown does (parentId = the folder, index = the *source*
  // layer's own pre-removal index in folder.children) for a merge that is
  // NOT at either edge of the folder, so a wrong-index bug would show up as
  // the merged layer landing next to the wrong sibling.
  it('layer_merge inside a folder places the merged layer exactly at the source\'s old slot, preserving siblings on both sides', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b', 'c', 'd', 'e']), a: layer('a'), b: layer('b'), c: layer('c'), d: layer('d'), e: layer('e') },
      ['f1'],
    )
    // Merge 'b' (index 1) down with 'c' (index 2) — neither is the folder's
    // first or last child, so a wrong-index bug (e.g. always inserting at 0,
    // or ejecting to rootOrder) would be caught here.
    const op: LayerMergeOperation = {
      ...baseOp, type: 'layer_merge', layerId: 'merged', name: 'Merged',
      sources: [{ id: 'b', opacity: 1 }, { id: 'c', opacity: 1 }], parentId: 'f1', index: 1,
    }
    const next = applyContentOp(state, op)
    expect(next.rootOrder).toEqual(['f1']) // stays inside the folder, not ejected to root
    expect((next.items.f1 as LayerFolder).children).toEqual(['a', 'merged', 'd', 'e'])
  })

  it('stroke, layer_clear, and the meta-ops (revoke/undo/redo) are structural no-ops', () => {
    const state = stateOf({ a: layer('a') }, ['a'])
    expect(applyContentOp(state, { ...baseOp, type: 'stroke', layerId: 'a', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs: [] })).toBe(state)
    expect(applyContentOp(state, { ...baseOp, type: 'layer_clear', layerId: 'a' })).toBe(state)
    // image_import (#88) never creates its own layer — layer_add already did
    // that, moments earlier — so it's a pixel-only op, same as stroke.
    expect(applyContentOp(state, { ...baseOp, type: 'image_import', layerId: 'a', image: 'data:,', width: 1, height: 1 })).toBe(state)
    expect(applyContentOp(state, { ...baseOp, type: 'operation_revoke', targetOpId: 'x' })).toBe(state)
    // #103: operation_undo/operation_redo only flip another log entry's
    // done/undone state (see OperationLog) — they never touch LayerState
    // directly, same as operation_revoke.
    expect(applyContentOp(state, { ...baseOp, type: 'operation_undo', targetOpId: 'x' })).toBe(state)
    expect(applyContentOp(state, { ...baseOp, type: 'operation_redo', targetOpId: 'x' })).toBe(state)
  })
})

describe('replayLayerState', () => {
  it('folds a sequence of operations over a base state regardless of authorship', () => {
    const base = stateOf({ [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID) }, [BACKGROUND_LAYER_ID])
    const ops = [
      { ...baseOp, id: '1', userId: 'remote-user', type: 'layer_add', layerId: 'l1', name: 'L1' } as LayerAddOperation,
      { ...baseOp, id: '2', userId: 'remote-user', type: 'layer_opacity', layerId: 'l1', opacity: 0.5 } as LayerOpacityOperation,
    ]
    const result = replayLayerState(base, ops)
    expect(result.rootOrder).toEqual(['l1', BACKGROUND_LAYER_ID])
    expect((result.items.l1 as RasterLayer).opacity).toBe(0.5)
  })
})

describe('overlayLocalFields', () => {
  it('carries local view fields (selection, activeId, folder collapsed/locked) onto the replayed state', () => {
    const derived = stateOf(
      { f1: folder('f1', []), a: layer('a') },
      ['f1', 'a'],
      { activeId: 'f1', selectedIds: [] },
    )
    const current = stateOf(
      { f1: folder('f1', [], { collapsed: true, locked: true }), a: layer('a', { locked: true }) },
      ['f1', 'a'],
      { activeId: 'a', selectedIds: ['a'] },
    )

    const result = overlayLocalFields(derived, current)
    expect(result.activeId).toBe('a')
    expect(result.selectedIds).toEqual(['a'])
    expect((result.items.f1 as LayerFolder).collapsed).toBe(true)
    expect((result.items.a as RasterLayer).locked).toBe(true)
  })

  it('sanitizes selection/active id that no longer exist after replay', () => {
    const derived = stateOf({ a: layer('a') }, ['a'])
    const current = stateOf({ a: layer('a'), b: layer('b') }, ['a', 'b'], { activeId: 'b', selectedIds: ['b'] })

    const result = overlayLocalFields(derived, current)
    expect(result.activeId).toBe('a') // 'b' no longer exists, falls back
    expect(result.selectedIds).toEqual([])
  })
})

describe('sanitizeSelection', () => {
  it('is a no-op (same reference) when nothing needs sanitizing', () => {
    const state = stateOf({ a: layer('a') }, ['a'], { activeId: 'a', selectedIds: [] })
    expect(sanitizeSelection(state)).toBe(state)
  })
})

describe('removeItems', () => {
  it('removes ids from items, rootOrder, and folder children', () => {
    const state = stateOf({ f1: folder('f1', ['a', 'b']), a: layer('a'), b: layer('b') }, ['f1'])
    const { items, rootOrder } = removeItems(state, new Set(['a']))
    expect(items.a).toBeUndefined()
    expect((items.f1 as LayerFolder).children).toEqual(['b'])
    expect(rootOrder).toEqual(['f1'])
  })
})

describe('parentOf / getVisibleOrder', () => {
  const state = stateOf(
    { f1: folder('f1', ['a', 'b'], { collapsed: false }), a: layer('a'), b: layer('b'), c: layer('c') },
    ['f1', 'c'],
  )

  it('parentOf finds the containing folder, or null at root', () => {
    expect(parentOf(state, 'a')).toBe('f1')
    expect(parentOf(state, 'c')).toBeNull()
  })

  it('getVisibleOrder expands open folders but skips the background layer', () => {
    const withBg = stateOf(
      { ...state.items, [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID) },
      ['f1', 'c', BACKGROUND_LAYER_ID],
    )
    expect(getVisibleOrder(withBg)).toEqual(['f1', 'a', 'b', 'c'])
  })

  it('getVisibleOrder does not expand a collapsed folder', () => {
    const collapsed = stateOf({ ...state.items, f1: folder('f1', ['a', 'b'], { collapsed: true }) }, ['f1', 'c'])
    expect(getVisibleOrder(collapsed)).toEqual(['f1', 'c'])
  })
})

describe('placementAbove / rootPlacementAbove (#378)', () => {
  //  f1 ─ a
  //     └ b
  //  c
  //  background
  const state = stateOf(
    {
      f1: folder('f1', ['a', 'b']), a: layer('a'), b: layer('b'), c: layer('c'),
      [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID),
    },
    ['f1', 'c', BACKGROUND_LAYER_ID],
  )

  it('places a new layer at the active row\'s own index, which is the slot above it', () => {
    expect(placementAbove(state, 'c')).toEqual({ parentId: null, index: 1 })
    expect(placementAbove(state, 'f1')).toEqual({ parentId: null, index: 0 })
  })

  it('keeps a new layer inside the folder the active one lives in', () => {
    expect(placementAbove(state, 'a')).toEqual({ parentId: 'f1', index: 0 })
    expect(placementAbove(state, 'b')).toEqual({ parentId: 'f1', index: 1 })
  })

  it('falls back to the top for an id that is not in the tree', () => {
    expect(placementAbove(state, 'ghost')).toEqual({ parentId: null, index: 0 })
    expect(rootPlacementAbove(state, 'ghost')).toBe(0)
  })

  // A folder cannot be a folder's child, so the anchor climbs to the folder
  // holding the active layer rather than dropping the new folder inside it.
  it('anchors a new folder on the active row\'s root ancestor', () => {
    expect(rootPlacementAbove(state, 'a')).toBe(0)
    expect(rootPlacementAbove(state, 'c')).toBe(1)
  })

  // Every placement above is a bare index; the background's is only safe
  // because applyContentOp clamps it — asserted separately on layer_add.
  it('reports the background\'s own index when it is active', () => {
    expect(placementAbove(state, BACKGROUND_LAYER_ID)).toEqual({ parentId: null, index: 2 })
  })
})

describe('collectDescendants', () => {
  it('returns just the id itself for a plain layer', () => {
    const state = stateOf({ a: layer('a') }, ['a'])
    expect(collectDescendants(state, 'a')).toEqual(['a'])
  })

  it('returns the folder id plus all of its children, in id-then-children order', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b']), a: layer('a'), b: layer('b'), c: layer('c') },
      ['f1', 'c'],
    )
    expect(collectDescendants(state, 'f1')).toEqual(['f1', 'a', 'b'])
  })

  it('returns just the id if it refers to a nonexistent item', () => {
    const state = stateOf({ a: layer('a') }, ['a'])
    expect(collectDescendants(state, 'ghost')).toEqual(['ghost'])
  })
})

describe('composite/merge order', () => {
  it('computeCompositeOrder returns bottom-to-top visible layers with effective opacity, skipping hidden ones', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b'], { opacity: 0.5 }), a: layer('a', { opacity: 1 }), b: layer('b', { opacity: 0.5, visible: false }), c: layer('c') },
      ['f1', 'c'],
    )
    const order = computeCompositeOrder(state)
    // rootOrder reversed is [c, f1] -> c first, then f1's children reversed [b, a] with b hidden -> skipped
    expect(order).toEqual([{ id: 'c', opacity: 1 }, { id: 'a', opacity: 0.5 }])
  })

  it('computeMergeOrder includes hidden layers among the requested ids', () => {
    const state = stateOf({ a: layer('a'), b: layer('b', { visible: false }) }, ['a', 'b'])
    const order = computeMergeOrder(state, ['a', 'b'])
    expect(order.map(o => o.id)).toEqual(['b', 'a']) // bottom-to-top
  })
})

describe('isLayerLocked', () => {
  it('follows the flag for an ordinary layer', () => {
    expect(isLayerLocked(layer('a'))).toBe(false)
    expect(isLayerLocked(layer('a', { locked: true }))).toBe(true)
  })

  // The bug this exists for: the background carries no `locked` flag — nothing
  // ever set one — so every caller reading `.locked` directly concluded it was
  // paintable, and it was.
  it('locks the background even though nothing set the flag', () => {
    expect(isLayerLocked(layer(BACKGROUND_LAYER_ID))).toBe(true)
  })

  it('keeps the background locked when the flag says otherwise', () => {
    expect(isLayerLocked(layer(BACKGROUND_LAYER_ID, { locked: false }))).toBe(true)
  })

  it('locks a folder by its own flag too', () => {
    expect(isLayerLocked(folder('f', []))).toBe(false)
    expect(isLayerLocked(folder('f', [], { locked: true }))).toBe(true)
  })

  it('treats a missing item as unlocked rather than throwing', () => {
    expect(isLayerLocked(undefined)).toBe(false)
  })
})

// (#359) The gate on starting a stroke has to agree with the compositor about
// what "hidden" means, or a stroke lands somewhere nobody can see it — the
// author included — while still reaching the log and every participant.
describe('isEffectivelyVisible', () => {
  it('follows the item\'s own flag', () => {
    const state = stateOf({ a: layer('a'), b: layer('b', { visible: false }) }, ['a', 'b'])
    expect(isEffectivelyVisible(state, 'a')).toBe(true)
    expect(isEffectivelyVisible(state, 'b')).toBe(false)
  })

  // The case the item's own flag can't answer: the layer says visible, and it
  // still paints nothing, because computeCompositeOrder skips a hidden folder
  // without ever looking at its children.
  it('hides a visible layer inside a hidden folder', () => {
    const state = stateOf({ f: folder('f', ['a'], { visible: false }), a: layer('a') }, ['f'])
    expect(isEffectivelyVisible(state, 'a')).toBe(false)
    expect(computeCompositeOrder(state).map(o => o.id)).toEqual([]) // same verdict, other side
  })

  it('keeps a layer visible inside a visible folder', () => {
    const state = stateOf({ f: folder('f', ['a']), a: layer('a') }, ['f'])
    expect(isEffectivelyVisible(state, 'a')).toBe(true)
  })

  it('reports a missing item as not visible rather than throwing', () => {
    expect(isEffectivelyVisible(stateOf({}, []), 'gone')).toBe(false)
  })
})

// An id is a position in the order, not a count: it must appear exactly once
// across rootOrder and every folder's children. Nothing enforced that until
// 2026-07-31, when a restored room replayed a `layer_merge` whose result the
// stored layerState already held, and the layer showed up twice in the panel —
// then three times, gaining a row per reload, because the corrupted order was
// itself uploaded and restored from. Visibility and opacity applied to every
// copy at once, since all of them were the same layer.
describe('an id never appears twice in the order', () => {
  const occurrences = (state: LayerState, id: string): number =>
    state.rootOrder.filter(x => x === id).length
    + Object.values(state.items).reduce(
      (n, item) => n + (item.kind === 'folder' ? item.children.filter(x => x === id).length : 0), 0)

  const merge = (overrides: Partial<LayerMergeOperation> = {}): LayerMergeOperation => ({
    ...baseOp, type: 'layer_merge', layerId: 'merged', name: 'Merged',
    sources: [{ id: 'a', opacity: 1 }], parentId: null, index: 0, ...overrides,
  })

  it('re-applying a merge whose result is already present does not add a second row', () => {
    const base = stateOf(
      { merged: layer('merged'), b: layer('b'), background: layer(BACKGROUND_LAYER_ID) },
      ['b', 'merged', BACKGROUND_LAYER_ID],
    )

    const once = applyContentOp(base, merge())
    const twice = applyContentOp(once, merge())

    expect(occurrences(once, 'merged')).toBe(1)
    expect(occurrences(twice, 'merged')).toBe(1)
  })

  // The shape actually seen in production: the same operation folded in on
  // every reload, each one leaving another row behind.
  it('stays at one however many times the operation is replayed', () => {
    let state = stateOf(
      { merged: layer('merged'), background: layer(BACKGROUND_LAYER_ID) },
      ['merged', BACKGROUND_LAYER_ID],
    )
    for (let i = 0; i < 5; i++) state = applyContentOp(state, merge())

    expect(occurrences(state, 'merged')).toBe(1)
    expect(state.rootOrder.filter(id => id === 'merged')).toHaveLength(1)
  })

  // layer_add carries its own guard (`if (state.items[id]) return state`), which
  // is why only merges ever duplicated. Pinned so the two paths cannot drift.
  it('re-applying a layer_add does not add a second row either', () => {
    const base = stateOf({ a: layer('a'), background: layer(BACKGROUND_LAYER_ID) }, ['a', BACKGROUND_LAYER_ID])
    const op: LayerAddOperation = { ...baseOp, type: 'layer_add', layerId: 'a', name: 'A' }

    expect(occurrences(applyContentOp(base, op), 'a')).toBe(1)
  })

  // The result of a merge can already be sitting inside a folder — someone
  // moved it there after the merge, and now the merge is being folded in
  // again. It has to come out of the folder rather than exist in both places.
  it('does not leave a copy behind in a folder the result had been moved into', () => {
    const base = stateOf(
      { f: folder('f', ['merged']), merged: layer('merged'), background: layer(BACKGROUND_LAYER_ID) },
      ['f', BACKGROUND_LAYER_ID],
    )

    const next = applyContentOp(base, merge())

    expect(occurrences(next, 'merged')).toBe(1)
    expect(next.rootOrder).toContain('merged')
    expect((next.items.f as LayerFolder).children).not.toContain('merged')
  })

  it('keeps the merge landing where the operation asked for it', () => {
    const base = stateOf(
      { x: layer('x'), y: layer('y'), background: layer(BACKGROUND_LAYER_ID) },
      ['x', 'y', BACKGROUND_LAYER_ID],
    )

    const next = applyContentOp(base, merge({ index: 1, sources: [{ id: 'x', opacity: 1 }] }))

    expect(next.rootOrder).toEqual(['y', 'merged', BACKGROUND_LAYER_ID])
  })
})
