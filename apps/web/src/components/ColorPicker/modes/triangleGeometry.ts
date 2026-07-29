import { pointOnCircle, type Point } from '../../../lib/angles'

/** The classic saturation/value triangle inside the hue ring (#341).
 *
 *  Three corners — pure hue, white, black — and every point inside is a
 *  barycentric mix of them. Laid out point-down, with white at the upper left,
 *  the hue at the upper right and black at the bottom, so it reads the same
 *  way round as the square mode: white one way, saturation the other, black
 *  below. Someone switching modes keeps their bearings.
 *
 *  The triangle does not rotate with hue (decided 29.07): the hue corner
 *  changes color, but nothing moves. A target that turns under a finger is
 *  harder to hit, and "Painter did it" is an argument from habit, not from
 *  use. */

/** Compass angles (0 = up, clockwise) of the hue, white and black corners. */
const HUE_ANGLE = 60
const WHITE_ANGLE = 300
const BLACK_ANGLE = 180

export interface TriangleCorners {
  hue: Point
  white: Point
  black: Point
}

/** The three corners on a circle of `radius` around `center`. */
export function triangleCorners(center: Point, radius: number): TriangleCorners {
  return {
    hue: pointOnCircle(center, radius, HUE_ANGLE),
    white: pointOnCircle(center, radius, WHITE_ANGLE),
    black: pointOnCircle(center, radius, BLACK_ANGLE),
  }
}

/** Barycentric weights of `p` with respect to the three corners, in the same
 *  order. They always sum to 1; all three are >= 0 exactly when `p` is inside
 *  the triangle, which is what makes them the natural inside test too. */
export function barycentric(p: Point, c: TriangleCorners): [number, number, number] {
  const { hue: a, white: b, black: d } = c
  const den = (b.y - d.y) * (a.x - d.x) + (d.x - b.x) * (a.y - d.y)
  if (den === 0) return [1, 0, 0]
  const wa = ((b.y - d.y) * (p.x - d.x) + (d.x - b.x) * (p.y - d.y)) / den
  const wb = ((d.y - a.y) * (p.x - d.x) + (a.x - d.x) * (p.y - d.y)) / den
  return [wa, wb, 1 - wa - wb]
}

/** Saturation and value at a set of weights.
 *
 *  The color there is `wHue·hue + wWhite·white + wBlack·black`, and black
 *  contributes nothing, so the mix is `wHue·hue + wWhite` in every channel.
 *  A pure hue has 1 in its top channel and 0 in its bottom one, which makes
 *  the maximum `wHue + wWhite` and the minimum `wWhite` — so value is their
 *  sum and saturation is the hue corner's share of it. */
export function svFromWeights([wHue, wWhite]: [number, number, number]): { s: number; v: number } {
  const v = wHue + wWhite
  return { s: v <= 0 ? 0 : wHue / v, v }
}

/** The inverse: where a given saturation/value sits in the triangle. */
export function pointForSv(s: number, v: number, c: TriangleCorners): Point {
  const wHue = s * v
  const wWhite = v - wHue
  const wBlack = 1 - v
  return {
    x: wHue * c.hue.x + wWhite * c.white.x + wBlack * c.black.x,
    y: wHue * c.hue.y + wWhite * c.white.y + wBlack * c.black.y,
  }
}

/** The nearest point inside the triangle — `p` itself when it is already in.
 *
 *  A drag that wanders outside has to keep meaning something: without this the
 *  thumb either freezes at the last good spot or jumps to wherever the raw
 *  weights land, and both read as the control breaking. Sliding along the edge
 *  is what every other picker in this app already does with `clamp` on a
 *  rectangle — a triangle just needs the nearest-edge version of it. */
export function clampToTriangle(p: Point, c: TriangleCorners): Point {
  const [wa, wb, wc] = barycentric(p, c)
  if (wa >= 0 && wb >= 0 && wc >= 0) return p

  const edges: [Point, Point][] = [
    [c.hue, c.white],
    [c.white, c.black],
    [c.black, c.hue],
  ]
  let best: Point = c.hue
  let bestDist = Infinity
  for (const [from, to] of edges) {
    const candidate = closestPointOnSegment(p, from, to)
    const dist = (candidate.x - p.x) ** 2 + (candidate.y - p.y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }
  return best
}

function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return a
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return { x: a.x + t * dx, y: a.y + t * dy }
}
