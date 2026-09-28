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

/** (#512) Whether the screen is small enough that the full editor does not fit
 *  on it — a phone, in practice.
 *
 *  Deliberately *not* a third `DeviceType`. That type answers "which set of
 *  controls is within reach", and a phone's answer is the same as a tablet's:
 *  a finger on glass, no keyboard, no hover. What differs is how much fits, so
 *  this is a second, orthogonal question rather than a third value of the
 *  first one. The practical difference is what happens to code that already
 *  says `deviceType === 'tablet'` — `minimalUiAvailable`, `floatingPanelVisible`
 *  and the rest of uiPreferences.ts. A third value would have silently
 *  excluded a phone from every one of them, one quiet missing feature at a
 *  time; an orthogonal flag leaves a phone inheriting all of it.
 *
 *  Measured on the *short* side, so it survives rotation: a phone held
 *  landscape is still a phone, and its problem is the 390 px it has across the
 *  other axis. CSS pixels rather than device ones — a modern phone has plenty
 *  of the latter and lays out with about as many of the former as it did in
 *  2014.
 *
 *  Deliberately not a stylus test. "A phone has no pen" is close enough to
 *  true to be tempting and wrong in all three directions: phones with an S Pen
 *  have one, a capacitive stylus is indistinguishable from a finger, and
 *  `any-pointer: fine` only reports a pen while it is in hover range — so
 *  before the first touch there is no answer at all. Size is the honest
 *  signal, and it is also the one that matches the actual complaint: the
 *  interface takes up the whole screen. */
export const COMPACT_MAX_SHORT_SIDE_PX = 600

export function compactMediaQuery(): string {
  return `(max-width: ${COMPACT_MAX_SHORT_SIDE_PX}px), (max-height: ${COMPACT_MAX_SHORT_SIDE_PX}px)`
}

export function detectCompact(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(compactMediaQuery()).matches
}

/** The stored override, if the user has one, else detection. Three states
 *  rather than a boolean, for the same reason the device tumbler has a stored
 *  value at all: detection will be wrong for somebody, and "I never chose"
 *  has to stay distinguishable from "I chose the same thing detection did", or
 *  a rotation would look like a choice. */
export type CompactPreference = 'auto' | 'on' | 'off'

export const COMPACT_PREFERENCES: readonly CompactPreference[] = ['auto', 'on', 'off']

export function isCompactPreference(value: unknown): value is CompactPreference {
  return value === 'auto' || value === 'on' || value === 'off'
}

export function resolveCompact(preference: CompactPreference, detected: boolean): boolean {
  if (preference === 'on') return true
  if (preference === 'off') return false
  return detected
}
