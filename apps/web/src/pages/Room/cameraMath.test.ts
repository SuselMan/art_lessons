import { describe, expect, it } from 'vitest'

import { worldToScreen, screenToWorld, cameraTransformCss, visibleWorldRect, clientToRoomPoint } from './cameraMath'
import type { Viewport } from './useViewport'

describe('worldToScreen / screenToWorld', () => {
  it('maps world origin to (vp.cx, vp.cy)', () => {
    const vp: Viewport = { cx: 400, cy: 250, zoom: 1.5, angle: 0.3 }
    const { x, y } = worldToScreen(0, 0, vp)
    expect(x).toBeCloseTo(vp.cx)
    expect(y).toBeCloseTo(vp.cy)
  })

  it('maps (vp.cx, vp.cy) back to world origin', () => {
    const vp: Viewport = { cx: 400, cy: 250, zoom: 1.5, angle: 0.3 }
    const { x, y } = screenToWorld(vp.cx, vp.cy, vp)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
  })

  it('round-trips an arbitrary point through world->screen->world', () => {
    const vp: Viewport = { cx: 123, cy: -45, zoom: 2.7, angle: -0.9 }
    const world = { x: 837.5, y: -212.3 }
    const screen = worldToScreen(world.x, world.y, vp)
    const back = screenToWorld(screen.x, screen.y, vp)
    expect(back.x).toBeCloseTo(world.x)
    expect(back.y).toBeCloseTo(world.y)
  })

  it('scales screen distance from (cx,cy) by zoom, angle 0', () => {
    const vp: Viewport = { cx: 0, cy: 0, zoom: 2, angle: 0 }
    const { x, y } = worldToScreen(10, 0, vp)
    expect(x).toBeCloseTo(20)
    expect(y).toBeCloseTo(0)
  })

  it('agrees with the sync-viewport effect\'s old hand-solved wx/wy formula at screen center', () => {
    // Room/index.tsx's viewport->engine sync effect used to hand-solve this
    // inline before delegating to screenToWorld — inlined here to catch any
    // accidental drift between the two.
    const vp: Viewport = { cx: 512, cy: 384, zoom: 0.6, angle: 1.1 }
    const hw = 900, hh = 640
    const dx = hw - vp.cx, dy = hh - vp.cy
    const cos = Math.cos(vp.angle), sin = Math.sin(vp.angle)
    const expectedWx = (dx * cos + dy * sin) / vp.zoom
    const expectedWy = (-dx * sin + dy * cos) / vp.zoom
    const { x, y } = screenToWorld(hw, hh, vp)
    expect(x).toBeCloseTo(expectedWx)
    expect(y).toBeCloseTo(expectedWy)
  })
})

describe('cameraTransformCss', () => {
  it('formats a translate/rotate/scale CSS transform string', () => {
    const vp: Viewport = { cx: 10, cy: 20, zoom: 1.5, angle: 0.25 }
    expect(cameraTransformCss(vp)).toBe('translate(10px,20px) rotate(0.25rad) scale(1.5)')
  })
})

describe('visibleWorldRect', () => {
  it('is centered on the world point under screen center', () => {
    const vp: Viewport = { cx: 400, cy: 300, zoom: 1, angle: 0 }
    const rect = visibleWorldRect(vp, 800, 600)
    const { x: cx, y: cy } = screenToWorld(400, 300, vp)
    expect((rect.minX + rect.maxX) / 2).toBeCloseTo(cx)
    expect((rect.minY + rect.maxY) / 2).toBeCloseTo(cy)
  })

  it('shrinks as zoom increases', () => {
    const near = visibleWorldRect({ cx: 0, cy: 0, zoom: 4, angle: 0 }, 800, 600)
    const far = visibleWorldRect({ cx: 0, cy: 0, zoom: 1, angle: 0 }, 800, 600)
    expect(near.maxX - near.minX).toBeLessThan(far.maxX - far.minX)
  })
})

describe('clientToRoomPoint', () => {
  const rect = { left: 100, top: 50 } as DOMRect

  it('delegates to screenToWorld for infinite rooms', () => {
    const vp: Viewport = { cx: 10, cy: 10, zoom: 1, angle: 0 }
    const config = { infinite: true, width: 8192, height: 8192 }
    const expected = screenToWorld(110 - rect.left, 60 - rect.top, vp)
    const actual = clientToRoomPoint(110, 60, rect, vp, config)
    expect(actual.x).toBeCloseTo(expected.x)
    expect(actual.y).toBeCloseTo(expected.y)
  })

  it('delegates to clientToCanvas (bounded canvas-pixel space) for bounded rooms', () => {
    const vp: Viewport = { cx: 0, cy: 0, zoom: 1, angle: 0 }
    const config = { infinite: false, width: 200, height: 100 }
    // (rect.left + vp.cx, rect.top + vp.cy) is the canvas center on screen;
    // clicking exactly there should land on the canvas's own center point.
    const { x, y } = clientToRoomPoint(rect.left, rect.top, rect, vp, config)
    expect(x).toBeCloseTo(100)
    expect(y).toBeCloseTo(50)
  })
})
