import { describe, expect, it } from 'vitest'

import {
  appendFreehandPoint, closeAfterDoubleClick, closesPolygon, mapSelectionPoints, rectangleFromDrag,
  selectionBoundsRect, selectionFromPoints, transformSelection,
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

describe('closeAfterDoubleClick', () => {
  it('drops the vertex the second press of the double-click placed', () => {
    // Four presses: three corners, then a double-click whose first press put
    // the fourth corner down and whose second press means "close it".
    expect(closeAfterDoubleClick([0, 0, 40, 0, 40, 40, 0, 40, 0, 40]))
      .toEqual({ points: [0, 0, 40, 0, 40, 40, 0, 40] })
  })

  it('keeps a bare triangle whole — there is no spare vertex to drop', () => {
    expect(closeAfterDoubleClick([0, 0, 30, 0, 15, 25]))
      .toEqual({ points: [0, 0, 30, 0, 15, 25] })
  })

  it('deselects rather than closing something with no inside', () => {
    expect(closeAfterDoubleClick([10, 10, 20, 10, 20, 10, 20, 10])).toBeNull()
  })
})

describe('mapSelectionPoints', () => {
  it('is what draws the outline on top of the live transform preview', () => {
    expect(mapSelectionPoints([0, 0, 10, 0], [2, 0, 0, 0, 2, 0, 5, 5, 1])).toEqual([5, 5, 25, 5])
  })

  it('refuses a matrix that folds a point through the vanishing line', () => {
    expect(mapSelectionPoints([0, 0, 100, 0], [1, 0, -0.02, 0, 1, 0, 0, 0, 1])).toBeNull()
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

  it('accepts the sliver a pen tap wobbles out — which is why the tap guard is not here (#484)', () => {
    // Deliberately passing. Four square layer pixels is a region, and nothing
    // in this function can tell it from a small selection someone drew on
    // purpose zoomed all the way in; raising the area test until it could
    // would start eating real ones. What separates a tap from a tiny drag is
    // how far the hand travelled *on screen*, which only the gesture knows —
    // see handleSelectionDown's ClickTracker, which clears the selection on a
    // press that never left the click slop instead of replacing it with this.
    expect(selectionFromPoints(rectangleFromDrag(10, 10, 12, 12).points)).not.toBeNull()
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
