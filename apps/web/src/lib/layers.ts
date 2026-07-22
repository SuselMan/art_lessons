import type { LayerFolder, LayerItem, LayerState, Operation, RasterLayer, LayerMoveOperation } from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'

export function isFolder(item: LayerItem): item is LayerFolder {
  return item.kind === 'folder'
}

/** Returns the folder id that holds the item, or null if the item is at root. */
export function parentOf(state: LayerState, id: string): string | null {
  for (const item of Object.values(state.items))
    if (isFolder(item) && item.children.includes(id)) return item.id
  return null
}

/** Returns all visible item ids in render order (root items + children of open folders). */
export function getVisibleOrder(state: LayerState): string[] {
  const out: string[] = []
  for (const id of state.rootOrder) {
    if (id === BACKGROUND_LAYER_ID) continue
    out.push(id)
    const item = state.items[id]
    if (isFolder(item) && !item.collapsed) {
      out.push(...item.children)
    }
  }
  return out
}

/** Collects an id plus all descendants (children of folders). Only one level deep
 *  because nested folders are forbidden, but recurse defensively. */
export function collectDescendants(state: LayerState, id: string): string[] {
  const out: string[] = [id]
  const item = state.items[id]
  if (item && isFolder(item)) {
    for (const cid of item.children) {
      out.push(...collectDescendants(state, cid))
    }
  }
  return out
}

/** Walks the hierarchy bottom→top and returns raster layers with effective
 *  (folder × layer) opacity. `includeHidden` keeps invisible items in the list. */
function orderedLayers(state: LayerState, includeHidden: boolean): { id: string; opacity: number }[] {
  const result: { id: string; opacity: number }[] = []
  for (const id of [...state.rootOrder].reverse()) {
    const item = state.items[id]
    if (!item || !(includeHidden || item.visible)) continue
    if (isFolder(item)) {
      for (const cid of [...item.children].reverse()) {
        const child = state.items[cid]
        if (child && (includeHidden || child.visible))
          result.push({ id: cid, opacity: item.opacity * child.opacity })
      }
    } else {
      result.push({ id, opacity: item.opacity })
    }
  }
  return result
}

export function computeCompositeOrder(state: LayerState): { id: string; opacity: number }[] {
  return orderedLayers(state, false)
}

/** Bottom→top order of the given layers for merging. Hidden layers are
 *  included — a merge destroys its sources, so their pixels must be baked
 *  into the result rather than silently dropped. */
export function computeMergeOrder(state: LayerState, ids: string[]): { id: string; opacity: number }[] {
  const idSet = new Set(ids)
  return orderedLayers(state, true).filter(entry => idSet.has(entry.id))
}

// ── Operation replay (ADR 002: LayerState is derived from the operation log) ──

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length))
}

/** Inserts an id into a container, honoring the reserved bottom slot of the
 *  background layer when targeting the root. */
function insertAt(state: LayerState, items: LayerState['items'], rootOrder: string[],
  id: string, parentId: string | null, index: number): LayerState {
  if (parentId) {
    const folder = items[parentId]
    if (folder && isFolder(folder)) {
      const children = [...folder.children]
      children.splice(clampIndex(index, children.length), 0, id)
      return { ...state, items: { ...items, [parentId]: { ...folder, children } }, rootOrder }
    }
    // target folder vanished from history — fall back to root top
    return { ...state, items, rootOrder: [id, ...rootOrder] }
  }
  const order = [...rootOrder]
  const bg = order.indexOf(BACKGROUND_LAYER_ID)
  const at = clampIndex(index, order.length)
  order.splice(bg >= 0 ? Math.min(at, bg) : at, 0, id)
  return { ...state, items, rootOrder: order }
}

function applyMove(state: LayerState, op: LayerMoveOperation): LayerState {
  const moving = state.items[op.layerId]
  if (!moving || op.layerId === BACKGROUND_LAYER_ID) return state
  if (op.parentId) {
    const target = state.items[op.parentId]
    // folders are one level deep; a folder can never become a folder's child
    if (!target || !isFolder(target) || isFolder(moving) || op.parentId === op.layerId) return state
  }

  const rootOrder = state.rootOrder.filter(id => id !== op.layerId)
  const items: LayerState['items'] = {}
  for (const [id, item] of Object.entries(state.items)) {
    items[id] = isFolder(item) && item.children.includes(op.layerId)
      ? { ...item, children: item.children.filter(c => c !== op.layerId) }
      : item
  }
  return insertAt(state, items, rootOrder, op.layerId, op.parentId, op.index)
}

/** Applies one operation's structural effect. Pixel-only operations (stroke,
 *  clear) and the meta-operations (revoke/undo/redo — they only flip *another*
 *  entry's state, see OperationLog) pass through unchanged. Local view fields
 *  (activeId, selectedIds, collapsed, locked) are not touched — see
 *  overlayLocalFields. */
export function applyContentOp(state: LayerState, op: Operation): LayerState {
  switch (op.type) {
    case 'layer_add': {
      if (state.items[op.layerId]) return state
      const layer: RasterLayer = { kind: 'layer', id: op.layerId, name: op.name, opacity: 1, visible: true, locked: false }
      return { ...state, items: { ...state.items, [op.layerId]: layer }, rootOrder: [op.layerId, ...state.rootOrder] }
    }
    case 'folder_add': {
      if (state.items[op.layerId]) return state
      const folder: LayerFolder = { kind: 'folder', id: op.layerId, name: op.name, opacity: 1, visible: true, locked: false, collapsed: false, children: [] }
      return { ...state, items: { ...state.items, [op.layerId]: folder }, rootOrder: [op.layerId, ...state.rootOrder] }
    }
    case 'layer_delete': {
      const ids = new Set(op.layerIds)
      ids.delete(BACKGROUND_LAYER_ID)
      const { items, rootOrder } = removeItems(state, ids)
      return { ...state, items, rootOrder }
    }
    case 'layer_move':
      return applyMove(state, op)
    case 'layer_opacity': {
      const item = state.items[op.layerId]
      if (!item) return state
      return { ...state, items: { ...state.items, [op.layerId]: { ...item, opacity: op.opacity } } }
    }
    case 'layer_visibility': {
      const item = state.items[op.layerId]
      if (!item) return state
      return { ...state, items: { ...state.items, [op.layerId]: { ...item, visible: op.visible } } }
    }
    case 'layer_owner_lock': {
      const item = state.items[op.layerId]
      if (!item) return state
      return { ...state, items: { ...state.items, [op.layerId]: { ...item, ownerLocked: op.locked } } }
    }
    case 'layer_rename': {
      const item = state.items[op.layerId]
      if (!item) return state
      return { ...state, items: { ...state.items, [op.layerId]: { ...item, name: op.name } } }
    }
    case 'layer_merge': {
      const ids = new Set(op.sources.map(s => s.id))
      ids.delete(BACKGROUND_LAYER_ID)
      const { items, rootOrder } = removeItems(state, ids)
      const merged: RasterLayer = { kind: 'layer', id: op.layerId, name: op.name, opacity: 1, visible: true, locked: false }
      return insertAt(state, { ...items, [op.layerId]: merged }, rootOrder, op.layerId, op.parentId, op.index)
    }
    case 'stroke':
    case 'layer_clear':
    case 'image_import':
    case 'layer_transform':
    case 'operation_revoke':
    case 'operation_undo':
    case 'operation_redo':
      return state
  }
}

/** Rebuilds LayerState by replaying done operations over the room's base state. */
export function replayLayerState(base: LayerState, ops: Operation[]): LayerState {
  let state = base
  for (const op of ops) state = applyContentOp(state, op)
  return state
}

/** Drops references to items that no longer exist after replay/delete. */
export function sanitizeSelection(state: LayerState): LayerState {
  const selectedIds = state.selectedIds.filter(id => state.items[id])
  let activeId = state.activeId
  if (!state.items[activeId]) {
    activeId = state.rootOrder.find(id => id !== BACKGROUND_LAYER_ID) ?? BACKGROUND_LAYER_ID
  }
  if (activeId === state.activeId && selectedIds.length === state.selectedIds.length) return state
  return { ...state, activeId, selectedIds }
}

/** Carries per-user view state (selection, collapsed folders, local locks) from
 *  the current state onto a freshly replayed one — those fields live outside
 *  the shared operation log. */
export function overlayLocalFields(derived: LayerState, current: LayerState): LayerState {
  const items: LayerState['items'] = {}
  for (const [id, item] of Object.entries(derived.items)) {
    const cur = current.items[id]
    if (cur && isFolder(item) && isFolder(cur)) {
      items[id] = { ...item, locked: cur.locked, collapsed: cur.collapsed }
    } else if (cur && !isFolder(item) && !isFolder(cur)) {
      items[id] = { ...item, locked: cur.locked }
    } else {
      items[id] = item
    }
  }
  return sanitizeSelection({ ...derived, items, activeId: current.activeId, selectedIds: current.selectedIds })
}

/** Removes the given ids everywhere: from the items map, from rootOrder and
 *  from every folder's children. */
export function removeItems(
  state: LayerState,
  ids: ReadonlySet<string>,
): Pick<LayerState, 'items' | 'rootOrder'> {
  const items: LayerState['items'] = {}
  for (const [id, item] of Object.entries(state.items)) {
    if (ids.has(id)) continue
    items[id] = isFolder(item) && item.children.some(c => ids.has(c))
      ? { ...item, children: item.children.filter(c => !ids.has(c)) }
      : item
  }
  return { items, rootOrder: state.rootOrder.filter(id => !ids.has(id)) }
}
