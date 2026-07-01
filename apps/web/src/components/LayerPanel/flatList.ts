import type { LayerState, LayerItem } from '@art-lessons/shared'
import { isFolder } from '../../lib/layers'

export const S_TOP = '__top_'
export const S_BOT = '__bot_'

export interface FlatEntry {
  id: string
  kind: 'layer' | 'folder' | 'sentinel'
  depth: number
}

/** Expands the hierarchy into a flat list suitable for a single SortableContext.
 *
 *  Open folders emit:  [folder, __top_id, ...children, __bot_id]
 *  Closed folders emit: [folder, __bot_id]  (drop zone below closed folder)
 *
 *  Sentinels embed the folder ID in their own ID so reconstructHierarchy can
 *  recover children even when the folder header has been moved by arrayMove. */
export function buildFlatList(state: LayerState): FlatEntry[] {
  const out: FlatEntry[] = []
  for (const id of state.rootOrder) {
    const item = state.items[id]
    if (!item) continue
    if (isFolder(item)) {
      out.push({ id, kind: 'folder', depth: 0 })
      if (!item.collapsed) {
        out.push({ id: `${S_TOP}${id}`, kind: 'sentinel', depth: 1 })
        for (const cid of item.children)
          if (state.items[cid]) out.push({ id: cid, kind: 'layer', depth: 1 })
      }
      // __bot_ always present: depth 0 for collapsed (same level as folder header)
      out.push({ id: `${S_BOT}${id}`, kind: 'sentinel', depth: item.collapsed ? 0 : 1 })
    } else {
      out.push({ id, kind: 'layer', depth: 0 })
    }
  }
  return out
}

/** Converts a reordered flat-ID list back to { rootOrder, items }.
 *
 *  __top_X opens a bracket collecting children for folder X.
 *  __bot_X closes it.  Items outside any bracket go to rootOrder.
 *  Collapsed folders never emit __top_, so their children are left untouched
 *  (they are not present in flatIds and therefore not overwritten here). */
export function reconstructHierarchy(
  flatIds: string[],
  prevItems: Record<string, LayerItem>,
): { rootOrder: string[]; items: Record<string, LayerItem> } {
  const rootOrder: string[] = []
  const openFolderChildren: Record<string, string[]> = {}
  let cur: string | null = null

  for (const id of flatIds) {
    if (id.startsWith(S_TOP)) { cur = id.slice(S_TOP.length); openFolderChildren[cur] = []; continue }
    if (id.startsWith(S_BOT)) { cur = null; continue }
    if (cur !== null) openFolderChildren[cur].push(id)
    else rootOrder.push(id)
  }

  const newItems = { ...prevItems }
  for (const [fid, ch] of Object.entries(openFolderChildren)) {
    const folder = newItems[fid]
    if (folder && isFolder(folder)) newItems[fid] = { ...folder, children: ch }
  }

  return { rootOrder, items: newItems }
}
