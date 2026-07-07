import { describe, expect, it } from 'vitest'

import { RULER_SNAP_TOLERANCE_PX, snapToRuler } from './rulerSnap'

// Pure geometry tests for the ruler tool's snapping math (#89) — see
// index.ruler.test.ts for the engine-level integration test verifying this
// actually gets applied to a live-drawn stroke's recorded dabs.

describe('snapToRuler', () => {
  const horizontal = { a: { x: 0, y: 10 }, b: { x: 100, y: 10 } }

  it('leaves a point already on the line unchanged', () => {
    expect(snapToRuler(50, 10, horizontal)).toEqual({ x: 50, y: 10 })
  })

  it('projects a nearby off-line point onto the line', () => {
    const p = snapToRuler(50, 10 + RULER_SNAP_TOLERANCE_PX / 2, horizontal)
    expect(p.x).toBeCloseTo(50, 6)
    expect(p.y).toBeCloseTo(10, 6)
  })

  it('snaps onto the line even beyond the segment\'s own endpoints (infinite-line snap — see doc comment)', () => {
    const p = snapToRuler(150, 15, horizontal)
    expect(p.x).toBeCloseTo(150, 6)
    expect(p.y).toBeCloseTo(10, 6)
  })

  it('snaps exactly at the tolerance boundary', () => {
    const y = 10 + RULER_SNAP_TOLERANCE_PX
    const p = snapToRuler(50, y, horizontal)
    expect(p.x).toBeCloseTo(50, 6)
    expect(p.y).toBeCloseTo(10, 6)
  })

  it('leaves the point unchanged once farther than the tolerance', () => {
    const y = 10 + RULER_SNAP_TOLERANCE_PX + 5
    expect(snapToRuler(50, y, horizontal)).toEqual({ x: 50, y })
  })

  it('handles a diagonal ruler line', () => {
    const diag = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }
    // (6, 4) projects onto y = x at (5, 5), distance sqrt(2) ~= 1.41
    const p = snapToRuler(6, 4, diag, 5)
    expect(p.x).toBeCloseTo(5, 6)
    expect(p.y).toBeCloseTo(5, 6)
  })

  it('treats a degenerate (near-zero-length, still-being-placed) ruler as a no-op', () => {
    const degenerate = { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } }
    expect(snapToRuler(50, 50, degenerate)).toEqual({ x: 50, y: 50 })
  })

  it('respects a custom tolerance override', () => {
    // 20px away vertically; a 5px tolerance should not snap it.
    expect(snapToRuler(50, 30, horizontal, 5)).toEqual({ x: 50, y: 30 })
  })

  it('a vertical ruler line snaps in x, leaves y alone', () => {
    const vertical = { a: { x: 40, y: 0 }, b: { x: 40, y: 100 } }
    const p = snapToRuler(45, 60, vertical, 10)
    expect(p.x).toBeCloseTo(40, 6)
    expect(p.y).toBeCloseTo(60, 6)
  })
})
