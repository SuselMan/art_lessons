import {it,expect,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {BufferResidency,releaseResidencyTexture,withBufferAllocationBindings} from './BufferResidency'
const bindingKeys=(gl:WebGLRenderingContext):number[]=>[gl.FRAMEBUFFER_BINDING,gl.ACTIVE_TEXTURE,gl.TEXTURE_BINDING_2D]
function fixture(budget=108){const gl=new MockGL() as unknown as WebGLRenderingContext;Object.assign(gl,{FRAMEBUFFER_BINDING:0x8ca6,ACTIVE_TEXTURE:0x84e0,TEXTURE_BINDING_2D:0x8069,MAX_COMBINED_TEXTURE_IMAGE_UNITS:0x8b4d,PACK_ALIGNMENT:0xd05,UNPACK_ALIGNMENT:0xcf5,UNPACK_FLIP_Y_WEBGL:0x9240,UNPACK_PREMULTIPLY_ALPHA_WEBGL:0x9241});let fbo:WebGLFramebuffer|null=null,active:number=gl.TEXTURE0;const textures=new Map<number,WebGLTexture|null>(),pixel=new Map<number,number>([[gl.PACK_ALIGNMENT,4],[gl.UNPACK_ALIGNMENT,4],[gl.UNPACK_FLIP_Y_WEBGL,0],[gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0]]),queries:number[]=[],stores:Array<[number,number]>=[];const bindFbo=gl.bindFramebuffer.bind(gl),bindTex=gl.bindTexture.bind(gl),activate=gl.activeTexture.bind(gl),parameter=gl.getParameter.bind(gl),remove=gl.deleteTexture.bind(gl);vi.spyOn(gl,'bindFramebuffer').mockImplementation((target,value)=>{fbo=value;bindFbo(target,value)});vi.spyOn(gl,'bindTexture').mockImplementation((target,value)=>{textures.set(active,value);bindTex(target,value)});vi.spyOn(gl,'activeTexture').mockImplementation(value=>{active=value;activate(value)});vi.spyOn(gl,'deleteTexture').mockImplementation(value=>{for(const[k,v]of textures)if(v===value)textures.set(k,null);remove(value)});vi.spyOn(gl,'pixelStorei').mockImplementation((key,value)=>{pixel.set(key,Number(value));stores.push([key,Number(value)])});vi.spyOn(gl,'getParameter').mockImplementation(key=>{queries.push(key);return key===gl.FRAMEBUFFER_BINDING?fbo:key===gl.ACTIVE_TEXTURE?active:key===gl.TEXTURE_BINDING_2D?textures.get(active)??null:key===gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS?8:pixel.has(key)?pixel.get(key):parameter(key)});const cache=new BufferResidency(gl,budget),make=()=>new AccumulationBuffer(gl,3,3,'nearest',cache),unbind=()=>{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null)},hostile=()=>{gl.activeTexture(gl.TEXTURE0+3);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());gl.bindFramebuffer(gl.FRAMEBUFFER,gl.createFramebuffer());gl.pixelStorei(gl.PACK_ALIGNMENT,8);gl.pixelStorei(gl.UNPACK_ALIGNMENT,8);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,1)},state=()=>({fbo,active,texture:textures.get(active)??null,pixels:[...pixel]});return{gl,cache,make,unbind,hostile,state,queries,stores,pixel,textures}}

it('eight managed constructors use one binding snapshot and restore between admissions',()=>{
 const f=fixture(4096); f.make(); f.hostile();const before=f.state();f.queries.length=0
 const buffers=withBufferAllocationBindings(f.gl,()=>Array.from({length:8},()=>f.make()))
 expect(f.queries.filter(k=>bindingKeys(f.gl).includes(k))).toHaveLength(3)
 expect(f.state()).toEqual(before);for(const b of buffers)b.destroy();f.cache.dispose()
})
it('nested same/different contexts restore each own entry and remove scopes after throw',()=>{
 const a=fixture(4096),b=fixture(4096);a.hostile();b.hostile();const sa=a.state(),sb=b.state()
 expect(()=>withBufferAllocationBindings(a.gl,()=>{
  a.make();a.gl.bindFramebuffer(a.gl.FRAMEBUFFER,a.gl.createFramebuffer());const inner=a.state()
  withBufferAllocationBindings(a.gl,()=>{a.make();withBufferAllocationBindings(b.gl,()=>b.make())})
  expect(a.state()).toEqual(inner);expect(b.state()).toEqual(sb);throw Error('work fault')
 })).toThrow('work fault');expect(a.state()).toEqual(sa);a.queries.length=0;a.make()
 expect(a.queries.filter(k=>bindingKeys(a.gl).includes(k))).toHaveLength(3)
 a.cache.dispose();b.cache.dispose()
})
it('admission can evict previous batch allocation without stale constructor bindings',()=>{
 const f=fixture(36);f.hostile();const before=f.state();let first:AccumulationBuffer|undefined
 const last=withBufferAllocationBindings(f.gl,()=>{first=f.make();return f.make()})
 expect(f.state()).toEqual(before);expect(f.cache.residentBytes).toBe(36)
 expect(first!.readPixels()).toEqual(new Uint8Array(36));expect(last.readPixels()).toEqual(new Uint8Array(36));f.cache.dispose()
})
it('allocation failure restores bindings, admission accounting and scope retirement',()=>{
 const f=fixture(4096);f.hostile();const before=f.state();vi.spyOn(f.gl,'texImage2D').mockImplementationOnce(()=>{throw Error('allocation fault')})
 expect(()=>withBufferAllocationBindings(f.gl,()=>f.make())).toThrow('allocation fault')
 expect(f.state()).toEqual(before);expect(f.cache.residentBytes).toBe(0)
 f.queries.length=0;f.make();expect(f.queries.filter(k=>bindingKeys(f.gl).includes(k))).toHaveLength(3);f.cache.dispose()
})
it('evicted entry texture is not resurrected by cached allocation restore',()=>{
 const f=fixture();f.hostile();const before=f.state()
 withBufferAllocationBindings(f.gl,()=>{releaseResidencyTexture(before.texture!);f.gl.deleteTexture(before.texture!);f.make()})
 expect(f.state()).toEqual({...before,texture:null});f.cache.dispose()
})
