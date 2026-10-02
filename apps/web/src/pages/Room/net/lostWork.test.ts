import { describe, expect, it } from 'vitest'

import type { LayerState, Operation, StrokeOperation } from '@grafetto/shared'

import {
  createLostWorkBatcher, groupLostOpsByLayer, isRecoverableContentOp, recoveryOperations, resolveDeletedLayerName,
  retargetToLayer, type Timers,
} from './lostWork'

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

  it('recovers self-contained shapes, pastes and fills without losing their payload', () => {
    const base = { id: 'new-content', userId: 'u', timestamp: 10, layerId: 'deleted' }
    const paste = { ...base, type: 'area_paste' as const, image: 'data:image/png;base64,pixels', x: 4, y: 6, width: 8, height: 9, matrix: [1, 0, 0, 1, 20, 30] as [number, number, number, number, number, number] }
    const shape: Operation = { ...base, type: 'shape', geometry: { kind: 'rectangle', cornerRadius: 3 }, frame: { x: 4, y: 6, width: 80, height: 90, angle: 0.2 }, stroke: null, fill: { color: [1, 0, 0] } }
    const fill: Operation = { ...base, type: 'area_fill', image: paste.image, x: 4, y: 6, width: 8, height: 9, seedX: 5, seedY: 7, color: [1, 0, 0], tolerance: 10, gapClose: 2, expand: 1, source: 'visible' }
    for (const op of [shape, paste, fill]) {
      expect(isRecoverableContentOp(op)).toBe(true)
      if (!isRecoverableContentOp(op)) throw new Error('content not recoverable')
      expect(retargetToLayer(op, 'recovered', 'new-id', 20)).toEqual({ ...op, layerId: 'recovered', id: 'new-id', timestamp: 20 })
    }
  })

  it('does not invent missing source pixels for a rejected region transform', () => {
    expect(isRecoverableContentOp({ id: 'move', userId: 'u', timestamp: 0, type: 'area_transform', layerId: 'deleted', selection: { points: [0, 0, 10, 0, 10, 10] }, matrix: [1, 0, 0, 1, 5, 5] })).toBe(false)
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

// (#493) Out of Room's recoverLostWork.
describe('recoveryOperations', () => {
  function run(lost: StrokeOperation[], live = EMPTY) {
    let n = 0
    return recoveryOperations({
      lost, live, log: [], restored: null, userId: 'me',
      unnamedLayer: 'Unnamed', restoredName: name => `Recovered: ${name}`,
      newId: () => `id${++n}`, now: () => 1000,
    })
  }

  it('gives each dead layer one fresh layer and moves its strokes onto it', () => {
    const r = run([stroke({ id: 'a', layerId: 'dead-1' }), stroke({ id: 'b', layerId: 'dead-1' }), stroke({ id: 'c', layerId: 'dead-2' })])
    const adds = r.operations.filter(op => op.type === 'layer_add')
    expect(adds).toHaveLength(2)
    expect(r.restoredLayerIds).toHaveLength(2)
    const moved = r.operations.filter((op): op is StrokeOperation => op.type === 'stroke')
    expect(moved).toHaveLength(3)
    // Every stroke lands on a layer that is in this batch, never the dead one.
    for (const op of moved) {
      expect(r.restoredLayerIds).toContain(op.layerId)
      expect(['a', 'b', 'c']).not.toContain(op.id)
    }
  })

  it('names the new layer after the deleted one, or says it could not', () => {
    const named = run([stroke({ layerId: 'dead-1' })], layerState({ 'dead-1': { name: 'Sketch' } }))
    expect(named.layerNames).toEqual(['Sketch'])
    const add = named.operations.find(op => op.type === 'layer_add')
    expect(add && 'name' in add ? add.name : null).toBe('Recovered: Sketch')

    expect(run([stroke({ layerId: 'dead-1' })]).layerNames).toEqual(['Unnamed'])
  })

  it('adds the layer before the strokes that go onto it', () => {
    const r = run([stroke({ layerId: 'dead-1' })])
    expect(r.operations.map(op => op.type)).toEqual(['layer_add', 'stroke'])
  })
})

describe('createLostWorkBatcher', () => {
  function setup() {
    let clock = 0
    const queued = new Map<number, { fn: () => void; at: number }>()
    let nextId = 1
    const timers: Timers = {
      set: (fn, ms) => { const id = nextId++; queued.set(id, { fn, at: clock + ms }); return id },
      clear: id => { queued.delete(id) },
    }
    const flushes: string[][] = []
    const batcher = createLostWorkBatcher({
      onFlush: ops => flushes.push(ops.map(op => op.id)),
      quietMs: 800, maxWaitMs: 5000, timers, now: () => clock,
    })
    const advance = (ms: number) => {
      clock += ms
      for (const [id, t] of [...queued]) if (t.at <= clock) { queued.delete(id); t.fn() }
    }
    return { batcher, flushes, advance }
  }

  // Rejections arrive one ack at a time as the outbox drains: one batch, not
  // one replacement layer per lost stroke.
  it('waits for a quiet spell and hands the whole batch over at once', () => {
    const { batcher, flushes, advance } = setup()
    batcher.add(stroke({ id: 'a' }))
    advance(500)
    batcher.add(stroke({ id: 'b' }))
    advance(500)
    expect(flushes).toEqual([])
    advance(300)
    expect(flushes).toEqual([['a', 'b']])
  })

  it('goes through at the cap even if rejections never stop', () => {
    const { batcher, flushes, advance } = setup()
    for (let t = 0; t < 5000; t += 500) { batcher.add(stroke({ id: `s${t}` })); advance(500) }
    batcher.add(stroke({ id: 'last' }))
    expect(flushes).toHaveLength(1)
    expect(flushes[0]).toContain('last')
  })

  it('drops what is waiting on reset', () => {
    const { batcher, flushes, advance } = setup()
    batcher.add(stroke({ id: 'a' }))
    batcher.reset()
    advance(2000)
    expect(flushes).toEqual([])
  })
})
