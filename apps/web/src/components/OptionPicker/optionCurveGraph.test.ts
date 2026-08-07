import { describe, expect, it } from 'vitest'

import { CURVE_GRAPH_PADDING, curveGraphPoints } from './optionCurveGraph'

/** Parses the `points` attribute back into numbers, so a test can talk about
 *  the shape rather than about the string. */
function parse(points: string): { x: number; y: number }[] {
  if (!points) return []
  return points.split(' ').map(pair => {
    const [x, y] = pair.split(',').map(Number)
    return { x, y }
  })
}

describe('option curve graph geometry (#409)', () => {
  const W = 88
  const H = 34
  const P = CURVE_GRAPH_PADDING

  it('spans the full padded box, first sample to last', () => {
    const pts = parse(curveGraphPoints([0, 0.5, 1], W, H))
    expect(pts[0].x).toBeCloseTo(P)
    expect(pts.at(-1)!.x).toBeCloseTo(W - P)
  })

  it('puts 0 at the bottom and 1 at the top, SVG y being upside down', () => {
    const pts = parse(curveGraphPoints([0, 1], W, H))
    expect(pts[0].y).toBeCloseTo(H - P)
    expect(pts[1].y).toBeCloseTo(P)
  })

  it('spaces samples evenly regardless of how many there are', () => {
    for (const count of [2, 3, 25]) {
      const pts = parse(curveGraphPoints(Array.from({ length: count }, () => 0.5), W, H))
      expect(pts).toHaveLength(count)
      // Precision 1, not more: the points are emitted at two decimals, which
      // is a hundredth of an SVG unit and far finer than anything visible.
      const step = (W - P * 2) / (count - 1)
      pts.forEach((pt, i) => expect(pt.x).toBeCloseTo(P + i * step, 1))
    }
  })

  it('keeps a flat curve inside the box rather than on its edge', () => {
    // A response pinned at 0 for most of its range (restrained, at the grips a
    // hand actually uses) still has to draw a visible line.
    const pts = parse(curveGraphPoints([0, 0, 0], W, H))
    for (const pt of pts) expect(pt.y).toBeLessThan(H)
  })

  it('draws nothing for a curve that is not one', () => {
    expect(curveGraphPoints([], W, H)).toBe('')
    expect(curveGraphPoints([0.5], W, H)).toBe('')
  })
})
