import type { Operation } from '@grafetto/shared'

/** Ordinary pixel writers consume a finished M70 layer. Erasing its dry base
 * is deliberately excluded; a layer copy/merge reads canonical sources without
 * closing their water and is handled by its own historical read contract. */
export function watercolorMaterialBoundaryLayers(op: Operation): string[] {
  switch (op.type) {
    case 'shape': case 'area_clear': case 'area_transform': case 'area_fill':
    case 'area_paste': case 'image_import': case 'layer_filter':
      return [op.layerId]
    case 'layer_transform': return op.transforms.map(t => t.layerId)
    default: return []
  }
}

/** Only M70 water is consumed by ordinary tools. Legacy recorded wet contacts
 * retain their established lifetime and must not silently be reinterpreted. */
export function m70WaterResetLayers(op: Operation): string[] {
  if (op.type === 'stroke' && op.tool !== 'eraser'
    && !(op.tool === 'watercolor' && op.preset.split(':')[5] === 'wc@m70-r2-v1')) return [op.layerId]
  return watercolorMaterialBoundaryLayers(op)
}
