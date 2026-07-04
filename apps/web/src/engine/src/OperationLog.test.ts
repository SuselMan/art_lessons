import { describe, expect, it } from 'vitest'

import type { LayerOpacityOperation, StrokeOperation } from '@art-lessons/shared'

import { OperationLog } from './OperationLog'

function stroke(overrides: Partial<StrokeOperation> = {}): StrokeOperation {
  return {
    id: overrides.id ?? 'op-1',
    type: 'stroke',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-1',
    tool: overrides.tool ?? 'pencil',
    preset: overrides.preset ?? 'HB',
    dabs: overrides.dabs ?? [],
    ...overrides,
  }
}

function opacity(overrides: Partial<LayerOpacityOperation> = {}): LayerOpacityOperation {
  return {
    id: overrides.id ?? 'op-opacity',
    type: 'layer_opacity',
    userId: overrides.userId ?? 'user-a',
    timestamp: overrides.timestamp ?? 0,
    layerId: overrides.layerId ?? 'layer-1',
    opacity: overrides.opacity ?? 0.5,
    ...overrides,
  }
}

describe('OperationLog', () => {
  it('appends operations as done, in seq order', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a' }))
    log.append(stroke({ id: 'b' }))

    const done = log.doneOperations()
    expect(done.map(o => o.id)).toEqual(['a', 'b'])
    expect(done[0].seq).toBe(0)
    expect(done[1].seq).toBe(1)
  })

  it('coalesces consecutive layer_opacity ops from the same user/layer into one entry', () => {
    const log = new OperationLog()
    log.append(opacity({ id: 'a', opacity: 0.2 }))
    log.append(opacity({ id: 'b', opacity: 0.4 }))
    log.append(opacity({ id: 'c', opacity: 0.6 }))

    expect(log.entries).toHaveLength(1)
    expect(log.doneOperations()[0]).toMatchObject({ id: 'c', opacity: 0.6 })
  })

  it('does not coalesce opacity ops from different users or layers', () => {
    const log = new OperationLog()
    log.append(opacity({ id: 'a', userId: 'user-a' }))
    log.append(opacity({ id: 'b', userId: 'user-b' }))
    expect(log.entries).toHaveLength(2)
  })

  it('undo marks the user\'s latest done op as undone and returns it', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    log.append(stroke({ id: 'b', userId: 'user-b' }))

    const undone = log.undo('user-a')
    expect(undone?.id).toBe('a')
    expect(log.doneOperations().map(o => o.id)).toEqual(['b'])
  })

  it('undo only affects the given user\'s operations', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    expect(log.undo('user-b')).toBeNull()
    expect(log.doneOperations().map(o => o.id)).toEqual(['a'])
  })

  it('redo restores the lowest-seq undone op for that user', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    log.append(stroke({ id: 'b', userId: 'user-a' }))
    log.undo('user-a') // undoes b (highest seq done)
    log.undo('user-a') // undoes a

    const redone = log.redo('user-a')
    expect(redone?.id).toBe('a')
    expect(log.doneOperations().map(o => o.id)).toEqual(['a'])
  })

  it('a new action makes the user\'s undone entries gone, blocking redo past it', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'user-a' }))
    log.undo('user-a')
    log.append(stroke({ id: 'b', userId: 'user-a' }))

    expect(log.redo('user-a')).toBeNull()
    expect(log.doneOperations().map(o => o.id)).toEqual(['b'])
  })

  it('revoke marks the target gone regardless of author, and is not redoable', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', userId: 'student' }))
    const revoked = log.revoke('a')

    expect(revoked?.id).toBe('a')
    expect(log.doneOperations()).toHaveLength(0)
    expect(log.redo('student')).toBeNull()
    expect(log.undo('student')).toBeNull()
  })

  it('layerPixelOps filters by layer and state, respecting beforeSeq', () => {
    const log = new OperationLog()
    log.append(stroke({ id: 'a', layerId: 'layer-1' }))
    log.append(stroke({ id: 'b', layerId: 'layer-2' }))
    log.append(stroke({ id: 'c', layerId: 'layer-1' }))

    const all = log.layerPixelOps('layer-1')
    expect(all.map(o => o.id)).toEqual(['a', 'c'])

    const beforeC = log.layerPixelOps('layer-1', all[1].seq)
    expect(beforeC.map(o => o.id)).toEqual(['a'])
  })
})
