import { describe, expect, it } from 'vitest'

import type {
  LayerDeleteOperation, LayerMergeOperation, LayerTransformOperation, StrokeOperation,
} from '@art-lessons/shared'

import { isLocalIslandSafe } from './optimism'

function stroke(): StrokeOperation {
  return {
    id: 's1', type: 'stroke', userId: 'user-a', timestamp: 0,
    layerId: 'layer-shared', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs: [],
  }
}

function layerDelete(layerIds: string[]): LayerDeleteOperation {
  return { id: 'd1', type: 'layer_delete', userId: 'user-a', timestamp: 0, layerIds }
}

function layerMerge(sources: string[]): LayerMergeOperation {
  return {
    id: 'm1', type: 'layer_merge', userId: 'user-a', timestamp: 0, layerId: 'merged', name: 'Merged',
    sources: sources.map(id => ({ id, opacity: 1 })), parentId: null, index: 0,
  }
}

function layerTransform(layerIds: string[]): LayerTransformOperation {
  return {
    id: 't1', type: 'layer_transform', userId: 'user-a', timestamp: 0,
    transforms: layerIds.map(layerId => ({ layerId, matrix: [1, 0, 0, 1, 0, 0] as const })),
  }
}

describe('isLocalIslandSafe', () => {
  it('is always safe for operation types that cannot invalidate a shared reference', () => {
    expect(isLocalIslandSafe(stroke(), new Set())).toBe(true)
  })

  it('is safe for layer_delete when every target is in the local island', () => {
    const pending = new Set(['layer-a', 'layer-b'])
    expect(isLocalIslandSafe(layerDelete(['layer-a', 'layer-b']), pending)).toBe(true)
  })

  it('is not safe for layer_delete when any target predates the local island', () => {
    const pending = new Set(['layer-a'])
    expect(isLocalIslandSafe(layerDelete(['layer-a', 'layer-shared']), pending)).toBe(false)
  })

  it('is not safe for layer_delete with no pending ids at all', () => {
    expect(isLocalIslandSafe(layerDelete(['layer-shared']), new Set())).toBe(false)
  })

  it('is safe for layer_merge only when every source is in the local island', () => {
    const pending = new Set(['layer-a', 'layer-b'])
    expect(isLocalIslandSafe(layerMerge(['layer-a', 'layer-b']), pending)).toBe(true)
    expect(isLocalIslandSafe(layerMerge(['layer-a', 'layer-shared']), pending)).toBe(false)
  })

  it('is safe for layer_transform only when every targeted layer is in the local island', () => {
    const pending = new Set(['layer-a'])
    expect(isLocalIslandSafe(layerTransform(['layer-a']), pending)).toBe(true)
    expect(isLocalIslandSafe(layerTransform(['layer-a', 'layer-shared']), pending)).toBe(false)
  })
})
