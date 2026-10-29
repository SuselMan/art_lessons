import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'

it.each(['premultiplied-rgba8', 'straight-rgba8'] as const)('copies %s without redefining destination storage', encoding => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const source = new AccumulationBuffer(gl, 2, 2, 'nearest', encoding), dest = new AccumulationBuffer(gl, 2, 2, 'nearest', encoding)
  try {
    // The mock stores alpha only; arbitrary RGB identity needs the device gate.
    const input = new Uint8Array([0,0,0,0, 1,2,3,17, 4,5,6,128, 7,8,9,255])
    source.restorePixels(input)
    const allocation = vi.spyOn(mock, 'copyTexImage2D'), subcopy = vi.spyOn(mock, 'copyTexSubImage2D')
    source.copyTo(dest)
    expect(subcopy).toHaveBeenCalledWith(mock.TEXTURE_2D, 0, 0, 0, 0, 0, 2, 2)
    expect(allocation).not.toHaveBeenCalled()
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo)
    const out = new Uint8Array(16); gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, out)
    expect([out[3], out[7], out[11], out[15]]).toEqual([0,17,128,255])
  } finally { source.destroy(); dest.destroy() }
})
it('rejects wrong dimensions, context and feedback before changing destination or GL state', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const source = new AccumulationBuffer(gl, 2, 2), small = new AccumulationBuffer(gl, 1, 2)
  const foreign = new AccumulationBuffer(new MockGL() as unknown as WebGLRenderingContext, 2, 2)
  try {
    const bind = vi.spyOn(mock, 'bindFramebuffer'), sample = vi.spyOn(mock, 'texParameteri')
    for (const dest of [source, small, foreign]) expect(() => source.copyTo(dest)).toThrow('distinct same-context')
    expect(bind).not.toHaveBeenCalled(); expect(sample).not.toHaveBeenCalled()
  } finally { source.destroy(); small.destroy(); foreign.destroy() }
})
it('closes the source framebuffer when a copy fails', () => {
  const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext
  const source = new AccumulationBuffer(gl, 2, 2), dest = new AccumulationBuffer(gl, 2, 2)
  try {
    const bind = vi.spyOn(mock, 'bindFramebuffer')
    vi.spyOn(mock, 'copyTexSubImage2D').mockImplementation(() => { throw new Error('copy failed') })
    expect(() => source.copyTo(dest)).toThrow('copy failed')
    expect(bind).toHaveBeenLastCalledWith(mock.FRAMEBUFFER, null)
  } finally { source.destroy(); dest.destroy() }
})
