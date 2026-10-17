import {expect,it,vi} from 'vitest'
import {MockGL} from '../../../testing/mockGL'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {createPuddlePresentation} from './PuddlePresentation'

// MockGL proves resource ownership/control flow, not GPU shader pixels.
for(const nth of [1,2,3,4,5,6,7,8])it(`disposes partial presentation allocation ${nth} and can construct the next operation`,()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext
 const created=vi.spyOn(gl,'createTexture'),deleted=vi.spyOn(gl,'deleteTexture')
 const fbos=vi.spyOn(gl,'createFramebuffer'),freedFbos=vi.spyOn(gl,'deleteFramebuffer')
 let calls=0,fail=true
 const bufferFactory=(w:number,h:number,f:'linear'|'nearest'='linear')=>{
  if(++calls===nth && fail)throw Error('Residency budget exhausted')
  return new AccumulationBuffer(gl,w,h,f)
 }
 expect(()=>createPuddlePresentation(gl,3,{bufferFactory})).toThrow('Residency budget exhausted')
 expect(deleted).toHaveBeenCalledTimes(created.mock.calls.length)
 expect(freedFbos).toHaveBeenCalledTimes(fbos.mock.calls.length)
 fail=false
 const next=createPuddlePresentation(gl,3,{bufferFactory})
 next.destroy();next.destroy()
 expect(deleted).toHaveBeenCalledTimes(created.mock.calls.length)
 expect(freedFbos).toHaveBeenCalledTimes(fbos.mock.calls.length)
})

it('frees all textures, programs and quad when initial clear fails after program construction',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext
 const textures=vi.spyOn(gl,'createTexture'),deleteTextures=vi.spyOn(gl,'deleteTexture')
 const programs=vi.spyOn(gl,'createProgram'),deletePrograms=vi.spyOn(gl,'deleteProgram')
 const quads=vi.spyOn(gl,'createBuffer'),deleteQuads=vi.spyOn(gl,'deleteBuffer')
 vi.spyOn(gl,'clear').mockImplementationOnce(()=>{throw Error('clear interrupted')})
 expect(()=>createPuddlePresentation(gl,3)).toThrow('clear interrupted')
 expect(deleteTextures).toHaveBeenCalledTimes(textures.mock.calls.length)
 expect(deletePrograms).toHaveBeenCalledTimes(programs.mock.calls.length)
 expect(deleteQuads).toHaveBeenCalledTimes(quads.mock.calls.length)
 const recovered=createPuddlePresentation(gl,3);recovered.destroy()
 expect(deleteTextures).toHaveBeenCalledTimes(textures.mock.calls.length)
 expect(deletePrograms).toHaveBeenCalledTimes(programs.mock.calls.length)
 expect(deleteQuads).toHaveBeenCalledTimes(quads.mock.calls.length)
})

it('recovers after an actual pinned residency budget rejection without leaving cache entries',async()=>{
 const {BufferResidency}=await import('../../buffers/BufferResidency')
 const gl=new MockGL() as unknown as WebGLRenderingContext
 Object.assign(gl,{FRAMEBUFFER_BINDING:0x8ca6,ACTIVE_TEXTURE:0x84e0,TEXTURE_BINDING_2D:0x8069,MAX_COMBINED_TEXTURE_IMAGE_UNITS:0x8b4d})
 const parameter=gl.getParameter.bind(gl)
 vi.spyOn(gl,'getParameter').mockImplementation(p=>p===gl.ACTIVE_TEXTURE?gl.TEXTURE0:p===gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS?8:parameter(p))
 const cache=new BufferResidency(gl,36)
 const blocker=new AccumulationBuffer(gl,3,3,'linear',cache)
 const make=(w:number,h:number,f:'linear'|'nearest'='linear')=>new AccumulationBuffer(gl,w,h,f,cache)
 const create=vi.spyOn(gl,'createTexture')
 cache.runPinned([blocker],()=>expect(()=>createPuddlePresentation(gl,3,{bufferFactory:make})).toThrow('pinned or bound'))
 expect(create).not.toHaveBeenCalled();expect(cache.bufferCount).toBe(1)
 const recovered=createPuddlePresentation(gl,3,{bufferFactory:make})
 expect(cache.residentBytes).toBeLessThanOrEqual(36)
 recovered.destroy();expect(cache.bufferCount).toBe(1)
 blocker.destroy();cache.dispose();expect(cache.bufferCount).toBe(0)
})
