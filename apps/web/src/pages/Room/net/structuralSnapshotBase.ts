import { IMPLICIT_LAYER_IDS, type LayerState, type Operation } from '@grafetto/shared'

import { doneOperationsFromHistory } from '../../../engine'
import { replayLayerState } from '../../../lib/layers/layers'
import { makeInitialLayerState } from '../../../stores/slices/layerSlice'

/** A missing legacy prefix cannot be reconstructed by treating today's
 * uploaded roots as yesterday's implicit base. Validate before pixel handover.
 * Selection, collapsed folders and untranslated implicit names are local. */
export function assertStructuralSnapshotBase(uploaded: LayerState, prefix: readonly Operation[]): void {
  const done = doneOperationsFromHistory(prefix)
  const folded = replayLayerState(makeInitialLayerState(), done)
  const renamed = new Set(done.filter(op => op.type === 'layer_rename').map(op => op.layerId))
  const implicit = new Set(IMPLICIT_LAYER_IDS)
  const shared = (state: LayerState) => ({
    rootOrder: state.rootOrder,
    items: Object.keys(state.items).sort().map(id => {
      const item = state.items[id]
      return {
        id, kind: item.kind,
        name: !implicit.has(id) || renamed.has(id) ? item.name : undefined,
        opacity: item.opacity, visible: item.visible,
        locked: !!item.locked, ownerLocked: !!item.ownerLocked,
        children: item.kind === 'folder' ? item.children : undefined,
      }
    }),
  })
  if (JSON.stringify(shared(uploaded)) !== JSON.stringify(shared(folded))) {
    throw new Error('Stored structural base does not match its original prefix')
  }
}
