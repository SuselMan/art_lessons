import {createHash,webcrypto} from 'node:crypto'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {bristleSaturationProfileBytes,type BrushBristle} from '@grafetto/shared'
import {MockGL} from '../../testing/mockGL'
import {createBristleInkProfile} from '../presets/brushBristleInk'
import {prepareBristleSaturationTable,copyBristleSaturationTable} from '../presets/brushBristleSaturationTable'
import {installBrushPixels,clearImportedBrushPixels} from '../presets/importedBrushes'
import {prepareBristleSaturationLookup,bristleSaturationLookupReady,acquireBristleSaturationLookup} from '../presets/bristleSaturationLookup'
import {BrushTextureCache} from './BrushTextureCache'
import {BristleRequestBatch} from './BristleRequestBatch'
import {BristleSaturationResource,bristleSaturationResourceKey,BRISTLE_SATURATION_GPU_BYTES} from './BristleSaturationResource'
/** Real WebGL enums and independent tracked unpack slots; the generic MockGL
 * intentionally models only UNPACK_ALIGNMENT. Never let undefined enums alias. */
class SaturationMockGL extends MockGL {
 readonly UNPACK_FLIP_Y_WEBGL=0x9240
 readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL=0x9241
 readonly UNPACK_COLORSPACE_CONVERSION_WEBGL=0x9243
 readonly NONE=0
 private readonly unpack=new Map<number,number>([[this.UNPACK_FLIP_Y_WEBGL,0],[this.UNPACK_PREMULTIPLY_ALPHA_WEBGL,0],[this.UNPACK_COLORSPACE_CONVERSION_WEBGL,0x9244]])
 override getParameter(pname:number):number|object|null{return this.unpack.get(pname)??super.getParameter(pname)}
 override pixelStorei(pname:number,param:number):void{if(this.unpack.has(pname))this.unpack.set(pname,param);else super.pixelStorei(pname,param)}
}
const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex')
function fixture(weight=.5):{brush:BrushBristle;raw:Uint8Array}{
 const ink=Object.freeze({depletion:Object.freeze([0,.125,.25,.375,.5,.625,.75,1]),useOpacity:true,useSaturation:true,useWeights:true,pressureWeight:weight,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:.5})
 const profile=createBristleInkProfile(ink),compiled=prepareBristleSaturationTable(profile)
 if(compiled.kind!=='ready')throw Error(compiled.reason)
 const bytes=copyBristleSaturationTable(compiled.table);let side=2;while(side*side<bytes.length)side*=2
 const raw=new Uint8Array(side*side);raw.set(bytes)
 const hairs:[number,number,number][]=[[0,0,1]]
 const brush:BrushBristle=Object.freeze({version:2,hairs,scale:1,shear:0,random:0,mousePressure:false,threshold:false,connected:true,antialias:false,compositing:false,ink,saturationLookup:Object.freeze({version:1,encoding:'bristle-saturation-functional-v1-le',asset:`asset:${hash(raw)}`,profileSha256:hash(bristleSaturationProfileBytes(ink)),byteLength:bytes.length})})
 return{brush,raw}
}
async function ready(f:ReturnType<typeof fixture>){if(f.brush.version!==2)throw Error('fixture');installBrushPixels(f.brush.saturationLookup!.asset,f.raw);await prepareBristleSaturationLookup(f.brush)}
function setup(budget=BRISTLE_SATURATION_GPU_BYTES){const gl=new SaturationMockGL(),cache=new BrushTextureCache(gl as unknown as WebGLRenderingContext,budget),owner=new BristleSaturationResource(gl as unknown as WebGLRenderingContext,cache);return{gl,cache,owner}}
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);clearImportedBrushPixels()})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('compiled93 room readiness and existing GPU cache owner',()=>{
 it('authenticates exact F64 weights, keeps old72 synchronous and rejects profile substitution before GL',async()=>{
  const f=fixture();expect(bristleSaturationLookupReady(f.brush)).toBe(false);await ready(f);expect(bristleSaturationLookupReady(f.brush)).toBe(true)
  if(f.brush.version!==2)throw Error('fixture')
  const changed=Object.freeze({...f.brush,ink:Object.freeze({...f.brush.ink,bristleInkAmountWeight:f.brush.ink.bristleInkAmountWeight+Number.EPSILON})})
  await expect(prepareBristleSaturationLookup(changed)).rejects.toThrow('checksum')
  expect(()=>acquireBristleSaturationLookup(changed)).toThrow('not prepared')
  const old=Object.freeze({...f.brush,ink:Object.freeze({...f.brush.ink,useSaturation:false}),saturationLookup:undefined})
  expect(prepareBristleSaturationLookup(old)).toBeNull();expect(bristleSaturationLookupReady(old)).toBe(true)
 })
 it('charges one actual512KiB cache page, never aliases A/B, and reloads after genuine LRU eviction',async()=>{
  const a=fixture(),b=fixture(.25);await ready(a);await ready(b)
  const {gl,cache,owner}=setup(),uploads=vi.spyOn(gl,'texImage2D')
  const ka=bristleSaturationResourceKey(a.brush),kb=bristleSaturationResourceKey(b.brush)
  owner.prepare(a.brush,[ka]);const first=owner.acquire(a.brush)
  expect(cache.bytes).toBe(512*1024);expect(first.texture).toBe(cache.get(ka));expect(uploads).toHaveBeenCalledTimes(1)
  owner.prepare(a.brush,[ka]);expect(uploads).toHaveBeenCalledTimes(1)
  owner.prepare(b.brush,[kb]);expect(cache.get(ka)).toBeUndefined();expect(()=>first.assertCurrent()).toThrow('retired');first.release()
  expect(owner.ready(b.brush)).toBe(true);expect(cache.bytes).toBe(512*1024)
  cache.protect(['ordinary']);cache.put('ordinary',{} as WebGLTexture,512*1024)
  expect(owner.ready(b.brush)).toBe(false);owner.prepare(a.brush,[ka]);expect(owner.ready(a.brush)).toBe(true);expect(uploads).toHaveBeenCalledTimes(3)
  cache.clear();owner.reset();expect(cache.bytes).toBe(0)
 })
 it('keeps the current planned key resident at the actual16MiB LRU boundary and evicts only unleased old pages',async()=>{
  const a=fixture();await ready(a);const {cache,owner}=setup(16*1024*1024),key=bristleSaturationResourceKey(a.brush)
  cache.protect(['ordinary']);cache.put('ordinary',{} as WebGLTexture,16*1024*1024-512*1024)
  owner.prepare(a.brush,['ordinary',key]);expect(cache.bytes).toBe(16*1024*1024);expect(owner.ready(a.brush)).toBe(true)
  const ordinary=cache.get('ordinary')
  cache.protect(['ordinary','next']);cache.put('next',{} as WebGLTexture,512*1024)
  expect(owner.ready(a.brush)).toBe(false);expect(cache.get('ordinary')).toBe(ordinary)
  owner.prepare(a.brush,['ordinary',key]);expect(owner.ready(a.brush)).toBe(true);expect(cache.bytes).toBe(16*1024*1024);expect(cache.get('ordinary')).toBe(ordinary)
  cache.clear()
 })
 it('prewarms the actual full-resident Batch, drops issued bytes before reset and never deletes borrowed cache textures',async()=>{
  const f=fixture();await ready(f);if(f.brush.version!==2)throw Error('fixture');const settings=f.brush.ink
  const {gl,cache,owner}=setup(),key=bristleSaturationResourceKey(f.brush)
  owner.prepare(f.brush,[key]);const page=owner.acquire(f.brush),texture=page.texture
  const get=gl.getParameter.bind(gl),ext=gl.getExtension.bind(gl)
  Object.defineProperties(gl,{MAX_VERTEX_ATTRIBS:{value:90101},MAX_TEXTURE_IMAGE_UNITS:{value:90102},getParameter:{value:(p:number)=>p===90101?16:p===90102?8:get(p)},getExtension:{value:(name:string)=>name==='OES_vertex_array_object'?{createVertexArrayOES:()=>({}),bindVertexArrayOES:()=>{},deleteVertexArrayOES:()=>{}}:ext(name)}})
  const deleted=vi.spyOn(gl,'deleteTexture'),upload=vi.spyOn(gl,'texImage2D'),batch=new BristleRequestBatch(gl as unknown as WebGLRenderingContext)
  batch.prepareCompiledSaturation(f.brush.ink,page,false);batch.assertInkPrepared(settings,false)
  expect(batch.preparedInkProfile(f.brush.ink).useSaturation).toBe(true)
  const afterFirst=upload.mock.calls.length,next=owner.acquire(f.brush)
  batch.prepareCompiledSaturation(f.brush.ink,next,false);expect(upload.mock.calls.length).toBe(afterFirst)
  batch.releaseSaturationResource();expect(()=>batch.assertInkPrepared(settings,false)).toThrow('not prepared');expect(()=>page.assertCurrent()).toThrow('retired')
  batch.reset();expect(deleted.mock.calls.some(call=>call[0]===texture)).toBe(false);expect(cache.get(key)).toBe(texture)
  cache.clear();expect(deleted.mock.calls.some(call=>call[0]===texture)).toBe(true)
 })
 it('refuses changing a leased page before upload or loss of the existing sampler',async()=>{
  const a=fixture(),b=fixture(.25);await ready(a);await ready(b)
  const {gl,cache,owner}=setup(),ka=bristleSaturationResourceKey(a.brush),kb=bristleSaturationResourceKey(b.brush)
  owner.prepare(a.brush,[ka]);const lease=cache.lease([{key:ka,bytes:512*1024}]),page=owner.acquire(a.brush),uploads=vi.spyOn(gl,'texImage2D')
  expect(()=>owner.prepare(b.brush,[kb])).toThrow('leased');expect(uploads).not.toHaveBeenCalled();expect(owner.ready(a.brush)).toBe(true);page.assertCurrent()
  page.release();lease();cache.clear()
 })
 it('preserves undefined upload failures and restores all touched unpack/texture state',async()=>{
  const a=fixture();await ready(a);const {gl,cache,owner}=setup(),key=bristleSaturationResourceKey(a.brush)
  const fields=[gl.ACTIVE_TEXTURE,gl.TEXTURE_BINDING_2D,gl.UNPACK_ALIGNMENT,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_COLORSPACE_CONVERSION_WEBGL]
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,1)
  const before=fields.map(x=>gl.getParameter(x));let during:unknown[]=[]
  expect(new Set(fields).size).toBe(fields.length)
  vi.spyOn(gl,'texImage2D').mockImplementation(()=>{during=fields.slice(2).map(x=>gl.getParameter(x));throw undefined})
  let thrown=false,value:unknown='sentinel';try{owner.prepare(a.brush,[key])}catch(error){thrown=true;value=error}
  expect(thrown).toBe(true);expect(value).toBeUndefined();expect(during).toEqual([1,0,0,0]);expect(before.slice(2)).toEqual([4,1,1,0x9244]);expect(fields.map(x=>gl.getParameter(x))).toEqual(before);expect(cache.bytes).toBe(0);expect(owner.ready(a.brush)).toBe(false)
 })
 it('rejects a late hash after room bytes retire without installing stale readiness',async()=>{
  const f=fixture();if(f.brush.version!==2||!f.brush.saturationLookup)throw Error('fixture')
  installBrushPixels(f.brush.saturationLookup.asset,f.raw)
  const expected=await webcrypto.subtle.digest('SHA-256',bristleSaturationProfileBytes(f.brush.ink))
  let complete!:(v:ArrayBuffer)=>void
  vi.stubGlobal('crypto',{subtle:{digest:()=>new Promise<ArrayBuffer>(resolve=>{complete=resolve})}})
  const work=prepareBristleSaturationLookup(f.brush)!
  clearImportedBrushPixels();installBrushPixels(f.brush.saturationLookup.asset,f.raw)
  complete(expected);await expect(work).rejects.toThrow('changed during preparation')
  expect(bristleSaturationLookupReady(f.brush)).toBe(false)
  vi.stubGlobal('crypto',webcrypto);await prepareBristleSaturationLookup(f.brush)
  expect(bristleSaturationLookupReady(f.brush)).toBe(true)
 })
 it('invalidates stale room bytes rather than keeping a hidden decoded CPU bank',async()=>{
  const f=fixture();await ready(f);expect(bristleSaturationLookupReady(f.brush)).toBe(true)
  clearImportedBrushPixels();expect(bristleSaturationLookupReady(f.brush)).toBe(false)
  expect(()=>acquireBristleSaturationLookup(f.brush)).toThrow('not prepared')
  await ready(f);expect(bristleSaturationLookupReady(f.brush)).toBe(true)
 })
})
