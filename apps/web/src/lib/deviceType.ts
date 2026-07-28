/** Which of the two control schemes the interface is laid out for (#173,
 *  ADR #318).
 *
 *  Not a device category so much as a shorthand for which inputs are within
 *  reach: `tablet` is a finger on glass with no keyboard and no hover,
 *  `desktop` is a mouse or a graphics-tablet stylus with a keyboard beside
 *  it. Those are two different sets of controls, not one set at two sizes —
 *  there is no two-finger pan/zoom/rotate on a PC to scale down.
 *
 *  It decides *presentation only*: target sizes, panel layout, which
 *  affordances are shown, how long a long-press waits. Input handlers for
 *  both schemes are registered at once and kept apart by which event family
 *  they listen to, so guessing wrong costs cramped spacing rather than an
 *  unusable canvas. That distinction is the whole point, because the guess
 *  is wrong for exactly the people we're building for: a Surface or an iPad
 *  with the keyboard detached reports desktop-class hardware while it's
 *  being held like a tablet, and no browser API can tell the difference. */
export type DeviceType = 'tablet' | 'desktop'

export const DEVICE_TYPES: readonly DeviceType[] = ['tablet', 'desktop']

export function isDeviceType(value: unknown): value is DeviceType {
  return value === 'tablet' || value === 'desktop'
}

/** The scheme to start in on a device we've not seen before.
 *
 *  Deliberately not user-agent sniffing: iPadOS presents itself as desktop
 *  Safari on a Macintosh, so any UA-based check gets the single most common
 *  tablet wrong. `maxTouchPoints` is what sees through that.
 *
 *  The media query asks about `pointer`, the *primary* pointing device,
 *  rather than `any-pointer`. That's what keeps a laptop with a touchscreen
 *  on the desktop side — it has touch, but it's driven with the trackpad —
 *  while leaving an Android tablet with a stylus a tablet, since a stylus
 *  only ever shows up under `any-pointer: fine`. */
export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop'
  const hasTouch = navigator.maxTouchPoints > 0
  return hasTouch && window.matchMedia('(pointer: coarse)').matches ? 'tablet' : 'desktop'
}
