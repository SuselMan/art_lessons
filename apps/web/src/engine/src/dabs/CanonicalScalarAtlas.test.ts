import {runBrushGlBatch} from './BrushGlBatch'
import {ownedBrushFixture} from '../../testing/ownedBrushFixture'
import {SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from '../presets/sourceColorRgba8'
import {afterEach,expect,it,vi} from 'vitest'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {installScalarPowerAssetFetch,installScalarAtlasMockCaps} from '../../testing/scalarPowerTestAssets'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {CanonicalScalarAtlas} from './CanonicalScalarAtlas'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {readSourceScalarPowerByte,SOURCE_SCALAR_POWER_CPU_BYTES} from '../presets/sourceScalarPowerTable'
let restore:undefined|(()=>void)
afterEach(()=>{restore?.();restore=undefined;vi.restoreAllMocks()})
function setup(gpuBytes=4*1024*1024,cpuBytes=4*1024*1024){
 const {gl,snapshot}=recordingGL(),cache=new BrushTextureCache(gl,gpuBytes),cpu=new BrushMipCache(cpuBytes)
 gl.MAX_TEXTURE_SIZE=9013;gl.MAX_TEXTURE_IMAGE_UNITS=9014;gl.UNPACK_COLORSPACE_CONVERSION_WEBGL=9015
 gl.STATIC_DRAW=9016;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9017
 const get=gl.getParameter;gl.getParameter=(name:number)=>name===gl.MAX_TEXTURE_SIZE?4096:name===gl.MAX_TEXTURE_IMAGE_UNITS?8:get(name)
 installScalarAtlasMockCaps(gl);gl.getTexParameter=(_target:number,name:number)=>name===gl.TEXTURE_MIN_FILTER||name===gl.TEXTURE_MAG_FILTER?gl.NEAREST:gl.CLAMP_TO_EDGE;
 gl.isContextLost=()=>false;gl.getAttribLocation=()=>0;gl.copyTexSubImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn()
 return {gl,snapshot,cache,cpu}
}
function preparePlain(pass:CanonicalRgba8CompositePass,s:ReturnType<typeof setup>){const mask=ownedBrushFixture(s.gl,16);s.cache.protect(['fixture-mask']);s.cache.putOwned('fixture-mask',mask);pass.prepare({width:16,height:16,operations:['genericSCU8']},[{key:'fixture-mask',bytes:16}])}
it('a selected page charges one exact64KiB GPU page and owned CPU bytes, restores flags, and cache leases retain its real bytes',async()=>{
 restore=installScalarPowerAssetFetch();const s=setup(),atlas=new CanonicalScalarAtlas(s.gl,s.cache,s.cpu,'test')
 const before=s.snapshot();s.gl.pixelStorei(s.gl.UNPACK_FLIP_Y_WEBGL,1);s.gl.pixelStorei(s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,1)
 await atlas.prepare('easyDodge',[],()=>{})
 const page=atlas.resource('easyDodge');expect(page.bytes).toBe(65536);expect(s.cache.resourceBytes(page.key)).toBe(65536);expect(s.cpu.reservedBytes).toBe(SOURCE_SCALAR_POWER_CPU_BYTES+2048)
 expect(s.gl.getParameter(s.gl.UNPACK_FLIP_Y_WEBGL)).toBe(1);expect(s.gl.getParameter(s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(1)
 expect(readSourceScalarPowerByte(page.view,'easyDodge',255,0)).toBe(255)
 const release=s.cache.leaseRequired([{key:page.key,bytes:65536}]);s.cache.protect([])
 // Another page preparation may trim optional entries, but the real lease is authoritative.
 await atlas.prepare('easyBurn',[],()=>{})
 expect(atlas.resource('easyDodge').texture).toBe(page.texture);release()
 atlas.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
 // Snapshot excludes upload flags; assert them above explicitly.
 expect(s.snapshot()).toEqual(before)
})
it('ordinary and other-mode participant readiness survives eviction of an unused page; queued exact-mode leases retain it',async()=>{
 restore=installScalarPowerAssetFetch();const s=setup(),pass=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'test')
 preparePlain(pass,s)
 const ordinary=pass.brushGlBatchInfo(),baseline=s.cpu.reservedBytes
 expect(ordinary.textureUnits).toBe(3);expect(ordinary.ownedPointSamplers??[]).toEqual([])
 const fetched=vi.spyOn(globalThis,'fetch')
 expect(fetched).not.toHaveBeenCalled()
 await pass.prepareScalarAtlas('easyDodge');const release=pass.retainScalarAtlas('easyDodge');await pass.prepareScalarAtlas('easyBurn')
 const dodge=pass.scalarParticipant('easyDodge'),burn=pass.scalarParticipant('easyBurn'),dodgeInfo=dodge.brushGlBatchInfo(),burnInfo=burn.brushGlBatchInfo()
 const dodgePage=pass.scalarAtlasResources('easyDodge')[0],burnPage=pass.scalarAtlasResources('easyBurn')[0]
 expect(dodgeInfo.resources.some(resource=>resource.key===burnPage.key)).toBe(false)
 expect(burnInfo.resources.some(resource=>resource.key===dodgePage.key)).toBe(false)
 expect(pass.brushGlBatchInfo().resources).toEqual(ordinary.resources);expect(pass.brushGlBatchInfo().textureUnits).toBe(3)
 s.cache.protect([])
 // An explicit idle-page teardown models cache eviction, not release of the leased page.
 s.cache.discard(burnPage.key)
 expect(dodge.brushGlBatchInfo().textureUnits).toBe(5);expect(()=>burn.brushGlBatchInfo()).toThrow('prepared')
 expect(pass.isReady()).toBe(true);expect(pass.brushGlBatchInfo().resources).toEqual(ordinary.resources)
 release();pass.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0);expect(baseline).toBeGreaterThan(0)
})
it('unprepared selected mode fails closed and ordinary GenericSC allocates no Atlas resource',()=>{
 const s=setup(),pass=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'plain');preparePlain(pass,s)
 const before=s.cpu.reservedBytes,uploads=s.gl.texImage2D.mock.calls.length
 expect(()=>pass.scalarParticipant('pNormA')).toThrow('prepared')
 expect(pass.preparedResources()).toHaveLength(1);expect(s.gl.texImage2D.mock.calls.length).toBe(uploads);expect(s.cpu.reservedBytes).toBe(before)
 pass.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0)
})
it('upload throw undefined restores exact state and releases CPU/GPU ownership without laundering the primary failure',async()=>{
 restore=installScalarPowerAssetFetch();const s=setup(),atlas=new CanonicalScalarAtlas(s.gl,s.cache,s.cpu,'fault'),before=s.snapshot()
 s.gl.texImage2D.mockImplementation(()=>{throw undefined})
 let caught=false,error:unknown='not-thrown';try{await atlas.prepare('superLight',[],()=>{})}catch(value){caught=true;error=value}
 expect(caught).toBe(true);expect(error).toBeUndefined();expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0);expect(atlas.resources()).toEqual([])
 atlas.reset();s.cache.clear()
})
it('resource preparation respects real GPU and CPU caps and reset aborts the owned in-flight fetch',async()=>{
 restore=installScalarPowerAssetFetch();const s=setup(65535),atlas=new CanonicalScalarAtlas(s.gl,s.cache,s.cpu,'cap')
 await expect(atlas.prepare('easyBurn',[],()=>{})).rejects.toThrow();expect(s.cpu.reservedBytes).toBe(0)
 const t=setup(),pending=new CanonicalScalarAtlas(t.gl,t.cache,t.cpu,'cancel');let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve})
 globalThis.fetch=(_input,init)=>new Promise((_resolve,reject)=>{entered();init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})})
 const preparing=pending.prepare('softLightIfs',[],()=>{});await started;pending.reset();await expect(preparing).rejects.toThrow('Aborted');expect(t.cpu.reservedBytes).toBe(0);expect(pending.resources()).toEqual([])
})

it('refuses the planned old-queue plus new-page GPU union before fetching without clearing the old real lease',async()=>{
 restore=installScalarPowerAssetFetch();const s=setup(65536),atlas=new CanonicalScalarAtlas(s.gl,s.cache,s.cpu,'union')
 await atlas.prepare('easyDodge',[],()=>{});const old=atlas.resource('easyDodge'),release=s.cache.leaseRequired([{key:old.key,bytes:65536}]),before=s.cpu.reservedBytes,fetch=vi.spyOn(globalThis,'fetch')
 try{
  await expect(atlas.prepare('easyBurn',[],()=>{})).rejects.toThrow('budget')
  expect(fetch).not.toHaveBeenCalled();expect(s.cache.isResourceLeaseCurrent(release)).toBe(true);expect(atlas.resource('easyDodge').texture).toBe(old.texture);expect(s.cpu.reservedBytes).toBe(before);expect(readSourceScalarPowerByte(old.view,'easyDodge',255,0)).toBe(255)
 }finally{release();atlas.reset();s.cache.clear()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('compiles the actual private selected fragment before drawing and binds its real page without draw-time upload or compile',async()=>{
 restore=installScalarPowerAssetFetch();const s=setup(),pass=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'draw'),mask=ownedBrushFixture(s.gl,16)
 s.cache.protect(['mask']);s.cache.putOwned('mask',mask);pass.prepare({width:16,height:16,operations:['genericSCU8']},[{key:'mask',bytes:16}])
 await pass.prepareScalarAtlas('easyDodge')
 const sources:string[]=s.gl.shaderSource.mock.calls.map((call:unknown[])=>String(call[1]))
 expect(sources.some(source=>source.includes('uniform highp sampler2D scalarPowerTexture;')&&source.includes('if(mode==95.0)return sourceScalarPowerByte(s,d);'))).toBe(true)
 const selected=sources.find(source=>source.includes('uniform highp sampler2D scalarPowerTexture;'))!
 expect(selected).toContain('SourceRgba8CompositeControl(95.0,controls.x,')
 expect(selected).not.toContain('SourceRgba8CompositeControl(policy.x,controls.x,')
 const texture=s.gl.createTexture(),framebuffer=s.gl.createFramebuffer();s.gl.getFramebufferAttachmentParameter=()=>texture
 const view={key:'mask',texture:mask.texture,rect:{x:0,y:0,width:2,height:2},bounds:{x:0 as const,y:0 as const,width:1,height:1},mirror:{horizontal:false,vertical:false},channel:'r' as const}
 const target={brand:'canonical-straight-rgba8-v1' as const,texture,framebuffer,width:2,height:2,originX:0,originY:0,lifetime:{kind:'external' as const,owner:{},lease:()=>()=>{}}}
 const uploads=s.gl.texImage2D.mock.calls.length,programs=s.gl.createProgram.mock.calls.length,before=s.snapshot(),cpu=s.cpu.reservedBytes
 try{
  expect(pass.drawSource({source:{kind:'maskRgb',view,rgb:[255,127,64]},target,operation:{kind:'genericSCU8',control:{mode:'easyDodge',profile,opacity:1}}})).toBe('painted')
  expect(s.gl.uniform1i).toHaveBeenCalledWith(expect.objectContaining({name:'scalarPowerTexture'}),4)
  expect(s.gl.texImage2D.mock.calls.length).toBe(uploads);expect(s.gl.createProgram.mock.calls.length).toBe(programs);expect(s.cpu.reservedBytes).toBe(cpu);expect(s.snapshot()).toEqual(before)
  const reserve=vi.spyOn(s.cpu,'reserve'),fetch=vi.spyOn(globalThis,'fetch');await pass.prepareScalarAtlas('easyDodge');expect(reserve).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
 }finally{pass.reset();s.cache.clear()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('cold multi-mode inventory retains every prepared page until real admissions own them and releases on cancellation',async()=>{
 restore=installScalarPowerAssetFetch();const s=setup(),pass=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'cold');preparePlain(pass,s)
 const baseline=s.cpu.reservedBytes,releaseCandidate=await pass.prepareScalarAtlasInventory([{mode:'easyDodge',styles:['plain']},{mode:'easyBurn',styles:['plain']}],()=>{})
 const a=pass.scalarAtlasResources('easyDodge')[0],b=pass.scalarAtlasResources('easyBurn')[0]
 expect(s.cache.hasResourceLease(a.key)).toBe(true);expect(s.cache.hasResourceLease(b.key)).toBe(true)
 const entryA=pass.retainScalarAtlas('easyDodge'),entryB=pass.retainScalarAtlas('easyBurn');releaseCandidate();releaseCandidate()
 expect(s.cache.hasResourceLease(a.key)).toBe(true);expect(s.cache.hasResourceLease(b.key)).toBe(true)
 entryA();entryB()
 const controller=new AbortController();let checks=0
 await expect(pass.prepareScalarAtlasInventory([{mode:'easyDodge',styles:['plain']},{mode:'superLight',styles:['plain']}],()=>{if(++checks===3)controller.abort()},controller.signal)).rejects.toThrow()
 expect(s.cache.hasResourceLease(a.key)).toBe(false);expect(s.cache.hasResourceLease(b.key)).toBe(false)
 pass.reset();s.cache.clear();expect(s.cpu.reservedBytes).toBe(0);expect(baseline).toBeGreaterThan(0)
})
it('uses the genuine workspace epoch for scoped samplers in a real parent/child batch while keeping page liveness exact',async()=>{
 restore=installScalarPowerAssetFetch();const s=setup(),pass=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'epoch');preparePlain(pass,s);await pass.prepareScalarAtlas('easyDodge')
 const participant=pass.scalarParticipant('easyDodge'),info=participant.brushGlBatchInfo(),sampler=info.ownedPointSamplers![0]
 expect(sampler.epoch).toBe(info.epoch)
 try{runBrushGlBatch({participants:[participant]},frame=>{frame.assert(participant,info.resources,[]);const release=frame.pointSampling(sampler.texture);release()})}finally{pass.reset();s.cache.clear()}
 expect(s.cpu.reservedBytes).toBe(0)
})
