// (#507) A transform of a *tiled* layer is stitched from one draw per source
// tile, and along every source-tile boundary each of those draws carries only
// part of one bilinear filter kernel — the rest lives in the neighbouring
// tile's texture, which that draw cannot see. Two things have to hold for the
// parts to add back up to one whole pixel:
//
//   - the passes must SUM into the destination (ONE, ONE), not composite
//     "over" each other, which would scale each share by the previous one's
//     coverage;
//   - the source must be point-sampled, because the shader does the filtering
//     itself from exact texel centres (TILE_BILINEAR in shaders.ts) and the
//     sampler must not interpolate — or, worse, serve a coarse mip level left
//     selected by an earlier composite (#365).
//
// Neither is visible in a pixel this mock produces: MockGL samples nearest,
// so it has no seam to show and never did. The real proof is on a GPU
// (e2e/specs/transformSeam.spec.ts, which measures the seam itself); this
// file guards the GL-level contract that proof depends on, which is exactly
// the part a refactor can drop silently.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, fillStroke, makeAreaTransform, makeLayerAdd, makeLayerTransform,
} from './testing/engineTestUtils'
import type { MockGL } from './testing/mockGL'
import { rectangleSelection } from './src/selectionMask'
import { TILE_SIZE } from './src/tileMath'

/** An infinite room with one layer whose content straddles the boundary
 *  between tile (0,0) and tile (1,0) — the only arrangement in which a
 *  transform is stitched from more than one source tile at all. */
function engineWithContentAcrossTiles() {
  const { engine, canvas } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
  const gl = canvas.getContext('webgl')!
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE - 12, 100, 24))
  engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE + 12, 100, 24))
  return { engine, gl }
}

/** The transform-blit draws issued while `run` executed. Read straight after
 *  the call and before any pixel-reading helper: those run a composite, whose
 *  own rotate blit uses the same program (_finishInfiniteComposite) and would
 *  land in this list too. */
function drawsDuring(gl: MockGL, run: () => void) {
  const before = gl.transformDraws().length
  run()
  return gl.transformDraws().slice(before)
}

describe('#507: a transform stitched from several source tiles sums its passes', () => {
  it('the bake blends additively and point-samples every source tile', () => {
    const { engine, gl } = engineWithContentAcrossTiles()

    // Deliberately fractional: an exactly-integer translation lands on texel
    // centres, where the filter has nothing to blend and the seam this exists
    // for cannot appear.
    const draws = drawsDuring(gl, () => {
      engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 3.5, 0] }]))
    })

    // More than one, or the arrangement above didn't span two tiles and this
    // test is checking nothing.
    expect(draws.length).toBeGreaterThan(1)
    for (const d of draws) {
      expect(d.blendDst).toBe(gl.ONE)
      expect(d.srcMinFilter).toBe(gl.NEAREST)
      expect(d.srcMagFilter).toBe(gl.NEAREST)
    }
  })

  it('the live gizmo preview does the same — what you drag has to be what lands', () => {
    const { engine, gl } = engineWithContentAcrossTiles()

    const draws = drawsDuring(gl, () => {
      engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 3.5, 0] }])
    })

    expect(draws.length).toBeGreaterThan(1)
    for (const d of draws) {
      expect(d.blendDst).toBe(gl.ONE)
      expect(d.srcMinFilter).toBe(gl.NEAREST)
    }
    engine.clearLayerTransformPreview()
  })

  it('a selection spanning two tiles accumulates the lifted piece before it is composited', () => {
    const { engine, gl } = engineWithContentAcrossTiles()
    const selection = rectangleSelection(TILE_SIZE - 40, 70, TILE_SIZE + 40, 130)

    const draws = drawsDuring(gl, () => {
      engine.appendOperation(makeAreaTransform('user-a', 'L', selection, [1, 0, 0, 1, 3.5, 0]))
    })

    expect(draws.length).toBeGreaterThan(1)
    // Additive into the lift buffer — the "over" that puts the piece back on
    // the tile is a separate composite pass, not one of these.
    for (const d of draws) {
      expect(d.blendDst).toBe(gl.ONE)
      expect(d.srcMagFilter).toBe(gl.NEAREST)
    }
  })

  it('a selection inside a single tile still goes straight on, with no lift buffer', () => {
    // Nothing to sum: one source tile means one pass, and "over" onto the
    // tile's own remaining content is both correct and one buffer cheaper.
    const { engine, canvas } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    const gl = canvas.getContext('webgl')!
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 30))

    const draws = drawsDuring(gl, () => {
      engine.appendOperation(makeAreaTransform('user-a', 'L', rectangleSelection(80, 80, 120, 120), [1, 0, 0, 1, 3.5, 0]))
    })

    expect(draws.length).toBe(1)
    expect(draws[0].blendDst).toBe(gl.ONE_MINUS_SRC_ALPHA)
  })
})
