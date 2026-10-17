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

it('charges only allocated levels and rejects an oversized mip chain before its GL allocation',()=>{
 const {gl,cache,unbind}=fixture(64)
 const buffer=new AccumulationBuffer(gl,4,4,'nearest',cache);unbind()
 expect(cache.residentBytes).toBe(64)
 const generate=vi.spyOn(gl,'generateMipmap')
 expect(()=>buffer.ensureMipmaps()).toThrow('mipmaps exceed')
 expect(generate).not.toHaveBeenCalled()
 expect(buffer.mipmapsAllocated).toBe(false)
 expect(cache.residentBytes).toBe(64)
 cache.dispose();expect(cache.residentBytes).toBe(0)
})
it('accounts for an admitted mip chain across invalidation, eviction and hydration',()=>{
 const {gl,cache,unbind}=fixture(100)
 const buffer=new AccumulationBuffer(gl,4,4,'nearest',cache);buffer.clear();unbind()
 const generate=vi.spyOn(gl,'generateMipmap')
 expect(buffer.ensureMipmaps()).toBe(true);unbind()
 expect(cache.residentBytes).toBe(84)
 expect(buffer.mipmapsAllocated).toBe(true)
 expect(buffer.ensureMipmaps()).toBe(true);expect(generate).toHaveBeenCalledTimes(1)
 buffer.clear();unbind();expect(cache.residentBytes).toBe(84)
 expect(buffer.ensureMipmaps()).toBe(true);unbind();expect(generate).toHaveBeenCalledTimes(2)
 const other=new AccumulationBuffer(gl,3,3,'nearest',cache);unbind()
 expect(cache.residentBytes).toBe(36)
 void buffer.texture;unbind()
 expect(cache.residentBytes).toBe(84);expect(generate).toHaveBeenCalledTimes(3)
 other.destroy();buffer.destroy();cache.dispose();expect(cache.residentBytes).toBe(0)
})
it('charges mip levels already allocated before attaching an ordinary buffer to a cache',()=>{
 const {gl,cache,unbind}=fixture(64)
 const buffer=new AccumulationBuffer(gl,4,4)
 buffer.ensureMipmaps();unbind()
 expect(()=>buffer.enableResidency(cache)).toThrow('exceeds')
 expect(cache.bufferCount).toBe(0);expect(cache.residentBytes).toBe(0)
 buffer.destroy();cache.dispose()
})


import {RibbonScratchPool} from './RibbonScratchPool'
import {RibbonStrokeScratch} from './RibbonStrokeScratch'
function pooled(budget=72,discardIdleContents=true){
 const f=fixture(budget),pool=new RibbonScratchPool(f.gl,(w,h,filter)=>new AccumulationBuffer(f.gl,w,h,filter,f.cache),{discardIdleContents})
 const read=vi.spyOn(f.gl,'readPixels'),upload=vi.spyOn(f.gl,'texSubImage2D')
 const finish=()=>{pool.trimFree();f.cache.dispose();expect(f.cache.bufferCount).toBe(0)}
 return {...f,pool,read,upload,finish}
}
it('default pool preserves free contents and original readback/upload behavior',()=>{
 const f=pooled(36,false);try{
 const a=f.pool.acquire(3,3);a.writePixels(pixels(7));f.unbind();f.pool.release(a)
 const blocker=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);f.unbind();expect(f.read).toHaveBeenCalledTimes(1)
 const b=f.pool.acquire(3,3);expect(b).toBe(a);const uploads=f.upload.mock.calls.length
 expect(b.readPixels()).toEqual(pixels(7));expect(f.upload.mock.calls.length).toBe(uploads+1);f.unbind();f.pool.release(b);blocker.destroy()
 }finally{f.finish()}
})
it('resident free release/reacquire retains the same handles and allocates/transfers nothing',()=>{
 const f=pooled(36);try{
 const a=f.pool.acquire(3,3);a.writePixels(pixels(7));f.unbind();const texture=a._texture,fbo=a._fbo,create=vi.spyOn(f.gl,'createTexture'),remove=vi.spyOn(f.gl,'deleteTexture'),uploads=f.upload.mock.calls.length
 f.pool.release(a);expect(a.idlePoolBuffer).toBe(true);expect(f.pool.acquire(3,3)).toBe(a);expect(a.idlePoolBuffer).toBe(false)
 expect(a._texture).toBe(texture);expect(a._fbo).toBe(fbo);expect(create).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(f.read).not.toHaveBeenCalled();expect(f.upload.mock.calls.length).toBe(uploads)
 f.pool.release(a)
 }finally{f.finish()}
})
it('evicts free contents without readback and initializes a reused texture without a backing upload',()=>{
 const f=pooled(36);try{
 const a=f.pool.acquire(3,3);a.writePixels(pixels(8));f.unbind();f.pool.release(a)
 const blocker=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);f.unbind();expect(f.read).not.toHaveBeenCalled()
 const uploads=f.upload.mock.calls.length,create=vi.spyOn(f.gl,'createTexture')
 expect(f.pool.acquire(3,3)).toBe(a);expect(create).not.toHaveBeenCalled();expect(f.upload.mock.calls.length).toBe(uploads)
 a.clear();f.unbind();expect(f.upload.mock.calls.length).toBe(uploads);expect(a.readPixels()).toEqual(new Uint8Array(36));f.unbind()
 a.writePixels(pixels(13));f.unbind();expect(a.readPixels()).toEqual(pixels(13));f.unbind();f.pool.release(a);blocker.destroy()
 }finally{f.finish()}
})
it('prioritizes more-recent free pool buffers before older live material planes',()=>{
 const f=pooled(72);try{
 const live=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);live.writePixels(pixels(4));f.unbind();const liveTexture=live._texture
 const idle=f.pool.acquire(3,3);idle.writePixels(pixels(5));f.unbind();f.pool.release(idle)
 const third=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);f.unbind();expect(f.read).not.toHaveBeenCalled();expect(live._texture).toBe(liveTexture)
 const creates=vi.spyOn(f.gl,'createTexture');void live.texture;expect(creates).not.toHaveBeenCalled();f.unbind();third.destroy();live.destroy()
 }finally{f.finish()}
})
it('keeps draw-bound free textures protected, without unbinding samplers to force an eviction',()=>{
 const f=pooled(72);const out=new AccumulationBuffer(f.gl,3,3);try{
 const idle=f.pool.acquire(3,3);idle.writePixels(pixels(5));f.unbind();f.pool.release(idle)
 const live=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);f.unbind()
 out.beginReplaceDraw();f.gl.activeTexture(f.gl.TEXTURE0+3);f.gl.bindTexture(f.gl.TEXTURE_2D,idle._texture)
 const bound=f.gl.getParameter(f.gl.TEXTURE_BINDING_2D)
 const third=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache)
 expect(f.gl.getParameter(f.gl.TEXTURE_BINDING_2D)).toBe(bound);expect(f.read).toHaveBeenCalledTimes(1) // live, not bound free texture
 out.endDraw();f.unbind();third.destroy();live.destroy()
 }finally{out.destroy();f.finish()}
})
it('disables discard for every reacquired live lease and preserves its new bytes through eviction',()=>{
 const f=pooled(36);try{
 const a=f.pool.acquire(3,3);f.unbind();f.pool.release(a);f.pool.acquire(3,3);a.writePixels(pixels(17));f.unbind()
 const blocker=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);f.unbind();expect(f.read).toHaveBeenCalledTimes(1)
 expect(a.readPixels()).toEqual(pixels(17));f.unbind();f.pool.release(a);blocker.destroy()
 }finally{f.finish()}
})
it('drops a nonresident free backing without hydrating it and recovers after a pinned-budget failure',()=>{
 const f=pooled(36);try{
 const a=f.pool.acquire(3,3);a.writePixels(pixels(17));f.unbind()
 const blocker=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);f.unbind();expect(f.read).toHaveBeenCalledTimes(1)
 const before=f.read.mock.calls.length,uploads=f.upload.mock.calls.length
 f.pool.release(a);expect((a as unknown as {_backing:unknown})._backing).toBeUndefined();f.pool.acquire(3,3)
 expect(()=>f.cache.runPinned([blocker],()=>a.clear())).toThrow('pinned or bound');expect(f.read.mock.calls.length).toBe(before);expect(f.upload.mock.calls.length).toBe(uploads)
 a.clear();f.unbind();expect(f.upload.mock.calls.length).toBe(uploads);expect(a.readPixels()).toEqual(new Uint8Array(36));f.unbind();f.pool.release(a);blocker.destroy()
 }finally{f.finish()}
})
it('retains lossless backing/mip accounting for mip-bearing free buffers',()=>{
 const f=pooled(40);try{
 const a=f.pool.acquire(2,2);a.writePixels(new Uint8Array(16).fill(77));a.ensureMipmaps();a.setMipSampling(true);f.unbind();f.pool.release(a)
 const b=new AccumulationBuffer(f.gl,2,2,'nearest',f.cache);f.unbind();const c=new AccumulationBuffer(f.gl,2,2,'nearest',f.cache);f.unbind()
 expect(f.read).toHaveBeenCalledTimes(1);const uploads=f.upload.mock.calls.length
 expect(f.pool.acquire(2,2)).toBe(a);expect(a.readPixels()).toEqual(new Uint8Array(16).fill(77));f.unbind();expect(f.upload.mock.calls.length).toBe(uploads+1);expect(f.cache.residentBytes).toBeLessThanOrEqual(40)
 f.pool.release(a);b.destroy();c.destroy()
 }finally{f.finish()}
})
it('holding/trim/destroy and context loss do not hydrate idle discarded objects or fabricate lost data',()=>{
 const f=pooled(72);try{
 const a=f.pool.acquire(3,3),b=f.pool.acquire(3,3);f.unbind();f.pool.holding=true;f.pool.release(a);f.pool.release(b)
 const c=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);f.unbind();expect(f.read).not.toHaveBeenCalled();const uploads=f.upload.mock.calls.length
 f.cache.forgetContext();expect(()=>a.texture).toThrow();f.pool.trimFree();expect(f.upload.mock.calls.length).toBe(uploads);expect(f.pool.bytes.free).toBe(0);c.destroy()
 }finally{f.finish()}
})
it('getOrCreate initializes every scratch plane correctly after dirty free buffers were discarded',()=>{
 const f=pooled(144),tile=new AccumulationBuffer(f.gl,3,3);const scratch=new RibbonStrokeScratch(f.pool,true,true);try{
 tile.writePixels(pixels(3));f.unbind();const dirty=Array.from({length:4},()=>{const b=f.pool.acquire(3,3);b.writePixels(pixels(27));f.unbind();return b});for(const b of dirty)f.pool.release(b)
 const blockers=Array.from({length:4},()=>{const b=new AccumulationBuffer(f.gl,3,3,'nearest',f.cache);f.unbind();return b});expect(f.read).not.toHaveBeenCalled()
 const e=scratch.getOrCreate(tile);f.unbind();expect(e.original.readPixels()).toEqual(pixels(3));f.unbind()
 for(const b of [e.coverage,e.inkLoad!,e.inkColor!]){expect(b.readPixels()).toEqual(new Uint8Array(36));f.unbind()}
 scratch.destroy();for(const b of blockers)b.destroy()
 }finally{scratch.destroy();tile.destroy();f.finish()}
})
