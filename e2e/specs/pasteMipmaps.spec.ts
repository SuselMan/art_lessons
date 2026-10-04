import { expect, test } from '@playwright/test'

import type { AreaOpsContext } from '../../apps/web/src/engine/src/raster/AreaOps'

// #714: the gizmo draws freshly copied preview tiles, while its commit writes
// into a resident tile whose mip chain may already represent the old content.
// MockGL cannot distinguish those pixels, so exercise the real rasterizer.
test('a transformed paste updates the zoomed-out tile as well as its base pixels', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const bufferUrl = '/src/engine/src/buffers/AccumulationBuffer.ts'
    const areaUrl = '/src/engine/src/raster/AreaOps.ts'
    const passesUrl = '/src/engine/src/raster/blitPasses.ts'
    const previewsUrl = '/src/engine/src/raster/layerPreviews.ts'
    const { AccumulationBuffer } = await import(bufferUrl) as typeof import('../../apps/web/src/engine/src/buffers/AccumulationBuffer')
    const { AreaOps } = await import(areaUrl) as typeof import('../../apps/web/src/engine/src/raster/AreaOps')
    const { BlitPasses } = await import(passesUrl) as typeof import('../../apps/web/src/engine/src/raster/blitPasses')
    const { LayerPreviews } = await import(previewsUrl) as typeof import('../../apps/web/src/engine/src/raster/layerPreviews')
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl')
    if (!gl) throw new Error('no WebGL')
    const quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const passes = new BlitPasses(gl, quad)
    const ctx: AreaOpsContext = {
      gl, infinite: false, previews: new LayerPreviews(), passes: () => passes,
      layer: () => undefined, image: () => undefined,
      tileSize: () => ({ w: 256, h: 256 }), pageSize: () => ({ w: 256, h: 256 }),
      displayOrder: () => [], paperColor: () => [1, 1, 1],
      compositeTextures: () => {}, encodePng: async () => null, display: () => {},
    }
    const area = new AreaOps(ctx)
    const tile = new AccumulationBuffer(gl, 256, 256)
    const display = new AccumulationBuffer(gl, 32, 32)
    tile.clear()
    // A previously displayed blank tile: precisely the state hidden by a float.
    tile.setMipSampling(tile.ensureMipmaps())
    const raster = document.createElement('canvas')
    raster.width = 128; raster.height = 128
    const paint = raster.getContext('2d')!
    paint.fillStyle = '#ff0000'; paint.fillRect(0, 0, 128, 128)
    const image = new Image()
    image.src = raster.toDataURL()
    await image.decode()
    const samples: Array<{ base: number; reduced: number }> = []
    // Translation and scaling, including repeated writes to a displayed tile.
    for (const scale of [1, 0.75]) {
      area.drawImageThroughMatrix(tile, 0, 0, image,
        { x: 0, y: 0, width: 128, height: 128 }, [scale, 0, 0, 0, scale, 0, 64, 64, 1])
      const base = tile.readPixels()[(128 * 256 + 128) * 4 + 3]
      tile.setMipSampling(tile.ensureMipmaps())
      display.clear(); display.beginDraw()
      passes.image(tile.texture, 32, 32, 0, 0, 32, 32)
      display.endDraw()
      const reduced = display.readPixels()[(16 * 32 + 16) * 4 + 3]
      samples.push({ base, reduced })
    }
    const error = gl.getError()
    area.destroy(); tile.destroy(); display.destroy(); passes.destroy()
    gl.deleteBuffer(quad)
    return { samples, error }
  })
  expect(result.error).toBe(0)
  for (const sample of result.samples) {
    expect(sample.base).toBe(255)
    expect(sample.reduced).toBe(255)
  }
})
