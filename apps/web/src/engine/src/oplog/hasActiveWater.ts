import type { Operation } from '@grafetto/shared'
import { WET_DRY_MS } from '../paper/paperWetness'
import { watercolorMixFromPreset } from '../presets/watercolorPresets'

/** Network snapshots store pixels, not ephemeral water or solvent sources.
 * Consume done operations only: undone/revoked donors cannot keep a layer wet. */
export function hasActiveWater(ops: readonly Operation[], layerId: string, now: number): boolean {
  let active = false
  for (const op of ops) {
    if (op.type === 'paper_dry' || (op.type === 'layer_clear' && op.layerId === layerId)) {
      active = false
    } else if (op.type === 'stroke' && op.layerId === layerId && op.tool === 'watercolor'
      && watercolorMixFromPreset(op.preset).water > 0
      && now - op.timestamp < WET_DRY_MS) {
      active = true
    }
  }
  return active
}

/** Done-log order determines which recorded strokes may rehydrate PaperWet.
 * Age is checked by the caller; dry pigment may still have standing contact water. */
export function wetReplayOperationIds(ops: readonly Operation[]): Set<string> {
  const layers = new Map<string, Set<string>>()
  for (const op of ops) {
    if (op.type === 'paper_dry') layers.clear()
    else if (op.type === 'layer_clear') layers.delete(op.layerId)
    else if (op.type === 'stroke' && op.tool === 'watercolor') {
      let ids = layers.get(op.layerId)
      if (!ids) { ids = new Set(); layers.set(op.layerId, ids) }
      ids.add(op.id)
    }
  }
  return new Set([...layers.values()].flatMap(ids => [...ids]))
}
