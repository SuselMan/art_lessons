import { describe, it, expect } from 'vitest'

import { placePopup, type PopupRect } from './popupPlacement'

const OPTS = { margin: 8, gap: 4 }

/** A trigger box from its top-left corner and size, the way the DOM reports one. */
function rect(left: number, top: number, width: number, height: number): PopupRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

describe('placePopup below (the dropdown case)', () => {
  const viewport = { width: 1000, height: 800 }

  it('hangs under the trigger, right-aligned by default', () => {
    // Trigger's right edge is 300; a 120-wide popup ends there too.
    expect(placePopup(rect(200, 100, 100, 40), { width: 120, height: 200 }, viewport, OPTS))
      .toEqual({ top: 144, left: 180 })
  })

  it('lines up with the left edge when asked', () => {
    expect(placePopup(rect(200, 100, 100, 40), { width: 120, height: 200 }, viewport, { ...OPTS, align: 'left' }))
      .toEqual({ top: 144, left: 200 })
  })

  it('flips above rather than sliding up when there is no room below', () => {
    // Under the trigger the popup would end at 1044, well past the viewport.
    const placed = placePopup(rect(200, 700, 100, 40), { width: 120, height: 300 }, viewport, OPTS)
    // Above it: 700 - 300 - 4. Sliding instead would have covered the trigger,
    // which is the one place a popup must never be.
    expect(placed.top).toBe(396)
  })
})

describe('placePopup right (#542, the rail case)', () => {
  const viewport = { width: 1000, height: 800 }
  const opts = { ...OPTS, placement: 'right' as const }

  it('sits beside the trigger, not under it', () => {
    // The colour well in the tool rail: a 40px circle at the top-left corner.
    // Under it, the flyout would cover the whole column of tool buttons.
    const placed = placePopup(rect(11, 66, 40, 40), { width: 208, height: 420 }, viewport, opts)
    expect(placed).toEqual({ top: 66, left: 55 })
  })

  it('lines its top up with the trigger rather than centring on it', () => {
    // Centring a 420-tall popup on a 40px well 66px down the screen would put
    // its top at -124, i.e. clamped to the margin and no longer beside anything.
    const placed = placePopup(rect(11, 66, 40, 40), { width: 208, height: 420 }, viewport, opts)
    expect(placed.top).toBe(66)
  })

  it('flips to the trigger\'s left when the right has no room', () => {
    // The floating panel dragged against the right edge: its own well is the
    // trigger, and there are only 40px of screen to the right of it.
    const placed = placePopup(rect(940, 300, 44, 44), { width: 208, height: 420 }, viewport, opts)
    expect(placed.left).toBe(728) // 940 - 208 - 4
  })

  it('clamps a popup taller than the space below the trigger back up the screen', () => {
    const placed = placePopup(rect(11, 600, 40, 40), { width: 208, height: 420 }, viewport, opts)
    // 800 - 420 - 8. Top-aligning at 600 would have run 220px off the bottom.
    expect(placed.top).toBe(372)
  })

  it('keeps a popup wider than the viewport on screen at the margin', () => {
    const placed = placePopup(rect(11, 66, 40, 40), { width: 1200, height: 200 }, { width: 400, height: 800 }, opts)
    expect(placed.left).toBe(8)
  })
})
