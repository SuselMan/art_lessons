import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'
import { BufferResidency } from './BufferResidency'

// Add binding introspection to the existing pixel backend, without changing it.
function fixture(budget = 72) {
  const mock = new MockGL()
  const gl = mock as unknown as WebGLRenderingContext
  Object.assign(gl, { FRAMEBUFFER_BINDING: 0x8ca6, ACTIVE_TEXTURE: 0x84e0,
    TEXTURE_BINDING_2D: 0x8069, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d })
  let fbo: WebGLFramebuffer | null = null
  let active: number = gl.TEXTURE0
  const textures = new Map<number, WebGLTexture | null>()
  const bindFbo = gl.bindFramebuffer.bind(gl)
  const bindTex = gl.bindTexture.bind(gl)
  const activeTex = gl.activeTexture.bind(gl)
  vi.spyOn(gl, 'bindFramebuffer').mockImplementation((target, value) => { fbo = value; bindFbo(target, value) })
  vi.spyOn(gl, 'bindTexture').mockImplementation((target, value) => { textures.set(active, value); bindTex(target, value) })
  vi.spyOn(gl, 'activeTexture').mockImplementation(value => { active = value; activeTex(value) })
  const parameter = gl.getParameter.bind(gl)
  vi.spyOn(gl, 'getParameter').mockImplementation(p => {
    if (p === gl.FRAMEBUFFER_BINDING) return fbo
    if (p === gl.ACTIVE_TEXTURE) return active
    if (p === gl.TEXTURE_BINDING_2D) return textures.get(active) ?? null
    if (p === gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 8
    return parameter(p)
  })
  const cache = new BufferResidency(gl, budget)
  const make = () => new AccumulationBuffer(gl, 3, 3).enableResidency(cache)
  const unbind = () => { gl.bindTexture(gl.TEXTURE_2D, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null) }
  return { gl, mock, cache, make, unbind }
}
function pixels(seed: number) {
  return Uint8Array.from({ length: 36 }, (_, i) => ((i - i % 4 + 3) * seed + 17) % 256)
}

it('preserves exact pixel bytes through repeated LRU eviction and readback', () => {
  const { make, unbind, cache } = fixture()
  const buffers = Array.from({ length: 7 }, (_, i) => {
    const b = make(); b.restorePixels(pixels(i + 3)); unbind(); return b
  })
  for (let round = 0; round < 3; round++) for (const [i, b] of buffers.entries()) {
    expect(b.readPixels()).toEqual(pixels(i + 3)); unbind()
    expect(cache.residentBytes).toBeLessThanOrEqual(72)
  }
  cache.dispose()
  expect(cache.bufferCount).toBe(0)
  expect(cache.residentBytes).toBe(0)
})

it('keeps normal output FBO and all sampled buffers alive across hydration', () => {
  const { gl, make, unbind, cache } = fixture(108)
  const a = make(); a.restorePixels(pixels(3)); unbind()
  const b = make(); b.restorePixels(pixels(5)); unbind()
  const c = make(); unbind()
  const d = make(); unbind() // evicts a
  const out = new AccumulationBuffer(gl, 3, 3)
  out.beginReplaceDraw()
  const target = gl.getParameter(gl.FRAMEBUFFER_BINDING)
  gl.activeTexture(gl.TEXTURE0 + 3)
  const sentinel = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, sentinel)
  const tex = a.texture // evicts b and hydrates while normal output is active
  expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(target)
  expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe(gl.TEXTURE0 + 3)
  expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).toBe(sentinel)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  void c.texture
  void d.texture
  expect(() => b.texture).toThrow('pinned or bound')
  out.endDraw(); unbind()
  expect(b.readPixels()).toEqual(pixels(5))
  out.destroy(); cache.dispose()
})

it('copies parked source to ordinary destination and ordinary source to parked destination', () => {
  const { gl, make, unbind, cache } = fixture()
  const a = make(); a.restorePixels(pixels(7)); unbind()
  const b = make(); unbind()
  const c = make(); unbind()
  const out = new AccumulationBuffer(gl, 3, 3)
  const sentinel = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, sentinel)
  a.copyTo(out)
  expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).toBe(sentinel)
  expect(out.readPixels()).toEqual(pixels(7))
  unbind(); out.copyTo(b)
  expect(b.readPixels()).toEqual(pixels(7))
  out.destroy(); c.destroy(); cache.dispose()
})

it('releases transaction pins after exceptions and handles context loss without GL deletion', () => {
  const { gl, make, unbind, cache } = fixture(36)
  const a = make(); unbind()
  expect(() => cache.runPinned([a], () => { throw Error('cancel') })).toThrow('cancel')
  const b = make(); unbind()
  const deleteTex = vi.spyOn(gl, 'deleteTexture')
  const read = vi.spyOn(gl, 'readPixels')
  cache.forgetContext()
  expect(deleteTex).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
  expect(() => b.texture).toThrow('unavailable')
  a.destroy(); b.destroy(); cache.dispose()
  expect(cache.bufferCount).toBe(0)
})

it('preserves clipped top-edge restores and GL-region copies across eviction', () => {
  const { gl, cache, make, unbind } = fixture()
  const source = make()
  const payload = pixels(9).subarray(0, 16)
  source.restorePixelsRect(2, 2, payload)
  const expected = source.readPixels(); unbind()
  const dest = make(); dest.clear(); unbind()
  const pressure = make(); unbind()
  expect(source.readPixels()).toEqual(expected); unbind()
  source.copyRegionInto(dest, 0, 1, 1, 0, 2, 2)
  const result = dest.readPixels(); unbind()
  const normalSource = new AccumulationBuffer(gl, 3, 3)
  const normalDest = new AccumulationBuffer(gl, 3, 3)
  normalSource.restorePixelsRect(2, 2, payload); normalDest.clear()
  normalSource.copyRegionInto(normalDest, 0, 1, 1, 0, 2, 2)
  expect(result).toEqual(normalDest.readPixels())
  unbind(); void pressure.texture; unbind()
  expect(dest.readPixels()).toEqual(result)
  normalSource.destroy(); normalDest.destroy(); cache.dispose()
})

it('reserves factory allocation before creating a texture, rejects oversize and double-free', () => {
  const { gl, cache, unbind } = fixture(36)
  const a = new AccumulationBuffer(gl, 3, 3, 'nearest', cache)
  unbind()
  const create = vi.spyOn(gl, 'createTexture')
  cache.runPinned([a], () => {
    expect(() => new AccumulationBuffer(gl, 3, 3, 'linear', cache)).toThrow('pinned or bound')
  })
  expect(create).not.toHaveBeenCalled()
  expect(() => new AccumulationBuffer(gl, 4, 4, 'linear', cache)).toThrow('exceeds')
  const deletes = vi.spyOn(gl, 'deleteTexture')
  a.destroy(); a.destroy(); cache.dispose()
  expect(deletes).toHaveBeenCalledTimes(1)
})


it('transfers every RGBA channel losslessly and restores nearest sampling', () => {
  const { gl, mock, cache, unbind } = fixture(36)
  const a = new AccumulationBuffer(gl, 3, 3, 'nearest', cache)
  const rgba = Uint8Array.from({ length: 36 }, (_, i) => (i * 31 + 7) & 255)
  a.restorePixels(rgba); unbind()
  // MockGL rasterizes alpha only. Supply a real RGBA readback at the eviction
  // boundary and check the exact upload, independently of its alpha pipeline.
  vi.spyOn(gl, 'readPixels').mockImplementationOnce((_x, _y, _w, _h, _f, _t, out) => {
    (out as Uint8Array).set(rgba)
  })
  const b = new AccumulationBuffer(gl, 3, 3, 'linear', cache)
  unbind()
  const upload = vi.spyOn(gl, 'texSubImage2D')
  const sampling = vi.spyOn(gl, 'texParameteri')
  const texture = a.texture
  expect(upload.mock.calls.at(-1)?.at(-1)).toEqual(rgba)
  expect(mock.getMinFilter(texture)).toBe(gl.NEAREST)
  expect(sampling).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  a.destroy(); b.destroy(); cache.dispose()
})


it('cycles more windows than the budget despite stale sampler bindings outside draws', () => {
  const { gl, cache } = fixture(72)
  const buffers = Array.from({ length: 12 }, (_, i) => {
    const b = new AccumulationBuffer(gl, 3, 3, 'linear', cache)
    b.restorePixels(pixels(i + 2))
    return b
  })
  for (let round = 0; round < 3; round++) for (const [i, b] of buffers.entries()) {
    gl.activeTexture(gl.TEXTURE0 + i % 8)
    gl.bindTexture(gl.TEXTURE_2D, b.texture)
    expect(b.readPixels()).toEqual(pixels(i + 2))
    expect(cache.residentBytes).toBeLessThanOrEqual(72)
  }
  cache.dispose()
})


it.each([[0, 0, 0, 0], [19, 73, 151, 233], [255, 0, 127, 1]])('round-trips asymmetric uniform RGBA through repeated eviction: %j', (...rgba) => {
  const { gl, make, unbind, cache } = fixture(36)
  const expected = Uint8Array.from({ length: 36 }, (_, i) => rgba[i % 4])
  const a = make(); a.writePixels(expected); unbind()
  // MockGL mirrors alpha in its raster backend: inject exact RGBA readback
  // and assert the full upload on each restoration, without a GPU pixel claim.
  vi.spyOn(gl, 'readPixels').mockImplementation((_x, _y, _w, _h, _format, _type, target) => {
    const bytes = target as Uint8Array
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) === (a as unknown as { _fbo: WebGLFramebuffer })._fbo) bytes.set(expected)
    else bytes.fill(0)
  })
  const uploads = vi.spyOn(gl, 'texSubImage2D')
  const b = make(); unbind() // a now owns compact uniform backing
  expect((a as unknown as { _backing: unknown })._backing).toEqual(rgba)
  for (let round = 0; round < 4; round++) {
    void a.texture
    expect(uploads.mock.lastCall?.[8]).toEqual(expected); unbind()
    void b.texture; unbind() // force a back to CPU after every hydration
    expect(cache.residentBytes).toBe(36)
  }
  cache.dispose()
  expect(cache.bufferCount).toBe(0)
})

it.each([0, 1, 2, 3])('keeps a last-pixel-only change in RGBA channel %s lossless', channel => {
  const { gl, make, unbind, cache } = fixture(36)
  const expected = Uint8Array.from({ length: 36 }, (_, i) => [19, 73, 151, 233][i % 4])
  expected[expected.length - 4 + channel] ^= 1
  const a = make(); a.writePixels(expected); unbind()
  // MockGL mirrors alpha in its raster backend: inject exact RGBA readback
  // and assert the full upload on each restoration, without a GPU pixel claim.
  vi.spyOn(gl, 'readPixels').mockImplementation((_x, _y, _w, _h, _format, _type, target) => {
    const bytes = target as Uint8Array
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) === (a as unknown as { _fbo: WebGLFramebuffer })._fbo) bytes.set(expected)
    else bytes.fill(0)
  })
  const uploads = vi.spyOn(gl, 'texSubImage2D')
  const b = make(); unbind()
  expect((a as unknown as { _backing: unknown })._backing).toBeInstanceOf(Uint8Array)
  for (let round = 0; round < 4; round++) {
    void a.texture
    expect(uploads.mock.lastCall?.[8]).toEqual(expected); unbind()
    void b.texture; unbind()
  }
  cache.dispose()
  expect(cache.bufferCount).toBe(0)
})
