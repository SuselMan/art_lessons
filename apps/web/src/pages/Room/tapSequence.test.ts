import { describe, expect, it } from 'vitest'

import { TapSequence } from './tapSequence'
import { DOUBLE_TAP_MAX_DELAY_MS, DOUBLE_TAP_MAX_DIST_PX } from '../../lib/tapThreshold'

describe('TapSequence (#189)', () => {
  it('fires on every tap when one is required', () => {
    const s = new TapSequence(1)
    expect(s.tap(100, 100, 0).completed).toBe(true)
    expect(s.tap(500, 500, 9999).completed).toBe(true)
  })

  it('needs two taps when two are required', () => {
    const s = new TapSequence(2)
    expect(s.tap(100, 100, 0)).toEqual({ count: 1, completed: false })
    expect(s.tap(100, 100, 120)).toEqual({ count: 2, completed: true })
  })

  it('does not pair taps that are too far apart in time', () => {
    const s = new TapSequence(2)
    s.tap(100, 100, 0)
    // Too late to be the second half — starts a run of its own instead.
    expect(s.tap(100, 100, DOUBLE_TAP_MAX_DELAY_MS + 1)).toEqual({ count: 1, completed: false })
  })

  it('does not pair taps that are too far apart on screen', () => {
    const s = new TapSequence(2)
    s.tap(100, 100, 0)
    expect(s.tap(100 + DOUBLE_TAP_MAX_DIST_PX + 1, 100, 50)).toEqual({ count: 1, completed: false })
  })

  it('tolerates a second tap right at the edge of both windows', () => {
    const s = new TapSequence(2)
    s.tap(100, 100, 0)
    expect(s.tap(100 + DOUBLE_TAP_MAX_DIST_PX, 100, DOUBLE_TAP_MAX_DELAY_MS).completed).toBe(true)
  })

  it('measures the delay from the previous tap, not from the start of the run', () => {
    const s = new TapSequence(3)
    s.tap(100, 100, 0)
    s.tap(100, 100, 300)
    // 600 ms since the first tap, but only 300 since the second — still one
    // continuous run.
    expect(s.tap(100, 100, 600).completed).toBe(true)
  })

  it('clears the run on completion, so three taps are one toggle and not two', () => {
    const s = new TapSequence(2)
    s.tap(100, 100, 0)
    expect(s.tap(100, 100, 100).completed).toBe(true)
    expect(s.tap(100, 100, 200)).toEqual({ count: 1, completed: false })
    expect(s.tap(100, 100, 300).completed).toBe(true)
  })

  it('reset() drops a pending half-gesture', () => {
    const s = new TapSequence(2)
    s.tap(100, 100, 0)
    // e.g. a stylus came down to draw, or a drag happened between the taps
    s.reset()
    expect(s.tap(100, 100, 100)).toEqual({ count: 1, completed: false })
  })
})
