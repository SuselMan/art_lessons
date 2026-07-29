import { angleToCompassDegrees, pointOnCircle, type Point } from '../../../lib/angles'

/** Hue ring + inscribed saturation/value square (#340).
 *
 *  Hue 0 (red) sits at 12 o'clock and increases clockwise. That isn't an
 *  aesthetic choice: it is exactly what `conic-gradient(from 0deg, …)` paints,
 *  so the ring's picture and the code that reads a pointer off it share one
 *  convention and cannot drift apart by an offset nobody notices until the
 *  color under the thumb is wrong.
 *
 *  All of it works in the ring's own coordinate space — pixels relative to the
 *  widget's top-left corner — so nothing here has to know about page scroll,
 *  device pixel ratio or where the panel happens to be. */

/** Where a pointer landed, as a hue in [0, 360). Distance from the center is
 *  deliberately ignored: once a ring drag has started, a finger that wanders
 *  inside or outside the band should keep steering the hue rather than
 *  freezing it — the angle is the whole signal. */
export function hueFromPoint(center: Point, point: Point): number {
  return angleToCompassDegrees(center, point)
}

/** Where the thumb for `hue` sits, on the circle running down the middle of
 *  the band. */
export function pointForHue(center: Point, ringMidRadius: number, hue: number): Point {
  return pointOnCircle(center, ringMidRadius, hue)
}

/** Side of the largest axis-aligned square that fits inside a circle of
 *  `radius` — its corners touch the circle, so this is radius·√2, and it is
 *  what limits how big the S/V area can be in this mode. */
export function inscribedSquareSide(radius: number): number {
  return radius * Math.SQRT2
}

/** Whether a point is inside the ring band, used to decide which of the two
 *  surfaces a pointerdown belongs to when they overlap in one box. The square
 *  sits inside the hole, so anything not in the band and not in the square is
 *  dead space in the corners. */
export function isInRing(center: Point, point: Point, innerRadius: number, outerRadius: number): boolean {
  const d = Math.hypot(point.x - center.x, point.y - center.y)
  return d >= innerRadius && d <= outerRadius
}
