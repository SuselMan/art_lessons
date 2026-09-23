// (#574) The engine half of layer filters: that a `layer_filter` operation
// reaches the layer's pixels, comes back off them on undo, and leaves a layer
// that is gone alone.
//
// Pixel values are not asserted here on purpose. MockGL keeps one scalar per
// texel (see its docstring), so a colour filter has nothing to act on, and a
// blur's exact numbers belong to layerFilters.test.ts, which runs the real
// arithmetic. What MockGL can show honestly is *where* ink is — enough to see
// a blur spread, and to see undo put everything back byte for byte.
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'

import type { LayerFilter, LayerFilterOperation, Operation } from '@grafetto/shared'

import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerDelete, readLayerPixels,
} from './testing/engineTestUtils'

function makeFilter(userId: string, layerId: string, filter: LayerFilter): LayerFilterOperation {
  return { id: nanoid(10), type: 'layer_filter', userId, timestamp: Date.now(), layerId, filter }
}

function undoOf(op: Operation): Operation {
  return { id: `undo-${op.id}`, type: 'operation_undo', userId: op.userId, timestamp: 0, targetOpId: op.id }
}

function inked(pixels: Uint8Array | null): number {
  let n = 0
  if (pixels) for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) n++
  return n
}

function paintedEngine() {
  const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.appendOperation(fillStroke('user-a', 'L', 32, 32, 6))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return engine
}

describe('layer_filter in the engine (#574)', () => {
  it('a blur spreads the ink, and undo takes it back exactly', () => {
    const engine = paintedEngine()
    const before = readLayerPixels(engine, 'L')
    expect(inked(before)).toBeGreaterThan(0)

    const op = makeFilter('user-a', 'L', { kind: 'gaussian_blur', radius: 3 })
    engine.appendOperation(op)
    expect(inked(readLayerPixels(engine, 'L'))).toBeGreaterThan(inked(before))

    engine.appendOperation(undoOf(op))
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })

  it('an identity colour filter changes nothing', () => {
    const engine = paintedEngine()
    const before = readLayerPixels(engine, 'L')
    engine.appendOperation(makeFilter('user-a', 'L', { kind: 'hsl', hue: 0, saturation: 0, lightness: 0 }))
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })

  it('a filter on a layer that no longer exists is revoked, not kept', () => {
    const engine = paintedEngine()
    engine.appendOperation(makeLayerDelete('user-a', ['L']))
    const op = makeFilter('user-a', 'L', { kind: 'gaussian_blur', radius: 2 })
    engine.appendOperation(op)
    expect(engine.getOperations().find(o => o.id === op.id)).toBeUndefined()
  })

  it('an unknown filter kind from a newer peer is skipped, not guessed at', () => {
    const engine = paintedEngine()
    const before = readLayerPixels(engine, 'L')
    // A kind this build has never heard of, as a newer client could send.
    const alien = { kind: 'emboss', depth: 3 } as unknown as LayerFilter
    engine.appendOperation(makeFilter('user-a', 'L', alien))
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })

  it('the preview floats over the layer and never writes into it', () => {
    const engine = paintedEngine()
    const before = readLayerPixels(engine, 'L')
    engine.previewLayerFilter('L', { kind: 'gaussian_blur', radius: 3 })
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
    engine.clearLayerTransformPreview()
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })
})
