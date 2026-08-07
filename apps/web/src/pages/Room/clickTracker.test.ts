import { describe, expect, it } from 'vitest'

import { ClickTracker } from './clickTracker'
import { CLICK_MOVE_THRESHOLD_PX } from '../../lib/tapThreshold'

describe('ClickTracker (#408)', () => {
  it('recognizes a stationary down/up as a click', () => {
    const t = new ClickTracker()
    t.down(1, 100, 100)
    expect(t.up(1)).toBe(true)
  })

  it('does not recognize movement past the threshold as a click', () => {
    const t = new ClickTracker()
    t.down(1, 100, 100)
    t.move(1, 100 + CLICK_MOVE_THRESHOLD_PX + 1, 100)
    expect(t.up(1)).toBe(false)
  })

  it('tolerates the jitter a pen tap arrives with', () => {
    const t = new ClickTracker()
    t.down(1, 100, 100)
    t.move(1, 100 + CLICK_MOVE_THRESHOLD_PX - 1, 100)
    expect(t.up(1)).toBe(true)
  })

  it('measures wander from where the press began, not from the last sample', () => {
    // Otherwise a slow drag — every step under the threshold — would arrive at
    // the far side of the screen still counting as a click.
    const t = new ClickTracker()
    t.down(1, 100, 100)
    for (let i = 1; i <= 10; i++) t.move(1, 100 + i * (CLICK_MOVE_THRESHOLD_PX - 1), 100)
    expect(t.up(1)).toBe(false)
  })

  it('a second pointer landing mid-press does not steal the first one\'s click', () => {
    // The tablet case this exists for (#408): the pen is down and a palm (or
    // the hand steadying the device) settles on the glass after it. Under the
    // single-slot bookkeeping this replaced, the palm's press took over and the
    // pen's release found nothing to release — the gesture was lost, which is
    // exactly what "doesn't work with the pen" was.
    const t = new ClickTracker()
    t.down(1, 100, 100)
    t.down(2, 400, 700)
    expect(t.up(1)).toBe(true)
  })

  it('a resting pointer\'s own movement does not disqualify another\'s click', () => {
    const t = new ClickTracker()
    t.down(1, 100, 100)
    t.down(2, 400, 700)
    t.move(2, 500, 700)
    expect(t.up(1)).toBe(true)
  })

  it('cancel clears the press so a subsequent lift is never mistaken for a click', () => {
    const t = new ClickTracker()
    t.down(1, 100, 100)
    t.cancel(1)
    expect(t.up(1)).toBe(false)
  })

  it('up() consumes the press — a stray second up for the same id is not a click', () => {
    const t = new ClickTracker()
    t.down(1, 100, 100)
    expect(t.up(1)).toBe(true)
    expect(t.up(1)).toBe(false)
  })

  it('an up for a pointer that was never offered is not a click', () => {
    // Room withholds presses that belong to something else — the hand tool, a
    // gizmo handle, a non-primary button — by not calling down() for them at
    // all, so their release must not end the session either.
    const t = new ClickTracker()
    expect(t.up(7)).toBe(false)
  })
})
