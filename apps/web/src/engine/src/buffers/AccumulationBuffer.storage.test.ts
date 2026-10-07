import { describe, expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'

function setup() {
  const mock = new MockGL()
  const gl = mock as unknown as WebGLRenderingContext
  return { mock, gl }
}
function pixels(w: number, h: number) {
  return Uint8Array.from({ length: w * h * 4 }, (_, i) => i % 4 === 3 ? (i * 29) % 256 : i % 256)
}

describe('AccumulationBuffer storage reuse', () => {
  it.each(['nearest', 'linear'] as const)('copies every texel without redefining same-sized %s storage', filter => {
    const { mock, gl } = setup()
    const src = new AccumulationBuffer(gl, 8, 4, filter)
    const dst = new AccumulationBuffer(gl, 8, 4, filter)
    src.restorePixels(pixels(8, 4)); dst.restorePixels(new Uint8Array(8 * 4 * 4).fill(231))
    const sub = vi.spyOn(mock, 'copyTexSubImage2D')
    const redefine = vi.spyOn(mock, 'copyTexImage2D')
    src.copyTo(dst)
    expect(sub).toHaveBeenCalledOnce(); expect(redefine).not.toHaveBeenCalled()
    expect(dst.readPixels()).toEqual(src.readPixels())
  })

  it('preserves unequal-size resizing and repairs physical storage before a later nominal-size copy', () => {
    const { mock, gl } = setup()
    const small = new AccumulationBuffer(gl, 4, 4)
    const large = new AccumulationBuffer(gl, 8, 8)
    const other = new AccumulationBuffer(gl, 8, 8)
    small.restorePixels(pixels(4, 4)); other.restorePixels(pixels(8, 8))
    const redefine = vi.spyOn(mock, 'copyTexImage2D')
    small.copyTo(large)
    expect(redefine).toHaveBeenCalledTimes(1)
    other.copyTo(large)
    expect(redefine).toHaveBeenCalledTimes(2)
    expect(large.readPixels()).toEqual(other.readPixels())
    other.copyTo(large)
    expect(redefine).toHaveBeenCalledTimes(2)
  })

  it('retains the legacy self-copy command rather than silently discarding it', () => {
    const { mock, gl } = setup(); const buf = new AccumulationBuffer(gl, 4, 4)
    const redefine = vi.spyOn(mock, 'copyTexImage2D'); const sub = vi.spyOn(mock, 'copyTexSubImage2D')
    buf.copyTo(buf)
    expect(redefine).toHaveBeenCalledOnce(); expect(sub).not.toHaveBeenCalled()
  })

  it('does not enable storage reuse across GL contexts', () => {
    const a = setup(), b = setup()
    const src = new AccumulationBuffer(a.gl, 4, 4), dst = new AccumulationBuffer(b.gl, 4, 4)
    const redefine = vi.spyOn(a.mock, 'copyTexImage2D'); const sub = vi.spyOn(a.mock, 'copyTexSubImage2D')
    src.copyTo(dst)
    expect(redefine).toHaveBeenCalledOnce(); expect(sub).not.toHaveBeenCalled()
  })

  it('invalidates destination mipmaps on an in-place copy', () => {
    const { mock, gl } = setup()
    const src = new AccumulationBuffer(gl, 8, 8), dst = new AccumulationBuffer(gl, 8, 8)
    dst.setMipSampling(dst.ensureMipmaps())
    src.copyTo(dst)
    expect(mock.getMinFilter(dst.texture)).toBe(mock.LINEAR)
    dst.ensureMipmaps()
    expect(mock.getMipmapGenerations(dst.texture)).toBe(2)
  })

  it('uploads into existing storage and keeps the same RGBA readback as legacy redefine', () => {
    const { mock, gl } = setup(); const buf = new AccumulationBuffer(gl, 8, 4)
    const legacy = new AccumulationBuffer(gl, 8, 4), data = pixels(8, 4)
    gl.bindTexture(gl.TEXTURE_2D, legacy.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 8, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
    const redefine = vi.spyOn(mock, 'texImage2D'); const sub = vi.spyOn(mock, 'texSubImage2D')
    buf.restorePixels(data)
    expect(sub).toHaveBeenCalledOnce(); expect(redefine).not.toHaveBeenCalled()
    expect(buf.readPixels()).toEqual(legacy.readPixels())
  })

  it('full restore repairs physically resized storage before later reuse', () => {
    const { mock, gl } = setup()
    const small = new AccumulationBuffer(gl, 4, 4), large = new AccumulationBuffer(gl, 8, 8)
    small.copyTo(large)
    const redefine = vi.spyOn(mock, 'texImage2D')
    large.restorePixels(pixels(8, 8))
    expect(redefine).toHaveBeenCalledOnce()
    large.restorePixels(pixels(8, 8))
    expect(redefine).toHaveBeenCalledOnce()
  })

  it('retains the legacy command for an undersized upload payload', () => {
    const { mock, gl } = setup(); const buf = new AccumulationBuffer(gl, 8, 8)
    const redefine = vi.spyOn(mock, 'texImage2D'); const sub = vi.spyOn(mock, 'texSubImage2D')
    buf.restorePixels(new Uint8Array(4))
    expect(redefine).toHaveBeenCalledOnce(); expect(sub).not.toHaveBeenCalled()
  })
})
