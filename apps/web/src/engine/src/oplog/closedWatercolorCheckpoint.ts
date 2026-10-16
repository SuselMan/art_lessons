import type { Operation } from '@grafetto/shared'
import { operationLayerIds } from '@grafetto/shared'
import { isM70WatercolorStroke } from './watercolorUndo'

/** A dry pixel checkpoint has no wet source to carry. Prove that its whole
 * effective material prefix, including the recorded dry boundary, is unchanged.
 * Operations and water-only projections are immutable journal objects. Reference
 * comparison is deliberately conservative: confirmation/backfill may reject a
 * reusable checkpoint, but can never accept changed material under the same ID. */
export function closedWatercolorCheckpoint(
  layerId: string,
  operations: readonly Operation[],
  read: () => { revision: number; operations: readonly Operation[] },
): { canonicalValid: () => boolean; closedWashIds: string[] } | null {
  const material = (ops: readonly Operation[]) => ops.filter(op =>
    op.type !== 'operation_undo' && op.type !== 'operation_redo' && op.type !== 'operation_revoke'
    && (op.type === 'paper_dry' && !op.layerId
      || op.type === 'layer_transform' && op.transforms.some(t => t.layerId === layerId)
      || ('layerId' in op || 'layerIds' in op) && operationLayerIds(op).includes(layerId)))
  const prefix = material(operations)
  const boundary = prefix.at(-1)
  if (!boundary || !(boundary.type === 'paper_dry'
    || boundary.type === 'layer_visibility' && !boundary.visible)) return null
  const closedWashIds = [...new Set(prefix.filter(isM70WatercolorStroke).map(op => op.washId).filter((id): id is string => !!id))]
  if (!closedWashIds.length) return null
  let revision = -1, valid = false
  let previousOperations: readonly Operation[] | undefined
  return { closedWashIds, canonicalValid: () => {
    const current = read()
    if (revision === current.revision && previousOperations === current.operations) return valid
    revision = current.revision
    previousOperations = current.operations
    const next = material(current.operations)
    const end = next.findIndex(op => op.id === boundary.id)
    valid = end === prefix.length - 1 && prefix.every((op, i) => op === next[i])
    return valid
  } }
}
