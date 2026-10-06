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
