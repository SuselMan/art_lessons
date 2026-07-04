import { describe, expect, it } from 'vitest'

import type {
  LayerFolder, LayerItem, LayerState, RasterLayer,
  LayerAddOperation, FolderAddOperation, LayerDeleteOperation,
  LayerMoveOperation, LayerOpacityOperation, LayerVisibilityOperation,
  LayerRenameOperation, LayerMergeOperation,
} from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'

import {
  applyContentOp, replayLayerState, overlayLocalFields, sanitizeSelection,
  removeItems, parentOf, computeCompositeOrder, computeMergeOrder, getVisibleOrder,
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
  it('layer_add inserts at the top of rootOrder and is a no-op if the id already exists', () => {
    const state = stateOf({ [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID) }, [BACKGROUND_LAYER_ID])
    const op: LayerAddOperation = { ...baseOp, type: 'layer_add', layerId: 'l1', name: 'Layer 1' }

    const next = applyContentOp(state, op)
    expect(next.rootOrder).toEqual(['l1', BACKGROUND_LAYER_ID])
    expect(next.items.l1).toMatchObject({ kind: 'layer', name: 'Layer 1' })

    expect(applyContentOp(next, op)).toBe(next) // duplicate add is a no-op (same reference)
  })

  it('folder_add creates an empty folder at the top', () => {
    const state = stateOf({}, [])
    const op: FolderAddOperation = { ...baseOp, type: 'folder_add', layerId: 'f1', name: 'Folder 1' }
    const next = applyContentOp(state, op)
    expect(next.items.f1).toMatchObject({ kind: 'folder', children: [] })
    expect(next.rootOrder).toEqual(['f1'])
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

  it('stroke, layer_clear, and the meta-ops (revoke/undo/redo) are structural no-ops', () => {
    const state = stateOf({ a: layer('a') }, ['a'])
    expect(applyContentOp(state, { ...baseOp, type: 'stroke', layerId: 'a', tool: 'pencil', preset: 'HB', dabs: [] })).toBe(state)
    expect(applyContentOp(state, { ...baseOp, type: 'layer_clear', layerId: 'a' })).toBe(state)
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
