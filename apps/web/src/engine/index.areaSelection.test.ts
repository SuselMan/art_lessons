// (#446) Engine-level behaviour of the three selection operations. What is
// being checked here is the part a browser run cannot check cheaply and a
// unit test can: that a masked operation touches the selected pixels and
// leaves the rest of the layer exactly as it was, that the lift is a move
// (hole included) rather than a copy, and that all of it survives
// undo/redo's own replay path.
//
// MockGL rasterizes both selection shaders faithfully enough for this (see
// its _rasterAreaTransform/_rasterAreaMask) — deliberately, because tagging
// AREA_TRANSFORM_FRAG as the ordinary transform would have made a whole-layer
// move look like a passing selection test.
import { describe, expect, it } from 'vitest'

import {
  alphaAt as alphaAtIn, createTestEngine, fillStroke, installFakeImageDecoder, makeAreaClear,
  makeAreaPaste, makeAreaTransform, makeLayerAdd, readLayerPixels,
} from './testing/engineTestUtils'
import { rectangleSelection } from './src/selectionMask'

const CANVAS = { width: 40, height: 40 }

/** Alpha at a canvas pixel of this file's one canvas size. */
const alphaAt = (pixels: Uint8Array, x: number, y: number) => alphaAtIn(pixels, x, y, CANVAS.width)

/** A layer with one solid disc painted over the whole canvas — every pixel of
 *  the 40x40 test canvas is covered, so any hole or move below is unambiguous
 *  rather than a question about where a dab's edge fell. */
function engineWithFilledLayer() {
  const { engine } = createTestEngine({ userId: 'user-a' }, CANVAS)
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.appendOperation(fillStroke('user-a', 'L', 20, 20, 40))
  return engine
}

describe('area_clear', () => {
  it('erases inside the selection and leaves everything outside untouched', () => {
    const engine = engineWithFilledLayer()
    const before = readLayerPixels(engine, 'L')!
    expect(alphaAt(before, 12, 12)).toBeGreaterThan(200)

    engine.appendOperation(makeAreaClear('user-a', 'L', rectangleSelection(8, 8, 20, 20)))
    const after = readLayerPixels(engine, 'L')!

    expect(alphaAt(after, 12, 12)).toBe(0)
    expect(alphaAt(after, 19, 19)).toBe(0)
    // One pixel past each edge of the selection is still exactly what it was.
    expect(alphaAt(after, 7, 12)).toBe(alphaAt(before, 7, 12))
    expect(alphaAt(after, 20, 12)).toBe(alphaAt(before, 20, 12))
    expect(alphaAt(after, 12, 7)).toBe(alphaAt(before, 12, 7))
    expect(alphaAt(after, 12, 20)).toBe(alphaAt(before, 12, 20))
  })

  it('is undoable — the erased region comes back with the rest of the layer intact', () => {
    const engine = engineWithFilledLayer()
    const before = readLayerPixels(engine, 'L')!

    engine.appendOperation(makeAreaClear('user-a', 'L', rectangleSelection(8, 8, 20, 20)))
    expect(alphaAt(readLayerPixels(engine, 'L')!, 12, 12)).toBe(0)

    engine.undo()
    expect(Array.from(readLayerPixels(engine, 'L')!)).toEqual(Array.from(before))
  })

  it('does nothing at all for a selection with no inside', () => {
    const engine = engineWithFilledLayer()
    const before = readLayerPixels(engine, 'L')!
    // A tap: three coincident points, no area. Reachable by hand with the
    // point-by-point lasso, so it must be inert rather than a thrown error.
    engine.appendOperation(makeAreaClear('user-a', 'L', { points: [10, 10, 10, 10, 10, 10] }))
    expect(Array.from(readLayerPixels(engine, 'L')!)).toEqual(Array.from(before))
  })
})

describe('area_transform', () => {
  it('moves the selected pixels and leaves a hole where they were', () => {
    const engine = engineWithFilledLayer()
    // Erase a band first, so "did the content move" is answerable: the
    // selection below covers a region that is half solid and half empty.
    engine.appendOperation(makeAreaClear('user-a', 'L', rectangleSelection(4, 4, 12, 12)))
    const before = readLayerPixels(engine, 'L')!
    expect(alphaAt(before, 6, 6)).toBe(0)
    expect(alphaAt(before, 16, 6)).toBeGreaterThan(200)

    // Take the 8x8 hole plus its solid neighbour to the right, and move the
    // whole 16x8 strip down by 20 px.
    engine.appendOperation(makeAreaTransform(
      'user-a', 'L', rectangleSelection(4, 4, 20, 12), [1, 0, 0, 1, 0, 20],
    ))
    const after = readLayerPixels(engine, 'L')!

    // Source region: emptied, hole and content alike.
    expect(alphaAt(after, 16, 6)).toBe(0)
    expect(alphaAt(after, 6, 6)).toBe(0)
    // Destination: the strip arrived.
    expect(alphaAt(after, 16, 26)).toBeGreaterThan(200)
    // …and it landed *over* what was already there rather than replacing it —
    // the transparent part of the moved strip does not punch through the
    // drawing underneath. Same rule every other editor's "move selection"
    // follows, and the reason the lift and the stamp are separate passes
    // rather than one copy of a rectangle.
    expect(alphaAt(after, 6, 26)).toBeGreaterThan(200)
    // Untouched part of the layer is still there.
    expect(alphaAt(after, 30, 6)).toBeGreaterThan(200)
  })

  it('moving a piece out over empty canvas and back by the exact inverse restores the layer', () => {
    // Deliberately a small mark on an otherwise empty layer, moved into empty
    // space. A round trip is only the identity when the destination was
    // empty: the stamp composites over whatever is already there, so moving a
    // piece onto existing drawing and back brings the merge back with it —
    // the pixels really are mixed by then, exactly as they would be in any
    // other editor once the selection is dropped.
    const { engine } = createTestEngine({ userId: 'user-a' }, CANVAS)
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 10, 10, 6))
    const before = readLayerPixels(engine, 'L')!

    engine.appendOperation(makeAreaTransform(
      'user-a', 'L', rectangleSelection(2, 2, 18, 18), [1, 0, 0, 1, 18, 0],
    ))
    expect(alphaAt(readLayerPixels(engine, 'L')!, 10, 10)).toBe(0)

    engine.appendOperation(makeAreaTransform(
      'user-a', 'L', rectangleSelection(20, 2, 36, 18), [1, 0, 0, 1, -18, 0],
    ))
    expect(Array.from(readLayerPixels(engine, 'L')!)).toEqual(Array.from(before))
  })

  it('is undoable, hole and all', () => {
    const engine = engineWithFilledLayer()
    engine.appendOperation(makeAreaClear('user-a', 'L', rectangleSelection(4, 4, 12, 12)))
    const before = readLayerPixels(engine, 'L')!

    engine.appendOperation(makeAreaTransform(
      'user-a', 'L', rectangleSelection(4, 4, 20, 12), [1, 0, 0, 1, 0, 20],
    ))
    engine.undo()

    expect(Array.from(readLayerPixels(engine, 'L')!)).toEqual(Array.from(before))
  })

  it('redo re-applies it exactly', () => {
    const engine = engineWithFilledLayer()
    engine.appendOperation(makeAreaTransform(
      'user-a', 'L', rectangleSelection(4, 4, 20, 12), [1, 0, 0, 1, 0, 20],
    ))
    const applied = readLayerPixels(engine, 'L')!

    engine.undo()
    engine.redo()

    expect(Array.from(readLayerPixels(engine, 'L')!)).toEqual(Array.from(applied))
  })

  it('scaling the selection to nothing still lifts it — the hole is real even when nothing lands', () => {
    const engine = engineWithFilledLayer()
    engine.appendOperation(makeAreaTransform(
      'user-a', 'L', rectangleSelection(8, 8, 20, 20), [0, 0, 0, 0, 0, 0],
    ))
    const after = readLayerPixels(engine, 'L')!

    expect(alphaAt(after, 12, 12)).toBe(0)
    expect(alphaAt(after, 30, 30)).toBeGreaterThan(200)
  })
})

describe('area_paste', () => {
  it('lands where the operation says, not mirrored about the canvas', () => {
    // The bug this exists for (#446): IMAGE_BLIT_FRAG read GL's bottom-up
    // `v_uv` as though it were app-space top-down. A fit-centered import is
    // symmetric, so nothing noticed for as long as that was the only caller;
    // paste places a raster at an arbitrary rect and came out flipped about
    // the canvas's horizontal centre-line — right in x, wrong in y, which is
    // exactly how it was reported.
    const restore = installFakeImageDecoder({ size: 8 })
    try {
      const { engine } = createTestEngine({ userId: 'user-a' }, CANVAS)
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      const op = makeAreaPaste('user-a', 'L', { x: 6, y: 4, width: 10, height: 8 })
      // Decoded up front, so the paste paints synchronously (see #398).
      return engine.preloadImages([op]).then(() => {
        engine.appendOperation(op)
        const pixels = readLayerPixels(engine, 'L')!

        // Inside the rect the stand-in raster is fully opaque…
        expect(alphaAt(pixels, 8, 6)).toBeGreaterThan(200)
        expect(alphaAt(pixels, 15, 11)).toBeGreaterThan(200)
        // …just outside it, nothing.
        expect(alphaAt(pixels, 8, 3)).toBe(0)
        expect(alphaAt(pixels, 8, 12)).toBe(0)
        expect(alphaAt(pixels, 5, 6)).toBe(0)
        expect(alphaAt(pixels, 16, 6)).toBe(0)
        // The mirrored position the old blit would have used (y = 40 - 4 - 8).
        expect(alphaAt(pixels, 8, 30)).toBe(0)
      })
    } finally { restore() }
  })
})

describe('a selection operation on a layer that is gone', () => {
  it('is revoked rather than silently kept in the log', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, CANVAS)
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 20, 20, 40))
    engine.appendOperation(makeAreaClear('user-a', 'missing-layer', rectangleSelection(4, 4, 12, 12)))

    // Nothing to apply it to, so it can never take effect — a later undo must
    // not be able to resurface it (#101's rule for every pixel operation).
    engine.undo()
    expect(alphaAt(readLayerPixels(engine, 'L')!, 20, 20)).toBe(0)
  })
})
