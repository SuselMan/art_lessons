import {canonicalRecordedPrimaryTexturePin} from '@grafetto/shared'
import {compositeSourceFused32} from '../presets/sourceFused32'
import {compositeSourceOver32Scalar} from '../presets/sourceOver32Scalar'
import {canonicalFixedPrimaryTexturePin,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B} from '@grafetto/shared'
import {expect,it,vi} from 'vitest'
import {canonicalPrimaryTexturePin} from '@grafetto/shared'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {ownedBrushFixture} from '../../testing/ownedBrushFixture'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {canonicalPatternResourceLifetime,CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import type {TransformedMaskView} from './TransformedMaskPrepass'
import {runBrushGlBatch} from './BrushGlBatch'
import {CanonicalRgba8CompositePass,canonicalRgba8CompositeBudget,type CanonicalCompositeRequest,type CanonicalOwnedRgba8Target} from './CanonicalRgba8CompositePass'
const operation={kind:'alphaDarken32FusedScalar' as const,control:{profile:'installed-arm64-scalar-fused-fpcr0-v1' as const,variant:'hard' as const,opacity:.8,averageOpacity:.5,flow:.7}}
const limits={width:16,height:16,operations:['alphaDarken32FusedScalar']as const,texturedOperations:['alphaDarken32FusedScalar']as const}
function fixture(side=4,crop={width:3,height:2}){
 const{gl,snapshot}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache()
 gl.LUMINANCE=0x1909;gl.TEXTURE1=gl.TEXTURE0+1;gl.STATIC_DRAW=9001;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002;gl.LINEAR=9010;gl.REPEAT=9011
 gl.getShaderPrecisionFormat=()=>({precision:23,rangeMin:127,rangeMax:127});gl.copyTexSubImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn();gl.getAttribLocation=()=>0
 const params=new Map<object,Map<number,number>>(),original=gl.texParameteri
 gl.getTexParameter=(_:number,key:number)=>params.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(key)??(key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?gl.LINEAR:gl.REPEAT)
 gl.texParameteri=(_:number,key:number,value:number)=>{original(_,key,value);const texture=gl.getParameter(gl.TEXTURE_BINDING_2D),p=params.get(texture)??new Map();p.set(key,value);params.set(texture,p)}
 const asset={id:'asset:'+'a'.repeat(64),size:side,x:0,y:0,width:crop.width,height:crop.height},pin=canonicalPrimaryTexturePin({kind:'canvasTexture',asset:asset.id,law:'subtract-u8-v1',width:crop.width,height:crop.height,periodX:crop.width,periodY:crop.height,offsetX:1,offsetY:1,strength:'pressure-identity-v1'},asset)
 const bank=new CanonicalMaskSourceBank(gl,cache,cpu,[],{gpuBytes:0,cpuBytes:0},undefined,'root-residency'),p=bank.prepareRoot([{kind:'raw-pattern-l8',asset,pin,readOriginalGray:()=>Uint8Array.from({length:side*side},(_,i)=>i*13%256)}],{gpuBytes:0,cpuBytes:0});p.prepareJob(0);p.assertPreparedPublication();const root=p.publish(),pattern=root.patternResource(pin,asset,{gl,cache,cpu})
 const mask=ownedBrushFixture(gl,1024);cache.protect(['mask']);cache.putOwned('mask',mask)
 const view:TransformedMaskView={key:'mask',texture:mask.texture,rect:{x:8,y:18,width:6,height:7},bounds:{x:0,y:0,width:6/16,height:7/16},mirror:{horizontal:false,vertical:false},channel:'r' as const}
 const target:CanonicalOwnedRgba8Target={brand:'canonical-straight-rgba8-v1',texture:gl.createTexture(),framebuffer:gl.createFramebuffer(),width:8,height:8,originX:10,originY:20,lifetime:{kind:'external',owner:{},lease:()=>()=>{}}}
 gl.getFramebufferAttachmentParameter=()=>target.texture
 const pass=new CanonicalRgba8CompositePass(gl,cache,cpu,'pattern-composite'),companions=[{key:'mask',bytes:1024},{key:pattern.key,bytes:side*side*4}]
 const request:CanonicalCompositeRequest={source:{kind:'texturedMaskRgb',view,rgb:[198,36,90],pattern,pin,strengthU8:128},target,operation}
 const close=()=>{pass.reset();root.release();bank.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)}
 return{gl,cache,cpu,pass,root,bank,pattern,pin,view,target,request,companions,params,snapshot,close}
}
it('uses the real fused source path and separately keyed/program-accounted variant while keeping legacy shader bytes',()=>{
 const s=fixture();try{
  const plain=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'plain'),legacy={width:16,height:16,operations:limits.operations}
  plain.prepare(legacy,s.companions);const plainShaders=s.gl.shaderSource.mock.calls.map((c:unknown[])=>c[1]);plain.reset();s.gl.shaderSource.mockClear()
  const before=canonicalRgba8CompositeBudget(legacy),after=canonicalRgba8CompositeBudget(limits);expect(after.gpuBytes).toBe(before.gpuBytes);expect(after.cpuBytes-before.cpuBytes).toBe(8192)
  s.pass.prepare(limits,s.companions);expect(s.pass.supportsTexturedOperations(['alphaDarken32FusedScalar'])).toBe(true);expect(s.pass.supportsTexturedOperations(['genericSCU8'])).toBe(false)
  const shaders=s.gl.shaderSource.mock.calls.map((c:unknown[])=>c[1]);expect(shaders.slice(0,2)).toEqual(plainShaders)
  const textured=shaders[3]as string;expect(textured).toContain('sampled.r-grain-(255.0-patternStrength)');expect(textured.indexOf('highp float coverage')).toBeLessThan(textured.lastIndexOf('gl_FragColor='));expect(textured.slice(textured.indexOf('highp float patternCell'),textured.lastIndexOf('void main(){'))).not.toContain('mod(')
  const count=s.gl.texImage2D.mock.calls.length
  for(const strengthU8 of [0,128,255])expect(s.pass.drawSource({...s.request,source:{...s.request.source as Extract<typeof s.request.source,{kind:'texturedMaskRgb'}>,strengthU8}})).toBe('painted')
  expect(s.gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({name:'patternStrength'}),0);expect(s.gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({name:'patternStrength'}),128);expect(s.gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({name:'patternStrength'}),255)
  expect(s.gl.texImage2D).toHaveBeenCalledTimes(count)
 }finally{s.close()}
})
it('computes clipped canvas phase independently on asymmetric axes and mask mirrors, including negative origins',()=>{
 const s=fixture();try{s.pass.prepare(limits,s.companions)
  for(const negative of [false,true])for(const mirror of [false,true]){
   const source=s.request.source as Extract<typeof s.request.source,{kind:'texturedMaskRgb'}>,originX=negative?-6:10,originY=negative?-16:20,x=originX+1,y=originY+1
   const target={...s.target,originX,originY},view={...s.view,rect:{...s.view.rect,x:originX-2,y:originY-2},mirror:{horizontal:mirror,vertical:mirror}}
   s.pass.drawSource({...s.request,target,source:{...source,view},writeBounds:{minX:x,minY:y,maxX:x+2,maxY:y+3}})
   const positive=(n:number,p:number,offset:number)=>((n%p+p)%p+offset)%p
   expect(s.gl.uniform2f).toHaveBeenCalledWith(expect.objectContaining({name:'mirrorFlags'}),+mirror,+mirror)
   const phase=s.gl.uniform2f.mock.calls.filter((c:any[])=>c[0].name==='patternPhase').at(-1)
   expect(phase.slice(1)).toEqual([positive(x,3,1),positive(y,2,1)])
   expect(s.gl.uniform2f).toHaveBeenCalledWith(expect.objectContaining({name:'patternPeriod'}),3,2)
  }
 }finally{s.close()}
})
it('rejects missing/stale variants and malformed manifests before target lease/copy/draw',()=>{
 const s=fixture();try{
  const lease=vi.fn(()=>()=>{}),request={...s.request,target:{...s.target,lifetime:{kind:'external' as const,owner:{},lease}}}
  s.pass.prepare({...limits,texturedOperations:[]},s.companions);s.gl.drawArrays.mockClear();s.gl.copyTexSubImage2D.mockClear()
  expect(()=>s.pass.drawSource(request)).toThrow(/not prepared/);expect(lease).not.toHaveBeenCalled();expect(s.gl.copyTexSubImage2D).not.toHaveBeenCalled();expect(s.gl.drawArrays).not.toHaveBeenCalled()
  expect(()=>s.pass.prepare(limits,s.companions)).toThrow(/Reset/)
  expect(()=>canonicalRgba8CompositeBudget({...limits,operations:['over32FusedScalar']})).toThrow(/textured/)
  expect(()=>canonicalRgba8CompositeBudget({...limits,texturedOperations:['genericSCU8']as never})).toThrow(/textured/)
 }finally{s.close()}
})
it.each(['success','draw error','sampler error']as const)('restores sampler2 and all bindings/active unit on %s',mode=>{
 const s=fixture();try{s.pass.prepare(limits,s.companions)
  const previousActive=s.gl.getParameter(s.gl.ACTIVE_TEXTURE),previousTexture=s.gl.getParameter(s.gl.TEXTURE_BINDING_2D)
  s.gl.activeTexture(s.gl.TEXTURE0+2);s.gl.bindTexture(s.gl.TEXTURE_2D,s.pattern.texture);for(const name of [s.gl.TEXTURE_MIN_FILTER,s.gl.TEXTURE_MAG_FILTER,s.gl.TEXTURE_WRAP_S,s.gl.TEXTURE_WRAP_T])s.gl.texParameteri(s.gl.TEXTURE_2D,name,s.gl.REPEAT)
  s.gl.activeTexture(previousActive);s.gl.bindTexture(s.gl.TEXTURE_2D,previousTexture)
  const before=s.snapshot(),params=new Map(s.params.get(s.pattern.texture))
  if(mode==='draw error')s.gl.drawArrays.mockImplementationOnce(()=>{throw Error('draw fail')})
  if(mode==='sampler error'){
   const original=s.gl.texParameteri;let once=true;s.gl.texParameteri=(target:number,name:number,value:number)=>{if(once&&s.gl.getParameter(s.gl.TEXTURE_BINDING_2D)===s.pattern.texture&&name===s.gl.TEXTURE_MAG_FILTER){once=false;throw Error('sampler fail')}original(target,name,value)}
  }
  if(mode==='success')expect(s.pass.drawSource(s.request)).toBe('painted');else expect(()=>s.pass.drawSource(s.request)).toThrow(/fail/)
  expect(s.snapshot()).toEqual(before);expect(s.params.get(s.pattern.texture)).toEqual(params)
 }finally{s.close()}
})
it('declares and leases the genuine pattern inside an actual full brush batch',()=>{
 const s=fixture();try{s.pass.prepare(limits,s.companions);const before=s.snapshot()
  const copies=s.gl.copyTexSubImage2D.mock.calls.length
  expect(()=>runBrushGlBatch({participants:[s.pass],owners:[s.target.lifetime]},frame=>s.pass.drawSource(s.request,frame))).toThrow('Undeclared batch owner')
  expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(copies)
  const patternOwner=canonicalPatternResourceLifetime(s.pattern,{gl:s.gl,cache:s.cache,cpu:s.cpu},s.root)
  runBrushGlBatch({participants:[s.pass],owners:[s.target.lifetime,patternOwner]},frame=>expect(s.pass.drawSource(s.request,frame)).toBe('painted'))
  expect(s.root.isReady()).toBe(true)
  expect(s.snapshot()).toEqual(before);expect(s.gl.uniform1i).toHaveBeenCalledWith(expect.objectContaining({name:'patternTexture'}),2)
 }finally{s.close()}
})
it('revalidates genuine root after external acquisition and refuses copied views, invalid U8 and NPOT storage',()=>{
 const s=fixture();try{s.pass.prepare(limits,s.companions);const source=s.request.source as Extract<typeof s.request.source,{kind:'texturedMaskRgb'}>
  for(const strengthU8 of [-0,-1,.5,256,NaN])expect(()=>s.pass.drawSource({...s.request,source:{...source,strengthU8}})).toThrow()
  expect(()=>s.pass.drawSource({...s.request,source:{...source,pattern:{...s.pattern}}})).toThrow(/Unknown/)
  const request={...s.request,target:{...s.target,lifetime:{kind:'external' as const,owner:{},lease:()=>{s.root.release();return()=>{}}}}},copies=s.gl.copyTexSubImage2D.mock.calls.length
  expect(()=>s.pass.drawSource(request)).toThrow(/retired/);expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(copies)
 }finally{s.close()}
 const n=fixture(5);try{n.pass.prepare(limits,n.companions);expect(()=>n.pass.drawSource(n.request)).toThrow(/textured composite source/)}finally{n.close()}
})
it('refuses insufficient textured precision and charged variant CPU budget before allocations',()=>{
 const s=fixture();try{
  s.gl.getShaderPrecisionFormat=()=>({precision:23,rangeMin:127,rangeMax:16});const creates=s.gl.createTexture.mock.calls.length;expect(()=>s.pass.prepare(limits,s.companions)).toThrow(/precision range/);expect(s.gl.createTexture).toHaveBeenCalledTimes(creates)
  s.gl.getShaderPrecisionFormat=()=>({precision:23,rangeMin:127,rangeMax:127});const hold=s.cpu.reserve(s.cpu.budgetBytes-s.cpu.reservedBytes-10000);try{expect(()=>s.pass.prepare(limits,s.companions)).toThrow(/budgets/)}finally{hold()}
 }finally{s.close()}
})
it('requires the pattern in the actual frame resource declaration before any destination copy',()=>{
 const s=fixture();try{s.pass.prepare(limits,s.companions.filter(r=>r.key==='mask'));const copies=s.gl.copyTexSubImage2D.mock.calls.length
  expect(()=>runBrushGlBatch({participants:[s.pass],owners:[s.target.lifetime]},frame=>s.pass.drawSource(s.request,frame))).toThrow(/Undeclared/)
  expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(copies)
 }finally{s.close()}
})
it('cleans an unsuccessful additional shader variant and can prepare again under unchanged owners',()=>{
 const s=fixture();try{const bytes=s.cpu.reservedBytes,cacheBytes=s.cache.bytes;let calls=0
  s.gl.getShaderParameter=()=>++calls!==4
  expect(()=>s.pass.prepare(limits,s.companions)).toThrow(/shader compile/);expect(s.cpu.reservedBytes).toBe(bytes);expect(s.cache.bytes).toBe(cacheBytes);expect(s.pass.isReady()).toBe(false)
  expect(s.gl.deleteProgram).toHaveBeenCalledTimes(1);s.gl.getShaderParameter=()=>true;expect(s.pass.prepare(limits,s.companions)).toBe('ready');expect(s.pass.drawSource(s.request)).toBe('painted')
 }finally{s.close()}
})
it('cleans both program variants and workspace if preparation is cancelled during shader creation',()=>{
 const s=fixture();try{const abort=new AbortController(),bytes=s.cpu.reservedBytes,cacheBytes=s.cache.bytes,shaderSource=s.gl.shaderSource.getMockImplementation()
  s.gl.shaderSource.mockImplementation((...args:unknown[])=>{abort.abort();return shaderSource?.(...args)})
  expect(s.pass.prepare(limits,s.companions,0,abort.signal)).toBe('cancelled');expect(s.cpu.reservedBytes).toBe(bytes);expect(s.cache.bytes).toBe(cacheBytes);expect(s.gl.deleteProgram).toHaveBeenCalledTimes(2)
 }finally{s.close()}
})

it.each(['alphaDarken32FusedScalar','alphaDarkenBrowserFloat'] as const)('uses fixed S255 in the explicitly prepared %s texture variant',kind=>{
 const s=fixture();try{
  s.pass.prepare({width:16,height:16,operations:[kind],texturedOperations:[kind]},s.companions)
  const pin=canonicalFixedPrimaryTexturePin({...s.pin,strength:'fixed-one-v1'},s.pattern.asset)
  const base=s.request.source;if(base.kind!=='texturedMaskRgb')throw Error('Texture fixture required');const source={...base,pin,strengthU8:255},chosenOperation=kind==='alphaDarkenBrowserFloat'?{kind,control:{...operation.control,profile:B}}:operation
  expect(()=>s.pass.drawSource({...s.request,source,operation:chosenOperation})).not.toThrow()
  expect(()=>s.pass.drawSource({...s.request,source:{...source,strengthU8:128},operation:chosenOperation})).toThrow(/S255/)
 }finally{s.close()}
})


it.each(['over32FusedScalar','overBrowserFloat']as const)('prepares a separately charged texture+OVER variant without changing the plain kernel %s',kind=>{
 const s=fixture();try{
  const plain=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'plain-over'),manifest={width:16,height:16,operations:[kind]}
  plain.prepare(manifest,s.companions);const old=s.gl.shaderSource.mock.calls.map((c:unknown[])=>c[1]);plain.reset();s.gl.shaderSource.mockClear()
  const textured={...manifest,texturedOperations:[kind]},before=canonicalRgba8CompositeBudget(manifest),after=canonicalRgba8CompositeBudget(textured)
  expect(after.gpuBytes).toBe(before.gpuBytes);expect(after.cpuBytes-before.cpuBytes).toBe(8192)
  s.pass.prepare(textured,s.companions)
  const shaders=s.gl.shaderSource.mock.calls.map((c:unknown[])=>c[1]);expect(shaders.slice(0,2)).toEqual(old)
  const fragment=String(shaders[3]);expect(fragment).toContain('sampled.r-grain-(255.0-patternStrength)')
  expect(fragment).toContain(kind==='over32FusedScalar'?'sourceCompositeFusedOver32Scalar(source,destination':'sourceCompositeOver32Scalar(source,destination')
  const source=s.request.source;if(source.kind!=='texturedMaskRgb')throw Error('Expected original pattern source')
  const operation=kind==='overBrowserFloat'?{kind,control:{profile:B,opacity:.75}}:{kind,control:{profile:'installed-arm64-scalar-fused-fpcr0-v1' as const,opacity:.75}}
  const saved=s.snapshot();expect(s.pass.drawSource({...s.request,source,operation})).toBe('painted');expect(s.snapshot()).toEqual(saved)
 }finally{s.close()}
})


it('pins an independent opaque-destination U8 RGBA oracle for the existing native/browser OVER kernels',()=>{
 const pigment=[198,36,90]as const,destination=[10,20,30,255]as const
 // M255,T0 and S0/128/255 exercise exact same subtract law; analytic opaque OVER bytes.
 const expected=[[10,20,30,255],[104,28,60,255],[198,36,90,255]]
 for(const [i,strength]of [0,128,255].entries()){
  const coverage=Math.max(0,255-0-(255-strength)),source=[...pigment,coverage]as const
  const native=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:'over',source:new Uint8Array(source),destination:new Uint8Array(destination),cols:1,rows:1,sourceStride:4,destinationStride:4,maskStride:1,sourceAlignment:0,destinationAlignment:0,opacity:1,averageOpacity:1,flow:1}).pixels
  const browser=compositeSourceOver32Scalar(source,destination,{profile:'portable-f32-division-rne-v1',opacity:1})
  expect([...native]).toEqual(expected[i]);expect(browser).toEqual(expected[i])
 }
 // This is a CPU reference/selected-kernel oracle, NOT a mock-GL pixel readback proof.
})

it('maps captured recorded7 phase to SAME uniforms with independent minus-offset oracle/negative clipping',()=>{
 const s=fixture(64,{width:51,height:51})
 try{s.pass.prepare(limits,s.companions);const asset=s.pattern.asset,pin=canonicalRecordedPrimaryTexturePin({kind:'canvasTexture',asset:asset.id,law:'subtract-u8-v1',width:51,height:51,periodX:51,periodY:51,phase:{kind:'resolved-stroke-phase-v1',x:50,y:37},strength:'recorded-grain-v1'},asset),source=s.request.source
  if(source.kind!=='texturedMaskRgb')throw Error('texture')
  const textures=s.gl.createTexture.mock.calls.length
  for(const strengthU8 of[0,128,255])for(const originX of[-52,10]){const originY=-65,x=originX+1,y=originY+1,view={...s.view,rect:{...s.view.rect,x:originX-2,y:originY-2}},target={...s.target,originX,originY}
   s.pass.drawSource({...s.request,target,source:{...source,view,pin,strengthU8},writeBounds:{minX:x,minY:y,maxX:x+2,maxY:y+3}})
   const actual=s.gl.uniform2f.mock.calls.filter((c:any[])=>c[0].name==='patternPhase').at(-1),mod=(v:number)=>((v%51)+51)%51
   expect(actual.slice(1)).toEqual([mod(x-1),mod(y-65)]);expect(s.gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({name:'patternStrength'}),strengthU8)
  }
  expect(s.gl.createTexture).toHaveBeenCalledTimes(textures)
  let getters=0;const bad=structuredClone(pin);Object.defineProperty(bad.phase,'x',{get(){getters++;return 0}})
  const lease=vi.fn(()=>()=>{}),before=s.gl.copyTexSubImage2D.mock.calls.length
  expect(()=>s.pass.drawSource({...s.request,target:{...s.target,lifetime:{kind:'external',owner:{},lease}},source:{...source,pin:bad}})).toThrow();expect(getters).toBe(0);expect(lease).not.toHaveBeenCalled();expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(before)
 }finally{s.close()}
})
