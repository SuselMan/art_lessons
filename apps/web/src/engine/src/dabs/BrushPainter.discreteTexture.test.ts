import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrushPainter } from './BrushPainter'
import type { BrushContext } from './BrushPainter'

const mocks = vi.hoisted(() => ({ base: new Uint8Array(16), mips: [new Uint8Array(16), new Uint8Array(4), new Uint8Array(1)], pixels: vi.fn(), pyramid: vi.fn(), upload: vi.fn() }))
vi.mock('../presets/tipMasks', () => ({ brushTexturePixels: mocks.pixels, brushTextureMips: mocks.pyramid, tipMaskMips: vi.fn() }))
vi.mock('./BrushBehaviorPainter', () => ({ BrushBehaviorPainter: class {} }))
vi.mock('./BrushTextureCache', () => ({ BrushTextureCache: class { get() { return undefined }; protect() {}; put() {} }, uploadBrushTexture: mocks.upload }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pixels.mockReturnValue(mocks.base)
  mocks.pyramid.mockReturnValue(mocks.mips)
  mocks.upload.mockReturnValue({ texture: {}, bytes: 64 })
})

describe('discrete texture preparation', () => {
  it('uploads the original level zero without requesting discarded mip derivatives', () => {
    const gl = { LUMINANCE: 6409, REPEAT: 10497 } as WebGLRenderingContext
    const painter = new BrushPainter({ gl } as BrushContext)
    const resource = { painter: 'stamp' as const, id: 'grit' as const, grain: true, discrete: true as const }
    painter.prepareTexture([resource], resource)
    expect(mocks.pixels).toHaveBeenCalledWith('grit')
    expect(mocks.pyramid).not.toHaveBeenCalled()
    expect(mocks.upload).toHaveBeenCalledWith(gl, [mocks.base], 6409, 10497, true)
    expect(mocks.upload.mock.calls[0][1][0]).toBe(mocks.base)
  })
  it('keeps the legacy filtered texture pyramid unchanged', () => {
    const gl = { LUMINANCE: 6409, REPEAT: 10497 } as WebGLRenderingContext
    const painter = new BrushPainter({ gl } as BrushContext)
    const resource = { painter: 'stamp' as const, id: 'grit' as const, grain: true }
    painter.prepareTexture([resource], resource)
    expect(mocks.pixels).not.toHaveBeenCalled()
    expect(mocks.pyramid).toHaveBeenCalledWith('grit')
    expect(mocks.upload).toHaveBeenCalledWith(gl, mocks.mips, 6409, 10497, false)
  })
})
