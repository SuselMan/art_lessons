import { describe, expect, it } from 'vitest'

import type {
  LayerFolder, LayerItem, LayerState, RasterLayer,
  LayerAddOperation, FolderAddOperation, LayerDeleteOperation,
  LayerMoveOperation, LayerOpacityOperation, LayerVisibilityOperation,
  LayerRenameOperation, LayerMergeOperation, LayerDuplicateOperation,
  LayerLockOperation, LayerOwnerLockOperation, Operation,
} from '@grafetto/shared'
import { BACKGROUND_LAYER_ID } from '@grafetto/shared'

import {
  applyContentOp, replayLayerState, overlayLocalFields, sanitizeSelection,
  removeItems, parentOf, computeCompositeOrder, computeMergeOrder, getVisibleOrder,
  collectDescendants, isLayerLocked, isEffectivelyVisible, placementAbove, ancestorsOf,
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

  it('layer_move rejects moving the background layer', () => {
    const state = stateOf(
      { [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID), f1: folder('f1', []), f2: folder('f2', []) },
      [BACKGROUND_LAYER_ID, 'f1', 'f2'],
    )
    const moveBg: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: BACKGROUND_LAYER_ID, parentId: null, index: 0 }
    expect(applyContentOp(state, moveBg)).toBe(state)
  })

  // (#410) The rule this replaced was "a folder can never become a folder's
  // child", which used to be asserted right here alongside the background.
  it('layer_move nests a folder inside another folder', () => {
    const state = stateOf(
      { f1: folder('f1', []), f2: folder('f2', []) },
      ['f1', 'f2'],
    )
    const nest: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'f2', parentId: 'f1', index: 0 }
    const next = applyContentOp(state, nest)
    expect(next.rootOrder).toEqual(['f1'])
    expect(next.items.f1).toMatchObject({ children: ['f2'] })
  })

  // The guard that replaced it, and the reason it lives in replay rather than
  // in the drag handler: a loop is not a wrong answer, it is a walk that never
  // terminates — and every client folds every operation.
  it('layer_move refuses to move a folder into its own descendant', () => {
    //  f1 ─ f2 ─ f3
    const state = stateOf(
      { f1: folder('f1', ['f2']), f2: folder('f2', ['f3']), f3: folder('f3', []) },
      ['f1'],
    )
    const intoChild: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'f1', parentId: 'f2', index: 0 }
    expect(applyContentOp(state, intoChild)).toBe(state)

    const intoGrandchild: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'f1', parentId: 'f3', index: 0 }
    expect(applyContentOp(state, intoGrandchild)).toBe(state)

    const intoItself: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'f1', parentId: 'f1', index: 0 }
    expect(applyContentOp(state, intoItself)).toBe(state)
  })

  // The inverse direction stays legal: moving a folder *out* of the one that
  // holds it is not a loop, and refusing it would strand nested folders.
  it('layer_move lifts a nested folder back out to root', () => {
    const state = stateOf(
      { f1: folder('f1', ['f2']), f2: folder('f2', []) },
      ['f1'],
    )
    const lift: LayerMoveOperation = { ...baseOp, type: 'layer_move', layerId: 'f2', parentId: null, index: 0 }
    const next = applyContentOp(state, lift)
    expect(next.rootOrder).toEqual(['f2', 'f1'])
    expect(next.items.f1).toMatchObject({ children: [] })
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

  // (#449) The structural half of a duplicate. The pixel half is the engine's
  // (index.layerDuplicate.test.ts); what has to hold here is that the copy is a
  // real, independent row carrying the source's *appearance* and none of its
  // claims.
  it('layer_duplicate inserts the copy without consuming the source', () => {
    const state = stateOf({ a: layer('a'), b: layer('b') }, ['a', 'b'])
    const op: LayerDuplicateOperation = {
      ...baseOp, type: 'layer_duplicate', layerId: 'a-copy', sourceId: 'a', name: 'a copy',
      sourceOpacity: 1, sourceVisible: true, parentId: null, index: 0,
    }
    const next = applyContentOp(state, op)
    expect(next.items.a).toBeDefined()
    expect(next.rootOrder).toEqual(['a-copy', 'a', 'b'])
    expect(next.items['a-copy']).toMatchObject({ kind: 'layer', name: 'a copy' })
  })

  it('layer_duplicate takes opacity/visibility from the operation, never from live state', () => {
    // The source's live values deliberately disagree with the operation's:
    // replay must fold the same log into the same state on every client, and a
    // client whose source has since changed (or never existed) would otherwise
    // produce a different copy from everyone else's.
    const state = stateOf({ a: layer('a', { opacity: 0.2, visible: true }) }, ['a'])
    const op: LayerDuplicateOperation = {
      ...baseOp, type: 'layer_duplicate', layerId: 'a-copy', sourceId: 'a', name: 'a copy',
      sourceOpacity: 0.5, sourceVisible: false, parentId: null, index: 0,
    }
    const copy = applyContentOp(state, op).items['a-copy'] as RasterLayer
    expect(copy.opacity).toBe(0.5)
    expect(copy.visible).toBe(false)
  })

  it('layer_duplicate does not copy lock or owner-lock — a copy nobody may paint on is a puzzle, not a safeguard', () => {
    const state = stateOf({ a: layer('a', { locked: true, ownerLocked: true }) }, ['a'])
    const op: LayerDuplicateOperation = {
      ...baseOp, type: 'layer_duplicate', layerId: 'a-copy', sourceId: 'a', name: 'a copy',
      sourceOpacity: 1, sourceVisible: true, parentId: null, index: 0,
    }
    const copy = applyContentOp(state, op).items['a-copy'] as RasterLayer
    expect(copy.locked).toBe(false)
    expect(copy.ownerLocked).toBeUndefined()
  })

  it('layer_duplicate lands inside the source\'s own folder, at the source\'s slot', () => {
    const state = stateOf(
      { f1: folder('f1', ['a', 'b', 'c']), a: layer('a'), b: layer('b'), c: layer('c') },
      ['f1'],
    )
    // Driven exactly the way LayerPanel's handleDuplicate does: parentId = the
    // folder, index = the source's own index, which puts the copy above it.
    const op: LayerDuplicateOperation = {
      ...baseOp, type: 'layer_duplicate', layerId: 'b-copy', sourceId: 'b', name: 'b copy',
      sourceOpacity: 1, sourceVisible: true, parentId: 'f1', index: 1,
    }
    const next = applyContentOp(state, op)
    expect(next.rootOrder).toEqual(['f1'])
    expect((next.items.f1 as LayerFolder).children).toEqual(['a', 'b-copy', 'b', 'c'])
  })

  it('layer_duplicate folded twice is idempotent, not cumulative', () => {
    // Same guarantee insertAt's own doc comment exists for: a snapshot landing
    // mid-join can replay an operation whose result the restored state already
    // holds, and the layer must not appear twice for it.
    const state = stateOf({ a: layer('a') }, ['a'])
    const op: LayerDuplicateOperation = {
      ...baseOp, type: 'layer_duplicate', layerId: 'a-copy', sourceId: 'a', name: 'a copy',
      sourceOpacity: 1, sourceVisible: true, parentId: null, index: 0,
    }
    const once = applyContentOp(state, op)
    expect(applyContentOp(once, op)).toBe(once)
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
  it('carries local view fields (selection, activeId, folder collapsed) onto the replayed state', () => {
    const derived = stateOf(
      { f1: folder('f1', []), a: layer('a') },
      ['f1', 'a'],
      { activeId: 'f1', selectedIds: [] },
    )
    const current = stateOf(
      { f1: folder('f1', [], { collapsed: true }), a: layer('a') },
      ['f1', 'a'],
      { activeId: 'a', selectedIds: ['a'] },
    )

    const result = overlayLocalFields(derived, current)
    expect(result.activeId).toBe('a')
    expect(result.selectedIds).toEqual(['a'])
    expect((result.items.f1 as LayerFolder).collapsed).toBe(true)
  })

  // (#488) The lock is no longer a local field, and this says so: what the log
  // replayed wins, and a stale local value cannot resurrect itself on top. The
  // old behaviour — carrying `locked` over from `current` — is exactly why a
  // reload lost it, since a reload has no `current` to carry from.
  it('does not let a stale local value override either replayed lock', () => {
    const derived = stateOf({ a: layer('a', { locked: true, ownerLocked: true }) }, ['a'])
    const current = stateOf({ a: layer('a', { locked: false, ownerLocked: false }) }, ['a'])

    const a = overlayLocalFields(derived, current).items.a as RasterLayer
    expect(a.locked).toBe(true)
    expect(a.ownerLocked).toBe(true)
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

describe('placementAbove (#378)', () => {
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
  })

  // (#410) `rootPlacementAbove` used to live here: a second placement helper
  // that existed only because a folder could not be a folder's child, so a new
  // folder's position had to climb to the active row's *root* ancestor and
  // collapse to a bare rootOrder index. Nesting removes the exception, and with
  // it the helper — a new folder is now placed by the same rule as a new layer,
  // which is what this asserts.
  it('places a new folder inside the folder the active row lives in', () => {
    expect(placementAbove(state, 'a')).toEqual({ parentId: 'f1', index: 0 })
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

  // (#488) The two locks are not the same lock, and this is where that lives.
  describe('the two locks differ in who they stop', () => {
    it('the shared lock stops the owner too — that is what makes it shared', () => {
      const item = layer('a', { locked: true })
      expect(isLayerLocked(item, false)).toBe(true)
      expect(isLayerLocked(item, true)).toBe(true)
    })

    it('the owner lock stops everyone but the owner', () => {
      const item = layer('a', { ownerLocked: true })
      expect(isLayerLocked(item, false)).toBe(true)
      expect(isLayerLocked(item, true)).toBe(false)
    })

    it('an owner facing both is still stopped by the shared one', () => {
      expect(isLayerLocked(layer('a', { locked: true, ownerLocked: true }), true)).toBe(true)
    })

    it('defaults to the stricter answer when nobody says who is asking', () => {
      // Over-locking shows up as a padlock that will not open; under-locking
      // lets a stroke through that the server then rejects. Only one of those
      // costs drawing.
      expect(isLayerLocked(layer('a', { ownerLocked: true }))).toBe(true)
    })
  })

  // The lock has to survive the one thing its predecessor could not: being
  // rebuilt from the log alone, with no earlier state to carry it from. That
  // is what a reload is.
  describe('surviving a reload', () => {
    const base = stateOf({ a: layer('a') }, ['a'])
    const replayOf = (ops: Operation[]) => replayLayerState(base, ops)

    it('the shared lock comes back from the log', () => {
      const op: LayerLockOperation = { ...baseOp, type: 'layer_lock', layerId: 'a', locked: true }
      expect((replayOf([op]).items.a as RasterLayer).locked).toBe(true)
    })

    it('and can be lifted by anyone, which the log records the same way', () => {
      const on: LayerLockOperation = { ...baseOp, type: 'layer_lock', layerId: 'a', locked: true }
      const off: LayerLockOperation = { ...baseOp, id: 'op-off', type: 'layer_lock', layerId: 'a', locked: false }
      expect((replayOf([on, off]).items.a as RasterLayer).locked).toBe(false)
    })

    it('the owner lock comes back the same way and stays independent', () => {
      const shared: LayerLockOperation = { ...baseOp, type: 'layer_lock', layerId: 'a', locked: true }
      const owner: LayerOwnerLockOperation = { ...baseOp, id: 'op-o', type: 'layer_owner_lock', layerId: 'a', locked: true }
      const off: LayerLockOperation = { ...baseOp, id: 'op-off', type: 'layer_lock', layerId: 'a', locked: false }
      // Lifting the shared lock must not lift the owner's.
      const a = replayOf([shared, owner, off]).items.a as RasterLayer
      expect(a.locked).toBe(false)
      expect(a.ownerLocked).toBe(true)
    })

    it('a lock on a layer that no longer exists is ignored, not resurrected', () => {
      const op: LayerLockOperation = { ...baseOp, type: 'layer_lock', layerId: 'gone', locked: true }
      expect(replayOf([op]).items.gone).toBeUndefined()
    })
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

// ── #412: mass operations ────────────────────────────────────────────────────

describe('plural layer_opacity / layer_visibility (#412)', () => {
  const three = () => stateOf(
    { a: layer('a'), b: layer('b'), c: layer('c') },
    ['a', 'b', 'c'],
  )

  it('applies one opacity to every named layer', () => {
    const op: LayerOpacityOperation = {
      ...baseOp, type: 'layer_opacity', layerIds: ['a', 'c'], opacity: 0.25,
    }
    const next = applyContentOp(three(), op)
    expect(next.items.a.opacity).toBe(0.25)
    expect(next.items.c.opacity).toBe(0.25)
    expect(next.items.b.opacity).toBe(1)
  })

  it('applies one visibility to every named layer', () => {
    const op: LayerVisibilityOperation = {
      ...baseOp, type: 'layer_visibility', layerIds: ['a', 'b'], visible: false,
    }
    const next = applyContentOp(three(), op)
    expect(next.items.a.visible).toBe(false)
    expect(next.items.b.visible).toBe(false)
    expect(next.items.c.visible).toBe(true)
  })

  // Every room created before #412 has these in its log in the singular form,
  // and replays them on every single join. They must never stop working.
  it('still replays the pre-#412 singular form', () => {
    const opacity: LayerOpacityOperation = {
      ...baseOp, type: 'layer_opacity', layerId: 'b', opacity: 0.5,
    }
    const visibility: LayerVisibilityOperation = {
      ...baseOp, type: 'layer_visibility', layerId: 'c', visible: false,
    }
    const next = replayLayerState(three(), [opacity, visibility])
    expect(next.items.b.opacity).toBe(0.5)
    expect(next.items.c.visible).toBe(false)
    expect(next.items.a).toMatchObject({ opacity: 1, visible: true })
  })

  it('skips ids that no longer exist and keeps the rest', () => {
    const op: LayerOpacityOperation = {
      ...baseOp, type: 'layer_opacity', layerIds: ['a', 'ghost'], opacity: 0.1,
    }
    const next = applyContentOp(three(), op)
    expect(next.items.a.opacity).toBe(0.1)
    expect(next.items.ghost).toBeUndefined()
  })

  // Replay runs over every operation of every join, and callers upstream
  // compare by reference — a new object per no-op op would defeat that.
  it('returns the same state object when nothing matched', () => {
    const state = three()
    const op: LayerOpacityOperation = {
      ...baseOp, type: 'layer_opacity', layerIds: ['ghost'], opacity: 0.1,
    }
    expect(applyContentOp(state, op)).toBe(state)
  })

  it('an operation naming nothing at all is a no-op', () => {
    const state = three()
    const op: LayerVisibilityOperation = { ...baseOp, type: 'layer_visibility', visible: false }
    expect(applyContentOp(state, op)).toBe(state)
  })
})

// ── #413: group move ─────────────────────────────────────────────────────────

describe('group layer_move (#413)', () => {
  const move = (over: Partial<LayerMoveOperation>): LayerMoveOperation => ({
    ...baseOp, type: 'layer_move', parentId: null, index: 0, ...over,
  })

  it('lands a scattered selection as one contiguous run, in the order given', () => {
    const state = stateOf(
      { a: layer('a'), b: layer('b'), c: layer('c'), d: layer('d') },
      ['a', 'b', 'c', 'd'],
    )
    // a and c are not neighbours; after the move they are.
    const next = applyContentOp(state, move({ layerIds: ['a', 'c'], parentId: null, index: 2 }))
    expect(next.rootOrder).toEqual(['b', 'd', 'a', 'c'])
  })

  it('moves a mixed set of folders and layers into a folder', () => {
    const state = stateOf(
      { box: folder('box', []), f1: folder('f1', ['x']), x: layer('x'), y: layer('y') },
      ['box', 'f1', 'y'],
    )
    const next = applyContentOp(state, move({ layerIds: ['f1', 'y'], parentId: 'box', index: 0 }))
    expect(next.rootOrder).toEqual(['box'])
    expect(next.items.box).toMatchObject({ children: ['f1', 'y'] })
    // f1 kept its own contents through the move.
    expect(next.items.f1).toMatchObject({ children: ['x'] })
  })

  // Ilya's "and worse, individual items out of a folder" case.
  it('lifts part of a folder out and leaves the rest behind', () => {
    const state = stateOf(
      { f1: folder('f1', ['x', 'y', 'z']), x: layer('x'), y: layer('y'), z: layer('z') },
      ['f1'],
    )
    const next = applyContentOp(state, move({ layerIds: ['x', 'z'], parentId: null, index: 0 }))
    expect(next.rootOrder).toEqual(['x', 'z', 'f1'])
    expect(next.items.f1).toMatchObject({ children: ['y'] })
  })

  // The normalisation rule: a folder swallows its selected descendants, so the
  // child rides along inside it instead of being lifted out on its own.
  it('ignores a selected child whose folder is also selected', () => {
    const state = stateOf(
      { f1: folder('f1', ['x']), x: layer('x'), y: layer('y') },
      ['y', 'f1'],
    )
    const next = applyContentOp(state, move({ layerIds: ['f1', 'x'], parentId: null, index: 0 }))
    expect(next.rootOrder).toEqual(['f1', 'y'])
    expect(next.items.f1).toMatchObject({ children: ['x'] })
  })

  it('refuses the whole move when any member would land inside itself', () => {
    const state = stateOf(
      { f1: folder('f1', ['inner']), inner: folder('inner', []), loose: layer('loose') },
      ['f1', 'loose'],
    )
    // Refusing wholesale rather than moving `loose` and skipping `f1`: a
    // partial result is the one outcome the user cannot make sense of.
    expect(applyContentOp(state, move({ layerIds: ['f1', 'loose'], parentId: 'inner', index: 0 }))).toBe(state)
  })

  it('refuses a move into a folder that is itself moving', () => {
    const state = stateOf(
      { f1: folder('f1', []), a: layer('a') },
      ['f1', 'a'],
    )
    expect(applyContentOp(state, move({ layerIds: ['f1', 'a'], parentId: 'f1', index: 0 }))).toBe(state)
  })

  it('drops the background from a group rather than refusing the move', () => {
    const state = stateOf(
      { [BACKGROUND_LAYER_ID]: layer(BACKGROUND_LAYER_ID), a: layer('a'), b: layer('b') },
      ['a', 'b', BACKGROUND_LAYER_ID],
    )
    const next = applyContentOp(state, move({ layerIds: ['b', BACKGROUND_LAYER_ID], parentId: null, index: 0 }))
    expect(next.rootOrder).toEqual(['b', 'a', BACKGROUND_LAYER_ID])
  })

  // Every layer_move in a pre-#413 log is singular.
  it('still replays the pre-#413 singular form', () => {
    const state = stateOf({ a: layer('a'), b: layer('b') }, ['a', 'b'])
    const next = applyContentOp(state, move({ layerId: 'a', parentId: null, index: 1 }))
    expect(next.rootOrder).toEqual(['b', 'a'])
  })

  it('is a no-op when nothing it names still exists', () => {
    const state = stateOf({ a: layer('a') }, ['a'])
    expect(applyContentOp(state, move({ layerIds: ['ghost'], parentId: null, index: 0 }))).toBe(state)
  })
})

// ── #410: nested folders ─────────────────────────────────────────────────────

describe('nested folders (#410)', () => {
  //  f1 ─ f2 ─ deep
  //     └ mid
  //  top
  const nested = () => stateOf(
    {
      f1: folder('f1', ['f2', 'mid']), f2: folder('f2', ['deep']),
      deep: layer('deep'), mid: layer('mid'), top: layer('top'),
    },
    ['f1', 'top'],
  )

  describe('ancestorsOf', () => {
    it('walks folders nearest first, up to the root', () => {
      expect(ancestorsOf(nested(), 'deep')).toEqual(['f2', 'f1'])
      expect(ancestorsOf(nested(), 'mid')).toEqual(['f1'])
      expect(ancestorsOf(nested(), 'top')).toEqual([])
    })

    // A cycle cannot be authored — applyMove refuses it — but it can arrive
    // whole, in a stored snapshot nobody validates on the way in. Terminating
    // is the entire requirement here: the alternative is a frozen tab for every
    // participant at once, and no way to reach the state that froze it.
    it('terminates on a state that already contains a loop', () => {
      const looped = stateOf({ a: folder('a', ['b']), b: folder('b', ['a']) }, [])
      expect(ancestorsOf(looped, 'a')).toEqual(['b'])
    })
  })

  describe('isEffectivelyVisible', () => {
    it('is false when any ancestor is hidden, not just the immediate parent', () => {
      const state = nested()
      state.items.f1 = folder('f1', ['f2', 'mid'], { visible: false })
      // 'deep' sits two levels down and its own parent f2 is visible — the
      // one-level check this replaced called that visible.
      expect(isEffectivelyVisible(state, 'deep')).toBe(false)
      expect(isEffectivelyVisible(state, 'top')).toBe(true)
    })

    it('is true when the whole chain of ancestors is visible', () => {
      expect(isEffectivelyVisible(nested(), 'deep')).toBe(true)
    })
  })

  describe('composite order', () => {
    it('multiplies every enclosing folder\'s opacity into the layer\'s own', () => {
      const state = stateOf(
        {
          f1: folder('f1', ['f2'], { opacity: 0.5 }),
          f2: folder('f2', ['deep'], { opacity: 0.5 }),
          deep: layer('deep', { opacity: 0.5 }),
        },
        ['f1'],
      )
      expect(computeCompositeOrder(state)).toEqual([{ id: 'deep', opacity: 0.125 }])
    })

    it('skips a hidden nested folder whole, without descending into it', () => {
      const state = nested()
      state.items.f2 = folder('f2', ['deep'], { visible: false })
      expect(computeCompositeOrder(state).map(e => e.id)).toEqual(['top', 'mid'])
    })

    it('keeps bottom-to-top order across levels', () => {
      expect(computeCompositeOrder(nested()).map(e => e.id)).toEqual(['top', 'mid', 'deep'])
    })

    // Merge deliberately includes hidden sources — their pixels are about to be
    // destroyed — and that has to keep holding through a nested chain.
    it('computeMergeOrder still folds hidden nested layers in', () => {
      const state = nested()
      state.items.f2 = folder('f2', ['deep'], { visible: false })
      expect(computeMergeOrder(state, ['deep', 'mid']).map(e => e.id)).toEqual(['mid', 'deep'])
    })
  })

  describe('getVisibleOrder / collectDescendants', () => {
    it('getVisibleOrder expands nested open folders to full depth', () => {
      expect(getVisibleOrder(nested())).toEqual(['f1', 'f2', 'deep', 'mid', 'top'])
    })

    it('getVisibleOrder stops at a collapsed folder, hiding its whole subtree', () => {
      const state = nested()
      state.items.f2 = folder('f2', ['deep'], { collapsed: true })
      expect(getVisibleOrder(state)).toEqual(['f1', 'f2', 'mid', 'top'])
    })

    it('collectDescendants reaches through nested folders', () => {
      expect(collectDescendants(nested(), 'f1')).toEqual(['f1', 'f2', 'deep', 'mid'])
    })

    it('collectDescendants terminates on a looped state', () => {
      const looped = stateOf({ a: folder('a', ['b']), b: folder('b', ['a']) }, [])
      expect(collectDescendants(looped, 'a')).toEqual(['a', 'b'])
    })
  })

  describe('folder_add', () => {
    it('places a new folder inside the named parent', () => {
      const state = stateOf({ f1: folder('f1', []) }, ['f1'])
      const op: FolderAddOperation = {
        ...baseOp, type: 'folder_add', layerId: 'f2', name: 'Nested', parentId: 'f1', index: 0,
      }
      const next = applyContentOp(state, op)
      expect(next.rootOrder).toEqual(['f1'])
      expect(next.items.f1).toMatchObject({ children: ['f2'] })
    })

    // Every folder_add already recorded in a live room's log looks like this.
    it('lands at root when parentId is absent', () => {
      const state = stateOf({ a: layer('a') }, ['a'])
      const op: FolderAddOperation = { ...baseOp, type: 'folder_add', layerId: 'f1', name: 'F', index: 1 }
      expect(applyContentOp(state, op).rootOrder).toEqual(['a', 'f1'])
    })
  })

  it('layer_merge lands the result inside the nested folder it came from', () => {
    const state = stateOf(
      { f1: folder('f1', ['f2']), f2: folder('f2', ['x', 'y']), x: layer('x'), y: layer('y') },
      ['f1'],
    )
    const op: LayerMergeOperation = {
      ...baseOp, type: 'layer_merge', layerId: 'merged', name: 'Merged',
      sources: [{ id: 'y', opacity: 1 }, { id: 'x', opacity: 1 }],
      parentId: 'f2', index: 0,
    }
    const next = applyContentOp(state, op)
    expect(next.items.f2).toMatchObject({ children: ['merged'] })
    expect(next.rootOrder).toEqual(['f1'])
  })
})
