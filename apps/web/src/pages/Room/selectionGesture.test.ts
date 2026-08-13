import { describe, expect, it } from 'vitest'

import {
  appendFreehandPoint, closesPolygon, rectangleFromDrag, selectionBoundsRect, selectionFromPoints,
  transformSelection,
} from './selectionGesture'

describe('appendFreehandPoint', () => {
  it('records the first point unconditionally', () => {
    expect(appendFreehandPoint([], 4, 5)).toEqual([4, 5])
  })

  it('drops a sample too close to the previous one', () => {
    const points = [10, 10]
    expect(appendFreehandPoint(points, 11, 10)).toBe(points)
  })

  it('records one far enough away', () => {
    expect(appendFreehandPoint([10, 10], 14, 10)).toEqual([10, 10, 14, 10])
  })
})

describe('closesPolygon', () => {
  it('is false before there are three vertices — a line has no inside', () => {
    expect(closesPolygon([100, 100, 105, 105], 100, 100, 14)).toBe(false)
  })

  it('is true for a tap on the first vertex once the lasso is a polygon', () => {
    expect(closesPolygon([100, 100, 140, 105, 130, 60], 104, 103, 14)).toBe(true)
  })

  it('is false for a tap well away from it', () => {
    expect(closesPolygon([100, 100, 140, 105, 130, 60], 160, 100, 14)).toBe(false)
  })

  it('takes the tolerance in the same space as the points, so zoom scales it', () => {
    // 14 screen px at 4x zoom is 3.5 layer px: the same tap that closes the
    // lasso zoomed out must not close it zoomed in, where the vertex is
    // visibly elsewhere.
    expect(closesPolygon([100, 100, 140, 105, 130, 60], 108, 100, 14)).toBe(true)
    expect(closesPolygon([100, 100, 140, 105, 130, 60], 108, 100, 3.5)).toBe(false)
  })
})

describe('selectionFromPoints', () => {
  it('keeps a real region', () => {
    expect(selectionFromPoints([0, 0, 10, 0, 10, 10])).toEqual({ points: [0, 0, 10, 0, 10, 10] })
  })

  it('rejects a tap and a twitch — both leave nothing selected rather than an invisible sliver', () => {
    expect(selectionFromPoints([5, 5, 5, 5, 5, 5])).toBeNull()
    expect(selectionFromPoints([0, 0, 20, 0, 20, 0.02])).toBeNull()
  })

  it('rejects fewer than three vertices', () => {
    expect(selectionFromPoints([0, 0, 10, 10])).toBeNull()
  })
})

describe('rectangleFromDrag', () => {
  it('normalizes a drag made in any direction', () => {
    expect(rectangleFromDrag(30, 40, 10, 20)).toEqual({ points: [10, 20, 30, 20, 30, 40, 10, 40] })
  })
})

describe('transformSelection', () => {
  it('follows a translation, so the next drag grabs the piece where it now is', () => {
    const moved = transformSelection({ points: [0, 0, 10, 0, 10, 10, 0, 10] }, [1, 0, 0, 0, 1, 0, 5, 7, 1])
    expect(moved).toEqual({ points: [5, 7, 15, 7, 15, 17, 5, 17] })
  })

  it('divides through by w, so a projective transform moves the outline with the content', () => {
    // Homography (column-major, see LayerTransformMatrix): x' = x / (1 + 0.01x).
    const distorted = transformSelection(
      { points: [0, 0, 100, 0, 100, 100, 0, 100] },
      [1, 0, 0.01, 0, 1, 0, 0, 0, 1],
    )!
    expect(distorted.points[2]).toBeCloseTo(50, 6)
    expect(distorted.points[3]).toBeCloseTo(0, 6)
  })

  it('drops the selection rather than half-mapping it through the vanishing line', () => {
    expect(transformSelection(
      { points: [0, 0, 100, 0, 100, 100, 0, 100] },
      [1, 0, -0.02, 0, 1, 0, 0, 0, 1],
    )).toBeNull()
  })

  it('collapses to nothing when the transform does', () => {
    expect(transformSelection(
      { points: [0, 0, 10, 0, 10, 10] }, [0, 0, 0, 0, 0, 0, 0, 0, 1],
    )).toBeNull()
  })
})

describe('selectionBoundsRect', () => {
  it('is the axis-aligned box the gizmo frames', () => {
    expect(selectionBoundsRect({ points: [4, 9, 20, 3, 11, 25] }))
      .toEqual({ x: 4, y: 3, width: 16, height: 22 })
  })
})
