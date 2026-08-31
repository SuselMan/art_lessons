// (#365) Mip chains on tile buffers — the fix for an infinite room at low
// zoom point-sampling one texel out of a hundreds-wide footprint.
//
// MockGL deliberately samples 1:1 and has no notion of a mip level, so these
// tests cannot show that the picture looks better; that needs a real GPU and
// a side-by-side (see the issue). What they *can* pin is the invariant whose
// violation is catastrophic rather than merely ugly: in GLES2 a texture whose
// min filter asks for levels it has not been given is *incomplete* and
// samples as opaque black — the exact symptom #363 spent a session chasing.
// So every test below is ultimately about one thing: the trilinear filter is
// set only while a chain that matches level 0 actually exists.
import { describe, expect, it } from 'vitest'

import { MockGL } from '../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'

function ctx(): { gl: WebGLRenderingContext; mock: MockGL } {
  const mock = new MockGL()
  return { gl: mock as unknown as WebGLRenderingContext, mock }
}

/** The invariant, checked directly: a texture asking for mip levels must have
 *  been given a chain since its last write. */
function asksForMips(mock: MockGL, buf: AccumulationBuffer): boolean {
  return mock.getMinFilter(buf.texture) === mock.LINEAR_MIPMAP_LINEAR
}

describe('AccumulationBuffer mipmaps (#365)', () => {
  it('generates a chain and only then asks to sample from it', () => {
    const { gl, mock } = ctx()
    const buf = new AccumulationBuffer(gl, 16, 16)
    // A fresh buffer must be complete the moment it exists — nothing has
    // generated a chain, so nothing may ask for one.
    expect(asksForMips(mock, buf)).toBe(false)
    expect(mock.getMipmapGenerations(buf.texture)).toBe(0)

    buf.setMipSampling(buf.ensureMipmaps())
    expect(mock.getMipmapGenerations(buf.texture)).toBe(1)
    expect(asksForMips(mock, buf)).toBe(true)
  })

  it('does not regenerate when nothing has been written since', () => {
    // The composite calls this once per tile per frame, and a still camera
    // re-draws the same tiles indefinitely — regenerating a 1024² chain every
    // frame for content that has not moved would hand back in cost exactly
    // what the mip levels were bought to save.
    const { gl, mock } = ctx()
    const buf = new AccumulationBuffer(gl, 16, 16)
    for (let frame = 0; frame < 5; frame++) buf.setMipSampling(buf.ensureMipmaps())
    expect(mock.getMipmapGenerations(buf.texture)).toBe(1)
  })

  it('never asks for mips on a non-power-of-two buffer', () => {
    // WebGL1 forbids mipmaps there outright; a bounded room's tiles are its
    // own canvas size (e.g. A4's 1240x1754) and every viewport-sized scratch
    // buffer is arbitrary. Asking anyway is the black-texture trap.
    const { gl, mock } = ctx()
    const buf = new AccumulationBuffer(gl, 1240, 1754)
    buf.setMipSampling(buf.ensureMipmaps())
    expect(mock.getMipmapGenerations(buf.texture)).toBe(0)
    expect(asksForMips(mock, buf)).toBe(false)
  })

  it('is capable only when BOTH dimensions are powers of two', () => {
    const { gl, mock } = ctx()
    const oneSided = new AccumulationBuffer(gl, 1024, 1000)
    oneSided.setMipSampling(oneSided.ensureMipmaps())
    expect(mock.getMipmapGenerations(oneSided.texture)).toBe(0)
  })

  // Each of these leaves level 0 different from the chain that was generated
  // before it, so each must drop the filter back to plain LINEAR. Missing one
  // means that buffer keeps sampling content a write ago — visible as a tile
  // lagging behind the stroke being drawn into it.
  const writes: Array<[string, (buf: AccumulationBuffer, gl: WebGLRenderingContext) => void]> = [
    ['beginDraw', b => b.beginDraw()],
    ['beginErase', b => b.beginErase()],
    ['beginAdditiveDraw', b => b.beginAdditiveDraw()],
    ['beginReplaceDraw', b => b.beginReplaceDraw()],
    ['clear', b => b.clear()],
    ['restorePixels', b => b.restorePixels(new Uint8Array(16 * 16 * 4))],
    ['copyTo (as destination)', (b, gl) => new AccumulationBuffer(gl, 16, 16).copyTo(b)],
    ['copyRegionInto (as destination)', (b, gl) => new AccumulationBuffer(gl, 16, 16).copyRegionInto(b, 0, 0, 0, 0, 16, 16)],
  ]

  for (const [name, write] of writes) {
    it(`stops asking for mips after ${name} changes level 0`, () => {
      const { gl, mock } = ctx()
      const buf = new AccumulationBuffer(gl, 16, 16)
      buf.setMipSampling(buf.ensureMipmaps())
      expect(asksForMips(mock, buf)).toBe(true)

      write(buf, gl)
      expect(asksForMips(mock, buf)).toBe(false)

      // ...and the next composite regenerates rather than silently sampling
      // the stale chain it just dropped.
      buf.setMipSampling(buf.ensureMipmaps())
      expect(mock.getMipmapGenerations(buf.texture)).toBe(2)
      expect(asksForMips(mock, buf)).toBe(true)
    })
  }
})
