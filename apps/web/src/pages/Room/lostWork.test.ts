import { describe, expect, it } from 'vitest'

import type { LayerState, Operation, StrokeOperation } from '@grafetto/shared'

import { groupLostOpsByLayer, isRecoverableContentOp, resolveDeletedLayerName, retargetToLayer } from './lostWork'

function stroke(overrides: Partial<StrokeOperation> = {}): StrokeOperation {
  return {
    id: 'op-1',
    type: 'stroke',
    userId: 'user-a',
    timestamp: 0,
    layerId: 'layer-1',
    tool: 'pencil',
    preset: 'HB',
    color: [0, 0, 0],
    dabs: [],
    ...overrides,
  }
}

function layerState(items: Record<string, { name: string }>): LayerState {
  return {
    items: Object.fromEntries(Object.entries(items).map(([id, { name }]) => [
      id, { kind: 'layer' as const, id, name, opacity: 1, visible: true },
    ])),
    rootOrder: Object.keys(items),
    activeId: Object.keys(items)[0] ?? '',
    selectedIds: [],
  }
}

const EMPTY = layerState({})

describe('isRecoverableContentOp', () => {
  it('accepts the three content-bearing types', () => {
    expect(isRecoverableContentOp(stroke())).toBe(true)
    expect(isRecoverableContentOp({
      id: 'i', type: 'image_import', userId: 'u', timestamp: 0, layerId: 'l',
      image: 'data:', width: 1, height: 1,
    })).toBe(true)
    expect(isRecoverableContentOp({
      id: 'c', type: 'layer_clear', userId: 'u', timestamp: 0, layerId: 'l',
    })).toBe(true)
  })

  // A rejected opacity change costs one click to redo — recovering it into a
  // whole new layer would be noise, not help.
  it('rejects property-only and structural types', () => {
    expect(isRecoverableContentOp({
      id: 'o', type: 'layer_opacity', userId: 'u', timestamp: 0, layerId: 'l', opacity: 0.5,
    })).toBe(false)
    expect(isRecoverableContentOp({
      id: 'd', type: 'layer_delete', userId: 'u', timestamp: 0, layerIds: ['l'],
    })).toBe(false)
  })
})

describe('groupLostOpsByLayer', () => {
  it('splits per dead layer', () => {
    const grouped = groupLostOpsByLayer([
      stroke({ id: 'a', layerId: 'dead-1' }),
      stroke({ id: 'b', layerId: 'dead-2' }),
      stroke({ id: 'c', layerId: 'dead-1' }),
    ])

    expect([...grouped.keys()]).toEqual(['dead-1', 'dead-2'])
    expect(grouped.get('dead-1')!.map(o => o.id)).toEqual(['a', 'c'])
  })

  // The outbox drains 2 at a time (#298), so onSettled fires in ack order,
  // not draw order. Replaying a stroke before the layer_clear meant to wipe
  // it would restore something the user had already erased.
  it('restores original draw order from timestamp, not arrival order', () => {
    const grouped = groupLostOpsByLayer([
      stroke({ id: 'late',   timestamp: 300 }),
      stroke({ id: 'early',  timestamp: 100 }),
      stroke({ id: 'middle', timestamp: 200 }),
    ])

    expect(grouped.get('layer-1')!.map(o => o.id)).toEqual(['early', 'middle', 'late'])
  })

  it('returns an empty map for no input', () => {
    expect(groupLostOpsByLayer([]).size).toBe(0)
  })
})

describe('resolveDeletedLayerName', () => {
  it('prefers live layer state when the layer is somehow still there', () => {
    const live = layerState({ 'layer-x': { name: 'Live name' } })
    const log: Operation[] = [{ id: 'a', type: 'layer_add', userId: 'u', timestamp: 0, layerId: 'layer-x', name: 'Log name' }]

    expect(resolveDeletedLayerName('layer-x', live, log, null)).toBe('Live name')
  })

  it('falls back to the layer_add in the local log', () => {
    const log: Operation[] = [{ id: 'a', type: 'layer_add', userId: 'u', timestamp: 0, layerId: 'layer-x', name: 'Sketch' }]

    expect(resolveDeletedLayerName('layer-x', EMPTY, log, null)).toBe('Sketch')
  })

  it('prefers the newest rename over the original add', () => {
    const log: Operation[] = [
      { id: 'a', type: 'layer_add',    userId: 'u', timestamp: 0, layerId: 'layer-x', name: 'Original' },
      { id: 'b', type: 'layer_rename', userId: 'u', timestamp: 1, layerId: 'layer-x', name: 'Renamed' },
    ]

    expect(resolveDeletedLayerName('layer-x', EMPTY, log, null)).toBe('Renamed')
  })

  // A layer created before the snapshot this client restored from has no
  // layer_add in the local log at all.
  it('falls back to the restored snapshot layer state', () => {
    const restored = layerState({ 'layer-x': { name: 'From snapshot' } })

    expect(resolveDeletedLayerName('layer-x', EMPTY, [], restored)).toBe('From snapshot')
  })

  it('returns null when nothing knows the name', () => {
    expect(resolveDeletedLayerName('layer-x', EMPTY, [], null)).toBeNull()
  })
})

describe('retargetToLayer', () => {
  // Reusing the original id would hit the server's dedup
  // (findDuplicateOperation) and resolve to the very record that was just
  // rejected, so the copy would never be recorded.
  it('replaces id and layerId, keeps the content', () => {
    const original = stroke({ id: 'old-id', layerId: 'dead', dabs: [{ x: 1, y: 2, pressure: 1 }] as StrokeOperation['dabs'] })
    const copy = retargetToLayer(original, 'fresh', 'new-id', 999)

    expect(copy.id).toBe('new-id')
    expect(copy.layerId).toBe('fresh')
    expect(copy.timestamp).toBe(999)
    expect(copy.dabs).toEqual(original.dabs)
    expect(copy.type).toBe('stroke')
  })

  it('does not mutate the original', () => {
    const original = stroke({ id: 'old-id', layerId: 'dead' })
    retargetToLayer(original, 'fresh', 'new-id', 999)

    expect(original.id).toBe('old-id')
    expect(original.layerId).toBe('dead')
  })
})
