import { describe, expect, it } from 'vitest'
import { CANONICAL_STROKE_RASTER_PROFILE, paintedLayerIds, type CanonicalStrokeOperation, type LayerState, type StrokeOperation } from '@grafetto/shared'
import { applyContentOp } from '../../../lib/layers/layers'
import { OperationLog, isPixelOperation, pixelReadLayerIds, pixelWriteLayerIds } from './OperationLog'
function op(id: string, ordinal: number, layerId = 'layer'): CanonicalStrokeOperation {
  return { type: 'canonical_stroke', id, userId: 'author', timestamp: 0, layerId, frame: { version: 1, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
    brush: 'brush:imported-test@1', strokeId: 'gesture', frameOrdinal: ordinal, pigmentRgb8: [1, 2, 3], materialPacked: 'metadata-only-test',
    composition: { mode: 'wash', alphaDarken: 'creamy', outerResourceOpacity: 1, outerBlend: 'over' } } }
}
describe('canonical operation metadata, not rendering admission', () => {
  it('counts canonical frames as layer pixel writes and leaves layer structure unchanged', () => {
    const value = op('one', 0), state: LayerState = { items: { layer: { kind: 'layer', id: 'layer', name: 'Layer', opacity: 1, visible: true } }, rootOrder: ['layer'], activeId: 'layer', selectedIds: [] }
    expect(isPixelOperation(value)).toBe(true)
    expect(paintedLayerIds(value)).toEqual(['layer']); expect(pixelWriteLayerIds(value)).toEqual(['layer'])
    expect(pixelReadLayerIds(value)).toEqual([]) // only cross-layer dependencies, same as legacy stroke
    expect(applyContentOp(state, value)).toBe(state)
  })
  it('undo/redo expands all canonical chunks of one gesture without mixing a legacy stroke or another author', () => {
    const log = new OperationLog(), a = op('one', 0), b = op('two', 1, 'other')
    log.append(a); log.append(b)
    const legacy: StrokeOperation = { type: 'stroke', id: 'legacy', userId: 'author', timestamp: 0, layerId: 'layer', tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [], strokeId: 'gesture' }
    log.append(legacy); log.append({ ...op('peer', 0), userId: 'peer' })
    expect(log.gestureLayerIds(a)).toEqual(['layer', 'other'])
    log.applyUndo(b.id, 'author')
    expect(log.doneOperations().map(o => o.id)).toEqual(['legacy', 'peer'])
    expect(log.layerPixelOps('other')).toEqual([])
    log.applyRedo(a.id, 'author')
    expect(log.doneOperations().map(o => o.id)).toEqual(['one', 'two', 'legacy', 'peer'])
  })
})
