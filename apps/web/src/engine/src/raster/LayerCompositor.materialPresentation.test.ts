import { expect, it, vi } from 'vitest'
import { LayerCompositor, type LayerCompositorContext } from './LayerCompositor'
import { exactFrame } from './cameraFrame'
it('replaces the visible target layer once at its actual opacity using projected world dimensions', () => {
  const resolve = vi.fn(() => []), mip = vi.fn()
  const ctx = {
    previews: () => ({ tiles: new Map() }),
    materialPresentations: () => new Map([['paint', { originX: 0, originY: 0, worldWidth: 2560, worldHeight: 1600,
      buffer: { width: 1024, height: 640, texture: 'material', setMipSampling: mip } }]]),
    layers: () => new Map([['paint', { resolveVisible: resolve }]]),
  } as unknown as LayerCompositorContext
  const compositor = new LayerCompositor(ctx), draw = vi.fn()
  compositor.drawTileComposite = draw
  const frame = exactFrame({ x: 0, y: 0, width: 2560, height: 1600 })
  compositor.drawCompositeItem(frame, 'paint', 0.35, {} as WebGLFramebuffer, 800, 500)
  expect(draw).toHaveBeenCalledExactlyOnceWith(frame, 'material', 0, 0, 2560, 1600, 0.35, {}, 800, 500)
  expect(resolve).not.toHaveBeenCalled()
})
it('canonical exports and camera frames outside the replacement read the actual layer', () => {
  const resolve = vi.fn(() => [])
  const ctx = {
    previews: () => ({ tiles: new Map(), areaLayers: new Set() }),
    materialPresentations: () => new Map([['paint', { originX: 0, originY: 0, worldWidth: 100, worldHeight: 100,
      buffer: { width: 50, height: 50, texture: 'material', setMipSampling: vi.fn() } }]]),
    layers: () => new Map([['paint', { resolveVisible: resolve }]]),
  } as unknown as LayerCompositorContext
  const compositor = new LayerCompositor(ctx), draw = vi.fn()
  compositor.drawTileComposite = draw
  compositor.drawCompositeItem(exactFrame({ x: 0, y: 0, width: 100, height: 100 }), 'paint', 1, {} as WebGLFramebuffer, 100, 100, false)
  compositor.drawCompositeItem(exactFrame({ x: 0, y: 0, width: 200, height: 200 }), 'paint', 1, {} as WebGLFramebuffer, 200, 200)
  expect(resolve).toHaveBeenCalledTimes(2)
  expect(draw).not.toHaveBeenCalled()
})
it('selection previews take precedence and projected mip sampling uses texel rather than world scale', () => {
  const mip = vi.fn(), ensure = vi.fn(() => true), resolve = vi.fn(() => [])
  const tiles = new Map()
  const ctx = {
    previews: () => ({ tiles, areaLayers: new Set() }),
    materialPresentations: () => new Map([['paint', { originX: 0, originY: 0, worldWidth: 100, worldHeight: 100,
      buffer: { width: 10, height: 10, texture: 'material', setMipSampling: mip, ensureMipmaps: ensure } }]]),
    layers: () => new Map([['paint', { resolveVisible: resolve }]]),
  } as unknown as LayerCompositorContext
  const compositor = new LayerCompositor(ctx), draw = vi.fn()
  compositor.drawTileComposite = draw
  const frame = { ...exactFrame({ x: 0, y: 0, width: 100, height: 100 }), scale: 0.5 }
  compositor.drawCompositeItem(frame, 'paint', 0, {} as WebGLFramebuffer, 50, 50)
  expect(mip).toHaveBeenCalledWith(false) // 5 screen px per projected texel.
  expect(ensure).not.toHaveBeenCalled()
  expect(draw.mock.calls[0][6]).toBe(0)
  tiles.set('paint', [])
  draw.mockClear()
  compositor.drawCompositeItem(frame, 'paint', 1, {} as WebGLFramebuffer, 50, 50)
  expect(draw).not.toHaveBeenCalled()
})
