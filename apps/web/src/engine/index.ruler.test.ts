// Engine-level integration tests for the ruler tool (#89): verifies that
// snapping happens where it has to — inside the real pointer pipeline,
// before dabs are generated (PencilEngine._onStart/_onMove, via
// _snapPoint/snapToRuler) — so a *recorded* stroke Operation already
// contains the straightened geometry (what replay/undo/a peer would see),
// not just that the pure snapToRuler() function is correct in isolation
// (see rulerSnap.test.ts for that). Also verifies the ruler itself never
// shows up in the operation log, per #89's own "not part of the drawing"
// scope note (same status as the grid/measure overlays).
import { describe, expect, it } from 'vitest'

import type { StrokeOperation } from '@art-lessons/shared'

import { createTestEngine, makeLayerAdd, simulateStroke } from './testing/engineTestUtils'

// A hand-drawn path that wobbles a few px above/below y=20 — comfortably
// inside RULER_SNAP_TOLERANCE_PX (28) the whole way.
const WOBBLY_NEAR_RULER = [
  { x: 5,  y: 18 },
  { x: 15, y: 23 },
  { x: 30, y: 17 },
  { x: 45, y: 22 },
  { x: 55, y: 19 },
]

// Same horizontal shape, translated far below the ruler line — comfortably
// outside RULER_SNAP_TOLERANCE_PX (28) for the whole stroke (the wobble's
// own y range is 17-23, so it needs more than a 28-5=23px shift to clear
// tolerance at every sample, not just on average).
const WOBBLY_FAR_FROM_RULER = WOBBLY_NEAR_RULER.map(p => ({ x: p.x, y: p.y + 60 }))

describe('ruler tool (#89): live-stroke snapping', () => {
  it('snaps a wobbly drag onto the ruler line, and records only the stroke (no separate ruler operation)', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    engine.setActiveLayer('L1')

    // Horizontal ruler along y = 20, from x=0 to x=60.
    engine.setRuler({ a: { x: 0, y: 20 }, b: { x: 60, y: 20 } })
    simulateStroke(engine, WOBBLY_NEAR_RULER)

    const ops = engine.getOperations()
    // Exactly layer_add + the one stroke — the ruler itself never becomes
    // an Operation of its own.
    expect(ops).toHaveLength(2)
    expect(ops.map(op => op.type)).toEqual(['layer_add', 'stroke'])
    const stroke = ops[1] as StrokeOperation
    expect(stroke.type).toBe('stroke')
    expect(stroke.dabs.length).toBeGreaterThan(0)
    for (const d of stroke.dabs) {
      expect(d.y).toBeCloseTo(20, 5)
    }
  })

  it('leaves a stroke that stays outside the snap tolerance untouched', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 96, height: 96 })
    engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    engine.setActiveLayer('L1')

    engine.setRuler({ a: { x: 0, y: 20 }, b: { x: 60, y: 20 } })
    simulateStroke(engine, WOBBLY_FAR_FROM_RULER)

    const stroke = engine.getOperations()[1] as StrokeOperation
    for (const d of stroke.dabs) {
      expect(d.y).not.toBeCloseTo(20, 0)
    }
    // The original wobble survives — it wasn't flattened onto any line.
    const ys = stroke.dabs.map(d => d.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1)
  })

  it('setRuler(null) turns snapping back off', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    engine.setActiveLayer('L1')

    engine.setRuler({ a: { x: 0, y: 20 }, b: { x: 60, y: 20 } })
    engine.setRuler(null)
    simulateStroke(engine, WOBBLY_NEAR_RULER)

    const stroke = engine.getOperations()[1] as StrokeOperation
    const ys = stroke.dabs.map(d => d.y)
    // Original wobble preserved, not flattened onto y=20.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1)
  })

  it('a diagonal ruler snaps a near stroke onto its exact slope', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L1'))
    engine.setActiveLayer('L1')

    // y = x diagonal ruler.
    engine.setRuler({ a: { x: 0, y: 0 }, b: { x: 60, y: 60 } })
    simulateStroke(engine, [
      { x: 5,  y: 8 },
      { x: 20, y: 15 },
      { x: 35, y: 32 },
      { x: 50, y: 45 },
    ])

    const stroke = engine.getOperations()[1] as StrokeOperation
    expect(stroke.dabs.length).toBeGreaterThan(0)
    for (const d of stroke.dabs) {
      expect(d.x).toBeCloseTo(d.y, 4)
    }
  })
})
