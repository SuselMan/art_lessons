import { describe, it, expect } from 'vitest'

import { PinchTracker, PINCH_DISTANCE_FLOOR_PX } from './pinchTracker'

const DEG = Math.PI / 180

/** Two fingers `separation` apart, centred on `cx`/`cy`, the pair turned by
 *  `angle`. Mirrors how a real pair sits on the glass. */
function pair(cx: number, cy: number, separation: number, angle = 0): [FingerPoint, FingerPoint] {
  const hx = Math.cos(angle) * separation / 2
  const hy = Math.sin(angle) * separation / 2
  return [{ x: cx - hx, y: cy - hy }, { x: cx + hx, y: cy + hy }]
}

interface FingerPoint { x: number; y: number }

/** Walks the fingers from `from` apart to `to` apart over `frames` events, both
 *  moving together as they do on real hardware. Returns the frame it announced
 *  on, or null. A single giant jump is not used for this: the tracker measures
 *  its noise floor from the gesture's own step size, so one 60 px leap is a step
 *  as much as it is a signal — it takes a second event to tell them apart, which
 *  is a distinction a real gesture makes for free by arriving in many events. */
function spreadTo(t: PinchTracker, from: number, to: number, frames = 8, angle = 0): number | null {
  let announced: number | null = null
  for (let i = 0; i <= frames; i++) {
    const separation = from + (to - from) * (i / frames)
    if (t.move(...pair(600, 400, separation, angle)) && announced === null) announced = i
  }
  return announced
}

/** Same, for a pure rotation at fixed separation. */
function turnTo(t: PinchTracker, angle: number, frames = 8, separation = 240): number | null {
  let announced: number | null = null
  for (let i = 0; i <= frames; i++) {
    if (t.move(...pair(600, 400, separation, angle * (i / frames))) && announced === null) announced = i
  }
  return announced
}

/** Replays a two-finger gesture the way useViewport sees it: one `move` call per
 *  `pointermove`, i.e. one finger updated at a time while the other holds its
 *  last reported position. `steps` returns both fingers' true positions at frame
 *  `i`; the interleaving is applied here. Returns the frame index the tracker
 *  announced on, or null.
 */
function replayInterleaved(
  t: PinchTracker,
  frames: number,
  at: (i: number) => [FingerPoint, FingerPoint],
): number | null {
  let announced: number | null = null
  let [a, b] = at(0)
  for (let i = 1; i <= frames; i++) {
    const [na, nb] = at(i)
    // Finger A's event arrives first: A is fresh, B is one step stale.
    a = na
    if (t.move(a, b) && announced === null) announced = i
    // Then B's.
    b = nb
    if (t.move(a, b) && announced === null) announced = i
  }
  return announced
}

describe('PinchTracker', () => {
  it('stays quiet while two fingers hold still', () => {
    const t = new PinchTracker()
    const [a, b] = pair(600, 400, 240)
    for (let i = 0; i < 60; i++) expect(t.move(a, b)).toBe(false)
    expect(t.isActive).toBe(false)
    expect(t.end()).toBe(false)
  })

  it('stays quiet through a slow two-finger pan', () => {
    const t = new PinchTracker()
    // 2 px per event — the interleaving artefact is small, but so is the margin
    // a fixed threshold would have had.
    expect(replayInterleaved(t, 60, i => pair(400 + i * 2, 300 + i * 1.5, 240))).toBeNull()
    expect(t.isActive).toBe(false)
  })

  it('stays quiet through a fast two-finger pan', () => {
    const t = new PinchTracker()
    // 14 px per event at 240 px separation: the artefact alone is ~6%, which is
    // what defeated a fixed relative threshold and is the case QA caught.
    expect(replayInterleaved(t, 40, i => pair(300 + i * 14, 250 + i * 9, 240))).toBeNull()
    expect(t.isActive).toBe(false)
  })

  it('stays quiet through a fast pan with the fingers close together', () => {
    const t = new PinchTracker()
    // The worst case for anything relative: a 12 px step at only 70 px apart is
    // a 17% swing in separation and ~10° of apparent rotation per event.
    expect(replayInterleaved(t, 40, i => pair(300 + i * 12, 300 + i * 12, 70))).toBeNull()
    expect(t.isActive).toBe(false)
  })

  it('stays quiet through an accelerating pan, where one step outgrows the last', () => {
    const t = new PinchTracker()
    // maxStep is measured from the gesture so far, so a step larger than any
    // seen yet is the one moment the measured floor lags reality —
    // PINCH_STEP_MARGIN is the headroom that covers it.
    expect(replayInterleaved(t, 20, i => pair(300 + i * i * 0.8, 300, 200))).toBeNull()
    expect(t.isActive).toBe(false)
  })

  it('announces a pinch even while the hand also pans', () => {
    const t = new PinchTracker()
    // The realistic gesture: fingers spreading *and* the midpoint drifting.
    const frame = replayInterleaved(t, 30, i => pair(400 + i * 6, 300 + i * 4, 200 + i * 8))
    expect(frame).not.toBeNull()
    expect(frame!).toBeLessThan(8)
    expect(t.isActive).toBe(true)
  })

  it('announces a rotation even while the hand also pans', () => {
    const t = new PinchTracker()
    const frame = replayInterleaved(t, 30, i => pair(400 + i * 6, 300 + i * 4, 240, i * 2 * DEG))
    expect(frame).not.toBeNull()
    expect(frame!).toBeLessThan(10)
  })

  it('announces exactly once, then stays silent for the rest of the gesture', () => {
    const t = new PinchTracker()
    expect(spreadTo(t, 240, 300)).not.toBeNull()
    expect(t.isActive).toBe(true)
    // Every later frame is silent — the caller has been told, and a per-frame
    // `true` would be a per-frame re-render.
    expect(t.move(...pair(600, 400, 400))).toBe(false)
    expect(t.move(...pair(600, 400, 900))).toBe(false)
  })

  it('announces fingers closing as readily as spreading', () => {
    const t = new PinchTracker()
    expect(spreadTo(t, 240, 190)).not.toBeNull()
    expect(t.isActive).toBe(true)
  })

  it('recognizes rotation in either direction', () => {
    for (const sign of [1, -1]) {
      const t = new PinchTracker()
      expect(turnTo(t, sign * 15 * DEG)).not.toBeNull()
      expect(t.isActive).toBe(true)
    }
  })

  it('accumulates a slow pinch instead of measuring frame to frame', () => {
    const t = new PinchTracker()
    // Fingers spreading 0.6 px per event — no single frame is anywhere near the
    // floor, but the gesture as a whole crosses it. The case a previous-frame
    // comparison would never catch.
    let fired = false
    for (let i = 0; i < 40; i++) {
      if (t.move(...pair(600, 400, 240 + i * 0.6))) fired = true
    }
    expect(fired).toBe(true)
  })

  it('ignores tremor below the absolute floor', () => {
    const t = new PinchTracker()
    t.move(...pair(600, 400, 240))
    // Jitter of a couple of pixels, in both directions, forever.
    for (let i = 0; i < 60; i++) {
      const jitter = (i % 2 === 0 ? 1 : -1) * (PINCH_DISTANCE_FLOOR_PX / 3)
      expect(t.move(...pair(600, 400, 240 + jitter))).toBe(false)
    }
  })

  it('reads rotation across the ±π seam as the short way round', () => {
    const t = new PinchTracker()
    // A near-horizontal pair has an atan2 angle close to π, and turning it a
    // degree flips the sign. Without shortest-path handling that reads as nearly
    // a full turn, i.e. instantly significant.
    expect(t.move(...pair(600, 400, 240, Math.PI - 0.4 * DEG))).toBe(false)
    expect(t.move(...pair(600, 400, 240, -(Math.PI - 0.4 * DEG)))).toBe(false)
    // A real turn from there still registers.
    expect(t.move(...pair(600, 400, 240, -(Math.PI - 6 * DEG)))).toBe(true)
  })

  it('measures a second pinch in the same sequence from its own start', () => {
    const t = new PinchTracker()
    expect(spreadTo(t, 240, 480)).not.toBeNull()
    expect(t.end()).toBe(true)

    // A fresh gesture beginning 480 apart must not be compared against 240 — it
    // is 240 px away from there, which would report significance before the
    // fingers had moved at all. The measured step floor resets with it.
    expect(t.move(...pair(600, 400, 480))).toBe(false)
    expect(t.isActive).toBe(false)
    expect(spreadTo(t, 480, 520)).not.toBeNull()
  })

  it('reports an end only when a gesture was announced', () => {
    const t = new PinchTracker()
    // Nothing announced → nothing to end, so a two-finger pan lifting off stays
    // silent rather than hiding a readout that was never shown.
    expect(t.end()).toBe(false)

    expect(spreadTo(t, 240, 300)).not.toBeNull()
    expect(t.end()).toBe(true)
    // Idempotent: useViewport calls this from both the pointerup path and the
    // visibilitychange/blur reset, and both can run for the same gesture.
    expect(t.end()).toBe(false)
  })

  it('survives two fingers reported at the same point', () => {
    const t = new PinchTracker()
    const same = { x: 600, y: 400 }
    expect(t.move(same, same)).toBe(false)
    // No origin was taken from the degenerate frame, so the first real one sets
    // it — rather than every later frame dividing by a zero separation.
    expect(t.move(...pair(600, 400, 240))).toBe(false)
    expect(spreadTo(t, 240, 240 + PINCH_DISTANCE_FLOOR_PX * 4)).not.toBeNull()
  })

  it('scales its rotation threshold with how far apart the fingers are', () => {
    // The same lagging step swings a narrow pair much further than a wide one,
    // so the rotation floor has to account for separation. Both pans stay quiet.
    const narrow = new PinchTracker()
    expect(replayInterleaved(narrow, 30, i => pair(300 + i * 10, 300, 60))).toBeNull()

    const wide = new PinchTracker()
    expect(replayInterleaved(wide, 30, i => pair(300 + i * 10, 300, 600))).toBeNull()

    // And a deliberate turn registers at either separation.
    for (const separation of [60, 600]) {
      const t = new PinchTracker()
      expect(turnTo(t, 15 * DEG, 8, separation)).not.toBeNull()
    }
  })
})
