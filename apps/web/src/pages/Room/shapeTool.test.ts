import { describe, it, expect } from 'vitest'
import type { ShapeFrame } from '@grafetto/shared'
import {
  frameFromDrag, frameFromHandleDrag, frameWithRatio, frameWithSize,
  isDrawableFrame, shapeGeometryFrom, shapePaintFrom, LINE_ANGLE_SNAP_DEG,
} from './shapeTool'

// (#530) What a drag means. The modifiers are the interesting part: each of
// them has a rule that is easy to state and easy to get subtly wrong, and none
// of them is visible in a screenshot.

const MODS = { keepProportions: false, shift: false, fromCenter: false }

describe('frameFromDrag', () => {
  it('draws corner to corner, whichever way the hand went', () => {
    const a = frameFromDrag('boxed', { x: 100, y: 100 }, { x: 300, y: 200 }, MODS)
    const b = frameFromDrag('boxed', { x: 300, y: 200 }, { x: 100, y: 100 }, MODS)
    expect(a).toEqual({ x: 100, y: 100, width: 200, height: 100, angle: 0 })
    expect(b).toEqual(a)
  })

  it('lets Shift invert the toggle rather than only turning it on', () => {
    const drag = { start: { x: 0, y: 0 }, current: { x: 200, y: 50 } }
    const plain = frameFromDrag('boxed', drag.start, drag.current, MODS)
    const shifted = frameFromDrag('boxed', drag.start, drag.current, { ...MODS, shift: true })
    const toggled = frameFromDrag('boxed', drag.start, drag.current, { ...MODS, keepProportions: true })
    const both = frameFromDrag('boxed', drag.start, drag.current, {
      keepProportions: true, shift: true, fromCenter: false,
    })
    expect(plain.width).not.toBe(plain.height)
    expect(shifted.width).toBe(shifted.height)
    expect(toggled.width).toBe(toggled.height)
    // The whole point of inverting: with the toggle on, Shift is how you get a
    // free rectangle back without a trip to the panel.
    expect(both.width).not.toBe(both.height)
  })

  it('grows a constrained square to contain the drag, never to fit inside it', () => {
    const f = frameFromDrag('boxed', { x: 0, y: 0 }, { x: 200, y: 50 }, { ...MODS, shift: true })
    expect(f.width).toBe(200)
    expect(f.height).toBe(200)
  })

  it('draws from the centre with Alt, in every direction at once', () => {
    const f = frameFromDrag('boxed', { x: 100, y: 100 }, { x: 180, y: 130 }, { ...MODS, fromCenter: true })
    expect(f).toEqual({ x: 20, y: 70, width: 160, height: 60, angle: 0 })
  })

  it('keeps a line signed, so the two diagonals stay different lines', () => {
    const down = frameFromDrag('line', { x: 0, y: 0 }, { x: 100, y: 100 }, MODS)
    const up = frameFromDrag('line', { x: 0, y: 100 }, { x: 100, y: 0 }, MODS)
    expect(down).toEqual({ x: 0, y: 0, width: 100, height: 100, angle: 0 })
    expect(up).toEqual({ x: 0, y: 100, width: 100, height: -100, angle: 0 })
  })

  it('snaps a line to the angle ladder instead of squaring it', () => {
    // 20 degrees off horizontal, which is nearer 15 than 30.
    const len = 100
    const a = 20 * (Math.PI / 180)
    const f = frameFromDrag(
      'line', { x: 0, y: 0 }, { x: Math.cos(a) * len, y: Math.sin(a) * len }, { ...MODS, shift: true },
    )
    const snapped = Math.atan2(f.height, f.width) * (180 / Math.PI)
    expect(snapped).toBeCloseTo(LINE_ANGLE_SNAP_DEG, 6)
    // Length survives the snap — only the direction moved.
    expect(Math.hypot(f.width, f.height)).toBeCloseTo(len, 6)
  })
})

describe('isDrawableFrame', () => {
  it('refuses a press that never moved, so a stray tap records nothing', () => {
    expect(isDrawableFrame({ x: 5, y: 5, width: 0, height: 0, angle: 0 })).toBe(false)
    expect(isDrawableFrame({ x: 5, y: 5, width: 0.4, height: 0.4, angle: 0 })).toBe(false)
    expect(isDrawableFrame({ x: 5, y: 5, width: 40, height: 0, angle: 0 })).toBe(true)
  })
})

describe('shapeGeometryFrom', () => {
  it('maps the starness slider onto the polygon-to-needle range', () => {
    const polygon = shapeGeometryFrom('polystar', { points: 6, starness: 0, rotation: 0 })
    const star = shapeGeometryFrom('polystar', { points: 6, starness: 1, rotation: 0 })
    const half = shapeGeometryFrom('polystar', { points: 6, starness: 0.5, rotation: 0 })
    if (polygon.kind !== 'polystar' || star.kind !== 'polystar' || half.kind !== 'polystar') {
      throw new Error('expected polystars')
    }
    // Zero starness is the regular polygon: inner vertices exactly on the edges.
    expect(polygon.innerRadius).toBeCloseTo(Math.cos(Math.PI / 6), 12)
    expect(star.innerRadius).toBe(0)
    expect(half.innerRadius).toBeCloseTo(Math.cos(Math.PI / 6) / 2, 12)
  })

  it('converts the angles the panel shows in degrees', () => {
    const g = shapeGeometryFrom('ellipse', {
      startAngle: 90, endAngle: 270, innerRadius: 0.4, closePath: false,
    })
    if (g.kind !== 'ellipse') throw new Error('expected an ellipse')
    expect(g.startAngle).toBeCloseTo(Math.PI / 2, 12)
    expect(g.endAngle).toBeCloseTo((3 * Math.PI) / 2, 12)
    expect(g.closePath).toBe(false)
  })
})

describe('shapePaintFrom', () => {
  it('reads a switched-off colour as absent, not as transparent', () => {
    const both = shapePaintFrom({
      strokeOn: true, strokeColor: [1, 0, 0], strokeWidth: 3, strokeAlign: 'inside',
      fillOn: true, fillColor: [0, 1, 0],
    })
    expect(both.stroke).toEqual({ color: [1, 0, 0], width: 3, align: 'inside', join: 'miter' })
    expect(both.fill).toEqual({ color: [0, 1, 0] })

    const neither = shapePaintFrom({ strokeOn: false, fillOn: false, fillColor: [0, 1, 0] })
    expect(neither.stroke).toBeNull()
    expect(neither.fill).toBeNull()
  })

  it('gives a tool with no fill field no fill at all', () => {
    expect(shapePaintFrom({ strokeOn: true, strokeColor: [0, 0, 0], strokeWidth: 2, fillOn: true }).fill).toBeNull()
  })
})

describe('frameFromHandleDrag', () => {
  const frame: ShapeFrame = { x: 100, y: 100, width: 200, height: 100, angle: 0 }
  const mods = { keepProportions: false, shift: false }

  it('moves the whole frame by the body', () => {
    const f = frameFromHandleDrag(frame, 'body', { x: 0, y: 0 }, { x: 30, y: -10 }, mods)
    expect(f).toEqual({ ...frame, x: 130, y: 90 })
  })

  it('moves one edge and leaves the opposite one alone', () => {
    const f = frameFromHandleDrag(frame, 'r', { x: 300, y: 150 }, { x: 400, y: 150 }, mods)
    expect(f.x).toBe(100)
    expect(f.width).toBe(300)
    expect(f.height).toBe(100)
  })

  it('rotates about the centre and snaps with Shift', () => {
    const start = { x: 300, y: 150 }
    const quarter = { x: 200, y: 250 }
    const free = frameFromHandleDrag(frame, 'rotate-br', start, quarter, mods)
    expect(free.angle).toBeCloseTo(Math.PI / 2, 6)
    const snapped = frameFromHandleDrag(
      frame, 'rotate-br', start, { x: 210, y: 240 }, { ...mods, shift: true },
    )
    const step = LINE_ANGLE_SNAP_DEG * (Math.PI / 180)
    expect(snapped.angle / step).toBeCloseTo(Math.round(snapped.angle / step), 9)
  })

  it('keeps a rotated frame rotating about its own axes', () => {
    const turned: ShapeFrame = { ...frame, angle: Math.PI / 2 }
    // Dragging the right edge of a frame turned a quarter turn moves it
    // *downward* on screen, and the frame's own width is what grows.
    const f = frameFromHandleDrag(turned, 'r', { x: 200, y: 250 }, { x: 200, y: 300 }, mods)
    expect(f.width).toBeCloseTo(250, 6)
    expect(f.height).toBeCloseTo(100, 6)
  })

  it('never lets an edge cross the one opposite it', () => {
    const f = frameFromHandleDrag(frame, 'r', { x: 300, y: 150 }, { x: -500, y: 150 }, mods)
    expect(f.width).toBeGreaterThan(0)
  })

  it('keeps the proportions of the frame it started from', () => {
    const f = frameFromHandleDrag(frame, 'br', { x: 300, y: 200 }, { x: 500, y: 210 }, { ...mods, shift: true })
    expect(Math.abs(f.width) / Math.abs(f.height)).toBeCloseTo(2, 6)
  })

  it("keeps a line direction when an edge is dragged", () => {
    const line: ShapeFrame = { x: 0, y: 100, width: 100, height: -100, angle: 0 }
    const f = frameFromHandleDrag(line, 'r', { x: 100, y: 0 }, { x: 160, y: 0 }, mods)
    expect(Math.sign(f.width)).toBe(1)
    expect(Math.sign(f.height)).toBe(-1)
  })
})

describe('frameWithSize and frameWithRatio', () => {
  const frame: ShapeFrame = { x: 100, y: 100, width: 200, height: 100, angle: 0 }

  it('resizes about the centre, so a typed number never slides the frame', () => {
    const f = frameWithSize(frame, 'width', 400)
    expect(f.width).toBe(400)
    expect(f.x + f.width / 2).toBe(frame.x + frame.width / 2)
  })

  it('applies a ratio without collapsing the frame to one side', () => {
    const f = frameWithRatio(frame, 3 / 4)
    expect(Math.abs(f.width) / Math.abs(f.height)).toBeCloseTo(3 / 4, 6)
    // Area stays in the same neighbourhood rather than the frame snapping to
    // the longer side.
    expect(Math.abs(f.width * f.height)).toBeCloseTo(200 * 100, 4)
  })
})
