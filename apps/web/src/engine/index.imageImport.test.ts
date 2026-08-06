// #398: an imported reference image is the one pixel operation whose content
// has to be decoded before it can be painted, and a replay is synchronous.
// Left to resolve on its own, every operation recorded *after* the import
// applied to a layer the image had not landed on yet — the reported symptom
// being a reference photo that jumps back to where it was first dropped every
// time the room is rejoined, however many times it has been moved since.
//
// These tests drive the replay exactly the way Room's join/reconnect path
// does: preload, then apply in log order (see PencilEngineAPI.preloadImages).
// The image itself is uniformly opaque in MockGL (see its texImage2D DOM-
// source overload), so what a readback shows is purely *where* the image
// ended up — which is the whole question here.
import { describe, expect, it } from 'vitest'

import {
  alphaAt, createTestEngine, installFakeImageDecoder, makeImageImport, makeLayerAdd,
  makeLayerTransform, readLayerPixels,
} from './testing/engineTestUtils'

const SIZE = 16

/** A fixed-canvas import fit-centers to cover this whole canvas, so before any
 *  transform every pixel of the origin tile is opaque. */
function importedOps(userId = 'user-a', layerId = 'L') {
  return {
    add: makeLayerAdd(userId, layerId),
    image: makeImageImport(userId, layerId),
  }
}

/** Column-wise coverage of the origin tile: what a translate along X is
 *  visible as. */
function columnAlphas(pixels: Uint8Array): number[] {
  return Array.from({ length: SIZE }, (_, x) => alphaAt(pixels, x, SIZE / 2, SIZE))
}

describe('image_import: operations recorded after an import (#398)', () => {
  it('a layer_transform replayed after an import moves the image, not an empty layer', async () => {
    const restore = installFakeImageDecoder()
    try {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: SIZE, height: SIZE })
      const { add, image } = importedOps()
      // Translate the layer half a canvas to the right — the shape of the
      // real report (a reference photo dragged with the transform gizmo).
      const move = makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, SIZE / 2, 0] }])
      const ops = [add, image, move]

      await engine.preloadImages(ops)
      for (const op of ops) engine.appendOperation(op, 'remote')

      const columns = columnAlphas(readLayerPixels(engine, 'L')!)
      // Left half vacated, right half covered. Before the fix this read as
      // fully covered across the whole width: the transform baked an empty
      // layer and the image then landed, undisplaced, at its original spot.
      expect(columns.slice(0, SIZE / 2)).toEqual(Array(SIZE / 2).fill(0))
      expect(columns.slice(SIZE / 2)).toEqual(Array(SIZE / 2).fill(255))
    } finally {
      restore()
    }
  })

  it('preloading twice costs nothing and still paints once', async () => {
    const restore = installFakeImageDecoder()
    try {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: SIZE, height: SIZE })
      const { add, image } = importedOps()
      const ops = [add, image]

      // Backfill calls this once per page, and a reconnect again over ops the
      // first join already covered — a second decode must be a cache hit, not
      // a second paint or a second Image.
      await engine.preloadImages(ops)
      await engine.preloadImages(ops)
      for (const op of ops) engine.appendOperation(op, 'remote')

      expect(columnAlphas(readLayerPixels(engine, 'L')!)).toEqual(Array(SIZE).fill(255))
    } finally {
      restore()
    }
  })

  it('an undecodable image leaves preloadImages resolved and the rest of the replay intact', async () => {
    const restore = installFakeImageDecoder({ fail: true })
    try {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: SIZE, height: SIZE })
      const { add, image } = importedOps()
      const move = makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, SIZE / 2, 0] }])
      const ops = [add, image, move]

      // Must not reject: one unreadable image is not a reason to abandon
      // everything else the room drew.
      await expect(engine.preloadImages(ops)).resolves.toBeUndefined()
      for (const op of ops) engine.appendOperation(op, 'remote')

      // Nothing to paint, so nothing is painted — but the layer exists and
      // every other operation was applied.
      expect(columnAlphas(readLayerPixels(engine, 'L')!)).toEqual(Array(SIZE).fill(0))
      expect(engine.getOperations().map(op => op.type)).toEqual(['layer_add', 'image_import', 'layer_transform'])
    } finally {
      restore()
    }
  })
})

describe('image_import: an image that decodes after its operation was applied (#398)', () => {
  it('settles under whatever painted the layer while it was decoding', async () => {
    const restore = installFakeImageDecoder()
    try {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: SIZE, height: SIZE })
      const { add, image } = importedOps()
      const move = makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, SIZE / 2, 0] }])

      // No preload: a peer's import arriving live, with an operation right
      // behind it — nothing had a chance to decode it in advance.
      engine.appendOperation(add, 'remote')
      engine.appendOperation(image, 'remote')
      engine.appendOperation(move, 'remote')

      await new Promise(resolve => setTimeout(resolve, 0))

      const columns = columnAlphas(readLayerPixels(engine, 'L')!)
      expect(columns.slice(0, SIZE / 2)).toEqual(Array(SIZE / 2).fill(0))
      expect(columns.slice(SIZE / 2)).toEqual(Array(SIZE / 2).fill(255))
    } finally {
      restore()
    }
  })

  it('leaves an import nothing has followed exactly where it painted', async () => {
    const restore = installFakeImageDecoder()
    try {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: SIZE, height: SIZE })
      const { add, image } = importedOps()

      engine.appendOperation(add, 'remote')
      engine.appendOperation(image, 'remote')
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(columnAlphas(readLayerPixels(engine, 'L')!)).toEqual(Array(SIZE).fill(255))
    } finally {
      restore()
    }
  })
})
