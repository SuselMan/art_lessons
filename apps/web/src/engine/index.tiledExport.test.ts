// Engine-level integration tests for exportPNG's infinite-canvas "whole
// drawing" composite (#145) — before this fix, exportPNG (like pickColor)
// only ever read the on-screen, camera-framed _compositeFBO/canvas, so
// content far from the current camera's view was silently missing from an
// exported PNG. _buildContentComposite (see engine/index.ts) is the fix:
// it builds a *second*, camera-independent composite covering every layer's
// entire getContentBounds union, reusing _drawTileComposite via a synthetic
// fixed camera rather than the live, on-screen `_infiniteCamera`.
//
// MockGL never rasterizes the paper-blend/display-transparent passes (see
// mockGL.ts's module docstring) and the real PNG-encoding step needs a DOM
// <canvas> that doesn't exist under vitest's 'node' environment — so these
// tests assert on _buildContentComposite's own raw pixel output (via
// buildExportComposite, see engineTestUtils.ts) rather than a full
// engine.exportPNG() call. That's the exact boundary between "pixels MockGL
// can simulate" and "the DOM-only encoding step" — see pickColor's own
// investigation comment in engine/index.ts for why *that* method needed no
// change at all, unlike exportPNG.
import { describe, expect, it } from 'vitest'

import { buildExportComposite, createTestEngine, fillStroke, makeLayerAdd } from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

// Same convention index.tiledDisplay.test.ts's own alphaAt uses: MockGL's
// internal texel storage is already app-space row-major top-down (real GL's
// bottom-up byte order is a detail this mock deliberately doesn't model —
// see its module docstring), so no flip is needed to interpret it here.
function alphaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4 + 3]
}

describe('exportPNG infinite-room content composite (#145)', () => {
  it('returns null when nothing has been painted on any layer', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])

    expect(buildExportComposite(engine)).toBeNull()
  })

  it('includes content far from world origin and off the current camera viewport entirely', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])

    // Two strokes far apart — several tiles away from each other and from
    // world origin (TILE_SIZE is 1024). Both placed at their own tile's
    // vertical center (world y === k*TILE_SIZE + TILE_SIZE/2): MockGL
    // faithfully replicates DAB_FRAG's coverage-shape geometry but not
    // DAB_VERT's clip.y flip (see mockGL.ts's module docstring — a
    // "deliberate scope cut", not a correctness bug in the real engine),
    // so getContentBounds' compensating bottom-up-to-app-space flip (which
    // is exactly right against real WebGL) mirrors a mock-painted tile's
    // content around its own vertical center instead. Content already
    // sitting at that center is therefore unaffected (off by at most ~1px,
    // negligible against this stroke's own radius) — content near a tile's
    // top/bottom edge would come out mismatched under the mock specifically.
    // Sidestepping that gap here rather than fixing MockGL's geometry
    // simulation, which is out of scope for #145.
    const nearOrigin = { x: 20, y: TILE_SIZE / 2 }
    const farAway = { x: 4 * TILE_SIZE + 100, y: 3 * TILE_SIZE + TILE_SIZE / 2 }
    engine.appendOperation(fillStroke('user-a', 'L', nearOrigin.x, nearOrigin.y, 8))
    engine.appendOperation(fillStroke('user-a', 'L', farAway.x, farAway.y, 8))

    // Camera looks only at the origin stroke — the far one is nowhere near
    // this 64x64 on-screen viewport, i.e. exactly the pre-#145 bug scenario.
    engine.setInfiniteCamera(nearOrigin.x, nearOrigin.y, 1, 0)

    const composite = buildExportComposite(engine)!
    expect(composite).not.toBeNull()

    // The union bounds must actually span both strokes, not just whichever
    // one the camera happens to be looking at. A few px of slack absorbs the
    // ~1px mock-mirror residue noted above (real WebGL would be exact).
    const slack = 4
    expect(composite.x).toBeLessThanOrEqual(nearOrigin.x - 8 + slack)
    expect(composite.y).toBeLessThanOrEqual(nearOrigin.y - 8 + slack)
    expect(composite.x + composite.width).toBeGreaterThanOrEqual(farAway.x + 8 - slack)
    expect(composite.y + composite.height).toBeGreaterThanOrEqual(farAway.y + 8 - slack)

    // Both strokes' centers must actually be painted in the composite
    // buffer, at the position implied by its own bounds — this is the
    // concrete "far content is correctly included" assertion. A small search
    // window (rather than one exact texel) absorbs that same ~1px residue.
    const paintedNear = (dx: number, dy: number): number => alphaAt(
      composite.pixels, composite.width,
      Math.round(nearOrigin.x - composite.x) + dx, Math.round(nearOrigin.y - composite.y) + dy,
    )
    const paintedFar = (dx: number, dy: number): number => alphaAt(
      composite.pixels, composite.width,
      Math.round(farAway.x - composite.x) + dx, Math.round(farAway.y - composite.y) + dy,
    )
    const offsets = [-2, -1, 0, 1, 2]
    expect(offsets.some(dx => offsets.some(dy => paintedNear(dx, dy) > 0))).toBe(true)
    expect(offsets.some(dx => offsets.some(dy => paintedFar(dx, dy) > 0))).toBe(true)

    // A point far outside either stroke's footprint should read empty.
    expect(alphaAt(composite.pixels, composite.width, 0, 0)).toBe(0)
  })

  it('only unions layers currently in the composite order — a layer left out (e.g. hidden) contributes nothing', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'visible'))
    engine.appendOperation(makeLayerAdd('user-a', 'hidden'))
    engine.appendOperation(fillStroke('user-a', 'visible', 10, 10, 6))
    engine.appendOperation(fillStroke('user-a', 'hidden', 5 * TILE_SIZE, 5 * TILE_SIZE, 6))

    // Only 'visible' is composited — mirrors what computeCompositeOrder
    // would produce for a hidden layer (omitted entirely).
    engine.setCompositeOrder([{ id: 'visible', opacity: 1 }])

    const composite = buildExportComposite(engine)!
    expect(composite).not.toBeNull()
    // Bounds should hug only the visible layer's small stroke, nowhere near
    // the hidden layer's content five tiles away.
    expect(composite.width).toBeLessThan(TILE_SIZE)
    expect(composite.height).toBeLessThan(TILE_SIZE)
  })

  it('a bounded (fixed-canvas) engine never builds an export composite — exportPNG keeps its old canvas-viewport behavior untouched', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.initLayer('L')
    engine.setActiveLayer('L')
    engine.appendOperation(fillStroke('user-a', 'L', 8, 8, 6))

    // The fake canvas's toBlob always resolves with null (see
    // engineTestUtils' createMockCanvas) — this just proves the bounded
    // path is exactly as before: still resolves via canvas.toBlob(), never
    // touches the new infinite-only machinery.
    await expect(engine.exportPNG()).resolves.toBeNull()
    await expect(engine.exportPNG(true)).resolves.toBeNull()
  })
})
