import { describe, expect, it } from 'vitest'
import type { Dab, Operation, StrokeOperation } from '@grafetto/shared'
import { packDabs } from '@grafetto/shared'

import { OperationLog } from './OperationLog'
import type { LogEntry } from './OperationLog'
import { effectiveWatercolorOperations, waterOnlyStroke } from './watercolorUndo'

const dab = (x: number, y = 0): Dab => ({ x, y, size: 10, aspectRatio: 1, angle: 0,
  opacity: 1, pressure: 1, tiltX: 0, tiltY: 0, t: 0 })
const stroke = (id: string, userId: string, x: number, extra: Partial<StrokeOperation> = {}): StrokeOperation => ({
  id, userId, type: 'stroke', layerId: 'L', timestamp: 0, tool: 'watercolor', strokeId: id,
  washId: 'm70:L', preset: 'normal:80:60:PB29:round:wc@m70-r2-v1', color: [0, 0, 1], dabs: [dab(x)], ...extra,
})
const e = (op: Operation, state: LogEntry['state'] = 'done'): LogEntry => ({ op, state })
const ids = (entries: LogEntry[]) => effectiveWatercolorOperations(entries).map(op => op.id)
const pigment = (entries: LogEntry[], id: string) => {
  const op = effectiveWatercolorOperations(entries).find(op => op.id === id)
  return op?.type === 'stroke' ? op.preset.split(':')[2] : undefined
}

describe('water-preserving M70 undo', () => {
  it('fully removes latest stroke, own suffix and independent foreign strokes', () => {
    expect(ids([e(stroke('a', 'A', 0), 'undone')])).toEqual([])
    expect(ids([e(stroke('a', 'A', 0), 'undone'), e(stroke('a2', 'A', 1))])).toEqual(['a2'])
    expect(ids([e(stroke('a', 'A', 0), 'undone'), e(stroke('b', 'B', 100))])).toEqual(['b'])
  })
  it('preserves whole water of earlier mixed stroke, with stable immutable projection', () => {
    const a = stroke('a', 'A', 0)
    const entries = [e(a, 'undone'), e(stroke('b', 'B', 9))]
    expect(pigment(entries, 'a')).toBe('0')
    expect(a.preset.split(':')[2]).toBe('60')
    expect(effectiveWatercolorOperations(entries)[0]).toBe(waterOnlyStroke(a))
    expect(waterOnlyStroke(a).dabs).toBe(a.dabs)
  })
  it('protects pure water and clears protection when foreign contribution is undone', () => {
    const a = stroke('a', 'A', 0, { preset: 'normal:80:0:PB29:round:wc@m70-r2-v1' })
    const b = stroke('b', 'B', 5)
    expect(ids([e(a, 'undone'), e(b)])).toEqual(['a', 'b'])
    expect(ids([e(a, 'undone'), e(b, 'undone')])).toEqual([])
    expect(ids([e(a, 'gone'), e(b)])).toEqual(['b'])
  })
  it('joins through a third stroke and splits after undo of the latest bridge', () => {
    const entries = [e(stroke('a', 'A', 0), 'undone'), e(stroke('b', 'B', 20)),
      e(stroke('bridge', 'A', 10))]
    expect(pigment(entries, 'a')).toBe('0')
    entries[2].state = 'undone'
    expect(ids(entries)).toEqual(['b'])
  })
  it('intersects swept segments, handles tangency and ignores distant parallel segments', () => {
    const a = stroke('a', 'A', 0, { dabs: [dab(-20), dab(20)] })
    expect(pigment([e(a, 'undone'), e(stroke('b', 'B', 0, { dabs: [dab(0, 10)] }))], 'a')).toBe('0')
    expect(ids([e(a, 'undone'), e(stroke('b', 'B', 0, { dabs: [dab(-20, 11), dab(20, 11)] }))])).toEqual(['b'])
  })
  it('groups all chunks by gesture, never by shared washId; handles packed dabs', () => {
    const a1 = stroke('a1', 'A', 0, { strokeId: 'a', dabs: undefined, dabsPacked: packDabs([dab(0)]) })
    const a2 = stroke('a2', 'A', 40, { strokeId: 'a' })
    const entries = [e(a1, 'undone'), e(a2, 'undone'), e(stroke('b', 'B', 40))]
    expect(ids(entries)).toEqual(['a1', 'a2', 'b'])
    expect(pigment(entries, 'a1')).toBe('0')
    expect(ids([e(a1, 'undone'), e(stroke('b', 'B', 100))])).toEqual(['b'])
  })
  it('keeps layers separate and drying layer-scoped; undo dry reconnects material', () => {
    const a = e(stroke('a', 'A', 0), 'undone'), b = e(stroke('b', 'B', 0))
    const dry = e({ id: 'dry', type: 'paper_dry', userId: 'A', timestamp: 1, layerId: 'L' })
    expect(ids([a, dry, b])).toEqual(['dry', 'b'])
    expect(ids([a, { ...dry, state: 'undone' }, b])).toEqual(['a', 'b'])
    expect(ids([a, e({ ...dry.op, layerId: 'other' } as Operation), b])).toEqual(['a', 'dry', 'b'])
    expect(ids([a, e(stroke('b', 'B', 0, { layerId: 'other' }))])).toEqual(['b'])
  })
  it('retains dependencies after drying, but not between historically dry portions', () => {
    const a = e(stroke('a', 'A', 0), 'undone'), b = e(stroke('b', 'B', 0))
    const dry = e({ id: 'dry', type: 'paper_dry', userId: 'A', timestamp: 1 })
    expect(ids([a, b, dry])).toEqual(['a', 'b', 'dry'])
    expect(ids([a, e(stroke('b', 'B', 0, { timestamp: 120001 }))])).toEqual(['b'])
    expect(ids([a, dry, b])).toEqual(['dry', 'b'])
  })
  it('does not change other tools or legacy watercolor', () => {
    expect(ids([e(stroke('a', 'A', 0, { tool: 'pencil' }), 'undone'), e(stroke('b', 'B', 0))])).toEqual(['b'])
    expect(ids([e(stroke('a', 'A', 0, { preset: 'normal:80:60:PB29:round' }), 'undone'), e(stroke('b', 'B', 0))])).toEqual(['b'])
  })
  it('zero-water pigment can use a pool without bridging two pools', () => {
    const dry = 'normal:0:60:PB29:round:wc@m70-r2-v1'
    expect(pigment([e(stroke('a', 'A', 0), 'undone'), e(stroke('b', 'B', 0, { preset: dry }))], 'a')).toBe('0')
    expect(ids([e(stroke('a', 'A', 0), 'undone'), e(stroke('bridge', 'A', 10, { preset: dry })),
      e(stroke('b', 'B', 20))])).toEqual(['bridge', 'b'])
  })
  it('log redo restores original preset and historical position without double water', () => {
    const log = new OperationLog()
    log.append(stroke('a', 'A', 0)); log.append(stroke('b', 'B', 0))
    log.applyUndo('a', 'A')
    expect(log.layerPixelOps('L').map(op => op.type === 'stroke' ? op.preset.split(':')[2] : '')).toEqual(['0', '60'])
    log.applyUndo('b', 'B')
    expect(log.layerPixelOps('L')).toEqual([])
    log.applyRedo('a', 'A')
    expect(log.layerPixelOps('L').map(op => op.id)).toEqual(['a'])
    expect(log.layerPixelOps('L')[0]).toMatchObject({ preset: stroke('a', 'A', 0).preset })
  })
  it('makes layer drying undoable and redoable after another author draws', () => {
    const log = new OperationLog()
    log.append(stroke('a', 'A', 0))
    log.append({ id: 'dry', type: 'paper_dry', userId: 'A', timestamp: 1, layerId: 'L' })
    log.append(stroke('b', 'B', 0))
    expect(log.undoTarget('A')?.id).toBe('dry')
    log.applyUndo('dry', 'A')
    expect(log.watercolorEffectiveOperations().map(op => op.id)).toEqual(['a', 'b'])
    expect(log.redoTarget('A')?.id).toBe('dry')
    log.applyRedo('dry', 'A')
    expect(log.watercolorEffectiveOperations().map(op => op.id)).toEqual(['a', 'dry', 'b'])
  })
})

describe('historical water boundaries and abandoned redo', () => {
  it('retains protected water after its author takes a new action, but teacher revoke removes it', () => {
    const log = new OperationLog()
    log.append(stroke('a', 'A', 0)); log.append(stroke('b', 'B', 0))
    log.applyUndo('a', 'A')
    log.append(stroke('new', 'A', 100))
    expect(log.entries[0]).toMatchObject({ state: 'gone', goneReason: 'branch' })
    expect(log.redoTarget('A')).toBeNull()
    expect(log.layerPixelOps('L').map(op => op.id)).toEqual(['a', 'b', 'new'])
    expect(log.revoke('a')?.id).toBe('a')
    expect(log.entries[0]).toMatchObject({ state: 'gone', goneReason: 'revoke' })
    expect(log.layerPixelOps('L').map(op => op.id)).toEqual(['b', 'new'])
  })
  it('foreign undo releases abandoned-branch water and historical hydration preserves reason', () => {
    const log = new OperationLog()
    log.append(stroke('a', 'A', 0)); log.append(stroke('b', 'B', 0))
    log.applyUndo('a', 'A'); log.append(stroke('new', 'A', 100))
    const hydrated = new OperationLog(); hydrated.prependHistorical(log.entries)
    expect(hydrated.layerPixelOps('L').map(op => op.id)).toEqual(['a', 'b', 'new'])
    hydrated.applyUndo('b', 'B')
    expect(hydrated.layerPixelOps('L').map(op => op.id)).toEqual(['new'])
  })
  it('hiding a layer dries it, while showing it does not restore water', () => {
    const hide: Operation = { id: 'hide', type: 'layer_visibility', userId: 'A', timestamp: 1, layerId: 'L', visible: false }
    const a = e(stroke('a', 'A', 0), 'undone'), b = e(stroke('b', 'B', 0))
    expect(ids([a, e(hide), b])).toEqual(['hide', 'b'])
    expect(ids([a, e({ ...hide, visible: true }), b])).toEqual(['a', 'hide', 'b'])
    expect(ids([a, e({ ...hide, layerId: 'other' }), b])).toEqual(['a', 'hide', 'b'])
  })
  it('a distant stroke does not extend another pool drying deadline', () => {
    const a = e(stroke('a', 'A', 0), 'undone')
    const distant = e(stroke('distant', 'A', 1000, { timestamp: 119000 }))
    const late = e(stroke('late', 'B', 0, { timestamp: 121000 }))
    expect(ids([a, distant, late])).toEqual(['distant', 'late'])
    expect(ids([a, e(stroke('refresh', 'A', 0, { timestamp: 119000 })), late])).toEqual(['a', 'refresh', 'late'])
  })
  it('chunks of one gesture on opposite sides of a dry boundary do not connect pools', () => {
    const a = e(stroke('a', 'A', 0), 'undone')
    const first = e(stroke('first', 'A', 0, { strokeId: 'long' }))
    const dry = e({ id: 'dry', type: 'paper_dry', userId: 'A', layerId: 'L', timestamp: 1 })
    const second = e(stroke('second', 'A', 50, { strokeId: 'long' }))
    const b = e(stroke('b', 'B', 50))
    expect(ids([a, first, dry, second, b])).toEqual(['first', 'dry', 'second', 'b'])
  })
})
