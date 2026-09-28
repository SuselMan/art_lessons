import { describe, expect, it } from 'vitest'

import {
  CATCH_UP_ENTER_QUEUE, CATCH_UP_LEAVE_QUEUE, hasSeqGap, shouldEnterCatchUp, shouldLeaveCatchUp,
} from './catchUp'

describe('shouldEnterCatchUp / shouldLeaveCatchUp', () => {
  it('does not enter catch-up for a small backlog', () => {
    expect(shouldEnterCatchUp(0)).toBe(false)
    expect(shouldEnterCatchUp(CATCH_UP_ENTER_QUEUE - 1)).toBe(false)
  })

  it('enters catch-up once the backlog reaches the threshold', () => {
    expect(shouldEnterCatchUp(CATCH_UP_ENTER_QUEUE)).toBe(true)
    expect(shouldEnterCatchUp(CATCH_UP_ENTER_QUEUE + 50)).toBe(true)
  })

  it('leaves catch-up only once the backlog is comfortably small again', () => {
    expect(shouldLeaveCatchUp(CATCH_UP_LEAVE_QUEUE)).toBe(true)
    expect(shouldLeaveCatchUp(0)).toBe(true)
    expect(shouldLeaveCatchUp(CATCH_UP_LEAVE_QUEUE + 1)).toBe(false)
  })

  it('has a hysteresis band — a backlog between the two thresholds stays in whichever mode it was', () => {
    const between = Math.floor((CATCH_UP_LEAVE_QUEUE + CATCH_UP_ENTER_QUEUE) / 2)
    expect(shouldEnterCatchUp(between)).toBe(false)
    expect(shouldLeaveCatchUp(between)).toBe(false)
  })
})

describe('hasSeqGap', () => {
  it('reports no gap for the very first arrival of a session', () => {
    expect(hasSeqGap(0, 1)).toBe(false)
    expect(hasSeqGap(0, 5000)).toBe(false) // fresh join mid-room, not a gap
  })

  it('reports no gap for consecutive seqs', () => {
    expect(hasSeqGap(500, 501)).toBe(false)
  })

  it('reports a gap when a seq was skipped', () => {
    expect(hasSeqGap(501, 503)).toBe(true)
  })

  it('reports no gap for a repeated or older seq (never a missed operation)', () => {
    expect(hasSeqGap(501, 501)).toBe(false)
    expect(hasSeqGap(501, 499)).toBe(false)
  })
})
