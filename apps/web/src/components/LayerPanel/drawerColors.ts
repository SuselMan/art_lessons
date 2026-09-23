import type { LayerState } from '@grafetto/shared'
import { ancestorsOf, isFolder } from '../../lib/layers'

/** Row id → the outline colours that row shows for peers drawing on it.
 *
 *  A layer keeps its own colours. Every *collapsed* folder above it takes them
 *  too: its rows are not on screen, and the folder is the only place in the
 *  panel where "somebody is working in here" can still be seen. An expanded
 *  folder stays plain — the row itself is visible just below it, and lighting
 *  the whole chain would only blur which one is meant. Colours are deduped
 *  per row, in first-seen order. */
export function rollUpDrawerColors(
  state: LayerState,
  drawerColors: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (id: string, colors: readonly string[]) => {
    const row = (out[id] ??= [])
    for (const c of colors) if (!row.includes(c)) row.push(c)
  }
  for (const [layerId, colors] of Object.entries(drawerColors)) {
    if (!state.items[layerId] || colors.length === 0) continue
    add(layerId, colors)
    for (const folderId of ancestorsOf(state, layerId)) {
      const folder = state.items[folderId]
      if (folder && isFolder(folder) && folder.collapsed) add(folderId, colors)
    }
  }
  return out
}
