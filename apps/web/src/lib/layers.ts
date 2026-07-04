import type { LayerFolder, LayerItem, LayerState } from '@art-lessons/shared'
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
  if (isFolder(item)) {
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
