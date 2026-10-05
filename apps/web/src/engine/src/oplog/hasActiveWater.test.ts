import { describe, expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { makeStroke } from '../../testing/engineTestUtils'
import { WET_DRY_MS } from '../paper/paperWetness'
import { OperationLog } from './OperationLog'
import { hasActiveWater } from './hasActiveWater'

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
