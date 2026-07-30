import { describe, it, expect } from 'vitest'

import { PinchTracker, PINCH_ZOOM_EPSILON, PINCH_ANGLE_EPSILON } from './pinchTracker'

const DEG = Math.PI / 180

/** A gesture frame: `from` is the viewport before this frame, and the tracker is
 *  told where it is being moved to. Mirrors how useViewport calls it. */
function frame(t: PinchTracker, fromZoom: number, fromAngle: number, toZoom: number, toAngle: number): boolean {
  return t.move({ zoom: fromZoom, angle: fromAngle }, toZoom, toAngle)
}

describe('PinchTracker', () => {
  it('stays quiet for a two-finger pan that changes neither zoom nor angle', () => {
    const t = new PinchTracker()
    // Two fingers dragging in parallel: the same branch runs, scale is 1 and
    // dAngle is 0, so nothing here is a pinch.
    for (let i = 0; i < 60; i++) expect(frame(t, 1, 0, 1, 0)).toBe(false)
    expect(t.isActive).toBe(false)
    expect(t.end()).toBe(false)
  })

  it('stays quiet for sub-threshold wobble held over many frames', () => {
    const t = new PinchTracker()
    // Jitter that never accumulates: alternating either side of the start,
    // which is what two fingers on a real digitizer produce while panning.
    for (let i = 0; i < 60; i++) {
      const wobble = i % 2 === 0 ? 1.002 : 0.998
      expect(frame(t, 1, 0, wobble, (i % 2 === 0 ? 0.2 : -0.2) * DEG)).toBe(false)
    }
    expect(t.isActive).toBe(false)
  })

  it('announces a zoom exactly once, on the frame it crosses the threshold', () => {
    const t = new PinchTracker()
    expect(frame(t, 1, 0, 1.005, 0)).toBe(false)
    expect(frame(t, 1.005, 0, 1.02, 0)).toBe(true)
    expect(t.isActive).toBe(true)
    // Every later frame of the same gesture is silent — the caller has already
    // been told, and a per-frame `true` would be a per-frame re-render.
    expect(frame(t, 1.02, 0, 1.5, 0)).toBe(false)
    expect(frame(t, 1.5, 0, 3, 0)).toBe(false)
  })

  it('announces a rotation with no zoom change at all', () => {
    const t = new PinchTracker()
    expect(frame(t, 1, 0, 1, 0.5 * DEG)).toBe(false)
    expect(frame(t, 1, 0.5 * DEG, 1, 2 * DEG)).toBe(true)
  })

  it('accumulates a slow pinch instead of measuring frame to frame', () => {
    const t = new PinchTracker()
    // 20 frames of 0.2% each: no single frame is anywhere near the 1%
    // threshold, but the gesture as a whole passes it. This is the case a
    // previous-frame comparison would never catch.
    let zoom = 1
    let fired = false
    for (let i = 0; i < 20; i++) {
      const next = zoom * 1.002
      if (frame(t, zoom, 0, next, 0)) fired = true
      zoom = next
    }
    expect(fired).toBe(true)
  })

  it('measures a second pinch in the same sequence from its own start', () => {
    const t = new PinchTracker()
    expect(frame(t, 1, 0, 2, 0)).toBe(true)
    expect(t.end()).toBe(true)

    // A fresh gesture beginning at 2x must not be compared against 1x — it is
    // already 100% away from there, which would report significance before the
    // fingers had moved at all.
    expect(frame(t, 2, 0, 2, 0)).toBe(false)
    expect(t.isActive).toBe(false)
    expect(frame(t, 2, 0, 2.1, 0)).toBe(true)
  })

  it('reports an end only when a gesture was announced', () => {
    const t = new PinchTracker()
    // Nothing announced → nothing to end, so a two-finger pan lifting off stays
    // silent rather than hiding a readout that was never shown.
    expect(t.end()).toBe(false)

    expect(frame(t, 1, 0, 1.5, 0)).toBe(true)
    expect(t.end()).toBe(true)
    // Idempotent: useViewport calls this from both the pointerup path and the
    // visibilitychange/blur reset, and both can run for the same gesture.
    expect(t.end()).toBe(false)
  })

  it('goes quiet once a pinch is clamped against the zoom limit', () => {
    const t = new PinchTracker()
    // useViewport passes the clamped target. At the 20x ceiling the fingers
    // keep moving but zoom does not, so a gesture that has not yet been
    // announced must not be announced by movement that had no effect.
    expect(frame(t, 20, 0, 20, 0)).toBe(false)
    expect(frame(t, 20, 0, 20, 0)).toBe(false)
    expect(t.isActive).toBe(false)
  })

  it('treats zoom multiplicatively, so the threshold means the same at both extremes', () => {
    // A fixed absolute epsilon would be unreachable near the 0.04 floor and
    // instantaneous near the 20 ceiling. Same relative step, same verdict.
    const low = new PinchTracker()
    expect(frame(low, 0.04, 0, 0.04 * (1 + PINCH_ZOOM_EPSILON * 2), 0)).toBe(true)

    const high = new PinchTracker()
    expect(frame(high, 20, 0, 20 * (1 + PINCH_ZOOM_EPSILON * 2), 0)).toBe(true)

    const lowQuiet = new PinchTracker()
    expect(frame(lowQuiet, 0.04, 0, 0.04 * (1 + PINCH_ZOOM_EPSILON / 2), 0)).toBe(false)

    const highQuiet = new PinchTracker()
    expect(frame(highQuiet, 20, 0, 20 * (1 + PINCH_ZOOM_EPSILON / 2), 0)).toBe(false)
  })

  it('recognizes rotation in either direction', () => {
    const ccw = new PinchTracker()
    expect(frame(ccw, 1, 0, 1, -(PINCH_ANGLE_EPSILON * 2))).toBe(true)

    const cw = new PinchTracker()
    expect(frame(cw, 1, 0, 1, PINCH_ANGLE_EPSILON * 2)).toBe(true)
  })

  it('measures rotation from the gesture start even past a full turn', () => {
    const t = new PinchTracker()
    // vp.angle accumulates unbounded (the header normalizes only for display),
    // so a gesture beginning at 370° must compare against 370°, not 10°.
    const start = 370 * DEG
    expect(frame(t, 1, start, 1, start + 0.2 * DEG)).toBe(false)
    expect(frame(t, 1, start + 0.2 * DEG, 1, start + 2 * DEG)).toBe(true)
  })
})
