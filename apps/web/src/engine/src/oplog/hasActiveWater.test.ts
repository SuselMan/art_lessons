import { describe, expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { makeStroke } from '../../testing/engineTestUtils'
import { WET_DRY_MS } from '../paper/paperWetness'
import { OperationLog } from './OperationLog'
import { hasActiveWater, wetReplayOperationIds } from './hasActiveWater'

const now = 1000000
const water = (layerId = 'L', preset = 'normal:100:0') => makeStroke('A', layerId, [], {
  tool: 'watercolor', preset, timestamp: now - 100, washId: 'water', strokeId: 'clear',
})
const reset = (type: 'paper_dry' | 'layer_clear', layerId = 'L'): Operation =>
  ({ type, id: 'reset', userId: 'A', timestamp: now, ...(type === 'layer_clear' ? { layerId } : {}) }) as Operation

describe('network snapshot active water gate', () => {
  it('keeps clear water unsafe after the author switches to pencil', () => {
    expect(hasActiveWater([water(), makeStroke('A', 'L', [])], 'L', now)).toBe(true)
  })
  it('protects shallow water too, but not a dry pigment brush', () => {
    expect(hasActiveWater([water('L', 'normal:1:100')], 'L', now)).toBe(true)
    expect(hasActiveWater([water('L', 'normal:0:100')], 'L', now)).toBe(false)
  })
  it('expires at the same maximum water lifetime, retaining future clocks conservatively', () => {
    const op = water()
    expect(hasActiveWater([op], 'L', op.timestamp + WET_DRY_MS - 1)).toBe(true)
    expect(hasActiveWater([op], 'L', op.timestamp + WET_DRY_MS)).toBe(false)
    expect(hasActiveWater([op], 'L', op.timestamp - 1)).toBe(true)
  })
  it('respects dry/clear order and does not reset on another layer clear', () => {
    expect(hasActiveWater([water(), reset('paper_dry')], 'L', now)).toBe(false)
    expect(hasActiveWater([water(), reset('layer_clear')], 'L', now)).toBe(false)
    expect(hasActiveWater([reset('paper_dry'), water()], 'L', now)).toBe(true)
    expect(hasActiveWater([water(), reset('layer_clear', 'B')], 'L', now)).toBe(true)
    expect(hasActiveWater([water('B')], 'L', now)).toBe(false)
  })
  it('does not keep undone or revoked donors alive in the done log', () => {
    const log = new OperationLog()
    const op = water()
    log.append(op)
    expect(hasActiveWater(log.doneOperations(), 'L', now)).toBe(true)
    log.applyUndo(op.id, 'A')
    expect(hasActiveWater(log.doneOperations(), 'L', now)).toBe(false)
    log.applyRedo(op.id, 'A')
    expect(hasActiveWater(log.doneOperations(), 'L', now)).toBe(true)
    log.revoke(op.id)
    expect(hasActiveWater(log.doneOperations(), 'L', now)).toBe(false)
  })
})

 describe('recorded wet replay eligibility', () => {
  it('uses ordered dry barriers and preserves new water irrespective of clocks', () => {
    const before = { ...water(), id: 'before', timestamp: now + 100 }
    const after = { ...water(), id: 'after', timestamp: now - 1000 }
    expect([...wetReplayOperationIds([before, reset('paper_dry'), after])]).toEqual(['after'])
  })
  it('clear affects only its layer and admits subsequent strokes', () => {
    const a = { ...water(), id: 'a' }; const b = { ...water('B'), id: 'b' }
    const c = { ...water(), id: 'c' }
    expect([...wetReplayOperationIds([a,b,reset('layer_clear'),c])].sort()).toEqual(['b','c'])
  })
  it('done state excludes revoked barriers and undone donors; redo stays before Dry', () => {
    const log = new OperationLog(); const op = water(); const dry = reset('paper_dry')
    log.append(op); log.append(dry)
    log.applyUndo(op.id, 'A'); log.applyRedo(op.id, 'A')
    expect(wetReplayOperationIds(log.doneOperations()).has(op.id)).toBe(false)
    const before = log.revision; log.revoke(dry.id)
    expect(log.revision).toBeGreaterThan(before)
    expect(wetReplayOperationIds(log.doneOperations()).has(op.id)).toBe(true)
    log.revoke(op.id)
    expect(wetReplayOperationIds(log.doneOperations()).size).toBe(0)
  })
  it('invalidates eligibility caches for confirmation order and historical hydration', () => {
    const log = new OperationLog(); const op = water(); const dry = reset('paper_dry')
    log.append(op, { pending: true }); let revision = log.revision
    log.confirm(op.id, 2); expect(log.revision).toBeGreaterThan(revision)
    revision = log.revision
    log.prependHistorical([{ op: dry, state: 'done', serverSeq: 1 }])
    expect(log.revision).toBeGreaterThan(revision)
    expect(wetReplayOperationIds(log.doneOperations()).has(op.id)).toBe(true)
    const lateDry = { ...dry, id: 'late' }
    log.append(lateDry, { pending: true }); revision = log.revision
    log.confirm(lateDry.id, 3); expect(log.revision).toBeGreaterThan(revision)
    expect(wetReplayOperationIds(log.doneOperations()).has(op.id)).toBe(false)
  })

})
