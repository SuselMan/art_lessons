import type { LayerFolder, LayerState } from '@art-lessons/shared'

export function isFolder(item: LayerState['items'][string]): item is LayerFolder {
  return item.kind === 'folder'
}

export function parentOf(state: LayerState, id: string): string | null {
  for (const item of Object.values(state.items))
    if (isFolder(item) && item.children.includes(id)) return item.id
  return null
}

export function computeCompositeOrder(state: LayerState): { id: string; opacity: number }[] {
  const result: { id: string; opacity: number }[] = []
  for (const id of [...state.rootOrder].reverse()) {
    const item = state.items[id]
    if (!item || !item.visible) continue
    if (isFolder(item)) {
      for (const cid of [...item.children].reverse()) {
        const child = state.items[cid]
        if (child?.visible) result.push({ id: cid, opacity: item.opacity * child.opacity })
      }
    } else {
      result.push({ id, opacity: item.opacity })
    }
  }
  return result
}
