import { expect,it,vi } from 'vitest'
import { MockGL } from '../../../../../apps/web/src/engine/testing/mockGL'
import { BufferResidency } from '../../../../../apps/web/src/engine/src/buffers/BufferResidency'
import { AccumulationBuffer } from './AccumulationBuffer.uniform.external'
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


function cycled(value=0){const f=fixture(72),b=f.make();b.restorePixels(new Uint8Array(36).fill(value));f.unbind();b._residencyEvict();b._residencyHydrate();f.unbind();return {...f,b}}
it('retains only verified uniforms across read-only hydration; zero skips upload',()=>{
 const {gl,b,unbind}=cycled();const read=vi.spyOn(gl,'readPixels'),upload=vi.spyOn(gl,'texSubImage2D');
 for(let i=0;i<4;i++){b._residencyEvict();b._residencyHydrate();unbind()}
 expect(read).toHaveBeenCalledTimes(0);expect(upload).toHaveBeenCalledTimes(0);expect(b.readPixels()).toEqual(new Uint8Array(36))
})
it('nonzero uniform reuploads exact bytes but skips repeated readback',()=>{
 const {gl,b,unbind}=cycled(73),read=vi.spyOn(gl,'readPixels');b._residencyEvict();b._residencyHydrate();unbind();expect(read).toHaveBeenCalledTimes(0);expect(b.readPixels()).toEqual(new Uint8Array(36).fill(73))
})
for(const api of ['clear','restorePixels','writePixels','restorePixelsRect','copyTo','copyRegionInto','fbo','beginDraw','beginErase','beginReplaceDraw','beginMaxDraw'])it('invalidates verified uniform before '+api,()=>{
 const {gl,b,unbind,make}=cycled(73),src=make();src.restorePixels(pixels(7));unbind();
 const read=vi.spyOn(gl,'readPixels');
 if(api==='clear')b.clear();else if(api==='restorePixels')b.restorePixels(pixels(5));else if(api==='writePixels')b.writePixels(pixels(5));else if(api==='restorePixelsRect')b.restorePixelsRect(2,2,new Uint8Array(16).fill(19));else if(api==='copyTo')src.copyTo(b);else if(api==='copyRegionInto')src.copyRegionInto(b,0,0,1,1,1,1);else if(api==='fbo'){gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}else {if(api==='beginMaxDraw')b.beginMaxDraw({MAX_EXT:0x8008});else b[api]();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);b.endDraw()}
 unbind();const expected=b.readPixels();read.mockClear();b._residencyEvict();expect(read).toHaveBeenCalledTimes(1);b._residencyHydrate();unbind();expect(b.readPixels()).toEqual(expected)
})
it('does not retain nonuniform backing while resident',()=>{const f=fixture(),b=f.make();b.restorePixels(pixels(7));f.unbind();b._residencyEvict();b._residencyHydrate();f.unbind();expect(b['_backing']).toBeUndefined();const read=vi.spyOn(f.gl,'readPixels');b._residencyEvict();expect(read).toHaveBeenCalledTimes(1)})
it('forgets proof on context loss',()=>{const {b}=cycled(73);b._residencyForget();expect(b['_backing']).toBeUndefined();expect(()=>b._residencyHydrate()).toThrow('context loss')})
it('write hydrates first then invalidates restored uniform proof',()=>{const {gl,make,unbind}=fixture(36);const b=make();b.restorePixels(new Uint8Array(36).fill(73));unbind();make();unbind();b.writePixels(pixels(3));unbind();const read=vi.spyOn(gl,'readPixels');b._residencyEvict();expect(read).toHaveBeenCalledTimes(1);b._residencyHydrate();expect(b.readPixels()).toEqual(pixels(3))})
it('failed upload never exposes residency success',()=>{const {b,gl}=cycled(73);b._residencyEvict();vi.spyOn(gl,'texSubImage2D').mockImplementation(()=>{throw Error('upload failure')});expect(()=>b._residencyHydrate()).toThrow('upload failure');expect(b['_resident']).toBe(false)})
it('failed write invalidates proof before GL mutation and cannot skip next readback',()=>{const {b,gl,unbind}=cycled(73);const upload=vi.spyOn(gl,'texSubImage2D').mockImplementationOnce(()=>{throw Error('write failed')});expect(()=>b.writePixels(pixels(2))).toThrow('write failed');expect(b['_backing']).toBeUndefined();upload.mockRestore();unbind();const read=vi.spyOn(gl,'readPixels');b._residencyEvict();expect(read).toHaveBeenCalledTimes(1)})
it('failed eviction readback does not retire the resident texture',()=>{const {b,gl}=cycled(73);b.clear();vi.spyOn(gl,'readPixels').mockImplementationOnce(()=>{throw Error('read failed')});const remove=vi.spyOn(gl,'deleteTexture');expect(()=>b._residencyEvict()).toThrow('read failed');expect(remove).not.toHaveBeenCalled();expect(b['_resident']).toBe(true);expect(b['_backing']).toBeUndefined()})
