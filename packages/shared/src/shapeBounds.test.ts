import { describe, it, expect } from 'vitest'
import { shapeWorldBounds, type ShapeFrame, type ShapeGeometry, type ShapeStroke } from './index.js'

// (#526) shapeWorldBounds is the one piece of shape geometry both sides run:
// the engine resolves tiles from it and the UI frames the gizmo with it. An
// underestimate is a shape clipped at a tile edge — invisible until the shape
// is big enough to cross one — so the interesting cases here are all about
// what a stroke adds outside the contour.

const RECT: ShapeGeometry = { kind: 'rectangle', cornerRadius: 0 }
const FRAME: ShapeFrame = { x: 100, y: 200, width: 400, height: 300, angle: 0 }

function stroke(over: Partial<ShapeStroke> = {}): ShapeStroke {
  return { color: [0, 0, 0], width: 10, align: 'center', join: 'round', ...over }
}

describe('shapeWorldBounds', () => {
  it('is the frame plus an antialiasing margin when nothing is stroked', () => {
    expect(shapeWorldBounds(RECT, FRAME, null)).toEqual({
      minX: 99, minY: 199, maxX: 501, maxY: 501,
    })
  })

  it('grows by half the width for a centred stroke and by all of it outside', () => {
    const centred = shapeWorldBounds(RECT, FRAME, stroke({ align: 'center' }))
    const outside = shapeWorldBounds(RECT, FRAME, stroke({ align: 'outside' }))
    expect(centred.minX).toBe(100 - 5 - 1)
    expect(outside.minX).toBe(100 - 10 - 1)
  })

  it('leaves room for a mitre, which reaches past the stroke itself', () => {
    const round = shapeWorldBounds(RECT, FRAME, stroke({ join: 'round' }))
    const mitre = shapeWorldBounds(RECT, FRAME, stroke({ join: 'miter' }))
    expect(mitre.minX).toBeLessThan(round.minX)
  })

  it('covers an inside stroke without growing at all', () => {
    const inside = shapeWorldBounds(RECT, FRAME, stroke({ align: 'inside' }))
    // Only the antialiasing margin — the whole point of `inside` is that the
    // frame is the shape's real extent, which is what makes an exact-sized
    // frame possible.
    expect(inside).toEqual({ minX: 99, minY: 199, maxX: 501, maxY: 501 })
  })

  it('reads a negative width as a line drawn the other way, not as an error', () => {
    const backwards: ShapeFrame = { x: 500, y: 200, width: -400, height: 300, angle: 0 }
    // Same rectangle in space as FRAME: the sign says which diagonal a line
    // runs along, and the bounds must not care.
    expect(shapeWorldBounds(RECT, backwards, null)).toEqual(shapeWorldBounds(RECT, FRAME, null))
  })

  it('lets a square cap push past the end of a line', () => {
    const line: ShapeGeometry = { kind: 'line', cap: 'square' }
    const butt: ShapeGeometry = { kind: 'line', cap: 'butt' }
    const s = stroke({ join: 'round' })
    expect(shapeWorldBounds(line, FRAME, s).minX).toBeLessThan(shapeWorldBounds(butt, FRAME, s).minX)
  })

  it('grows a rotated frame to the rectangle that actually contains it', () => {
    const square: ShapeFrame = { x: 0, y: 0, width: 100, height: 100, angle: Math.PI / 4 }
    const b = shapeWorldBounds(RECT, square, null)
    // A square turned 45 degrees spans its own diagonal.
    const half = (100 * Math.SQRT2) / 2
    expect(b.maxX - 50).toBeCloseTo(half + 1, 6)
    expect(b.maxY - 50).toBeCloseTo(half + 1, 6)
  })

  it('is symmetric about the frame centre for every angle', () => {
    for (const angle of [0, 0.3, 1.1, 2.5, -0.7]) {
      const b = shapeWorldBounds(RECT, { ...FRAME, angle }, stroke())
      expect((b.minX + b.maxX) / 2).toBeCloseTo(300, 6)
      expect((b.minY + b.maxY) / 2).toBeCloseTo(350, 6)
    }
  })
})
