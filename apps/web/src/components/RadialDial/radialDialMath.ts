// Pure geometry/value helpers for RadialDial (#277) — kept separate from the
// component so the angle math (the part most worth getting exactly right,
// especially the wraparound cases) is unit-testable without React/DOM.

export interface Point { x: number; y: number }

/** Pointer position -> compass-style degrees (0 = "up"/12 o'clock,
 *  increasing clockwise) around `center`. Clockwise-positive matches
 *  viewport.angle's own convention (useViewport.ts's `rotate(${v.angle}rad)`
 *  — a positive CSS rotation turns clockwise), so a value read off this
 *  dial composes directly with viewport.angle without a sign flip at the
 *  call site. */
export function angleToCompassDegrees(center: Point, point: Point): number {
  const rad = Math.atan2(point.y - center.y, point.x - center.x) // 0 = east (+x), increases toward south (+y, screen-down)
  const deg = (rad * 180) / Math.PI + 90 // rotate reference so 0 = north/up
  return wrapDegrees(deg)
}

/** Normalizes to [0, 360). */
export function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

/** Nearest multiple of `step` — plain Math.round(v/step)*step, pulled out
 *  as its own function only so callers don't have to re-derive the
 *  divide-round-multiply each time. */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

/** Normalizes `v` into the circular domain [domainMin, domainMin + range) —
 *  the general-range counterpart to wrapDegrees (which is just this with
 *  domainMin 0, range 360). E.g. wrapValue(360, 0, 360) === 0,
 *  wrapValue(-10, 0, 360) === 350. */
export function wrapValue(v: number, domainMin: number, range: number): number {
  if (range <= 0) return domainMin
  return domainMin + (((v - domainMin) % range) + range) % range
}

export function distanceFromCenter(center: Point, point: Point): number {
  return Math.hypot(point.x - center.x, point.y - center.y)
}

/** Shortest signed distance from `from` to `to` on a 360°-wrapping circle,
 *  in (-180, 180] — e.g. shortestDelta(359, 1) === 2, not -358. Used to
 *  count whole-unit (default: whole-degree) crossings during a drag without
 *  misfiring a huge burst across the 359->0 seam. */
export function shortestDelta(from: number, to: number): number {
  let d = wrapDegrees(to) - wrapDegrees(from)
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/** How many whole `unit`-sized boundaries were crossed going from `from` to
 *  `to` along the *shortest* path around the circle (matches shortestDelta's
 *  own direction) — e.g. wholeUnitsCrossed(0.6, 2.4, 1) === 2 (crossed the
 *  1 and 2 boundaries), wholeUnitsCrossed(359.5, 0.5, 1) === 1 (crossed the
 *  360/0 boundary once). Signed: negative means crossed going the other way.
 *  This is what drives RadialDial's per-degree click callback. */
export function wholeUnitsCrossed(from: number, to: number, unit: number): number {
  if (unit <= 0) return 0
  const delta = shortestDelta(from, to)
  const start = wrapDegrees(from)
  return Math.trunc((start + delta) / unit) - Math.trunc(start / unit)
}
