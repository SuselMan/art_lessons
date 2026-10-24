import { describe, expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { BrushTextureCache, uploadBrushTexture } from './BrushTextureCache'

const texture = (): WebGLTexture => ({} as WebGLTexture)
const rgbaMipBytes = (size: number): number => {
  let bytes = 0
  for (let side = size; side >= 1; side = Math.floor(side / 2)) bytes += side * side * 4
  return bytes
}
function setup(budget = 100) {
  const gl = new MockGL(), deleted = vi.spyOn(gl, 'deleteTexture')
  return { gl, deleted, cache: new BrushTextureCache(gl as unknown as WebGLRenderingContext, budget) }
}

describe('byte-bounded brush texture residency', () => {
  it('evicts the least-recent inactive resource rather than a currently used sampler', () => {
    const { cache, deleted } = setup(20), a = texture(), b = texture(), c = texture()
    cache.protect(['a']); cache.put('a', a, 10)
    cache.protect(['b']); cache.put('b', b, 10)
    expect(cache.get('a')).toBe(a)
    cache.protect(['c']); cache.put('c', c, 10)
    expect(deleted.mock.calls.map(call => call[0])).toEqual([b])
    expect(cache.get('a')).toBe(a); expect(cache.get('c')).toBe(c)
    expect(cache.bytes).toBe(20)
  })

  it('holds an oversized active group and shrinks only when its working set changes', () => {
    const { cache, deleted } = setup(100), old = texture(), a = texture(), b = texture()
    cache.protect(['old']); cache.put('old', old, 40)
    cache.protect(['a', 'b']); cache.put('a', a, 80); cache.put('b', b, 80)
    expect(cache.bytes).toBe(160)
    expect(cache.get('a')).toBe(a); expect(cache.get('b')).toBe(b)
    expect(deleted.mock.calls.map(call => call[0])).toEqual([old])
    cache.protect(['a', 'b'])
    expect(cache.bytes).toBe(160)
    cache.protect(['a'])
    expect(cache.bytes).toBe(80); expect(cache.get('a')).toBe(a); expect(cache.get('b')).toBeUndefined()
  })

  it.each([{ count: 9, side: 512 }, { count: 23, side: 256 }])('keeps a $count-frame $side-pixel pipe warm beyond old count limits', ({ count, side }) => {
    const { cache, deleted } = setup(16 * 1024 * 1024)
    let uploads = 0
    for (let dab = 0; dab < count * 4; dab++) {
      const key = `frame-${dab % count}`
      cache.protect([key])
      if (!cache.get(key)) { uploads++; cache.put(key, texture(), rgbaMipBytes(side)) }
    }
    expect(uploads).toBe(count)
    expect(deleted).not.toHaveBeenCalled()
    expect(cache.bytes).toBeLessThan(16 * 1024 * 1024)
  })

  it('protects a full legacy2048px primary/grain/dual group even above the target', () => {
    const { cache, deleted } = setup(16 * 1024 * 1024)
    const group = ['primary', 'grain', 'dual'], resources = group.map(texture)
    cache.protect(group)
    group.forEach((key, index) => cache.put(key, resources[index], rgbaMipBytes(2048)))
    expect(cache.bytes).toBe(rgbaMipBytes(2048) * 3)
    for (let pass = 0; pass < 3; pass++) {
      cache.protect(group)
      group.forEach((key, index) => expect(cache.get(key)).toBe(resources[index]))
    }
    expect(deleted).not.toHaveBeenCalled()
  })

  it('releases resources on destroy and forgets dead objects without GL calls on context loss', () => {
    const { cache, deleted } = setup()
    cache.protect(['a']); cache.put('a', texture(), 40); cache.clear(true)
    expect(cache.bytes).toBe(0); expect(deleted).not.toHaveBeenCalled()
    cache.protect(['a']); cache.put('a', texture(), 40); cache.clear()
    expect(cache.bytes).toBe(0); expect(deleted).toHaveBeenCalledTimes(1)
  })

  it('rejects an unprotected upload before it could return an immediately evicted texture', () => {
    const { cache } = setup()
    expect(() => cache.put('unresolved', texture(), 200)).toThrow('protected')
  })
})

describe('cold brush upload GL state', () => {
  it('restores active sampler/binding/alignment and never changes the destination FBO', () => {
    const gl = new MockGL(), previous = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0 + 3); gl.bindTexture(gl.TEXTURE_2D, previous); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8)
    const bindFbo = vi.spyOn(gl, 'bindFramebuffer')
    const entry = uploadBrushTexture(gl as unknown as WebGLRenderingContext, [new Uint8Array(64), new Uint8Array(16), new Uint8Array(4), new Uint8Array(1)], gl.LUMINANCE, gl.CLAMP_TO_EDGE)
    expect(entry.bytes).toBe((64 + 16 + 4 + 1) * 4)
    expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe(gl.TEXTURE0 + 3)
    expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).toBe(previous)
    expect(gl.getParameter(gl.UNPACK_ALIGNMENT)).toBe(8)
    expect(bindFbo).not.toHaveBeenCalled()
  })

  it('cleans a failed upload and restores the previous GL state', () => {
    const gl = new MockGL(), previous = gl.createTexture()
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, previous)
    vi.spyOn(gl, 'texImage2D').mockImplementationOnce(() => { throw new Error('own upload failure') })
    const deleted = vi.spyOn(gl, 'deleteTexture')
    expect(() => uploadBrushTexture(gl as unknown as WebGLRenderingContext, [new Uint8Array(4)], gl.ALPHA, gl.CLAMP_TO_EDGE)).toThrow('upload failure')
    expect(deleted).toHaveBeenCalledTimes(1)
    expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe(gl.TEXTURE1)
    expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).toBe(previous)
    expect(gl.getParameter(gl.UNPACK_ALIGNMENT)).toBe(4)
  })
})
