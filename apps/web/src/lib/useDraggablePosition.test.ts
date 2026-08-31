import { describe, expect, it } from 'vitest'

import { BUTTON_DRAG_THRESHOLD_PX, TAP_MOVE_THRESHOLD_PX } from './tapThreshold'
import { dragThresholdForPress } from './useDraggablePosition'

/** Stands in for the pointerdown's `target`. Only `closest` is ever called on
 *  it — see the interface the rule is written against, and vitest.config.ts
 *  for why there is no real DOM here to build one out of. */
function target(matches: string[]): EventTarget {
  return { closest: (selector: string) => (matches.includes(selector) ? {} : null) } as unknown as EventTarget
}

// (#516) A press aimed at one of the floating panel's buttons has to be
// allowed to drift further than a press on the panel's own body before it is
// taken away and turned into a drag: the body press means nothing else, the
// button press does.
describe('dragThresholdForPress', () => {
  const CONTROLS = 'button, a, input, select, textarea, [role="button"]'

  it('gives a press that landed on a control the button budget', () => {
    expect(dragThresholdForPress({ target: target([CONTROLS]) })).toBe(BUTTON_DRAG_THRESHOLD_PX)
  })

  it('gives a press on the draggable body itself the tight tap budget', () => {
    expect(dragThresholdForPress({ target: target([]) })).toBe(TAP_MOVE_THRESHOLD_PX)
  })

  it('falls back to the tap budget for a target that cannot be asked', () => {
    expect(dragThresholdForPress({ target: null })).toBe(TAP_MOVE_THRESHOLD_PX)
    expect(dragThresholdForPress({ target: {} as EventTarget })).toBe(TAP_MOVE_THRESHOLD_PX)
  })

  // The bug this exists for: 4 px is under a millimetre of tip travel on a
  // tablet digitiser, so a perfectly ordinary pen tap on Undo spent it and
  // moved the panel instead. Whatever the two numbers become, the button one
  // has to stay clear of the stylus drift CLICK_MOVE_THRESHOLD_PX documents.
  it('keeps the button budget well above the tap one', () => {
    expect(BUTTON_DRAG_THRESHOLD_PX).toBeGreaterThan(TAP_MOVE_THRESHOLD_PX * 4)
  })
})
