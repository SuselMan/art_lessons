// (#527, #494) The engine half of the shape tool: that a `shape` operation
// lands on the layer's pixels where its frame says and nowhere else, comes
// back off them on undo, is skipped when a restored snapshot already holds
// it, and that its live preview floats over the layer without writing into
// it. Written before the shape code moved out of PencilEngine, so the move
// has something to break.
//
// MockGL rasterizes SHAPE_FRAG's rectangle with the shader's own distance
// field and coverage ramp (see its _rasterShape), so *where* a shape's ink is
// is honest here. Its colour is not — MockGL keeps one scalar per texel — and
// the exact edge values belong to shapeGeometry.test.ts.
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'

import type { Operation, ShapeFill, ShapeFrame, ShapeOperation, ShapeStroke } from '@grafetto/shared'

import {
  alphaAt, createTestEngine, expectPixelsEqual, makeLayerAdd, makeLayerDelete, readLayerPixels,
  readTransformPreviewTiles, residentTileCount,
} from './testing/engineTestUtils'

const SIZE = 64

function makeShape(
  userId: string, layerId: string, frame: ShapeFrame,
  { stroke = null, fill = { color: [0, 0, 0] } }: { stroke?: ShapeStroke | null; fill?: ShapeFill | null } = {},
): ShapeOperation {
  return {
    id: nanoid(10), type: 'shape', userId, timestamp: Date.now(), layerId,
    geometry: { kind: 'rectangle', cornerRadius: 0 }, frame, stroke, fill,
  }
}

function undoOf(op: Operation): Operation {
  return { id: `undo-${op.id}`, type: 'operation_undo', userId: op.userId, timestamp: 0, targetOpId: op.id }
}

/** A 24×16 box whose top-left corner is (16, 8) — not square and not centred,
 *  so a shape drawn transposed or flipped reads differently from the right one. */
const FRAME: ShapeFrame = { x: 16, y: 8, width: 24, height: 16, angle: 0 }

function freshEngine() {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width: SIZE, height: SIZE })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return engine
}

function inked(pixels: Uint8Array | null): number {
  let n = 0
  if (pixels) for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) n++
  return n
}

describe('shape in the engine (#527)', () => {
  it('a filled rectangle covers its frame and nothing else', () => {
    const engine = freshEngine()
    engine.appendOperation(makeShape('user-a', 'L', FRAME))
    const px = readLayerPixels(engine, 'L')!

    // Inside, well clear of the one-pixel rim.
    expect(alphaAt(px, 17, 9, SIZE)).toBe(255)
    expect(alphaAt(px, 38, 22, SIZE)).toBe(255)
    // Outside on every side.
    expect(alphaAt(px, 14, 12, SIZE)).toBe(0)
    expect(alphaAt(px, 42, 12, SIZE)).toBe(0)
    expect(alphaAt(px, 20, 6, SIZE)).toBe(0)
    expect(alphaAt(px, 20, 26, SIZE)).toBe(0)
    // The frame's own edge pixels are the last ones inked — a shape off by a
    // pixel in either axis fails here.
    expect([15, 16, 39, 40].map(x => alphaAt(px, x, 12, SIZE))).toEqual([0, 255, 255, 0])
    expect([7, 8, 23, 24].map(y => alphaAt(px, 20, y, SIZE))).toEqual([0, 255, 255, 0])
    // Exactly the frame's area, edge pixels included.
    expect(inked(px)).toBe(FRAME.width * FRAME.height)
  })

  it('a stroke with no fill inks the rim and leaves the middle empty', () => {
    const engine = freshEngine()
    engine.appendOperation(makeShape('user-a', 'L', FRAME, {
      fill: null, stroke: { color: [0, 0, 0], width: 3, align: 'inside', join: 'miter' },
    }))
    const px = readLayerPixels(engine, 'L')!
    expect(alphaAt(px, 17, 16, SIZE)).toBe(255)
    expect(alphaAt(px, 28, 16, SIZE)).toBe(0)
    // Inside alignment keeps the stroke within the frame.
    expect(alphaAt(px, 15, 16, SIZE)).toBe(0)
  })

  it('undo takes the shape back exactly', () => {
    const engine = freshEngine()
    const before = readLayerPixels(engine, 'L')
    const op = makeShape('user-a', 'L', FRAME)
    engine.appendOperation(op)
    expect(inked(readLayerPixels(engine, 'L'))).toBeGreaterThan(0)
    engine.appendOperation(undoOf(op))
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })

  it('a shape on a layer that no longer exists is revoked, not kept', () => {
    const engine = freshEngine()
    engine.appendOperation(makeLayerDelete('user-a', ['L']))
    const op = makeShape('user-a', 'L', FRAME)
    engine.appendOperation(op)
    expect(engine.getOperations().find(o => o.id === op.id)).toBeUndefined()
  })

  it('a shape a restored snapshot already accounts for is not drawn again', () => {
    const { engine } = createTestEngine({ userId: 'user-b' }, { width: SIZE, height: SIZE })
    engine.initLayer('L')
    engine.restoreLayerFromSnapshot('L', [
      { originX: 0, originY: 0, width: SIZE, height: SIZE, pixels: new Uint8Array(SIZE * SIZE * 4) },
    ], 100)
    const restored = readLayerPixels(engine, 'L')!.slice()
    engine.appendOperation({ ...makeShape('user-a', 'L', FRAME), seq: 50 }, 'remote')
    expectPixelsEqual(readLayerPixels(engine, 'L'), restored)
  })

  it('a shape past the sheet edge grows no off-page tile in a bounded room', () => {
    const engine = freshEngine()
    engine.appendOperation(makeShape('user-a', 'L', { x: 50, y: 50, width: 40, height: 40, angle: 0 }))
    expect(residentTileCount(engine, 'L')).toBe(1)
    expect(alphaAt(readLayerPixels(engine, 'L')!, 60, 60, SIZE)).toBe(255)
  })

  it('the preview floats over the layer and never writes into it', () => {
    const engine = freshEngine()
    const before = readLayerPixels(engine, 'L')
    engine.previewShape('L', { kind: 'rectangle', cornerRadius: 0 }, FRAME, null, { color: [0, 0, 0] })
    const tiles = readTransformPreviewTiles(engine, 'L')
    expect(tiles).toHaveLength(1)
    expect(alphaAt(tiles[0].pixels, 20, 12, SIZE)).toBe(255)
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)

    engine.clearLayerTransformPreview()
    expect(readTransformPreviewTiles(engine, 'L')).toHaveLength(0)
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })

  it('a preview with neither stroke nor fill drops the float', () => {
    const engine = freshEngine()
    engine.previewShape('L', { kind: 'rectangle', cornerRadius: 0 }, FRAME, null, { color: [0, 0, 0] })
    engine.previewShape('L', { kind: 'rectangle', cornerRadius: 0 }, FRAME, null, null)
    expect(readTransformPreviewTiles(engine, 'L')).toHaveLength(0)
  })
})
