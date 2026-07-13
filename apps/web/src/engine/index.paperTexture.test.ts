// Engine-level tests for the #141 paper-texture grain fix. Three related
// defects, all in engine/index.ts + src/shaders.ts:
//  1. _initPaper generated the paper texture at canvas.width x
//     canvas.height — an infinite room's *current on-screen viewport size*,
//     not any fixed world/paper resolution.
//  2. resizeCanvas (infinite-only) never re-ran _initPaper, so after the
//     first live resize (which always happens once, right after
//     construction) the texture was stuck stretched across whatever size
//     it happened to be created at.
//  3. DAB_FRAG/DISPLAY_FRAG sampled the paper texture via local buffer/
//     screen UV, never world position — every tile independently sampled
//     the same local sub-region of that texture, so the grain pattern
//     discontinuously repeated at every tile boundary.
//
// MockGL deliberately doesn't rasterize DAB_FRAG's/PAPER_BLEND_FRAG's paper-
// height sampling or PAPER_GEN_FRAG's noise generation (see its module
// docstring) — a pixel readback can't observe any of this directly. These
// tests instead check the underlying plumbing the shader math depends on:
// the uniforms the engine computes and hands to the paper-sampling shaders,
// and the texture the engine actually creates — via the read-only
// introspection helpers added to MockGL/engineTestUtils for this fix (see
// paperTextureSize/paperTextureWrap/lastPaperDabUniform).
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, dab, lastPaperDabUniform, makeLayerAdd, makeStroke,
  paperTextureSize, paperTextureWrap,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

describe('paper texture: world-space grain sampling (#141)', () => {
  describe('bounded rooms: unchanged from before', () => {
    it('paper texture is still generated at exactly canvas size, with CLAMP_TO_EDGE', () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 37, height: 51 })
      expect(paperTextureSize(engine)).toEqual({ width: 37, height: 51 })

      const wrap = paperTextureWrap(engine)
      const CLAMP_TO_EDGE = 15 // MockGL's own enum value — see mockGL.ts
      expect(wrap).toEqual({ wrapS: CLAMP_TO_EDGE, wrapT: CLAMP_TO_EDGE })
    })

    it('a dab always gets paper origin (0,0) and paper-tex-size equal to the canvas — reduces to the old screen-UV formula exactly', () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 40, height: 30 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      engine.appendOperation(makeStroke('user-a', 'L', [dab(10, 12, { size: 4 })]))

      expect(lastPaperDabUniform(engine, 'u_paperOrigin')).toEqual([0, 0])
      expect(lastPaperDabUniform(engine, 'u_paperTexSize')).toEqual([40, 30])
    })

    it('a second dab at a different position still reports paper origin (0,0) — bounded rooms never have a nonzero tile origin', () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 40, height: 30 })
      engine.appendOperation(makeLayerAdd('user-a', 'L'))
      engine.appendOperation(makeStroke('user-a', 'L', [dab(35, 5, { size: 4 })]))
      expect(lastPaperDabUniform(engine, 'u_paperOrigin')).toEqual([0, 0])
    })
  })

  describe('infinite rooms: fixed world-space texture, decoupled from canvas size', () => {
    it('paper texture is a fixed, power-of-two resolution with REPEAT wrap, independent of canvas size', () => {
      const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 37, height: 51 })
      const size = paperTextureSize(engine)
      expect(size).not.toBeNull()
      expect(size!.width).toBe(size!.height) // square
      expect(Number.isInteger(Math.log2(size!.width))).toBe(true) // power of two

      const wrap = paperTextureWrap(engine)
      const REPEAT = 200 // MockGL's own enum value — see mockGL.ts
      expect(wrap).toEqual({ wrapS: REPEAT, wrapT: REPEAT })
    })

    it('resizeCanvas never changes the (now canvas-size-independent) paper texture — the #2 bug this fix makes moot', () => {
      const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
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
      // this fix targets (see INFINITE_PAPER_WORLD_SIZE's own comment).
      expect((texSizeTile0 as number[])[0]).not.toBe(TILE_SIZE)
    })
  })
})
