// (#365) Engine-level wiring for tile mip chains: that the composite actually
// asks for them, and only when it is shrinking tiles. The mechanics of a
// chain (generate-then-filter ordering, invalidation on every write path) are
// covered on the buffer itself in src/AccumulationBuffer.mipmaps.test.ts;
// this file is about the decision — which is where a regression would hide,
// since a mip chain nobody requests is invisible to every other test in the
// suite.
import { describe, expect, it } from 'vitest'

import type { MockGL } from './testing/mockGL'
import { createTestEngine, fillStroke, layerTileTextures, makeLayerAdd, readCompositePixels } from './testing/engineTestUtils'

function paintedInfiniteEngine() {
  const { engine, canvas } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.appendOperation(fillStroke('user-a', 'L', 0, 0, 15))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  const mock = canvas.getContext() as unknown as MockGL
  return { engine, mock }
}

function mipState(engine: ReturnType<typeof paintedInfiniteEngine>['engine'], mock: MockGL) {
  const textures = layerTileTextures(engine, 'L')
  expect(textures.length).toBeGreaterThan(0) // otherwise the test proves nothing
  return {
    generations: textures.map(t => mock.getMipmapGenerations(t)),
    askingForMips: textures.map(t => mock.getMinFilter(t) === mock.LINEAR_MIPMAP_LINEAR),
  }
}

describe('infinite canvas: tile mip chains (#365)', () => {
  it('does not build mip levels when drawing at 1:1', () => {
    // The zoom people actually draw at. Levels nobody samples would be pure
    // cost on the one path that has to stay fast.
    const { engine, mock } = paintedInfiniteEngine()
    engine.setInfiniteCamera(0, 0, 1, 0)
    readCompositePixels(engine)

    const { generations, askingForMips } = mipState(engine, mock)
    expect(generations.every(n => n === 0)).toBe(true)
    expect(askingForMips.every(v => v === false)).toBe(true)
  })

  it('builds them once the camera is zoomed out far enough to shrink tiles', () => {
    const { engine, mock } = paintedInfiniteEngine()
    engine.setInfiniteCamera(0, 0, 0.25, 0)
    readCompositePixels(engine)

    const { generations, askingForMips } = mipState(engine, mock)
    expect(generations.every(n => n === 1)).toBe(true)
    expect(askingForMips.every(v => v === true)).toBe(true)
  })

  it('does not rebuild them on a second frame of a still camera', () => {
    // A composite re-samples the same tiles every frame; regenerating a chain
    // per frame would hand back exactly the cost the levels were bought to
    // save.
    const { engine, mock } = paintedInfiniteEngine()
    engine.setInfiniteCamera(0, 0, 0.25, 0)
    readCompositePixels(engine)
    readCompositePixels(engine)
    readCompositePixels(engine)

    expect(mipState(engine, mock).generations.every(n => n === 1)).toBe(true)
  })

  it('rebuilds them after new paint changes the tile, never sampling the stale chain', () => {
    // The regression this guards: painting while zoomed out must not leave a
    // tile sampling the levels it had before the stroke landed.
    const { engine, mock } = paintedInfiniteEngine()
    engine.setInfiniteCamera(0, 0, 0.25, 0)
    readCompositePixels(engine)
    expect(mipState(engine, mock).generations.every(n => n === 1)).toBe(true)

    engine.appendOperation(fillStroke('user-a', 'L', 40, 40, 10))
    readCompositePixels(engine)

    const { generations, askingForMips } = mipState(engine, mock)
    // Only the tile the second stroke actually landed in is rebuilt. World
    // (0,0) is a tile *corner*, so the first stroke spans four tiles while
    // the second sits inside one of them — the other three are untouched and
    // correctly keep the chain they already had.
    expect(Math.max(...generations)).toBeGreaterThanOrEqual(2)
    // The invariant that must hold for every tile regardless: none is left
    // sampling a chain that no longer matches its pixels.
    expect(askingForMips.every(v => v === true)).toBe(true)
  })

  it('leaves a bounded room alone — its tiles are not power-of-two and it never minifies', () => {
    // A bounded room is scaled down by the browser compositor (a CSS
    // transform on its canvas element), so its buffers are always sampled
    // 1:1 — and at its own canvas size they could not carry a chain in
    // WebGL1 anyway.
    const { engine, canvas } = createTestEngine({ userId: 'user-a' }, { width: 60, height: 60 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 10, 10, 5))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    readCompositePixels(engine)

    const mock = canvas.getContext() as unknown as MockGL
    const textures = layerTileTextures(engine, 'L')
    expect(textures.length).toBeGreaterThan(0)
    expect(textures.every(t => mock.getMipmapGenerations(t) === 0)).toBe(true)
  })
})
