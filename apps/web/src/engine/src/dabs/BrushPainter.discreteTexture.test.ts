import { MockGL } from '../../testing/mockGL'
import { attachContextStorage, snapshotContextStorage } from '../buffers/ContextStorageOwner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrushPainter } from './BrushPainter'
import type { BrushContext } from './BrushPainter'

const mocks = vi.hoisted(() => ({ base: new Uint8Array(256*256), mips: [256,128,64,32,16,8,4,2,1].map(side=>new Uint8Array(side*side)), pixels: vi.fn(), pyramid: vi.fn(), upload: vi.fn() }))
vi.mock('../presets/tipMasks', () => ({ brushTexturePixels: mocks.pixels, brushTextureMips: mocks.pyramid, tipMaskMips: vi.fn() }))
vi.mock('./BrushBehaviorPainter', () => ({ BrushBehaviorPainter: class {} }))
vi.mock('./BrushTextureCache',async importOriginal=>{const actual=await importOriginal<typeof import('./BrushTextureCache')>();mocks.upload.mockImplementation(actual.uploadBrushTexture);return {...actual,uploadBrushTexture:mocks.upload}})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pixels.mockReturnValue(mocks.base)
  mocks.pyramid.mockReturnValue(mocks.mips)
})

describe('discrete texture preparation', () => {
  it('uploads the original level zero without requesting discarded mip derivatives', () => {
    const gl = new MockGL() as unknown as WebGLRenderingContext
    const painter = new BrushPainter({ gl } as BrushContext)
    const resource = { painter: 'stamp' as const, id: 'grit' as const, grain: true, discrete: true as const }
    painter.prepareTexture([resource], resource)
    expect(mocks.pixels).toHaveBeenCalledWith('grit')
    expect(mocks.pyramid).not.toHaveBeenCalled()
    expect(mocks.upload).toHaveBeenCalledWith(gl, [mocks.base], gl.LUMINANCE, gl.REPEAT, true,undefined,expect.objectContaining({kind:'context-storage-reservation'}))
    expect(mocks.upload.mock.calls[0][1][0]).toBe(mocks.base)
    painter['textures'].clear();expect(snapshotContextStorage(gl).residentBytes).toBe(0)
  })
  it('keeps the legacy filtered texture pyramid unchanged', () => {
    const gl = new MockGL() as unknown as WebGLRenderingContext
    const painter = new BrushPainter({ gl } as BrushContext)
    const resource = { painter: 'stamp' as const, id: 'grit' as const, grain: true }
    painter.prepareTexture([resource], resource)
    expect(mocks.pixels).not.toHaveBeenCalled()
    expect(mocks.pyramid).toHaveBeenCalledWith('grit')
    expect(mocks.upload).toHaveBeenCalledWith(gl, mocks.mips, gl.LUMINANCE, gl.REPEAT, false,undefined,expect.objectContaining({kind:'context-storage-reservation'}))
    painter['textures'].clear();expect(snapshotContextStorage(gl).residentBytes).toBe(0)
  })
})

it('denies a real painter miss before asking its CPU pixel/mip providers to stage work',()=>{
  const gl=new MockGL() as unknown as WebGLRenderingContext
  attachContextStorage(gl,{limitBytes:0})
  const painter=new BrushPainter({gl} as BrushContext),resource={painter:'stamp' as const,id:'grit' as const,grain:true}
  expect(()=>painter.prepareTexture([resource],resource)).toThrow('admission')
  expect(mocks.pixels).not.toHaveBeenCalled();expect(mocks.pyramid).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled()
  expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})
