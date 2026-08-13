import { nanoid } from 'nanoid'
import type { LayerState, OperationDraft } from '@grafetto/shared'
import { isFolder } from '../../lib/layers'

/** (#449) Every operation one "Duplicate" costs, in the order they must be
 *  applied, plus the id the copy will have.
 *
 *  A layer is a single `layer_duplicate`. A folder is not one operation at all:
 *  it holds no pixels of its own, so there is nothing for the engine to copy —
 *  what gets duplicated is its *shape*, and that is a `folder_add` plus one op
 *  per descendant, recursively, all with freshly minted ids.
 *
 *  Order is the whole correctness argument, which is why this returns a flat
 *  list rather than letting the caller nest: a container is always created
 *  before anything is placed in it, and children go in at ascending indices so
 *  replay rebuilds the same top→bottom order the original has. `applyContentOp`
 *  clamps, so an index past the end appends — the run stays contiguous either
 *  way.
 *
 *  Opacity and visibility ride along differently for the two kinds, and the
 *  asymmetry lives in the operations rather than here: `layer_duplicate`
 *  carries the source's own values as fields (replay must not read them off
 *  live state — see its docstring in packages/shared), while `folder_add` has
 *  no such fields and gets a `layer_opacity`/`layer_visibility` after it
 *  instead. Those two are emitted only when they would actually change
 *  something, so the common case of a plain folder still costs one operation.
 *
 *  Its own module, like `flatList`/`selection`, because it is pure and worth
 *  testing directly — and a plain recursive function rather than a
 *  `useCallback` in the panel, since a hook that has to list itself as its own
 *  dependency is a hook fighting its own shape.
 */
export function buildDuplicateOps(
  items: LayerState['items'], sourceId: string,
  parentId: string | null, index: number, name: string,
): { ops: OperationDraft[]; newId: string } {
  const source = items[sourceId]
  const newId = nanoid(8)
  if (!source) return { ops: [], newId }

  if (!isFolder(source)) {
    return {
      ops: [{
        type: 'layer_duplicate', layerId: newId, sourceId, name,
        sourceOpacity: source.opacity, sourceVisible: source.visible,
        parentId, index,
      }],
      newId,
    }
  }

  const ops: OperationDraft[] = [{ type: 'folder_add', layerId: newId, name, parentId, index }]
  if (source.opacity !== 1) ops.push({ type: 'layer_opacity', layerIds: [newId], opacity: source.opacity })
  if (!source.visible) ops.push({ type: 'layer_visibility', layerIds: [newId], visible: false })
  source.children.forEach((childId, i) => {
    const child = items[childId]
    // Children keep their own names — only the row the user actually pointed
    // at is renamed to "… copy". Naming every descendant that way would
    // rewrite a whole subtree's labels for one click.
    if (child) ops.push(...buildDuplicateOps(items, childId, newId, i, child.name).ops)
  })
  return { ops, newId }
}
