// Engine-level integration tests for #120: layer_transform (translate/scale/
// rotate baked into a layer's own buffer). Two things specifically worth
// nailing down with a *real* PencilEngine (via MockGL — see testing/mockGL.ts),
// not just type-checking the shared shape:
//
//   1. The transform actually moves pixels where the matrix says it should —
//      verified against an independent reference painted directly at the
//      expected position, the same "ground truth" pattern
//      index.structuralUndo.test.ts already uses for merge/undo.
//   2. One operation transforming several layers undoes/redoes them all
//      together as a single atomic step (the whole point of #120's "one
//      operation for the group, not a group of operations" design) — not as
//      independent per-layer undo steps.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerTransform, readLayerPixels,
} from './testing/engineTestUtils'

describe('layer_transform: bakes an affine transform into layer content', () => {
  it('translates a layer\'s content by an exact pixel offset, matching a reference painted directly at the shifted position', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))

    // Pure integer translate — the mock's nearest-neighbor resample lands
    // exactly on source pixel centers for an integer offset (no bilinear
    // ambiguity to account for), so this should match a reference painted
    // directly at (12, 4) byte-for-byte.
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 8, 0] }]))

    const { engine: refEngine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
    refEngine.appendOperation(fillStroke('user-a', 'L', 12, 4, 3))

    expectPixelsEqual(readLayerPixels(engine, 'L'), readLayerPixels(refEngine, 'L'))
  })

  it('undo restores the pre-transform content exactly', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))
    const before = readLayerPixels(engine, 'L')!

    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 8, 0] }]))
    expect(readLayerPixels(engine, 'L')).not.toEqual(before)

    expect(engine.undo()?.type).toBe('layer_transform')
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })
})

describe('layer_transform: multi-layer atomicity (#120)', () => {
  it('one operation transforming two layers undoes/redoes both together, not independently', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))
    engine.appendOperation(fillStroke('user-a', 'B', 4, 4, 3))
    const beforeA = readLayerPixels(engine, 'A')!
    const beforeB = readLayerPixels(engine, 'B')!

    engine.appendOperation(makeLayerTransform('user-a', [
      { layerId: 'A', matrix: [1, 0, 0, 1, 8, 0] }, // A moves right
      { layerId: 'B', matrix: [1, 0, 0, 1, 0, 8] }, // B moves down
    ]))

    const { engine: refA } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    refA.appendOperation(makeLayerAdd('user-a', 'A'))
    refA.appendOperation(fillStroke('user-a', 'A', 12, 4, 3))
    expectPixelsEqual(readLayerPixels(engine, 'A'), readLayerPixels(refA, 'A'))

    const { engine: refB } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    refB.appendOperation(makeLayerAdd('user-a', 'B'))
    refB.appendOperation(fillStroke('user-a', 'B', 4, 12, 3))
    expectPixelsEqual(readLayerPixels(engine, 'B'), readLayerPixels(refB, 'B'))

    // A single undo() call must revert BOTH layers in one step — if this
    // only reverted one of them, the log would have split what should be
    // one transaction into two, exactly the bug #120's design (one op for
    // the whole group) was chosen to rule out.
    expect(engine.undo()?.type).toBe('layer_transform')
    expectPixelsEqual(readLayerPixels(engine, 'A'), beforeA)
    expectPixelsEqual(readLayerPixels(engine, 'B'), beforeB)

    expect(engine.redo()?.type).toBe('layer_transform')
    expectPixelsEqual(readLayerPixels(engine, 'A'), readLayerPixels(refA, 'A'))
    expectPixelsEqual(readLayerPixels(engine, 'B'), readLayerPixels(refB, 'B'))
  })
})

describe('getContentBounds: content bounding box for the transform gizmo (#120)', () => {
  it('returns null for a layer with nothing painted on it', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    expect(engine.getContentBounds('L')).toBeNull()
  })

  it('shifts by the exact same offset a translate transform applied to the same content', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))

    const before = engine.getContentBounds('L')
    expect(before).not.toBeNull()

    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 8, 0] }]))
    const after = engine.getContentBounds('L')

    // The bounding box is exactly as translate-invariant as the pixels
    // themselves (see the exact-offset test above) — same box, shifted by
    // the same integer delta, not just "some box that changed".
    expect(after).toEqual({ ...before, x: before!.x + 8 })
  })
})

// (#421) The gizmo's frame is exactly getContentBounds, and the tracker
// behind it only ever grows: a bake marks each destination tile with the
// axis-aligned box of its source's *rotated* content rect, so every rotation
// inflates it and the next one inflates the inflated one. What the user sees
// is a selection that hugs the drawing the first time and grabs more and more
// empty paper on every re-entry. tightenContentBounds is the correction pass.
//
// Content is a disc centered in the canvas on purpose: its true bounding box
// is rotation-invariant, so "tight" is a number this test can state outright
// rather than derive per angle. Centered also keeps it symmetric about the
// tile's own middle, which is what lets these assertions ignore the mock's
// top-down readPixels rows (real GL hands them back bottom-up — see
// scanLocalContentRect's own note on the flip).
describe('tightenContentBounds: keeps the transform frame on the content (#421)', () => {
  const SIZE = 64, CX = 32, CY = 32
  // CSS/SVG matrix(a,b,c,d,e,f) — x' = ax + cy + e, y' = bx + dy + f, same
  // convention the translate tests above use.
  const rotateAbout = (deg: number, cx: number, cy: number): [number, number, number, number, number, number] => {
    const t = (deg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
    return [cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos]
  }
  const spin = (engine: ReturnType<typeof createTestEngine>['engine'], turns: number, tighten: boolean): void => {
    for (let i = 0; i < turns; i++) {
      engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: rotateAbout(45, CX, CY) }]))
      if (tighten) engine.tightenContentBounds('L')
    }
  }
  const paintDisc = (): ReturnType<typeof createTestEngine>['engine'] => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: SIZE, height: SIZE })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', CX, CY, 6))
    return engine
  }

  it('a rotation inflates the tracked box, and tightening puts it back on the pixels', () => {
    const engine = paintDisc()
    engine.tightenContentBounds('L')
    const tight = engine.getContentBounds('L')!

    spin(engine, 1, false)
    const inflated = engine.getContentBounds('L')!
    // Not an incidental difference: 45° on an axis-aligned box is the worst
    // case, ~1.41x per side. Asserting the inflation exists at all is what
    // makes the tightened numbers below mean something.
    expect(inflated.width).toBeGreaterThan(tight.width * 1.2)

    engine.tightenContentBounds('L')
    const retightened = engine.getContentBounds('L')!
    // A disc's own box doesn't change under rotation; the couple of pixels of
    // slack are the resample's edge, not the tracker's.
    expect(Math.abs(retightened.width - tight.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(retightened.height - tight.height)).toBeLessThanOrEqual(2)
  })

  it('stops the frame compounding across repeated rotations', () => {
    const tightened = paintDisc()
    tightened.tightenContentBounds('L')
    const start = tightened.getContentBounds('L')!
    spin(tightened, 4, true)

    const drifting = paintDisc()
    spin(drifting, 4, false)

    // Four rotations is a modest session — rotate, look, rotate again. Left
    // to the tracker alone the frame ends up half again as wide as the
    // drawing (this is the reported bug); tightened, it stays put.
    expect(drifting.getContentBounds('L')!.width).toBeGreaterThan(start.width * 1.5)
    expect(Math.abs(tightened.getContentBounds('L')!.width - start.width)).toBeLessThanOrEqual(3)
  })

  it('is a no-op for a layer that does not exist', () => {
    const engine = paintDisc()
    expect(() => engine.tightenContentBounds('nope')).not.toThrow()
  })
})
