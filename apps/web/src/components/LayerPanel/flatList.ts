import type { LayerState } from '@grafetto/shared'
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
 *  Drop below the sentinel puts the item outside.
 *
 *  (#410) Folders nest, so the sentinels nest with them — a folder inside a
 *  folder emits its own pair, and the two functions below read the list back
 *  with a stack rather than a single "am I in a folder" cursor. A collapsed
 *  folder still emits its sentinel with nothing between: that empty pair is
 *  what makes dropping *into* a closed folder possible at all. */
export function buildFlatList(state: LayerState): FlatEntry[] {
  const out: FlatEntry[] = []
  const seen = new Set<string>()
  const walk = (ids: string[], depth: number): void => {
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      const item = state.items[id]
      if (!item) continue
      if (isFolder(item)) {
        out.push({ id, kind: 'folder', depth })
        if (!item.collapsed) walk(item.children, depth + 1)
        out.push({ id: `${S_BOT}${id}`, kind: 'sentinel', depth })
      } else {
        out.push({ id, kind: 'layer', depth })
      }
    }
  }
  walk(state.rootOrder, 0)
  return out
}

/** Converts a flat-ID list back to { rootOrder, items }.
 *  Items between a folder header and its matching __bot_ become children.
 *  The sentinel ids themselves are discarded.
 *
 *  (#410) A stack of open folders replaced the single `currentFolder` cursor,
 *  which could only ever describe one level. A sentinel closes its *own*
 *  folder — found by id rather than assumed to be the innermost one — and
 *  anything left open above it closes with it, so a list whose pairs got
 *  scrambled degrades to a shallower tree instead of mis-parenting the rest of
 *  it.
 *
 *  Every id is placed exactly once (`placed`), which is what makes the result
 *  structurally acyclic no matter what comes in: a folder cannot end up inside
 *  a folder it already contains if it is only ever written to one container.
 *  That matters more here than it reads — this function's output goes straight
 *  into the delta that every other client folds. */
export function reconstructHierarchy(
  flatIds: string[],
  prevItems: LayerState['items'],
): { rootOrder: string[]; items: LayerState['items'] } {
  const rootOrder: string[] = []
  const childrenByFolder: Record<string, string[]> = {}
  const openFolders: string[] = []
  const placed = new Set<string>()

  for (const id of flatIds) {
    if (id.startsWith(S_BOT)) {
      const folderId = id.slice(S_BOT.length)
      const at = openFolders.lastIndexOf(folderId)
      if (at >= 0) openFolders.length = at
      continue
    }

    const item = prevItems[id]
    if (!item || placed.has(id)) continue
    placed.add(id)

    const openFolder = openFolders[openFolders.length - 1]
    if (openFolder === undefined) rootOrder.push(id)
    else childrenByFolder[openFolder].push(id)

    if (isFolder(item)) {
      openFolders.push(id)
      childrenByFolder[id] = []
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
    //
    // (#410) With nesting, "children" can hide a whole subtree rather than a
    // row of layers, and the merge still only has to cover this folder's own
    // list: a folder further down inside a collapsed one never reaches flatIds
    // either, so it never reaches childrenByFolder, so it is copied through
    // untouched with its own children intact. The invariant that makes that
    // safe is the one above — only folders actually seen in the list are
    // rewritten at all.
    const children = folder.collapsed
      ? [...ch, ...folder.children.filter(c => !ch.includes(c))]
      : ch
    newItems[fid] = { ...folder, children }
  }

  return { rootOrder, items: newItems }
}

/** Maps every flat-list id to the folder it would land in if dropped there —
 *  a folder's own header maps to whatever *encloses* that folder (dropping on
 *  the header keeps the item beside the folder, not inside it); its children
 *  and its sentinel map to the folder id (dropping there lands inside,
 *  matching what reconstructHierarchy does).
 *
 *  (#410) A header used to map to `null` unconditionally, which was the same
 *  answer as "encloses it" back when every folder sat at root. Nested, the two
 *  part ways: dropping on the header of a folder that lives inside another one
 *  has to land in the outer folder, not at root. Same stack as
 *  reconstructHierarchy, and it has to stay the same — this map decides what
 *  the drag highlights, and that function decides where the item actually
 *  goes. */
export function buildDropZoneMap(flatList: FlatEntry[]): Record<string, string | null> {
  const zone: Record<string, string | null> = {}
  const openFolders: string[] = []
  const enclosing = (): string | null =>
    openFolders.length ? openFolders[openFolders.length - 1] : null

  for (const entry of flatList) {
    if (entry.kind === 'sentinel') {
      const folderId = entry.id.slice(S_BOT.length)
      zone[entry.id] = folderId
      const at = openFolders.lastIndexOf(folderId)
      if (at >= 0) openFolders.length = at
    } else if (entry.kind === 'folder') {
      zone[entry.id] = enclosing()
      openFolders.push(entry.id)
    } else {
      zone[entry.id] = enclosing()
    }
  }

  return zone
}
