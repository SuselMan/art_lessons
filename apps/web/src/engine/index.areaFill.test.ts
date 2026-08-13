// (#453) Engine-level behaviour of `area_fill`.
//
// Note what is deliberately *not* here: the fill algorithm itself. That runs
// only on the author's machine, over pixels read back from a real GPU, and
// MockGL neither paints graphite the way the real dab shader does nor encodes
// a PNG — a test of computeAreaFill here would be measuring the mock (see the
// project_mockgl_no_marker memory for the last time that lesson was learned).
// It has its own tests, on plain arrays, in src/floodFill.test.ts.
//
// What is worth checking here is the half that a permanent operation log
// depends on: a recorded fill lands where it says it lands, and it replays.
import { describe, expect, it } from 'vitest'

import {
  alphaAt as alphaAtIn, createTestEngine, fillStroke, installFakeImageDecoder, makeAreaFill,
  makeLayerAdd, readLayerPixels,
} from './testing/engineTestUtils'

const CANVAS = { width: 40, height: 40 }

const alphaAt = (pixels: Uint8Array, x: number, y: number) => alphaAtIn(pixels, x, y, CANVAS.width)

describe('area_fill', () => {
  it('stamps its raster at the recorded rect, the same way a paste does', () => {
    // The orientation trap #446 fell into is live again here, and one step
    // worse: computeAreaFill runs the fill in GL row order (bottom-up, as
    // readPixels hands it over) and converts the crop's y back to world space
    // on the way out. This asserts the half of that round trip which does not
    // need a GPU — that the *operation's* rect is read top-down, so a fill
    // recorded near the top of the canvas does not replay near the bottom.
    const restore = installFakeImageDecoder({ size: 8 })
    try {
      const { engine } = createTestEngine({ userId: 'user-a' }, CANVAS)
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      const op = makeAreaFill('user-a', 'L', { x: 6, y: 4, width: 10, height: 8 })
      return engine.preloadImages([op]).then(() => {
        engine.appendOperation(op)
        const pixels = readLayerPixels(engine, 'L')!

        expect(alphaAt(pixels, 8, 6)).toBeGreaterThan(200)
        expect(alphaAt(pixels, 15, 11)).toBeGreaterThan(200)
        expect(alphaAt(pixels, 8, 3)).toBe(0)
        expect(alphaAt(pixels, 8, 12)).toBe(0)
        // Mirrored about the canvas centre-line (y = 40 - 4 - 8) — where a
        // fill would land if anything on this path read GL's y as app-space.
        expect(alphaAt(pixels, 8, 30)).toBe(0)
      })
    } finally { restore() }
  })

  it('replays away on undo, leaving what was under it', () => {
    // A fill cannot be inverted in place any more than an erase can — undo
    // means rebuilding the layer from its own history without it. Worth
    // asserting rather than assuming: the fill joined isPixelOperation and
    // COVERABLE_OP_TYPES by hand, and a pixel operation missing from either
    // list fails exactly here and nowhere else.
    const restore = installFakeImageDecoder({ size: 8 })
    try {
      const { engine } = createTestEngine({ userId: 'user-a' }, CANVAS)
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      engine.appendOperation(fillStroke('user-a', 'L', 30, 30, 8))
      const op = makeAreaFill('user-a', 'L', { x: 4, y: 4, width: 10, height: 10 })
      return engine.preloadImages([op]).then(() => {
        engine.appendOperation(op)
        expect(alphaAt(readLayerPixels(engine, 'L')!, 8, 8)).toBeGreaterThan(200)

        engine.undo()
        const after = readLayerPixels(engine, 'L')!
        expect(alphaAt(after, 8, 8)).toBe(0)
        // The stroke it was poured next to is still there — the rebuild
        // replayed the layer's history, it did not clear it.
        expect(alphaAt(after, 30, 30)).toBeGreaterThan(200)
      })
    } finally { restore() }
  })
})
