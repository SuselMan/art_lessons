import {canonicalMultiplyPrimaryTexturePin,canonicalPrimaryTextureMultiplyU8,canonicalRecordedPrimaryTexturePin} from '@grafetto/shared'
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
 const shaderTypes=new Map<object,number>(),createShader=gl.createShader.getMockImplementation();gl.createShader.mockImplementation((type:number)=>{const shader=createShader(type);if(shader)shaderTypes.set(shader,type);return shader});
 const shaderSources=(type:number)=>gl.shaderSource.mock.calls.filter(([shader]:unknown[])=>shaderTypes.get(shader as object)===type).map(([,source]:unknown[])=>source as string);
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
 return{gl,cache,cpu,pass,root,bank,pattern,pin,view,target,request,companions,params,snapshot,close,shaderTypes,shaderSources}
}
it('uses the real fused source path and separately keyed/program-accounted variant while keeping legacy shader bytes',()=>{
 const s=fixture();try{
  const plain=new CanonicalRgba8CompositePass(s.gl,s.cache,s.cpu,'plain'),legacy={width:16,height:16,operations:limits.operations}
  plain.prepare(legacy,s.companions);const plainVertex=s.shaderSources(s.gl.VERTEX_SHADER),plainFragments=s.shaderSources(s.gl.FRAGMENT_SHADER);plain.reset();s.gl.shaderSource.mockClear()
  const before=canonicalRgba8CompositeBudget(legacy),after=canonicalRgba8CompositeBudget(limits);expect(after.gpuBytes).toBe(before.gpuBytes);expect(after.cpuBytes-before.cpuBytes).toBe(8192)
  s.pass.prepare(limits,s.companions);expect(s.pass.supportsTexturedOperations(['alphaDarken32FusedScalar'])).toBe(true);expect(s.pass.supportsTexturedOperations(['genericSCU8'])).toBe(false)
  expect(s.shaderSources(s.gl.VERTEX_SHADER)).toEqual(plainVertex);const fragments=s.shaderSources(s.gl.FRAGMENT_SHADER);expect(fragments[0]).toBe(plainFragments[0])
  const textured=fragments[1];expect(textured).toContain('sourcePigmentCoverage(sampled.r)-grain-(255.0-patternStrength)');expect(textured).toContain('coverage*pigmentAlpha+128.0');expect(textured.indexOf('highp float coverage')).toBeLessThan(textured.lastIndexOf('gl_FragColor='));expect(textured.slice(textured.indexOf('highp float patternCell'),textured.lastIndexOf('void main(){'))).not.toContain('mod(')
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
 const s=fixture();try{const bytes=s.cpu.reservedBytes,cacheBytes=s.cache.bytes;let fragments=0
  s.gl.getShaderParameter=(shader:object)=>s.shaderTypes.get(shader)!==s.gl.FRAGMENT_SHADER||++fragments!==2
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
  plain.prepare(manifest,s.companions);const oldVertex=s.shaderSources(s.gl.VERTEX_SHADER),oldFragments=s.shaderSources(s.gl.FRAGMENT_SHADER);plain.reset();s.gl.shaderSource.mockClear()
  const textured={...manifest,texturedOperations:[kind]},before=canonicalRgba8CompositeBudget(manifest),after=canonicalRgba8CompositeBudget(textured)
  expect(after.gpuBytes).toBe(before.gpuBytes);expect(after.cpuBytes-before.cpuBytes).toBe(8192)
  s.pass.prepare(textured,s.companions)
  expect(s.shaderSources(s.gl.VERTEX_SHADER)).toEqual(oldVertex);const fragments=s.shaderSources(s.gl.FRAGMENT_SHADER);expect(fragments[0]).toBe(oldFragments[0])
  const fragment=fragments[1];expect(fragment).toContain('sourcePigmentCoverage(sampled.r)-grain-(255.0-patternStrength)');expect(fragment).toContain('coverage*pigmentAlpha+128.0')
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

const grainLimits={width:16,height:16,operations:['over32FusedScalar']as const,primaryGrainPrograms:[{operation:'over32FusedScalar',law:'hard-multiply-u8-native-v1'}]as const}
function multiplyRequest(s:ReturnType<typeof fixture>,strengthU8=128):CanonicalCompositeRequest {
 const source=s.request.source;if(source.kind!=='texturedMaskRgb')throw Error('Expected original source')
 const pin=canonicalMultiplyPrimaryTexturePin({kind:'canvasTexture',asset:s.pattern.asset.id,law:'hard-multiply-u8-native-v1',width:s.pin.width,height:s.pin.height,periodX:s.pin.width,periodY:s.pin.height,phase:{kind:'resolved-stroke-phase-v1',x:1,y:1},strength:'recorded-grain-v1'},s.pattern.asset)
 return {...s.request,operation:{kind:'over32FusedScalar',control:{profile:'installed-arm64-scalar-fused-fpcr0-v1',opacity:1}},source:{...source,kind:'primaryGrainMaskRgb',pin,strengthU8}}
}
it('precharges an explicit hardMultiply program and preserves shared VERTEX/plain/subtract source bytes',()=>{
 const s=fixture();try{
  const plain={width:16,height:16,operations:['over32FusedScalar']as const,texturedOperations:['over32FusedScalar']as const};s.pass.prepare(plain,s.companions)
  const old=s.shaderSources(s.gl.FRAGMENT_SHADER);s.pass.reset();s.gl.shaderSource.mockClear()
  const full={...grainLimits,texturedOperations:plain.texturedOperations},b=canonicalRgba8CompositeBudget(plain),g=canonicalRgba8CompositeBudget(full)
  expect(g.cpuBytes-b.cpuBytes).toBe(8192);expect(g.gpuBytes).toBe(b.gpuBytes)
  s.pass.prepare(full,s.companions);const fragments=s.shaderSources(s.gl.FRAGMENT_SHADER)
  expect(s.shaderSources(s.gl.VERTEX_SHADER)).toHaveLength(1);expect(fragments).toHaveLength(3);expect(fragments.slice(0,2)).toEqual(old)
  expect(fragments[2]).toContain('sourcePigmentCoverage(sampled.r)*grain*patternStrength+32603.0');expect(fragments[2]).toContain('floor((biased+floor(biased/128.0))/65536.0)');expect(fragments[2]).toContain('sourceCompositeFusedOver32Scalar(source,destination')
  const saved=s.snapshot(),textures=s.gl.createTexture.mock.calls.length
  for(const strength of[0,128,255])expect(s.pass.drawSource(multiplyRequest(s,strength))).toBe('painted')
  expect(s.snapshot()).toEqual(saved);expect(s.gl.createTexture).toHaveBeenCalledTimes(textures)
  const compileCount=s.gl.compileShader.mock.calls.length,update=s.pass.prepareCompanionUpdate(s.companions);update.assertCurrent();update.publish();update.finalizeCleanup();expect(s.gl.compileShader).toHaveBeenCalledTimes(compileCount)
 }finally{s.close()}
})
it('requires explicit new grain law/program/OVER, rejecting malformed pins before target lease or copy',()=>{
 const s=fixture();try{
  s.pass.prepare({width:16,height:16,operations:['over32FusedScalar']},s.companions)
  expect(()=>s.pass.drawSource(multiplyRequest(s))).toThrow('not prepared');s.pass.reset();s.pass.prepare(grainLimits,s.companions)
  const request=multiplyRequest(s),source=request.source;if(source.kind!=='primaryGrainMaskRgb')throw Error('Expected grain')
  const lease=vi.fn(()=>()=>{}),target={...s.target,lifetime:{kind:'external' as const,owner:{},lease}},copies=s.gl.copyTexSubImage2D.mock.calls.length
  let getters=0;const phase=Object.defineProperty({},'x',{get(){getters++;return 1}})
  for(const bad of[{...source,pin:{...source.pin,law:'subtract-u8-v1'}},{...source,pin:{...source.pin,phase}},{...source,strengthU8:256},{...source,pin:{...source.pin,width:2}}]){
   expect(()=>s.pass.drawSource({...request,target,source:bad} as CanonicalCompositeRequest)).toThrow()
  }
  expect(getters).toBe(0);expect(lease).not.toHaveBeenCalled();expect(s.gl.copyTexSubImage2D).toHaveBeenCalledTimes(copies)
  expect(()=>s.pass.drawSource({...request,operation})).toThrow('Unsupported multiply')
  const legacy=s.request.source;if(legacy.kind!=='texturedMaskRgb')throw Error('Expected legacy')
  expect(()=>s.pass.drawSource({...request,source:{...legacy,pin:source.pin} as unknown as CanonicalCompositeRequest['source']})).toThrow()
 }finally{s.close()}
})
it('keeps native hardMultiply triple rounding distinct from nested rounded pairs with independent boundary vectors',()=>{
 // These fixed values come from the native biased integer law, not GPU readback.
 expect(canonicalPrimaryTextureMultiplyU8(255,255,255)).toBe(255)
 expect(canonicalPrimaryTextureMultiplyU8(255,255,0)).toBe(0)
 expect(canonicalPrimaryTextureMultiplyU8(1,128,255)).toBe(1)
 expect(canonicalPrimaryTextureMultiplyU8(128,128,128)).toBe(32)
 expect(canonicalPrimaryTextureMultiplyU8(1,128,128)).toBe(0) // nested pair-rounding gives1
})

it('denies uncharged multiply compilation and cleans a failed new fragment including primary undefined before retry',()=>{
 const s=fixture();try{
  const plain=canonicalRgba8CompositeBudget({width:16,height:16,operations:['over32FusedScalar']})
  const release=s.cpu.reserve(s.cpu.budgetBytes-s.cpu.reservedBytes-plain.cpuBytes),created=s.gl.createShader.mock.calls.length
  try{expect(()=>s.pass.prepare(grainLimits,s.companions)).toThrow('budgets');expect(s.gl.createShader).toHaveBeenCalledTimes(created)}finally{release()}
  const baseline=s.cpu.reservedBytes,gpu=s.cache.bytes,saved=s.snapshot(),status=s.gl.getShaderParameter
  let fragments=0
  s.gl.getShaderParameter=(shader:unknown,key:number)=>{
   if(s.shaderTypes.get(shader as object)===s.gl.FRAGMENT_SHADER&&++fragments===2)throw undefined
   return status(shader,key)
  }
  let thrown=false,primary:unknown;try{s.pass.prepare(grainLimits,s.companions)}catch(error){thrown=true;primary=error}
  expect(thrown).toBe(true);expect(primary).toBeUndefined();expect(s.pass.isReady()).toBe(false);expect(s.cpu.reservedBytes).toBe(baseline);expect(s.cache.bytes).toBe(gpu);expect(s.snapshot()).toEqual(saved)
  expect(s.gl.deleteShader).toHaveBeenCalledTimes(3);expect(s.gl.deleteProgram).toHaveBeenCalledTimes(1)
  s.gl.getShaderParameter=status;expect(s.pass.prepare(grainLimits,s.companions)).toBe('ready')
 }finally{s.close()}
})
it('uses SAME phase/crop uniforms for hardMultiply and rejects accessor program declarations without callbacks',()=>{
 const s=fixture();try{
  let getters=0;const entry={operation:'over32FusedScalar',get law(){getters++;return 'hard-multiply-u8-native-v1'}}
  expect(()=>canonicalRgba8CompositeBudget({...grainLimits,primaryGrainPrograms:[entry]} as unknown as Parameters<typeof canonicalRgba8CompositeBudget>[0])).toThrow();expect(getters).toBe(0)
  s.pass.prepare(grainLimits,s.companions);const req=multiplyRequest(s),saved=s.snapshot()
  expect(s.pass.drawSource({...req,writeBounds:{minX:11,minY:21,maxX:13,maxY:24}})).toBe('painted');expect(s.snapshot()).toEqual(saved)
  expect(s.gl.uniform2f).toHaveBeenCalledWith(expect.objectContaining({name:'patternPeriod'}),3,2)
  expect(s.gl.uniform2f).toHaveBeenCalledWith(expect.objectContaining({name:'patternPhase'}),0,0)
  expect(s.gl.uniform1f).toHaveBeenCalledWith(expect.objectContaining({name:'patternStrength'}),128)
 }finally{s.close()}
})

import {canonicalPixelPrimaryTexturePin} from '@grafetto/shared'
import {SOURCE_RGBA8_GENERIC_SC_PROFILE,SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE} from '../presets/sourceColorRgba8'
it.each(['genericSCU8','colorHsyBrowser'] as const)('executes prepared neutral grain %s while historical multiply and subtract remain closed',kind=>{
 const s=fixture();try{
  s.pass.prepare({width:16,height:16,operations:['over32FusedScalar',kind],primaryGrainPrograms:[{operation:kind,law:'pixel-texture-u8-v1'},{operation:'over32FusedScalar',law:'hard-multiply-u8-native-v1'}]},s.companions)
  const source=s.request.source;if(source.kind!=='texturedMaskRgb')throw Error('Original pattern fixture required')
  const pin=canonicalPixelPrimaryTexturePin({kind:'canvasTexture',asset:s.pattern.asset.id,law:'pixel-texture-u8-v1',mode:'multiply',soft:false,width:s.pin.width,height:s.pin.height,periodX:s.pin.width,periodY:s.pin.height,phase:{kind:'resolved-stroke-phase-v1',x:1,y:1},strength:'recorded-grain-v1'},s.pattern.asset)
  const operation=kind==='genericSCU8'?{kind,control:{mode:'screen' as const,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:.8}}:{kind,control:{mode:'colorHsy' as const,profile:SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE,opacity:.8}}
  const before=s.snapshot(),draws=s.gl.drawArrays.mock.calls.length
  expect(s.pass.drawSource({...s.request,source:{...source,kind:'primaryGrainMaskRgb',pin,strengthU8:128},operation})).toBe('painted')
  expect(s.gl.drawArrays.mock.calls.length).toBe(draws+1);expect(s.snapshot()).toEqual(before)
  const old=multiplyRequest(s);expect(()=>s.pass.drawSource({...old,operation})).toThrow('Unsupported multiply')
  expect(()=>s.pass.drawSource({...s.request,operation})).toThrow()
  expect(s.gl.drawArrays.mock.calls.length).toBe(draws+1)
 }finally{s.close()}
})

it('dispatches all channel extension IDs through the same prepared neutral grain variant',()=>{
 const s=fixture();try{
  s.pass.prepare({width:16,height:16,operations:['genericSCU8'],primaryGrainPrograms:[{operation:'genericSCU8',law:'pixel-texture-u8-v1'}]},s.companions)
  const source=s.request.source;if(source.kind!=='texturedMaskRgb')throw Error('Original pattern fixture required')
  const pin=canonicalPixelPrimaryTexturePin({kind:'canvasTexture',asset:s.pattern.asset.id,law:'pixel-texture-u8-v1',mode:'multiply',soft:false,width:s.pin.width,height:s.pin.height,periodX:s.pin.width,periodY:s.pin.height,phase:{kind:'resolved-stroke-phase-v1',x:1,y:1},strength:'recorded-grain-v1'},s.pattern.asset)
  const modes=['equivalence','additiveSubtractive','arcTangent','negation','inverseSubtract','grainMerge','grainExtract','allanon','geometricMean','parallel','reflect','glow','freeze','heat','glowHeat','heatGlow','reflectFreeze','freezeReflect','heatGlowFreezeReflectHybrid','hardMixSofterPhotoshop','penumbraA','penumbraB','penumbraC','penumbraD','flatLight','binaryXor','binaryOr','binaryAnd','binaryNand','binaryNor','binaryXnor','binaryImplication','binaryNotImplication','binaryConverse','binaryNotConverse'] as const,policy=vi.spyOn(s.gl,'uniform2f'),programs=s.gl.createProgram.mock.calls.length,before=s.snapshot()
  for(const [i,mode]of modes.entries()){
   expect(s.pass.drawSource({...s.request,source:{...source,kind:'primaryGrainMaskRgb',pin,strengthU8:128},operation:{kind:'genericSCU8',control:{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:.8,mask:127}}})).toBe('painted')
   expect(policy).toHaveBeenLastCalledWith(expect.objectContaining({name:'policy'}),28+i,1)
  }
  expect(s.gl.createProgram.mock.calls.length).toBe(programs);expect(s.snapshot()).toEqual(before)
 }finally{s.close()}
})
