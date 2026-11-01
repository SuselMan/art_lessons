import {expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_MATERIAL_LIMITS,buildCanonicalMaterial,canonicalPrimaryTextureMaterialContext,type CanonicalMaterialContextV3,type CanonicalMaterialFrameV3} from '@grafetto/shared'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalFrameExecutor,canonicalExecutorOperations,type CanonicalFrameSubmissionV3,type CanonicalFrameExecutorOptions} from './CanonicalFrameExecutor'
import {CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
const tip={id:'asset:'+'a'.repeat(64),size:8,x:0,y:0,width:8,height:8},pattern={id:'asset:'+'b'.repeat(64),size:8,x:0,y:0,width:4,height:4}
const context=():CanonicalMaterialContextV3=>canonicalPrimaryTextureMaterialContext({version:3,assets:[tip,pattern],primarySource:{kind:'image',asset:tip.id,brushScale:1,brushAngle:0},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:1,offsetY:2,strength:'pressure-identity-v1'},budget:{workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels}})
const recipe={kind:'image' as const,asset:tip.id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:8,mirrorH:false,mirrorV:false}
function decoded(depths=[0,.5,1],ended=true,entry:CanonicalMaterialFrameV3['entry']={phase:'between'}){
 return buildCanonicalMaterial({masked:false,entry,draws:depths.map((grainDepth,i)=>({recipe,role:'primary' as const,x:i*4,y:0,opacity:.75,flow:.7,grainDepth})),fences:[...(entry.phase==='between'&&depths.length?[{kind:'segmentBegin' as const,at:0,group:0}]:[]),...(ended?[{kind:'primaryEnd' as const,at:depths.length,group:0},{kind:'segmentEnd' as const,at:depths.length,group:0},{kind:'gestureEnd' as const,at:depths.length}]:[])]},context()).frame
}
function fixture(variant=true,rawCompanion=true){
 const{gl,snapshot}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache()
 gl.LUMINANCE=0x1909;gl.TEXTURE1=gl.TEXTURE0+1;gl.STATIC_DRAW=9001;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002;gl.LINEAR=9010;gl.REPEAT=9011
 gl.getShaderPrecisionFormat=()=>({precision:23,rangeMin:127,rangeMax:127});gl.texSubImage2D=vi.fn();gl.copyTexSubImage2D=vi.fn();gl.copyTexImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn()
 const attrib=gl.getAttribLocation;gl.getAttribLocation=(p:unknown,n:string)=>n==='position'?0:attrib(p,n)
 const attachments=new Map(),attach=gl.framebufferTexture2D;gl.framebufferTexture2D=(...args:unknown[])=>{attachments.set(gl.getParameter(gl.FRAMEBUFFER_BINDING),args[3]);attach(...args)};gl.getFramebufferAttachmentParameter=()=>attachments.get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
 const parameters=new Map(),set=gl.texParameteri;gl.texParameteri=(t:number,n:number,v:number)=>{const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);if(!parameters.has(texture))parameters.set(texture,new Map());parameters.get(texture).set(n,v);set(t,n,v)};gl.getTexParameter=(_:number,n:number)=>parameters.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(n)??gl.NEAREST
 const c=context(),bank=new CanonicalMaskSourceBank(gl,cache,cpu,[],{gpuBytes:0,cpuBytes:0},undefined,'root-residency'),p=bank.prepareRoot([{asset:tip,readOriginalCoverage:()=>new Uint8Array(64).fill(255)},{kind:'raw-pattern-l8',asset:pattern,pin:c.primaryTexture,readOriginalGray:()=>Uint8Array.from({length:64},(_,i)=>i*3)}],{gpuBytes:0,cpuBytes:0});p.jobs.forEach((_,i)=>p.prepareJob(i));p.assertPreparedPublication();const root=p.publish()
 const prepass=new TransformedMaskPrepass(gl,cache,cpu,'exec-texture');prepass.prepare({width:8,height:8,slots:1},root.preparedResources())
 // Existing default capacity-record metadata is lazy and retained until prepass reset.
 const warm=prepass.retainPreparedCapacity();warm.release()
 const composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'exec-texture-composite'),raw=p.jobs.filter(j=>j.kind==='raw-pattern-l8').map(({key,bytes})=>({key,bytes}))
 composite.prepare({width:4,height:4,operations:canonicalExecutorOperations(G),...(variant?{texturedOperations:['alphaDarken32FusedScalar']as const}:{})},[...root.preparedResources(),...prepass.preparedResources(),...rawCompanion?raw:[]])
 const scratch=new RibbonScratchPool(gl),layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8'),reserve=vi.fn(()=>()=>{}),poison=vi.fn(),changed=vi.fn()
 const options:CanonicalFrameExecutorOptions={rasterProfile:G,bank:root,primaryTexture:{context:c,root},prepass,composite,scratch,layer:()=>({buffer:layer,epoch:0}),pageBounds:{minX:0,minY:0,maxX:32,maxY:16},reserveTransient:reserve,changed,poison}
 let executor:CanonicalFrameExecutor|undefined
 const create=(override:Partial<CanonicalFrameExecutorOptions>={})=>(executor=new CanonicalFrameExecutor({...options,...override}))
 const submission=(frame=decoded(),ordinal=0):CanonicalFrameSubmissionV3=>({gestureId:'gesture',layerId:'layer',layerEpoch:0,ordinal,frame,assets:c.assets,rgb:[200,20,50],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'}})
 const drain=()=>{let turns=0;while(executor!.pending){if(++turns>1000)throw Error('executor stalled');executor!.advance()}}
 const close=()=>{executor?.cancel();layer.destroy();scratch.destroy();prepass.reset();composite.reset();root.release();bank.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)}
 return{gl,cache,cpu,c,bank,root,prepass,composite,scratch,layer,options,create,submission,drain,close,reserve,poison,changed,snapshot}
}
it('paints real V3 draw depths via frameDrawIndex with one retained SAME root and no grain on outer composition',()=>{
 const s=fixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0);try{
  const e=s.create(),calls=vi.spyOn(s.composite,'drawSource'),uploads=s.gl.texImage2D.mock.calls.length,initialBytes=s.cpu.reservedBytes
  s.root.release();const frame=structuredClone(decoded()),input=s.submission(frame);e.enqueue(input)
  frame.draws.forEach(d=>Reflect.set(d,'grainDepth',1));Reflect.set(input.rgb,0,0);Reflect.set(input.composition,'outerResourceOpacity',0)
  s.drain();const textured=calls.mock.calls.map(([r])=>r).filter(r=>r.source.kind==='texturedMaskRgb')
  expect(textured.length).toBeGreaterThanOrEqual(3)
  for(const r of textured){if(r.source.kind!=='texturedMaskRgb')throw Error('source');expect(r.source.strengthU8).toBe([0,128,255][r.source.view.rect.x/4]);expect(r.source.rgb).toEqual([200,20,50])}
  expect(new Set(textured.map(r=>r.source.kind==='texturedMaskRgb'?r.source.pattern:undefined)).size).toBe(1)
  const outer=calls.mock.calls.map(([r])=>r).filter(r=>r.source.kind==='straightRgba8');expect(outer.length).toBeGreaterThan(0);expect(outer.every(r=>r.operation.control.opacity===.8)).toBe(true)
  expect(calls.mock.calls.every(([r])=>r.source.kind==='texturedMaskRgb'||r.source.kind==='straightRgba8')).toBe(true)
  expect(s.gl.texImage2D.mock.calls.length-uploads).toBeGreaterThan(0) // real layer/scratch allocations, never a new pattern upload
  expect(s.gl.texImage2D.mock.calls.filter((call:unknown[])=>call[2]===s.gl.LUMINANCE)).toHaveLength(1)
  expect(s.bank.jobs).toHaveLength(0);expect(s.cpu.reservedBytes).toBeLessThan(initialBytes);expect(e.checkpointReady).toBe(true);expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();s.close()}
})
it.each(['variant','companion','root','bank']as const)('refuses missing or foreign %s before target allocation and releases constructor captures',mode=>{
 const s=fixture(mode!=='variant',mode!=='companion');try{const bytes=s.cpu.reservedBytes,create=vi.spyOn(s.layer,'resolveForPaint');let override:Partial<CanonicalFrameExecutorOptions>={}
  if(mode==='root'){const wrong={...s.root,patternResource:()=>s.root.patternResource(s.c.primaryTexture,pattern,s.options.prepass.brushGlBatchInfo())};override={primaryTexture:{context:s.c,root:wrong},bank:wrong}}
  if(mode==='bank')override={bank:s.bank}
  expect(()=>s.create(override)).toThrow();expect(s.cpu.reservedBytes).toBe(bytes);expect(create).not.toHaveBeenCalled();expect(s.root.isReady()).toBe(true)
 }finally{s.close()}
})
it('rejects unsupported frame/cost/assets/depth before acceptance without reserving physical work',()=>{
 const s=fixture();try{const e=s.create(),base=s.cpu.reservedBytes,targets=vi.spyOn(s.layer,'resolveForPaint')
  const bads=[{...decoded(),masked:true},{...decoded(),draws:[{...decoded().draws[0],grainDepth:NaN}]},{...decoded(),definitions:[{...recipe,asset:pattern.id}]}]
  for(const frame of bads)expect(()=>e.enqueue({...s.submission(),frame}as CanonicalFrameSubmissionV3)).toThrow()
  expect(()=>e.enqueue({...s.submission(),assets:[pattern,tip]})).toThrow();expect(e.pending).toBe(false);expect(s.cpu.reservedBytes).toBe(base);expect(s.reserve).not.toHaveBeenCalled();expect(targets).not.toHaveBeenCalled()
  e.cancel()
  const limited={...s.c,budget:{...s.c.budget,workUnits:0}},other=s.create({primaryTexture:{context:limited,root:s.root}})
  expect(()=>other.enqueue(s.submission())).toThrow();other.cancel()
 }finally{s.close()}
})
it('preserves empty-frame prefix and same root through open continuation until the real terminal frame',()=>{
 const s=fixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0);try{const e=s.create(),calls=vi.spyOn(s.composite,'drawSource')
  e.enqueue(s.submission(decoded([],false),0));s.drain();expect(calls).not.toHaveBeenCalled();expect(s.bank.jobs.length).toBeGreaterThan(0)
  e.enqueue(s.submission(decoded([.5],false),1));s.drain();expect(e.checkpointReady).toBe(false)
  e.enqueue(s.submission(decoded([1],true,{phase:'primary',group:0}),2));s.root.release();s.drain();expect(s.bank.jobs).toHaveLength(0);expect(e.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close()}
})
it.each(['cancel','drawfail','loss']as const)('releases its retained root exactly once after actual %s cleanup',mode=>{
 const s=fixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0);try{const e=s.create();s.root.release();e.enqueue(s.submission(decoded([.5],false)))
  if(mode==='drawfail')s.gl.drawArrays.mockImplementationOnce(()=>{throw Error('paint fail')})
  if(mode==='cancel')e.cancel();else if(mode==='loss'){s.gl.isContextLost=()=>true;e.cancel(Error('lost'),{lost:true})}else expect(()=>s.drain()).toThrow(/paint fail/)
  expect(s.bank.jobs).toHaveLength(0);e.cancel();expect(e.pending).toBe(false)
 }finally{clock.mockRestore();s.close()}
})
it('keeps shared expected count/end and accessor rejection before any accepted target work',()=>{
 const s=fixture();try{const limited={...s.c,expectedDrawCount:1,expectedStrokeEnd:true},e=s.create({primaryTexture:{context:limited,root:s.root}}),bytes=s.cpu.reservedBytes,get=vi.fn(()=>.5)
  expect(()=>e.enqueue(s.submission(decoded([.5,.5])))).toThrow();expect(()=>e.enqueue(s.submission(decoded([.5],false)))).toThrow()
  const frame=structuredClone(decoded([.5])),draw=Object.defineProperty({...frame.draws[0]},'grainDepth',{get,enumerable:true})
  expect(()=>e.enqueue(s.submission({...frame,draws:[draw]}))).toThrow();expect(get).not.toHaveBeenCalled();expect(e.pending).toBe(false);expect(s.cpu.reservedBytes).toBe(bytes);expect(s.reserve).not.toHaveBeenCalled()
 }finally{s.close()}
})
it('refuses an actual ninth queued frame before capturing its body and preserves all earlier prefixes',()=>{
 const s=fixture();try{const e=s.create();for(let i=0;i<8;i++)e.enqueue(s.submission(decoded([.5],false,i?{phase:'primary',group:0}:{phase:'between'}),i))
  const bytes=s.cpu.reservedBytes,get=vi.fn(()=>.5),frame=decoded([.5],false,{phase:'primary',group:0}),draw=Object.defineProperty({...frame.draws[0]},'grainDepth',{get,enumerable:true})
  expect(()=>e.enqueue(s.submission({...frame,draws:[draw]},8))).toThrow(/queue is full/);expect(get).not.toHaveBeenCalled();expect(e.pendingFrameCount).toBe(8);expect(s.cpu.reservedBytes).toBe(bytes)
 }finally{s.close()}
})
it.each(['accepted','invalid']as const)('handles bounded capture workspace release failure after %s metadata without silent queued work',mode=>{
 const s=fixture();try{const e=s.create(),releaseError=Error('capture workspace release failed'),reserve=s.cpu.reserve.bind(s.cpu);let first=true
  const allocation=vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{const release=reserve(bytes);if(!first)return release;first=false;return()=>{release();throw releaseError}})
  const frame=mode==='invalid'?{...decoded([.5]),draws:[{...decoded([.5]).draws[0],grainDepth:NaN}]}:decoded([.5])
  if(mode==='accepted'){expect(()=>e.enqueue(s.submission(frame))).toThrow(releaseError);expect(e.poisoned).toBe(true);expect(s.poison).toHaveBeenCalledOnce()}
  else{expect(()=>e.enqueue(s.submission(frame))).toThrow(/canonical material/);expect(e.cleanupFailures).toContain(releaseError);expect(e.poisoned).toBe(false);expect(s.poison).not.toHaveBeenCalled()}
  expect(e.pending).toBe(false);allocation.mockRestore()
 }finally{s.close()}
})
