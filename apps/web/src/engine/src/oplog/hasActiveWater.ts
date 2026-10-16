import { operationLayerIds, type Operation } from '@grafetto/shared'
import { WET_DRY_MS } from '../paper/paperWetness'
import { watercolorMixFromPreset } from '../presets/watercolorPresets'
import { isM70WatercolorStroke } from './watercolorUndo'
import { m70WaterResetLayers } from './watercolorMaterialBoundaries'

/** Network snapshots store pixels, not ephemeral water or solvent sources.
 * Consume done operations only: undone/revoked donors cannot keep a layer wet. */
export function hasActiveWater(ops: readonly Operation[], layerId: string, now: number): boolean {
  let active = false, activeM70 = false
  for (const op of ops) {
    if (m70WaterResetLayers(op).includes(layerId)) activeM70 = false
    if ((op.type === 'paper_dry' && (!op.layerId || op.layerId === layerId)) || (op.type === 'layer_clear' && op.layerId === layerId) || (op.type === 'layer_visibility' && !op.visible && !!layerId && operationLayerIds(op).includes(layerId))) {
      active = false; activeM70 = false
    } else if (op.type === 'stroke' && op.layerId === layerId && op.tool === 'watercolor'
      && watercolorMixFromPreset(op.preset).water > 0
      && now - op.timestamp < WET_DRY_MS) {
      if (isM70WatercolorStroke(op)) activeM70 = true
      else active = true
    }
  }
  return active || activeM70
}

/** Done-log order determines which recorded strokes may rehydrate PaperWet.
 * Age is checked by the caller; dry pigment may still have standing contact water. */
export function wetReplayOperationIds(ops: readonly Operation[]): Set<string> {
  const layers = new Map<string, Set<string>>()
  const m70 = new Set<string>()
  for (const op of ops) {
    for (const id of m70WaterResetLayers(op)) {
      const ids = layers.get(id)
      if (ids) for (const donor of ids) if (m70.has(donor)) ids.delete(donor)
    }

    if (op.type === 'paper_dry') {
      if (op.layerId) layers.delete(op.layerId)
      else layers.clear()
    }
    else if (op.type === 'layer_clear') layers.delete(op.layerId)
    else if (op.type === 'layer_visibility' && !op.visible) for (const id of operationLayerIds(op)) layers.delete(id)
    else if (op.type === 'stroke' && op.tool === 'watercolor') {
      let ids = layers.get(op.layerId)
      if (!ids) { ids = new Set(); layers.set(op.layerId, ids) }
      ids.add(op.id)
      if (isM70WatercolorStroke(op)) m70.add(op.id)
    }
  }
  return new Set([...layers.values()].flatMap(ids => [...ids]))
}
