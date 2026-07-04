import type { LayerState } from '@art-lessons/shared'
import { isFolder } from '../../lib/layers'

export const S_BOT = '__bot_'

export interface FlatEntry {
  id: string
  kind: 'layer' | 'folder' | 'sentinel'
  depth: number
}

/** Expands the hierarchy into a flat list with visual depth.
 *  Folders always emit a bottom sentinel that marks the folder boundary:
 *    [folder, child1, child2, __bot_folder, ...]
 *  Drop between the folder header and its sentinel puts the item inside the folder.
 *  Drop below the sentinel puts the item outside. */
export function buildFlatList(state: LayerState): FlatEntry[] {
  const out: FlatEntry[] = []
  for (const id of state.rootOrder) {
    const item = state.items[id]
    if (!item) continue
    if (isFolder(item)) {
      out.push({ id, kind: 'folder', depth: 0 })
      if (!item.collapsed) {
        for (const cid of item.children)
          if (state.items[cid]) out.push({ id: cid, kind: 'layer', depth: 1 })
      }
      out.push({ id: `${S_BOT}${id}`, kind: 'sentinel', depth: 0 })
    } else {
      out.push({ id, kind: 'layer', depth: 0 })
    }
  }
  return out
}

/** Converts a flat-ID list back to { rootOrder, items }.
 *  Items between a folder header and its matching __bot_ become children.
 *  The sentinel ids themselves are discarded. */
export function reconstructHierarchy(
  flatIds: string[],
  prevItems: LayerState['items'],
): { rootOrder: string[]; items: LayerState['items'] } {
  const rootOrder: string[] = []
  const childrenByFolder: Record<string, string[]> = {}
  let currentFolder: string | null = null

  for (const id of flatIds) {
    if (id.startsWith(S_BOT)) {
      currentFolder = null
      continue
    }

    const item = prevItems[id]
    if (!item) continue

    if (currentFolder !== null) {
      childrenByFolder[currentFolder].push(id)
    } else {
      rootOrder.push(id)
      if (isFolder(item)) {
        currentFolder = id
        childrenByFolder[id] = []
      }
    }
  }

  const newItems = { ...prevItems }
  for (const [fid, ch] of Object.entries(childrenByFolder)) {
    const folder = newItems[fid]
    if (!folder || !isFolder(folder)) continue
    // A collapsed folder's children are not rendered, so they never appear in
    // flatIds. Merge the scanned ids (anything dropped between the header and
    // the sentinel lands on top) with the existing children instead of
    // replacing them — otherwise any drag would wipe a collapsed folder.
    const children = folder.collapsed
      ? [...ch, ...folder.children.filter(c => !ch.includes(c))]
      : ch
    newItems[fid] = { ...folder, children }
  }

  return { rootOrder, items: newItems }
}

/** Maps every flat-list id to the folder it would land in if dropped there —
 *  a folder's own header maps to null (dropping on the header keeps it at
 *  root, above the folder); its children and its sentinel map to the folder
 *  id (dropping there lands inside, matching what reconstructHierarchy does). */
export function buildDropZoneMap(flatList: FlatEntry[]): Record<string, string | null> {
  const zone: Record<string, string | null> = {}
  let currentFolder: string | null = null

  for (const entry of flatList) {
    if (entry.kind === 'sentinel') {
      zone[entry.id] = currentFolder
      currentFolder = null
    } else if (entry.kind === 'folder') {
      zone[entry.id] = null
      currentFolder = entry.id
    } else {
      zone[entry.id] = currentFolder
    }
  }

  return zone
}
