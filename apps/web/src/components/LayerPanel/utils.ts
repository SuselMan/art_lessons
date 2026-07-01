import type { LayerState, LayerItem } from '@art-lessons/shared'

/** Merges a partial patch into a single item, accepting either a plain patch or a
 *  function that receives the previous item and returns a patch. */
export function patchItem(
  id: string,
  updater: Partial<LayerItem> | ((prev: LayerItem) => Partial<LayerItem>),
): (p: LayerState) => LayerState {
  return p => {
    const prev = p.items[id]
    const patch = typeof updater === 'function' ? updater(prev) : updater
    return { ...p, items: { ...p.items, [id]: { ...prev, ...patch } as LayerItem } }
  }
}
