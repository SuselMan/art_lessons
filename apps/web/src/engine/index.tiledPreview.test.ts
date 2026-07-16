// Engine-level integration tests for #138: making the live-tip (#104),
// speculative-prediction (#92), and peer-stroke-reveal (previewOperation)
// preview buffers camera-relative for infinite-canvas rooms, the same way
// real tile content already is (see index.tiledDisplay.test.ts).
//
// Before #138, _composeToFBO returned early for infinite rooms *before* the
// block that blends these previews in at all — so for infinite rooms they
// never rendered, full stop. The fix (see PencilEngine._cameraCenteredOrigin/
// _translateDabs/_drawTileComposite in engine/index.ts) routes them through
// the same tile-positioning primitive real tile content uses, treating each
// preview buffer as a "tile" whose world origin is wherever the camera was
// when the buffer was created — so they now land at the correct screen
// position for whatever the current _infiniteCamera happens to be, not just
// near world origin.
//
// Every test below deliberately anchors its camera far from world origin
// (BASE, below) before painting anything into a preview buffer — proving the
// fix generalizes, rather than merely happening to work at (0,0) the way the
// pre-#138 raw-coordinate painting coincidentally did for bounded rooms.
import { describe, expect, it, vi } from 'vitest'

import {
  createTestEngine, dab, makeLayerAdd, makeStroke, paperReady, readCompositePixels,
  simulatePredictedSamples, simulateStrokeMove, simulateStrokeStart,
} from './testing/engineTestUtils'

// Reads one texel's alpha out of a readCompositePixels() Uint8Array (RGBA8,
// row-major, top-down — same convention _display() itself uses).
function alphaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4 + 3]
}

// An arbitrary world point far from the origin — every test below sets the
// camera here *before* creating any preview buffer, so its world-origin
// snapshot (_cameraCenteredOrigin) is centered here, not at (0,0). Preview
// content then stays within a small offset of BASE, well inside the fixed
// canvas-sized buffer's own local range (see _cameraCenteredOrigin's doc
// comment: it covers roughly canvas-size world units around wherever it was
// snapshotted, not the whole infinite plane).
const BASE = { x: 10_000, y: 5_000 }
// Far enough from BASE (and from world origin) that nothing painted near
// BASE could ever show up here.
const FAR_AWAY = { x: 999_999, y: 999_999 }

describe('infinite canvas: camera-relative preview buffers (#138)', () => {
  it('the live-tip (#104) preview follows the camera to its own world position', async () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setActiveLayer('L')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])

    // Camera parked at BASE before the stroke starts — this is what
    // _tipBufOrigin snapshots.
    engine.setInfiniteCamera(BASE.x, BASE.y, 1, 0)

    // _onStart immediately paints one real dab at the stroke's start (BASE).
    // The live-tip preview (#104) additionally paints a provisional segment
    // out to the latest real sample, 20 world units to the right — far past
    // the start dab's own small radius, so paint that far out can only be
    // the tip preview.
    simulateStrokeStart(engine, BASE.x, BASE.y)
    simulateStrokeMove(engine, BASE.x + 20, BASE.y)

    // Camera now looking straight at the tip's own world position: it
    // should land dead center on screen, exactly like real tile content
    // would.
    engine.setInfiniteCamera(BASE.x + 20, BASE.y, 1, 0)
    const centeredOnTip = readCompositePixels(engine)
    expect(alphaAt(centeredOnTip, 64, 32, 32)).toBeGreaterThan(0)

    // Camera panned far away from both the tip and the stroke's start:
    // nothing should show at screen center anymore — proving the preview
    // tracks the camera instead of staying fixed at whatever raw
    // buffer-local pixel it happened to be painted at.
    engine.setInfiniteCamera(FAR_AWAY.x, FAR_AWAY.y, 1, 0)
    const farAway = readCompositePixels(engine)
    expect(alphaAt(farAway, 64, 32, 32)).toBe(0)
  })

  it('the speculative pointer-prediction preview (#92) is camera-relative too', async () => {
    const { engine } = createTestEngine(
      { userId: 'user-a', infinite: true, predictPointer: true }, { width: 64, height: 64 },
    )
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setActiveLayer('L')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])

    // Camera parked at BASE before the stroke starts — this is what
    // _previewBufOrigin snapshots.
    engine.setInfiniteCamera(BASE.x, BASE.y, 1, 0)

    simulateStrokeStart(engine, BASE.x, BASE.y)
    simulateStrokeMove(engine, BASE.x + 10, BASE.y)
    // _onPredict feeds every sample through DabSystem.continueStroke on a
    // fork, which (like the real path) renders a segment only once the
    // point *after* it is known — so reaching world (BASE.x+25, BASE.y)
    // needs one more predicted sample past it to render that segment. See
    // DabSystem.continueStroke's own "deferred by one event" comment.
    simulatePredictedSamples(engine, [
      { x: BASE.x + 15, y: BASE.y },
      { x: BASE.x + 25, y: BASE.y },
      { x: BASE.x + 26, y: BASE.y },
    ])

    engine.setInfiniteCamera(BASE.x + 25, BASE.y, 1, 0)
    const centeredOnPrediction = readCompositePixels(engine)
    expect(alphaAt(centeredOnPrediction, 64, 32, 32)).toBeGreaterThan(0)

    engine.setInfiniteCamera(FAR_AWAY.x, FAR_AWAY.y, 1, 0)
    const farAway = readCompositePixels(engine)
    expect(alphaAt(farAway, 64, 32, 32)).toBe(0)
  })

  it("a peer's live-stroke reveal preview (previewOperation, #37 follow-up v2) is camera-relative", () => {
    vi.useFakeTimers()
    try {
      const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      engine.setCompositeOrder([{ id: 'L', opacity: 1 }])

      // Camera parked at BASE before previewOperation's first queued op for
      // this peer — this is what its PeerPreviewState.origin snapshots.
      engine.setInfiniteCamera(BASE.x, BASE.y, 1, 0)

      // Two dabs: the first (t=0) paints on the very first reveal tick; the
      // second (t=1000, i.e. one whole second later) keeps the reveal (and
      // its buffer) alive well past that tick, so there's a window to read
      // the composite before flushPeerPreview/_stepPeerPreview's own
      // end-of-queue teardown destroys the buffer.
      const op = makeStroke('user-b', 'L', [
        dab(BASE.x + 15, BASE.y + 10, { size: 30, t: 0 }),
        dab(BASE.x + 15, BASE.y + 10, { size: 30, t: 1000 }),
      ])
      engine.previewOperation(op)
      vi.advanceTimersByTime(20) // _stepPeerPreview's 16ms reveal tick

      engine.setInfiniteCamera(BASE.x + 15, BASE.y + 10, 1, 0)
      const centered = readCompositePixels(engine)
      expect(alphaAt(centered, 64, 32, 32)).toBeGreaterThan(0)

      engine.setInfiniteCamera(FAR_AWAY.x, FAR_AWAY.y, 1, 0)
      const farAway = readCompositePixels(engine)
      expect(alphaAt(farAway, 64, 32, 32)).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a bounded (fixed-canvas) room still blends the live-tip preview in directly, unaffected by #138', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setActiveLayer('L')
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])

    simulateStrokeStart(engine, 32, 32)
    simulateStrokeMove(engine, 40, 32)

    const pixels = readCompositePixels(engine)
    expect(alphaAt(pixels, 64, 32, 32)).toBeGreaterThan(0)
  })
})
