import { describe, expect, it } from 'vitest'

import { wrapInto } from './useDragToAdjust'

// (#329) The canvas-rotation drag depends on this: a drag downward past 0°
// must come back in at 359°, not stop dead at the bottom of the range.
describe('wrapInto', () => {
  it('leaves a value already inside the range alone', () => {
    expect(wrapInto(90, 0, 360)).toBe(90)
  })

  it('wraps a value below min back in from the top', () => {
    expect(wrapInto(-1, 0, 360)).toBe(359)
    expect(wrapInto(-370, 0, 360)).toBe(350)
  })

  it('wraps a value at or above max back in from the bottom', () => {
    expect(wrapInto(360, 0, 360)).toBe(0)
    expect(wrapInto(725, 0, 360)).toBe(5)
  })

  it('works for a range that does not start at zero', () => {
    expect(wrapInto(-181, -180, 180)).toBe(179)
    expect(wrapInto(180, -180, 180)).toBe(-180)
  })

  it('degenerates safely on an empty range rather than dividing by zero', () => {
    expect(wrapInto(5, 3, 3)).toBe(3)
  })
})
