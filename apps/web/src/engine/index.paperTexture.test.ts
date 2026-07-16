// Engine-level tests for the #141 paper-texture grain fix, updated for the
// later move to an offline-baked, raw-byte-uploaded texture (see
// ../scripts/bakePaperTextures.ts and src/paperLoader.ts): the
// world-position uniform plumbing DAB_FRAG needs (u_paperOrigin/
// u_paperTexSize) is unchanged by that move — it's still what turns a dab's
// local-buffer position into the true world position the paper texture is
// sampled at — so those tests stay as they were. What's new is that both
// bounded and infinite rooms now share the exact same fixed-resolution,
// REPEAT-wrapped texture (see engine/index.ts's _paperWorldSize), and that
// loading it is now asynchronous (a placeholder is bound synchronously,
// swapped for the real texture once the load resolves — see _paperReady).
//
// Three original defects, all in engine/index.ts + src/shaders.ts:
//  1. _initPaper generated the paper texture at canvas.width x
//     canvas.height — an infinite room's *current on-screen viewport size*,
//     not any fixed world/paper resolution. (Moot now — the texture is
//     baked offline, at a fixed resolution, for every room.)
//  2. resizeCanvas (infinite-only) never re-ran _initPaper, so after the
//     first live resize the texture was stuck stretched. (Moot now.)
//  3. DAB_FRAG sampled the paper texture via local buffer/screen UV, never
//     world position — every tile independently sampled the same local
//     sub-region, so the grain pattern discontinuously repeated at every
//     tile boundary. Still relevant: the texture is a pure function of its
//     input UV, so it still needs the true world position, not a
//     tile-local one, to stay continuous across tile boundaries.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, dab, lastPaperDabUniform, makeLayerAdd, makeStroke,
  paperReady, paperTextureSize, paperTextureWrap, simulateStroke, triggerContextRestore,
} from './testing/engineTestUtils'
import { __resetPaperLoaderForTesting, __setPaperLoaderForTesting } from './src/paperLoader'
import { PAPER_BAKE_RESOLUTION, PAPER_WORLD_SIZE } from './src/paperNoise'
import { TILE_SIZE } from './src/tileMath'

describe('paper texture: world-space grain sampling (#141)', () => {
  describe('bounded and infinite rooms share the exact same baked texture', () => {
    for (const infinite of [false, true]) {
      it(`${infinite ? 'infinite' : 'bounded'} room: paper texture is PAPER_BAKE_RESOLUTION^2 with REPEAT wrap, once loaded`, async () => {
        const { engine } = createTestEngine({ userId: 'user-a', infinite }, { width: 37, height: 51 })
        await paperReady(engine)

        expect(paperTextureSize(engine)).toEqual({ width: PAPER_BAKE_RESOLUTION, height: PAPER_BAKE_RESOLUTION })

        const wrap = paperTextureWrap(engine)
        const REPEAT = 200 // MockGL's own enum value — see mockGL.ts
        expect(wrap).toEqual({ wrapS: REPEAT, wrapT: REPEAT })
      })
    }

    it('a dab always gets paper-tex-size equal to PAPER_WORLD_SIZE, not the canvas size', () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 40, height: 30 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      engine.appendOperation(makeStroke('user-a', 'L', [dab(10, 12, { size: 4 })]))

      expect(lastPaperDabUniform(engine, 'u_paperTexSize')).toEqual([PAPER_WORLD_SIZE, PAPER_WORLD_SIZE])
    })
  })

  describe('bounded rooms: unchanged from before', () => {
    it('a dab always gets paper origin (0,0) — reduces to the old screen-UV formula exactly', () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 40, height: 30 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      engine.appendOperation(makeStroke('user-a', 'L', [dab(10, 12, { size: 4 })]))

      expect(lastPaperDabUniform(engine, 'u_paperOrigin')).toEqual([0, 0])
    })

    it('a second dab at a different position still reports paper origin (0,0) — bounded rooms never have a nonzero tile origin', () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 40, height: 30 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      engine.appendOperation(makeStroke('user-a', 'L', [dab(35, 5, { size: 4 })]))
      expect(lastPaperDabUniform(engine, 'u_paperOrigin')).toEqual([0, 0])
    })
  })

  describe('infinite rooms: fixed world-space texture, decoupled from canvas size', () => {
    it('resizeCanvas never changes the (canvas-size-independent) paper texture', async () => {
      const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
      await paperReady(engine)
      const before = paperTextureSize(engine)

      engine.resizeCanvas(500, 300)

      const after = paperTextureSize(engine)
      expect(after).toEqual(before)
    })

    it('dabs in different tiles compute paper UV from true world position, not tile-local position (the #3 bug)', () => {
      const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))

      // Same LOCAL offset (50, 50) within each dab's own tile, but genuinely
      // different WORLD positions (one TILE_SIZE apart in X) — under the
      // pre-#141 bug (paperUV from raw local gl_FragCoord alone, no origin
      // awareness), these two dabs would have sampled the *exact same*
      // paper texel despite being TILE_SIZE apart in the world: the "grain
      // repeats identically at every tile boundary" bug this fixes.
      engine.appendOperation(makeStroke('user-a', 'L', [dab(50, 50, { size: 4 })]))
      const originTile0 = lastPaperDabUniform(engine, 'u_paperOrigin') as number[]

      engine.appendOperation(makeStroke('user-a', 'L', [dab(TILE_SIZE + 50, 50, { size: 4 })]))
      const originTile1 = lastPaperDabUniform(engine, 'u_paperOrigin') as number[]

      // Tile(0,0)'s origin is (0,0); tile(1,0)'s is (TILE_SIZE,0) — X is
      // threaded straight through (no sign flip needed, see DAB_FRAG's own
      // comment), Y stays 0 since neither dab crosses a row boundary.
      expect(originTile0).toEqual([0, 0])
      expect(originTile1).toEqual([TILE_SIZE, 0])

      // Reconstructing world position as origin + local dab-center (exactly
      // what DAB_FRAG's gl_FragCoord.xy + u_paperOrigin computes at the
      // dab's own center pixel) resolves the two dabs to their true,
      // genuinely different world X coordinates — not the same one.
      const worldX0 = originTile0[0] + 50
      const worldX1 = originTile1[0] + 50
      expect(worldX0).toBe(50)
      expect(worldX1).toBe(TILE_SIZE + 50)
      expect(worldX0).not.toBe(worldX1)
    })

    it('a dab straddling a tile row boundary gets a negated-Y origin for the tile below', () => {
      const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))

      engine.appendOperation(makeStroke('user-a', 'L', [dab(50, TILE_SIZE + 50, { size: 4 })]))
      const origin = lastPaperDabUniform(engine, 'u_paperOrigin') as number[]

      // DAB_VERT's own clip.y flip means a tile's local gl_FragCoord.y runs
      // opposite to the tile origin's top-down world-Y convention — origin
      // must be *subtracted*, not added, for the two to agree at a shared
      // tile edge (see DAB_FRAG's / _paintDabsInstanced's own comment) —
      // i.e. u_paperOrigin.y is the *negation* of the tile's true world-Y
      // origin (TILE_SIZE for tile row 1), not the origin itself.
      expect(origin).toEqual([0, -TILE_SIZE])
    })

    it('paper-tex-size is the same fixed world constant for every tile, not tile- or canvas-size-dependent', () => {
      const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))

      engine.appendOperation(makeStroke('user-a', 'L', [dab(50, 50, { size: 4 })]))
      const texSizeTile0 = lastPaperDabUniform(engine, 'u_paperTexSize')

      engine.appendOperation(makeStroke('user-a', 'L', [dab(3 * TILE_SIZE + 50, 50, { size: 4 })]))
      const texSizeTile3 = lastPaperDabUniform(engine, 'u_paperTexSize')

      expect(texSizeTile0).toEqual(texSizeTile3)
      // And it must not equal TILE_SIZE itself — a paper-world period that
      // coincided with TILE_SIZE would make u_paperOrigin's threading a
      // no-op under GL_REPEAT (every tile origin is an exact multiple of
      // TILE_SIZE), silently reintroducing the same per-tile-repeat bug
      // this fix targets (see PAPER_WORLD_SIZE's own comment).
      expect((texSizeTile0 as number[])[0]).not.toBe(TILE_SIZE)
    })
  })
})

describe('paper texture: async load (placeholder, cache, context-restore)', () => {
  it('a dab painted before the real texture has loaded does not throw, and reads a 1x1 placeholder', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 20, height: 20 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    // No `await paperReady(engine)` here — this exercises the gap between
    // construction and the (in tests, still-microtask-async) load
    // resolving. The default test loader (installed process-wide in
    // engineTestUtils.ts) never runs synchronously, so the texture is
    // still the constructor's own placeholder at this point.
    expect(() => {
      engine.appendOperation(makeStroke('user-a', 'L', [dab(10, 10, { size: 4 })]))
    }).not.toThrow()
    expect(paperTextureSize(engine)).toEqual({ width: 1, height: 1 })
  })

  it('a real (pointer-driven) stroke started before the paper texture is ready is silently dropped, not painted against the placeholder', async () => {
    // Found via a live cross-device paper-grain comparison: a stroke drawn
    // right after opening a room, before the paper texture finished its own
    // async load, permanently baked in the placeholder's flat response —
    // nothing later re-paints an already-applied pixel operation. _onStart
    // now refuses to begin a stroke at all until _paperTexLoaded flips true
    // (see engine/index.ts's own field comment), rather than risk that.
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 20, height: 20 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.setActiveLayer('L')

    // No await paperReady(engine) yet — same still-microtask-async gap as
    // the "does not throw" test above.
    simulateStroke(engine, [{ x: 5, y: 5 }, { x: 10, y: 10 }])
    expect(engine.getOperations().map(op => op.type)).toEqual(['layer_add']) // no stroke recorded

    await paperReady(engine)

    simulateStroke(engine, [{ x: 5, y: 5 }, { x: 10, y: 10 }])
    expect(engine.getOperations().map(op => op.type)).toEqual(['layer_add', 'stroke'])
  })

  it('the placeholder is swapped for the real texture once _paperReady resolves', async () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 20, height: 20 })
    expect(paperTextureSize(engine)).toEqual({ width: 1, height: 1 })

    await paperReady(engine)

    expect(paperTextureSize(engine)).toEqual({ width: PAPER_BAKE_RESOLUTION, height: PAPER_BAKE_RESOLUTION })
  })

  it('setPaper() reuses the byte cache — cycling through all 3 paper types never exceeds one loader call per type', async () => {
    let calls = 0
    __setPaperLoaderForTesting(async () => {
      calls++
      return new Uint8Array(PAPER_BAKE_RESOLUTION * PAPER_BAKE_RESOLUTION * 2).fill(128)
    })
    try {
      const { engine } = createTestEngine({ userId: 'user-a', paper: 'rough' })
      await paperReady(engine)
      // The constructor's own prefetchAllPaperTypes() warms all 3 types
      // once, up front — so this is 3 (rough/smooth/bristol), not 1.
      expect(calls).toBe(3)

      engine.setPaper('smooth')
      await paperReady(engine)
      engine.setPaper('bristol')
      await paperReady(engine)
      engine.setPaper('rough')
      await paperReady(engine)

      // Every type was already cached by the initial prefetch — cycling
      // through them again must not trigger any further loader calls.
      expect(calls).toBe(3)
    } finally {
      __resetPaperLoaderForTesting()
    }
  })

  it('context-restore re-uploads from the byte cache without a new loader call', async () => {
    let calls = 0
    __setPaperLoaderForTesting(async () => {
      calls++
      return new Uint8Array(PAPER_BAKE_RESOLUTION * PAPER_BAKE_RESOLUTION * 2).fill(128)
    })
    try {
      const { engine } = createTestEngine({ userId: 'user-a', paper: 'rough' })
      await paperReady(engine)
      const callsAfterConstruction = calls

      triggerContextRestore(engine)
      // Context-restore rebinds a fresh 1x1 placeholder immediately (the
      // dead gl context took the old texture object with it), same as a
      // fresh construction.
      expect(paperTextureSize(engine)).toEqual({ width: 1, height: 1 })

      await paperReady(engine)

      expect(calls).toBe(callsAfterConstruction) // all 3 types already cached — no new fetch
      expect(paperTextureSize(engine)).toEqual({ width: PAPER_BAKE_RESOLUTION, height: PAPER_BAKE_RESOLUTION })
    } finally {
      __resetPaperLoaderForTesting()
    }
  })
})
