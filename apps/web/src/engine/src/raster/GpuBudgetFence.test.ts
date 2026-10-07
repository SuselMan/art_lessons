import { describe, expect, it, vi } from 'vitest'
import { GpuBudgetFence } from './GpuBudgetFence'

function context() {
  const state = { active: 33986, framebuffer: { old: 'fbo' }, texture: { old: 'unit0' }, pack: 8, lost: false }
  const gl = {
    ACTIVE_TEXTURE: 34016, FRAMEBUFFER_BINDING: 36006, TEXTURE_BINDING_2D: 32873, PACK_ALIGNMENT: 3333,
    TEXTURE0: 33984, TEXTURE_2D: 3553, FRAMEBUFFER: 36160, COLOR_ATTACHMENT0: 36064, FRAMEBUFFER_COMPLETE: 36053,
    TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240, TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243,
    NEAREST: 9728, CLAMP_TO_EDGE: 33071, RGBA: 6408, UNSIGNED_BYTE: 5121,
    getParameter: vi.fn((p: number) => p === 34016 ? state.active : p === 36006 ? state.framebuffer : p === 32873 ? state.texture : state.pack),
    activeTexture: vi.fn((v: number) => { state.active = v }), bindTexture: vi.fn((_t: number, v: typeof state.texture) => { state.texture = v }),
    bindFramebuffer: vi.fn((_t: number, v: typeof state.framebuffer) => { state.framebuffer = v }),
    createTexture: vi.fn(() => ({ own: 'texture' })), createFramebuffer: vi.fn(() => ({ own: 'fbo' })),
    texParameteri: vi.fn(), texImage2D: vi.fn(), framebufferTexture2D: vi.fn(), checkFramebufferStatus: vi.fn(() => 36053),
    pixelStorei: vi.fn((_p: number, v: number) => { state.pack = v }), readPixels: vi.fn(),
    deleteTexture: vi.fn(), deleteFramebuffer: vi.fn(), isContextLost: vi.fn(() => state.lost),
  }
  return { gl, state, fence: new GpuBudgetFence(gl as unknown as WebGLRenderingContext) }
}

describe('GPU scheduling completion fence (#728)', () => {
  it('allocates once, reads four bytes, and restores caller state', () => {
    const { gl, state, fence } = context(), original = { ...state }
    fence.sync(); fence.sync()
    expect(gl.createTexture).toHaveBeenCalledOnce(); expect(gl.createFramebuffer).toHaveBeenCalledOnce()
    expect(state).toEqual(original)
    for (const args of gl.readPixels.mock.calls as unknown as unknown[][]) {
      expect(args.slice(0, 6)).toEqual([0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE])
      expect((args[6] as Uint8Array).length).toBe(4)
    }
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.PACK_ALIGNMENT, 1)
    fence.release(); fence.release()
    expect(gl.deleteTexture).toHaveBeenCalledOnce(); expect(gl.deleteFramebuffer).toHaveBeenCalledOnce()
  })
  it('restores framebuffer and pack alignment if readback throws', () => {
    const { gl, state, fence } = context(), original = { ...state }
    gl.readPixels.mockImplementation(() => { throw Error('read failed') })
    expect(() => fence.sync()).toThrow('read failed')
    expect(state).toEqual(original)
    fence.release()
  })
  it('cleans partial allocation and restores active texture when FBO is incomplete', () => {
    const { gl, state, fence } = context(), original = { ...state }
    gl.checkFramebufferStatus.mockReturnValue(0)
    expect(() => fence.sync()).toThrow('framebuffer incomplete')
    expect(state).toEqual(original)
    expect(gl.deleteTexture).toHaveBeenCalledOnce(); expect(gl.deleteFramebuffer).toHaveBeenCalledOnce()
    fence.release()
    expect(gl.deleteTexture).toHaveBeenCalledOnce()
  })
  it('forgets dead handles without GL deletion and recreates on restoration', () => {
    const { gl, state, fence } = context()
    fence.sync(); state.lost = true; fence.sync(); fence.release()
    expect(gl.deleteTexture).not.toHaveBeenCalled(); expect(gl.deleteFramebuffer).not.toHaveBeenCalled()
    state.lost = false; fence.sync()
    expect(gl.createTexture).toHaveBeenCalledTimes(2)
    fence.release(); expect(gl.deleteTexture).toHaveBeenCalledOnce()
  })
})
