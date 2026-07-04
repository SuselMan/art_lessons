import { describe, expect, it } from 'vitest'

import { TapTracker } from './tapTracker'
import { TAP_MOVE_THRESHOLD_PX } from '../../lib/tapThreshold'

describe('TapTracker (#99)', () => {
  it('recognizes a stationary down/up as a tap', () => {
    const t = new TapTracker()
    t.down(1, 100, 100)
    expect(t.up(1)).toBe(true)
  })

  it('does not recognize movement past the threshold as a tap', () => {
    const t = new TapTracker()
    t.down(1, 100, 100)
    t.move(1, 100 + TAP_MOVE_THRESHOLD_PX + 1, 100)
    expect(t.up(1)).toBe(false)
  })

  it('tolerates jitter within the threshold', () => {
    const t = new TapTracker()
    t.down(1, 100, 100)
    t.move(1, 100 + TAP_MOVE_THRESHOLD_PX - 1, 100)
    expect(t.up(1)).toBe(true)
  })

  it('is not a tap once a second finger joins (pinch/pan, not a tap)', () => {
    const t = new TapTracker()
    t.down(1, 100, 100)
    t.down(2, 200, 200)
    // First finger never moved and lifts first — still not a tap, because a
    // second finger was down at the same time (this was a multi-touch
    // gesture, not a single stationary tap).
    expect(t.up(1)).toBe(false)
    t.cancel(2)
  })

  it('a second finger joining after the first already lifted does not retroactively invalidate that tap', () => {
    const t = new TapTracker()
    t.down(1, 100, 100)
    expect(t.up(1)).toBe(true)
    t.down(2, 200, 200)
    expect(t.up(2)).toBe(true) // finger 2 was also alone for its own gesture
  })

  it('cancel clears the candidate so a subsequent lift is never mistaken for a tap', () => {
    const t = new TapTracker()
    t.down(1, 100, 100)
    t.cancel(1)
    expect(t.up(1)).toBe(false)
  })

  it('up() always clears state, tap or not — a later stray up for the same id is not a tap', () => {
    const t = new TapTracker()
    t.down(1, 100, 100)
    expect(t.up(1)).toBe(true)
    expect(t.up(1)).toBe(false)
  })

  it('a drag on one finger does not consume the tap-eligibility of a different, later, unrelated finger', () => {
    const t = new TapTracker()
    t.down(1, 100, 100)
    t.move(1, 100 + TAP_MOVE_THRESHOLD_PX + 10, 100)
    expect(t.up(1)).toBe(false)

    t.down(2, 300, 300)
    expect(t.up(2)).toBe(true)
  })
})
