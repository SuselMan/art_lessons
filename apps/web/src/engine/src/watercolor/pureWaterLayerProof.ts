import { pixelWriteLayerIds, type LogEntry } from '../oplog/OperationLog'
import { watercolorMixFromPreset } from '../presets/watercolorPresets'

/** Full ordered history, with UNKNOWN restored prefixes always rejected.
 * This is a conservative permission to skip a zero-input pigment operator. */
export function pureWaterLayerProof(entries: readonly LogEntry[], layerId: string, unknownPrefix: boolean, livePigment: boolean): boolean {
  if (livePigment || unknownPrefix) return false
  let zero = true
  for (const { op, state } of entries) {
    if (state !== 'done' || !pixelWriteLayerIds(op).includes(layerId)) continue
    if (op.type === 'layer_clear') { zero = true; continue }
    if (op.type !== 'stroke' || op.tool !== 'watercolor' || watercolorMixFromPreset(op.preset).pigment > 0) zero = false
  }
  return zero
}
