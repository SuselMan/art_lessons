import { describe, expect, it } from 'vitest'

import { worldToScreen, screenToWorld, cameraTransformCss, visibleWorldRect, clientToRoomPoint, rotateViewportAround, pinchViewport, minZoom, deviceNativeZoom, holdAngle, fitZoom, ZOOM_MAX } from './cameraMath'
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

describe('rotateViewportAround (#319)', () => {
  const vp: Viewport = { cx: 400, cy: 250, zoom: 1.5, angle: 0.3 }

  it('holds the anchor over the same point of the drawing', () => {
    // The whole reason the function exists: turn the view and the pixel you
    // grabbed must not slide out from under the cursor. Anchored well away
    // from (cx, cy), because at the pivot itself any implementation passes.
    const anchor = { x: 120, y: 640 }
    const before = screenToWorld(anchor.x, anchor.y, vp)

    const rotated = rotateViewportAround(vp, anchor.x, anchor.y, 0.7)
    const after = worldToScreen(before.x, before.y, rotated)

    expect(after.x).toBeCloseTo(anchor.x)
    expect(after.y).toBeCloseTo(anchor.y)
  })

  it('turns the rest of the drawing by exactly the requested angle', () => {
    const rotated = rotateViewportAround(vp, 120, 640, 0.7)
    expect(rotated.angle).toBeCloseTo(vp.angle + 0.7)
    expect(rotated.zoom).toBe(vp.zoom)
  })

  it('is a no-op at zero, whatever the anchor', () => {
    // Guards the drag path: every pointermove recomputes from the drag's
    // start, so a pointer that has not moved horizontally must leave the
    // viewport untouched rather than drift by an epsilon per event.
    const rotated = rotateViewportAround(vp, -900, 33, 0)
    expect(rotated.cx).toBeCloseTo(vp.cx)
    expect(rotated.cy).toBeCloseTo(vp.cy)
    expect(rotated.angle).toBeCloseTo(vp.angle)
  })

  it('comes back to where it started when the drag is undone', () => {
    const anchor = { x: 40, y: 90 }
    const there = rotateViewportAround(vp, anchor.x, anchor.y, 0.9)
    const back = rotateViewportAround(there, anchor.x, anchor.y, -0.9)
    expect(back.cx).toBeCloseTo(vp.cx)
    expect(back.cy).toBeCloseTo(vp.cy)
    expect(back.angle).toBeCloseTo(vp.angle)
  })
})

describe('pinchViewport (#442)', () => {
  const FLOOR = 0.04

  it('holds the point under the fingers still through a pure twist', () => {
    // The bug this function was extracted for: rotation used to be a bare
    // `angle + dAngle`, which pivots about (cx, cy) — the canvas centre — not
    // about the fingers. (cx, cy) here is far off-screen, as it is at any
    // working zoom, which is why the fault only showed up zoomed in.
    const vp: Viewport = { cx: -4200, cy: 3100, zoom: 12, angle: 0.4 }
    const mid = { x: 500, y: 300 }
    const held = screenToWorld(mid.x, mid.y, vp)

    const after = pinchViewport(vp, mid, mid, 1, 0.35, FLOOR)
    const where = worldToScreen(held.x, held.y, after)

    expect(where.x).toBeCloseTo(mid.x)
    expect(where.y).toBeCloseTo(mid.y)
    expect(after.angle).toBeCloseTo(vp.angle + 0.35)
  })

  it('holds it still through a twist, a pinch and a drag at once', () => {
    // A real gesture is never one of the three, so the anchoring has to
    // survive all of them composed — and the composition order is the thing
    // that is easy to get subtly wrong.
    const vp: Viewport = { cx: -1800, cy: 900, zoom: 8, angle: -0.7 }
    const prevMid = { x: 420, y: 260 }
    const currMid = { x: 505, y: 190 }
    const held = screenToWorld(prevMid.x, prevMid.y, vp)

    const after = pinchViewport(vp, prevMid, currMid, 1.15, -0.22, FLOOR)
    const where = worldToScreen(held.x, held.y, after)

    // The pixel grabbed at the old midpoint follows the fingers to the new one.
    expect(where.x).toBeCloseTo(currMid.x)
    expect(where.y).toBeCloseTo(currMid.y)
    expect(after.zoom).toBeCloseTo(vp.zoom * 1.15)
  })

  it('is the same wherever the fingers are, at the same zoom', () => {
    // What "the axis is between the fingers" means operationally: two people
    // twisting the same view by the same angle at different spots must each
    // see it turn about their own fingers, not about a shared far-off pivot.
    const vp: Viewport = { cx: -900, cy: -400, zoom: 6, angle: 0 }
    for (const mid of [{ x: 80, y: 60 }, { x: 900, y: 700 }]) {
      const held = screenToWorld(mid.x, mid.y, vp)
      const where = worldToScreen(held.x, held.y, pinchViewport(vp, mid, mid, 1, 0.5, FLOOR))
      expect(where.x).toBeCloseTo(mid.x)
      expect(where.y).toBeCloseTo(mid.y)
    }
  })

  it('stops translating once the zoom hits its limit', () => {
    // The centre used to move by the requested factor even when the zoom was
    // clamped, so pinching further at the stop kept dragging the view while
    // nothing visibly changed size.
    const vp: Viewport = { cx: 200, cy: 150, zoom: ZOOM_MAX, angle: 0 }
    const mid = { x: 640, y: 400 }
    const after = pinchViewport(vp, mid, mid, 1.4, 0, FLOOR)
    expect(after.zoom).toBe(ZOOM_MAX)
    expect(after.cx).toBeCloseTo(vp.cx)
    expect(after.cy).toBeCloseTo(vp.cy)
  })

  it('is a no-op when the fingers hold still', () => {
    const vp: Viewport = { cx: 300, cy: -120, zoom: 3.3, angle: 1.2 }
    const mid = { x: 77, y: 512 }
    const after = pinchViewport(vp, mid, mid, 1, 0, FLOOR)
    expect(after.cx).toBeCloseTo(vp.cx)
    expect(after.cy).toBeCloseTo(vp.cy)
    expect(after.zoom).toBeCloseTo(vp.zoom)
    expect(after.angle).toBeCloseTo(vp.angle)
  })

  it('respects the zoom floor', () => {
    const vp: Viewport = { cx: 0, cy: 0, zoom: 0.05, angle: 0 }
    expect(pinchViewport(vp, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.1, 0, FLOOR).zoom).toBe(FLOOR)
  })
})

describe('minZoom (#363)', () => {
  // These tests run under vitest's `node` environment, which has no window —
  // deviceNativeZoom (which the infinite branch scales by) reads
  // window.devicePixelRatio live, so each case installs its own.
  function withDpr<T>(dpr: number, fn: () => T): T {
    const had = 'window' in globalThis
    const previous = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { devicePixelRatio: dpr }
    try { return fn() } finally {
      if (had) (globalThis as { window?: unknown }).window = previous
      else delete (globalThis as { window?: unknown }).window
    }
  }

  it('lets an infinite room zoom out to exactly the 10% its readout shows', () => {
    // The header shows vp.zoom / deviceNativeZoom() as a percentage, so the
    // floor has to be expressed against that same base — the whole point of
    // scaling it rather than hardcoding a vp.zoom value.
    withDpr(1, () => expect(minZoom(true)).toBeCloseTo(0.1))
    // DPR below 1 (browser zoomed out) is where a bare 0.1 would silently
    // mean a different percentage — and a different tile count, which is the
    // thing actually being bounded.
    withDpr(0.5, () => expect(minZoom(true)).toBeCloseTo(0.1 * deviceNativeZoom()))
  })

  it('is unchanged for bounded rooms, whatever the DPR', () => {
    // A bounded room composites one fixed page however small it is drawn, so
    // it never had the cost that motivated the infinite floor.
    withDpr(1, () => expect(minZoom(false)).toBe(0.04))
    withDpr(3, () => expect(minZoom(false)).toBe(0.04))
  })

  it('never lets an infinite room out further than a bounded one', () => {
    withDpr(1, () => expect(minZoom(true)).toBeGreaterThan(minZoom(false)))
  })
})

describe('holdAngle (#458 rotation lock)', () => {
  const prev: Viewport = { cx: 100, cy: 200, zoom: 2, angle: 0.5 }

  it('passes the update straight through when unlocked', () => {
    const next: Viewport = { cx: 10, cy: 20, zoom: 3, angle: 1.2 }
    expect(holdAngle(prev, next, false)).toBe(next)
  })

  it('pins the angle while locked, and nothing else', () => {
    const next: Viewport = { cx: 10, cy: 20, zoom: 3, angle: 1.2 }
    // Pan and zoom are untouched: the lock holds the canvas still, it does not
    // freeze the view.
    expect(holdAngle(prev, next, true)).toEqual({ cx: 10, cy: 20, zoom: 3, angle: 0.5 })
  })

  it('holds against a reset to 0 as firmly as against a turn', () => {
    // The header's quarter-turn click, the reset hotkey and minimal UI's
    // "reset view" all arrive here as an angle write like any other — a lock
    // that let 0 through would be undone by the button next to it.
    expect(holdAngle(prev, { ...prev, angle: 0 }, true).angle).toBe(0.5)
  })

  it('allocates nothing when the update leaves the angle alone', () => {
    // Every pan and zoom frame of every gesture goes through this — including
    // the rAF-throttled hot path — so the common case must not copy.
    const next: Viewport = { ...prev, cx: 111 }
    expect(holdAngle(prev, next, true)).toBe(next)
  })
})

describe('fitZoom', () => {
  const canvas = { width: 2000, height: 1000 }

  it('fits the tighter of the two axes, with a margin', () => {
    expect(fitZoom(1000, 1000, canvas, 0)).toBeCloseTo(1000 / 2000 * 0.88)
    expect(fitZoom(4000, 500, canvas, 0)).toBeCloseTo(500 / 1000 * 0.88)
  })

  it('keeps a turned page inside the viewport (#458)', () => {
    // The lock lets "fit" be asked for at a non-zero angle. Fitting the
    // upright width/height there would push the corners off-screen.
    const angle = Math.PI / 6
    const zoom = fitZoom(1200, 900, canvas, angle)
    const cos = Math.abs(Math.cos(angle))
    const sin = Math.abs(Math.sin(angle))
    expect((canvas.width * cos + canvas.height * sin) * zoom).toBeLessThanOrEqual(1200)
    expect((canvas.width * sin + canvas.height * cos) * zoom).toBeLessThanOrEqual(900)
  })

  it('is symmetric under a quarter turn', () => {
    // 90° swaps the page's own axes; 180° is the upright case again.
    expect(fitZoom(1200, 900, canvas, Math.PI / 2))
      .toBeCloseTo(fitZoom(1200, 900, { width: 1000, height: 2000 }, 0))
    expect(fitZoom(1200, 900, canvas, Math.PI)).toBeCloseTo(fitZoom(1200, 900, canvas, 0))
  })
})
