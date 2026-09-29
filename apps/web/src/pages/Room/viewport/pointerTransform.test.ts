import { describe, expect, it } from 'vitest'

import { clientToCanvas } from './pointerTransform'

const CANVAS = { width: 200, height: 100 }

describe('clientToCanvas', () => {
  it('maps the viewport center to the canvas center at zoom 1, angle 0', () => {
    const viewport = { cx: 500, cy: 300, zoom: 1, angle: 0 }
    const { x, y } = clientToCanvas(500, 300, viewport, CANVAS)
    expect(x).toBeCloseTo(100)
    expect(y).toBeCloseTo(50)
  })

  it('scales distance from center by 1/zoom', () => {
    const viewport = { cx: 500, cy: 300, zoom: 2, angle: 0 }
    const { x, y } = clientToCanvas(520, 300, viewport, CANVAS)
    // 20px on screen at zoom 2 = 10px of canvas content
    expect(x).toBeCloseTo(110)
    expect(y).toBeCloseTo(50)
  })

  it('accounts for a 90° viewport rotation', () => {
    const viewport = { cx: 500, cy: 300, zoom: 1, angle: Math.PI / 2 }
    // A point directly "right" of center on screen should land "above"
    // center in canvas space after undoing a +90° rotation.
    const { x, y } = clientToCanvas(510, 300, viewport, CANVAS)
    expect(x).toBeCloseTo(100)
    expect(y).toBeCloseTo(40)
  })

  it('round-trips with the engine\'s forward transform (setViewport in engine/index.ts)', () => {
    // Same formula as PencilEngine.setViewport's pointer transform, inlined
    // here to catch any accidental drift between the two independent copies.
    const cx = 400, cy = 250, zoom = 1.5, angle = 0.3
    const cos = Math.cos(-angle), sin = Math.sin(-angle)
    const hw = CANVAS.width / 2, hh = CANVAS.height / 2
    const engineTransform = (clientX: number, clientY: number) => {
      const dx = clientX - cx, dy = clientY - cy
      const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos
      return { x: rx / zoom + hw, y: ry / zoom + hh }
    }
    const expected = engineTransform(437, 271)
    const actual = clientToCanvas(437, 271, { cx, cy, zoom, angle }, CANVAS)
    expect(actual.x).toBeCloseTo(expected.x)
    expect(actual.y).toBeCloseTo(expected.y)
  })
})
