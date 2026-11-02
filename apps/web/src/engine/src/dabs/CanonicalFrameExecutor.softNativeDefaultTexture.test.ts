import {CanonicalWashLayerCoordinator,type CanonicalWashLayerCoordinatorOptions,type CanonicalLocalWashAuthor} from './CanonicalWashLayerCoordinator'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime,CanonicalRecordedDelivery} from '../oplog/CanonicalRecordedDelivery'
import {canonicalStrokeRasterContract,canonicalStrokeSnapshotV7,packCanonicalTexturedAutoMaterial,prepareCanonicalRecordedAttachment,type CanonicalStrokeOperation} from '@grafetto/shared'
import {canonicalTexturedAutoMaterialContext,buildCanonicalTexturedAutoMaterial,canonicalDefaultAutoSourcePin,canonicalGaussianAutoSourcePin,type CanonicalMaterialContextV7,type CanonicalTexturedAutoRecipe} from '@grafetto/shared'
import type {CanonicalFrameSubmissionV7} from './CanonicalFrameExecutor'
import {CanonicalSoftCircleProgramOwner} from './CanonicalSoftCircleProgramOwner'
import {expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,canonicalSoftAutoSourcePin,canonicalSoftNativeDefaultTexturedSourceMaterialContext,buildCanonicalMaterial,sourceAutoGeometry,type CanonicalMaterialContextV6} from '@grafetto/shared'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalFrameExecutor,canonicalExecutorOperations,type CanonicalFrameSubmissionV6,type CanonicalFrameExecutorOptions} from './CanonicalFrameExecutor'
import {CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
const pattern={id:'asset:'+'b'.repeat(64),size:8,x:0,y:0,width:4,height:4}
// Structural small Soft root fixture, not genuine descriptor/native admission proof.
function context(profile:typeof G|typeof B=G):CanonicalMaterialContextV6{const softnessCurve={text:'0,0;1,1;',points:[{x:0,y:0,corner:false},{x:1,y:1,corner:false}]};return canonicalSoftNativeDefaultTexturedSourceMaterialContext({version:6,assets:[pattern],primarySource:canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft-fixture',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:4,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve},brushScale:1,brushAngle:0,coverageProfile:profile===B?'browser-number-coverage-v1':'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:softnessCurve,coefficients:[[0,0,1,0]]}}),primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:1,offsetY:2,strength:'source-pressure-curve-v1'},budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})}
function decoded(profile:typeof G|typeof B=G){const c=context(profile),g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:4,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0}),recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:c.primarySource.source,coverageProfile:c.primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false};return buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[0,4,8].map(x=>({recipe,role:'primary' as const,x,y:0,opacity:.75,flow:.7,grainDepth:x===0?0:x===4?.5:1})),fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:3,group:0},{kind:'segmentEnd',at:3,group:0},{kind:'gestureEnd',at:3}]},c).frame}
function fixture(variant=true,rawCompanion=true,profile:typeof G|typeof B=G,overVariant=false,selected?:CanonicalMaterialContextV7){
 const{gl,snapshot}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache()
 gl.LUMINANCE=0x1909;gl.TEXTURE1=gl.TEXTURE0+1;gl.STATIC_DRAW=9001;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002;gl.LINEAR=9010;gl.REPEAT=9011
 gl.getShaderPrecisionFormat=()=>({precision:23,rangeMin:127,rangeMax:127});gl.texSubImage2D=vi.fn();gl.copyTexSubImage2D=vi.fn();gl.copyTexImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn()
 const attrib=gl.getAttribLocation;gl.getAttribLocation=(p:unknown,n:string)=>n==='position'?0:attrib(p,n)
 const attachments=new Map(),attach=gl.framebufferTexture2D;gl.framebufferTexture2D=(...args:unknown[])=>{attachments.set(gl.getParameter(gl.FRAMEBUFFER_BINDING),args[3]);attach(...args)};gl.getFramebufferAttachmentParameter=()=>attachments.get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
 const parameters=new Map(),set=gl.texParameteri;gl.texParameteri=(t:number,n:number,v:number)=>{const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);if(!parameters.has(texture))parameters.set(texture,new Map());parameters.get(texture).set(n,v);set(t,n,v)};gl.getTexParameter=(_:number,n:number)=>parameters.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(n)??gl.NEAREST
 const c=context(profile),chosen=selected??c,selectedAsset=chosen.assets[0],bank=new CanonicalMaskSourceBank(gl,cache,cpu,[],{gpuBytes:0,cpuBytes:0},undefined,'root-residency'),p=bank.prepareRoot([{kind:'raw-pattern-l8',asset:selectedAsset,pin:chosen.primaryTexture,readOriginalGray:()=>Uint8Array.from({length:selectedAsset.size*selectedAsset.size},(_,i)=>i*3)}],{gpuBytes:0,cpuBytes:0});p.jobs.forEach((_,i)=>p.prepareJob(i));p.assertPreparedPublication();const root=p.publish()
 const prepass=new TransformedMaskPrepass(gl,cache,cpu,'exec-texture');prepass.prepare({width:8,height:8,slots:1},root.preparedResources())
 // Existing default capacity-record metadata is lazy and retained until prepass reset.
 const warm=prepass.retainPreparedCapacity();warm.release()
 const composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'exec-texture-composite'),raw=p.jobs.filter(j=>j.kind==='raw-pattern-l8').map(({key,bytes})=>({key,bytes}))
 composite.prepare({width:4,height:4,operations:canonicalExecutorOperations(profile),...((variant||overVariant)?{texturedOperations:[...(variant?[profile===B?'alphaDarkenBrowserFloat' as const:'alphaDarken32FusedScalar' as const]:[]),...(overVariant?[profile===B?'overBrowserFloat' as const:'over32FusedScalar' as const]:[])]}:{})},[...root.preparedResources(),...prepass.preparedResources(),...rawCompanion?raw:[]])
 const scratch=new RibbonScratchPool(gl),layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8'),reserve=vi.fn(()=>()=>{}),poison=vi.fn(),changed=vi.fn()
 const options:CanonicalFrameExecutorOptions={rasterProfile:profile,autoSource:chosen.primarySource,bank:root,primaryTexture:{context:chosen,root},prepass,composite,scratch,layer:()=>({buffer:layer,epoch:0}),pageBounds:{minX:0,minY:0,maxX:32,maxY:16},reserveTransient:reserve,changed,poison}
 let executor:CanonicalFrameExecutor|undefined
 const create=(override:Partial<CanonicalFrameExecutorOptions>={})=>(executor=new CanonicalFrameExecutor({...options,...override}))
 const submission=(frame=decoded(profile),ordinal=0):CanonicalFrameSubmissionV6=>({gestureId:'gesture',layerId:'layer',layerEpoch:0,ordinal,frame,assets:c.assets,rgb:[200,20,50],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'}})
 const drain=()=>{let turns=0;while(executor!.pending){if(++turns>1000)throw Error('executor stalled');executor!.advance()}}
 const close=()=>{executor?.cancel();layer.destroy();scratch.destroy();prepass.reset();composite.reset();root.release();bank.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)}
 return{gl,cache,cpu,c,bank,root,prepass,composite,scratch,layer,options,create,submission,drain,close,reserve,poison,changed,snapshot}
}

it.each([G,B])('admits standalone6 SAME source/root and draws recorded quantized strength under exact profile %s',profile=>{
 const s=fixture(true,true,profile),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{expect(s.root.preparedResources()).toEqual([]);const e=s.create(),draw=vi.spyOn(s.composite,'drawSource');e.enqueue(s.submission());s.drain()
  const calls=draw.mock.calls.map(([r])=>r).filter(r=>r.source.kind==='texturedMaskRgb');expect(calls.length).toBeGreaterThan(0)
  for(const r of calls){if(r.source.kind!=='texturedMaskRgb')throw Error('texture required');expect([0,128,255]).toContain(r.source.strengthU8);expect(r.source.pin.strength).toBe('source-pressure-curve-v1');expect(r.operation.kind).toBe(profile===B?'alphaDarkenBrowserFloat':'alphaDarken32FusedScalar')}
  expect(new Set(calls.map(r=>r.source.kind==='texturedMaskRgb'?r.source.strengthU8:-1))).toEqual(new Set([0,128,255]));expect(e.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close()}
})
it('rejects source/profile/asset/frame strength mismatches before target reservation',()=>{
 const s=fixture();try{expect(()=>s.create({autoSource:{...s.c.primarySource,brushAngle:1}})).toThrow();expect(()=>s.create({rasterProfile:B})).toThrow()
  const e=s.create(),base=s.cpu.reservedBytes,bad=structuredClone(decoded());Reflect.set(bad.draws[0],'grainDepth',NaN)
  expect(()=>e.enqueue({...s.submission(),frame:bad})).toThrow();expect(()=>e.enqueue({...s.submission(),assets:[{...pattern,x:1}]})).toThrow()
  expect(s.reserve).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(base);expect(e.pending).toBe(false)
 }finally{s.close()}
})
it('keeps immutable accepted6 capture and releases all resources on source invalidation',()=>{
 const s=fixture();try{const e=s.create(),frame=decoded();e.enqueue(s.submission(frame));Reflect.set(frame.draws[0],'grainDepth',0);s.bank.reset();expect(()=>e.advance()).toThrow();e.cancel()}finally{s.close()}
})

it('captures every material6 strength independently of later DTO mutation',()=>{const s=fixture();const clock=vi.spyOn(performance,'now').mockReturnValue(0);try{const e=s.create(),frame=decoded(),draw=vi.spyOn(s.composite,'drawSource');e.enqueue(s.submission(frame));for(const d of frame.draws)Reflect.set(d,'grainDepth',1);s.drain();const actual=draw.mock.calls.map(([r])=>r.source).filter(r=>r.kind==='texturedMaskRgb');expect(new Set(actual.map(r=>r.kind==='texturedMaskRgb'?r.strengthU8:-1))).toEqual(new Set([0,128,255]));}finally{clock.mockRestore();s.close()}})

it('rejects cross4/6 profile and insufficient texture work before target reservation',()=>{const s=fixture();try{const e=s.create(),frame=decoded(),before=s.cpu.reservedBytes;Reflect.set(frame,'profile','canonical-textured-source-material-v4');expect(()=>e.enqueue(s.submission(frame))).toThrow();expect(s.cpu.reservedBytes).toBe(before);expect(s.reserve).not.toHaveBeenCalled();}finally{s.close()}const t=fixture();try{const limited=canonicalSoftNativeDefaultTexturedSourceMaterialContext({...t.c,budget:{...t.c.budget,workUnits:1}});const e=t.create({primaryTexture:{context:limited,root:t.root}}),before=t.cpu.reservedBytes;expect(()=>e.enqueue(t.submission())).toThrow();expect(t.cpu.reservedBytes).toBe(before);expect(t.reserve).not.toHaveBeenCalled();expect(e.pending).toBe(false);}finally{t.close()}})

function radialOwner(s:ReturnType<typeof fixture>){const source=s.c.primarySource.source;return new CanonicalSoftCircleProgramOwner(s.cpu,{kind:'auto',generator:'soft',shape:'circle',diameter:source.diameter,ratio:source.ratio,horizontalFade:source.horizontalFade,verticalFade:source.verticalFade,spikes:2,softness:1,randomness:0,density:1,antialias:false},{points:s.c.primarySource.radialCurve.source.points,coefficients:s.c.primarySource.radialCurve.coefficients},Math.floor(source.diameter*4+.5)+2)}
it('rejects supplied external Soft owner even on SAME CPU when texture root is present',()=>{const s=fixture(),owner=radialOwner(s);try{const before=s.cpu.reservedBytes;expect(()=>s.create({softProgramOwner:owner})).toThrow('same root owner');expect(s.cpu.reservedBytes).toBe(before)}finally{owner.retire();s.close()}})
it('rolls back texture and mask leases if genuine radial reservation fails, leaving root reusable',()=>{const s=fixture(),basis=radialOwner(s),bytes=basis.estimatedCpuBytes;basis.retire();const baseline=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu),spy=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(n===bytes)throw Error('radial reserve injected');return reserve(n)});try{expect(()=>s.create()).toThrow('radial reserve injected');expect(s.cpu.reservedBytes).toBe(baseline);spy.mockRestore();expect(()=>s.create()).not.toThrow()}finally{spy.mockRestore();s.close()}})


it.each([G,B])('routes standalone textured buildup EACH draw to its installed OVER variant %s',profile=>{
 const s=fixture(true,true,profile,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const e=s.create(),draw=vi.spyOn(s.composite,'drawSource'),input=s.submission()
  e.enqueue({...input,composition:{...input.composition,mode:'buildup'}});s.drain()
  const calls=draw.mock.calls.map(([r])=>r)
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.every(r=>r.source.kind==='texturedMaskRgb')).toBe(true)
  expect(calls.every(r=>r.operation.kind===(profile===B?'overBrowserFloat':'over32FusedScalar'))).toBe(true)
  expect(new Set(calls.map(r=>r.source.kind==='texturedMaskRgb'?r.source.strengthU8:-1))).toEqual(new Set([0,128,255]))
  // Direct composition has no deferred wash surface/present pass.
  expect(()=>e.rawWashTiles()).toThrow('Raw wash ownership unavailable');expect(e.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close()}
})
it('requires explicit OVER preparation before capture/reserve and keeps deposition-only closed',()=>{
 const s=fixture();try{
  const e=s.create(),input=s.submission(),bytes=s.cpu.reservedBytes
  expect(()=>e.enqueue({...input,composition:{...input.composition,mode:'buildup'}})).toThrow('OVER variant')
  expect(s.cpu.reservedBytes).toBe(bytes);expect(s.reserve).not.toHaveBeenCalled();expect(e.pending).toBe(false)
 }finally{s.close()}
 const t=fixture(true,true,G,true);try{
  const e=t.create({washMode:'deposition-only'}),input=t.submission(),bytes=t.cpu.reservedBytes
  expect(()=>e.enqueue({...input,composition:{...input.composition,mode:'buildup'}})).toThrow('Deposition-only')
  expect(t.cpu.reservedBytes).toBe(bytes);expect(t.reserve).not.toHaveBeenCalled();expect(e.pending).toBe(false)
 }finally{t.close()}
})
it('keeps the direct textured source on SAME root and cleans cancellation before and during paint',()=>{
 for(const painted of[false,true]){
  const s=fixture(true,true,G,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
  try{const e=s.create(),input=s.submission();e.enqueue({...input,composition:{...input.composition,mode:'buildup'}})
   if(painted){vi.spyOn(s.composite,'drawSource').mockImplementationOnce(()=>{throw Error('actual direct draw failure')});expect(()=>s.drain()).toThrow('actual direct draw failure')}
   e.cancel();expect(e.pending).toBe(false)
  }finally{clock.mockRestore();s.close()}
 }
})

// Standalone7 structural fixture: no source-author/binder or online permission.
function context7(kind:'defaultAuto'|'gaussianAuto'|'softAuto',profile:typeof G|typeof B=G):CanonicalMaterialContextV7{
 const soft=context(profile).primarySource,coverageProfile=profile===B?'browser-number-coverage-v1' as const:'neon64-f32-fma-v1' as const
 const common={descriptorId:'generic7',descriptorVersion:1,descriptorSha256:'c'.repeat(64),brushScale:1,brushAngle:0,coverageProfile}
 const geometry={shape:'circle' as const,diameter:4,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1}
 const primarySource=kind==='softAuto'?soft:kind==='defaultAuto'?canonicalDefaultAutoSourcePin({...common,kind:'defaultAuto',source:{...geometry,kind:'defaultAuto',generator:'default'}}):canonicalGaussianAutoSourcePin({...common,kind:'gaussianAuto',source:{...geometry,kind:'gaussianAuto',generator:'gauss'}})
 const asset={...pattern,size:64,width:51,height:51}
 return canonicalTexturedAutoMaterialContext({version:7,assets:[asset],primarySource,primaryTexture:{kind:'canvasTexture',asset:asset.id,law:'subtract-u8-v1',width:51,height:51,periodX:51,periodY:51,phase:{kind:'resolved-stroke-phase-v1',x:50,y:37},strength:'recorded-grain-v1'},budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
}
function decoded7(c:CanonicalMaterialContextV7){const source=c.primarySource,g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:4,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0}),common={brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false}
 const recipe:CanonicalTexturedAutoRecipe=source.kind==='softAuto'?{...common,kind:'softAuto',sourceSlot:0,source:source.source,coverageProfile:source.coverageProfile}:source.kind==='gaussianAuto'?{...common,kind:'gaussianAuto',source:source.source,coverageProfile:source.coverageProfile}:{...common,kind:'defaultAuto',source:source.source,coverageProfile:source.coverageProfile}
 return buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[0,4,8].map((x,i)=>({recipe,role:'primary',x,y:0,opacity:.75,flow:.7,grainDepth:[0,.5,1][i]})),fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:3,group:0},{kind:'segmentEnd',at:3,group:0},{kind:'gestureEnd',at:3}]},c).frame
}
function submission7(c:CanonicalMaterialContextV7):CanonicalFrameSubmissionV7{return{gestureId:'g7',layerId:'layer',layerEpoch:0,ordinal:0,frame:decoded7(c),assets:c.assets,rgb:[200,20,50],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'}}}
it.each(['defaultAuto','gaussianAuto','softAuto']as const)('renders explicit7 %s with SAME root pipeline and recorded strength',kind=>{
 for(const profile of[G,B]){const c=context7(kind,profile),s=fixture(true,true,profile,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0)
  try{const raw=structuredClone(c),e=s.create({primaryTexture:{context:raw,root:s.root}}),draw=vi.spyOn(s.composite,'drawSource');Reflect.set(raw.primaryTexture.phase,'x',0);e.enqueue(submission7(c));s.drain();expect(e.checkpointReady).toBe(true)
   const calls=draw.mock.calls.map(([r])=>r).filter(r=>r.source.kind==='texturedMaskRgb');expect(calls.length).toBeGreaterThan(0)
   expect(new Set(calls.map(r=>r.source.kind==='texturedMaskRgb'?r.source.strengthU8:-1))).toEqual(new Set([0,128,255]))
   for(const r of calls){if(r.source.kind!=='texturedMaskRgb')throw Error('texture');expect(r.source.pin).toEqual(c.primaryTexture)}
  }finally{clock.mockRestore();s.close()}
 }
})
it('rejects standalone7 density/seeded identity before retaining any capacity/root/metadata resources',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,false,c)
 try{const baseline=s.cpu.reservedBytes,retain=vi.spyOn(s.prepass,'retainPreparedCapacity'),reserve=vi.spyOn(s.cpu,'reserve')
  for(const mutate of[(x:CanonicalMaterialContextV7)=>Reflect.set(x.primarySource.source,'density',.5),(x:CanonicalMaterialContextV7)=>Reflect.set(x.primarySource,'coverageProfile','neon64-f32-fma-seeded-density-v1')]){
   const bad=structuredClone(c);mutate(bad);expect(()=>s.create({primaryTexture:{context:bad,root:s.root}})).toThrow();expect(s.cpu.reservedBytes).toBe(baseline)
  }
  expect(retain).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled()
 }finally{s.close()}
})
it('does not invoke standalone7 density accessors or capture full context before metadata charge',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,false,c)
 try{const baseline=s.cpu.reservedBytes,retain=vi.spyOn(s.prepass,'retainPreparedCapacity'),reserve=vi.spyOn(s.cpu,'reserve');let getters=0
  const bad=structuredClone(c);Object.defineProperty(bad.primarySource.source,'density',{get(){getters++;return 1}})
  expect(()=>s.create({primaryTexture:{context:bad,root:s.root}})).toThrow();expect(getters).toBe(0);expect(retain).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(baseline)
  retain.mockRestore();reserve.mockRestore()
  const raw=structuredClone(c),peek=vi.fn(()=>0);Object.defineProperty(raw.primaryTexture.phase,'x',{get:peek})
  const actual=s.cpu.reserve.bind(s.cpu),held=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(n===4096)throw Error('7 metadata admission denied');return actual(n)})
  expect(()=>s.create({primaryTexture:{context:raw,root:s.root}})).toThrow('7 metadata admission denied');expect(peek).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(baseline);held.mockRestore()
 }finally{s.close()}
})
it('captures7 phase and rejects wrong source, crop, grain/legacy frame and retiring root without leaks',()=>{
 const c=context7('gaussianAuto'),s=fixture(true,true,G,false,c)
 try{const baseline=s.cpu.reservedBytes;expect(()=>s.create({autoSource:context7('defaultAuto').primarySource})).toThrow();expect(s.cpu.reservedBytes).toBe(baseline)
  const e=s.create(),before=s.cpu.reservedBytes,bad=structuredClone(submission7(c));Reflect.set(bad.frame.draws[0],'grainDepth',NaN)
  expect(()=>e.enqueue(bad)).toThrow();expect(()=>e.enqueue({...submission7(c),assets:[{...c.assets[0],width:50}]})).toThrow();expect(()=>e.enqueue(s.submission())).toThrow();expect(s.cpu.reservedBytes).toBe(before);expect(s.reserve).not.toHaveBeenCalled()
  const frame=decoded7(c);e.enqueue({...submission7(c),frame});Reflect.set(frame.draws[0],'grainDepth',1);s.bank.reset();expect(()=>e.advance()).toThrow();e.cancel()
 }finally{s.close()}
})
it('rolls back7 SAME CPU/root child if late Soft radial reservation fails and then reuses root',()=>{
 const c=context7('softAuto'),s=fixture(true,true,G,false,c),basis=radialOwner(s),bytes=basis.estimatedCpuBytes;basis.retire()
 try{const baseline=s.cpu.reservedBytes,original=s.cpu.reserve.bind(s.cpu),reserve=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(n===bytes)throw Error('7 radial admission denied');return original(n)})
  expect(()=>s.create()).toThrow('7 radial admission denied');expect(s.cpu.reservedBytes).toBe(baseline);reserve.mockRestore();expect(()=>s.create()).not.toThrow()
 }finally{s.close()}
})
it('keeps standalone7 direct OVER/cancel/deposition guards with actual finite captured frame',()=>{
 for(const painted of[false,true]){const c=context7('softAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0)
  try{const e=s.create(),input=submission7(c);e.enqueue({...input,composition:{...input.composition,mode:'buildup'}})
   if(painted){vi.spyOn(s.composite,'drawSource').mockImplementationOnce(()=>{throw Error('7 actual draw failure')});expect(()=>s.drain()).toThrow('7 actual draw failure')}
   e.cancel();expect(e.pending).toBe(false)
  }finally{clock.mockRestore();s.close()}
 }
 const c=context7('softAuto'),s=fixture(true,true,G,true,c);try{const e=s.create({washMode:'deposition-only'}),input=submission7(c),baseline=s.cpu.reservedBytes;expect(()=>e.enqueue({...input,composition:{...input.composition,mode:'buildup'}})).toThrow('Deposition-only');expect(s.cpu.reservedBytes).toBe(baseline)}finally{s.close()}
})

// Admission-only structural7 tests; recording GL is NOT a GPU pixel oracle.
it('replay frontier denies executable enqueue/advance while default actual7 OVER stays valid',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c)
 try{const e=s.create({replayFrontier:'textured7-buildup-v1'}),input=submission7(c),draw=vi.spyOn(s.composite,'drawSource'),before=s.cpu.reservedBytes
  expect(()=>e.enqueue({...input,composition:{...input.composition,mode:'buildup'}})).toThrow('Replay frontier')
  expect(()=>e.advance()).toThrow('Replay frontier');expect(e.pendingFrameCount).toBe(0);expect(e.replayReservationCount).toBe(0);expect(e.checkpointReady).toBe(false);expect(draw).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(before)
 }finally{s.close()}
})
it.each(['defaultAuto','gaussianAuto','softAuto']as const)('charged replay admission shares actual7 capture/source/cost before pure publication %s',kind=>{
 const c=context7(kind),s=fixture(true,true,G,true,c)
 try{const e=s.create({replayFrontier:'textured7-buildup-v1'}),input=submission7(c),draw=vi.spyOn(s.composite,'drawSource'),before=s.cpu.reservedBytes,t=e.prepareReplayFrontier({...input,composition:{...input.composition,mode:'buildup'}})
  expect(s.cpu.reservedBytes).toBeGreaterThan(before);expect(s.reserve).toHaveBeenCalledTimes(1);expect(e.pending).toBe(false);expect(e.pendingFrameCount).toBe(0);expect(e.replayReservationCount).toBe(1)
  expect(()=>t.publish()).toThrow('not checked');expect(()=>Reflect.apply(t.assertCurrent,{},[])).toThrow('receiver');t.assertCurrent();t.publish();expect(()=>t.publish()).toThrow();expect(draw).not.toHaveBeenCalled();expect(s.layer.gpuAllocationSnapshot()).toHaveLength(0)
  t.release();t.release();expect(e.replayReservationCount).toBe(0);expect(s.cpu.reservedBytes).toBe(before)
  expect(()=>e.prepareReplayFrontier({...input,composition:{...input.composition,mode:'buildup'}})).toThrow()
 }finally{s.close()}
})
it('replay full7 capture rejects bad grain/assets/prepared capacity before any accepted prefix',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c)
 try{const e=s.create({replayFrontier:'textured7-buildup-v1'}),input=submission7(c),before=s.cpu.reservedBytes,bad=structuredClone(input)
  Reflect.set(bad.frame.draws[0],'grainDepth',NaN);expect(()=>e.prepareReplayFrontier({...bad,composition:{...bad.composition,mode:'buildup'}})).toThrow()
  expect(()=>e.prepareReplayFrontier({...input,assets:[{...c.assets[0],width:50}],composition:{...input.composition,mode:'buildup'}})).toThrow()
  const old=input.frame.definitions[0],g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:4,ratio:1,spikes:2,scale:1,angle:0},{scale:4,ratio:1,rotation:0}),recipe={...old,scale:4,width:g.maskSize[0],height:g.maskSize[1]},large=buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:.75,flow:.7,grainDepth:.5}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},c).frame
  expect(()=>e.prepareReplayFrontier({...input,frame:large,composition:{...input.composition,mode:'buildup'}})).toThrow('prepared capacity')
  expect(e.replayReservationCount).toBe(0);expect(e.pending).toBe(false);expect(s.cpu.reservedBytes).toBe(before);expect(s.reserve).not.toHaveBeenCalled()
  const retry=e.prepareReplayFrontier({...input,composition:{...input.composition,mode:'buildup'}});retry.cancel();expect(s.cpu.reservedBytes).toBe(before)
 }finally{s.close()}
})
it('replay target reservation failure and unchecked late owner failure leave prior prefix reusable',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c);let late:undefined|(()=>void)
 try{const e=s.create({replayFrontier:'textured7-buildup-v1',layer:()=>{late?.();return{buffer:s.layer,epoch:0}}}),input={...submission7(c),composition:{...submission7(c).composition,mode:'buildup' as const}},before=s.cpu.reservedBytes
  s.reserve.mockImplementationOnce(()=>{throw Error('target denied')});expect(()=>e.prepareReplayFrontier(input)).toThrow('target denied');expect(s.cpu.reservedBytes).toBe(before)
  const ticket=e.prepareReplayFrontier(input);late=()=>{expect(()=>e.prepareReplayFrontier(input)).toThrow('pending');throw Error('late owner')};expect(()=>ticket.assertCurrent()).toThrow('late owner');expect(()=>ticket.publish()).toThrow('not checked');ticket.cancel();late=undefined;expect(s.cpu.reservedBytes).toBe(before)
  const retry=e.prepareReplayFrontier(input);retry.assertCurrent();retry.publish();retry.release();expect(s.cpu.reservedBytes).toBe(before)
 }finally{late=undefined;s.close()}
})
it('replay reservations bound accepted frontier to eight and cancellation retires every receipt',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c)
 try{const e=s.create({replayFrontier:'textured7-buildup-v1'}),empty=buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},c).frame,input={...submission7(c),frame:empty,composition:{...submission7(c).composition,mode:'buildup' as const}},tickets=[]
  for(let ordinal=0;ordinal<8;ordinal++){const t=e.prepareReplayFrontier({...input,ordinal});t.assertCurrent();t.publish();tickets.push(t)}
  expect(e.replayReservationCount).toBe(8);expect(e.pendingFrameCount).toBe(0);expect(()=>e.prepareReplayFrontier({...input,ordinal:8})).toThrow('full');tickets[0].release();const t=e.prepareReplayFrontier({...input,ordinal:8});t.assertCurrent();t.publish();expect(e.replayReservationCount).toBe(8)
  e.cancel();expect(e.replayReservationCount).toBe(0);for(const t of tickets)t.cancel();t.cancel();expect(e.pendingFrameCount).toBe(0)
 }finally{s.close()}
})
it('replay prepare reserve callback cancellation cannot publish a retired source or leak capture',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c)
 try{const e=s.create({replayFrontier:'textured7-buildup-v1'}),input=submission7(c);s.reserve.mockImplementationOnce(()=>{e.cancel();return()=>{}})
  expect(()=>e.prepareReplayFrontier({...input,composition:{...input.composition,mode:'buildup'}})).toThrow();expect(e.replayReservationCount).toBe(0);expect(e.pendingFrameCount).toBe(0)
 }finally{s.close()}
})

it('independent same-ticket layer reentry cannot publish while outer assertion fails',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c);let callback:undefined|(()=>void)
 try{
  const e=s.create({replayFrontier:'textured7-buildup-v1',layer:()=>{callback?.();return{buffer:s.layer,epoch:0}}}),input=submission7(c)
  const ticket=e.prepareReplayFrontier({...input,composition:{...input.composition,mode:'buildup'}})
  let entered=false
  callback=()=>{if(entered)return;entered=true;ticket.assertCurrent();ticket.publish()}
  expect(()=>ticket.assertCurrent()).toThrow()
  expect(e['planned']).toBeUndefined()
  expect(e['gesture']).toBeUndefined()
  ticket.cancel()
 }finally{callback=undefined;s.close()}
})

it('replay ticket assertion guard clears even when layer callback throws undefined',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c);let callback:undefined|(()=>void)
 try{const e=s.create({replayFrontier:'textured7-buildup-v1',layer:()=>{callback?.();return{buffer:s.layer,epoch:0}}}),input=submission7(c),ticket=e.prepareReplayFrontier({...input,composition:{...input.composition,mode:'buildup'}})
  callback=()=>{throw undefined};let caught=false;try{ticket.assertCurrent()}catch{caught=true}expect(caught).toBe(true);expect(()=>ticket.publish()).toThrow('not checked');expect(e['planned']).toBeUndefined();callback=undefined;ticket.assertCurrent();ticket.publish();ticket.release()
 }finally{callback=undefined;s.close()}
})

// Structural original/local7 fixture, not vendor or online source authority.
function replayConsumer7(pageBounds?:Readonly<{minX:number;minY:number;maxX:number;maxY:number}>){
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),derived=new TiledLayerBuffer(s.gl,4,4,undefined,undefined,undefined,'straight-rgba8')
 const scope=Object.freeze({roomId:'frontier-room',boardEpoch:0,rasterProfile:G})
 let current=true,late:(()=>void)|undefined
 const lifetime:CanonicalRecordedLifetime=Object.freeze({assertCurrent(){if(this!==lifetime||!current)throw Error('frontier original stale');return scope}})
 const source=vi.fn<CanonicalWashLayerCoordinatorOptions['source']>(()=>{const child=s.root.retain();return{autoSource:c.primarySource,bank:child,sourceLease:child,primaryTexture:{context:c,root:child}}})
 const stageCandidate=vi.fn(()=>{throw Error('metadata frontier must not prepare preview')})
 const coordinator=new CanonicalWashLayerCoordinator({buildupReplay7:true,replayRetention:{maxEntries:64,maxBytes:1048576},previewCandidate:stageCandidate,...pageBounds?{pageBounds}:{},rasterProfile:G,layerId:'layer',layerEpoch:0,maxGestures:16,layer:()=>{late?.();return{buffer:s.layer,epoch:0}},presentation:()=>({buffer:derived,epoch:0}),prepass:s.prepass,composite:s.composite,scratch:s.scratch,source,reserveTransient:s.reserve,changed:vi.fn(),poison:vi.fn()})
 const snapshot=(strokeId:string)=>canonicalStrokeSnapshotV7({materialVersion:7,material:c,assets:c.assets,layerId:'layer',brush:'brush:generic7@1',strokeId,boardEpoch:0,descriptorSha256:c.primarySource.descriptorSha256,rasterProfile:G,pigmentRgb8:[200,20,50],composition:{mode:'buildup',alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'}},0,G)
 const author=(strokeId:string):CanonicalLocalWashAuthor=>{const value:CanonicalLocalWashAuthor=Object.freeze({lifetime,snapshot:snapshot(strokeId),userId:'actor',assertCurrent(candidate:CanonicalLocalWashAuthor){if(this!==value||candidate!==value)throw Error('foreign frontier author');return lifetime.assertCurrent()}});return value}
 const operation=(strokeId:string,ordinal=0,empty=false,points?:readonly {x:number;y:number}[]):CanonicalStrokeOperation=>{
  const frame=points?geometryFrame7(c,points):empty?buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},c).frame:decoded7(c)
  const version=canonicalStrokeRasterContract(G).envelopeVersion;if(version!==2)throw Error('GSC envelope2 required')
  return Object.freeze<CanonicalStrokeOperation>({type:'canonical_stroke',id:`frontier-${strokeId}-${ordinal}`,userId:'actor',timestamp:ordinal,layerId:'layer',frame:{version,rasterProfile:G,brush:'brush:generic7@1',strokeId,frameOrdinal:ordinal,pigmentRgb8:[200,20,50],composition:{mode:'buildup',alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'},texturePhase:c.primaryTexture.phase,materialPacked:packCanonicalTexturedAutoMaterial(frame,c)}})
 }
 const recorded=(op:CanonicalStrokeOperation,seq:number):CanonicalRecordedInput=>{
  const operation={...op,seq},atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:0,capabilities:[{originalUserId:'actor',snapshot:snapshot(op.frame.strokeId)}],bindings:[{operationId:op.id,sequence:seq,originalUserId:'actor',capability:0}]},[operation],scope)[0]
  let value:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==value)throw Error('foreign original frontier');lifetime.assertCurrent()}})
  value=Object.freeze({...atom,delivery});return value
 }
 return{...s,coordinator,derived,source,stageCandidate,author,operation,recorded,setLate:(fn?:()=>void)=>{late=fn},stale:()=>{current=false},close(){coordinator.cancel();derived.destroy();s.close()}}
}
it('consumer7 uses SAME global8 tagged slots across entries, metadata drains and latest stays closed at idle',()=>{
 const s=replayConsumer7(),draw=vi.spyOn(s.composite,'drawSource')
 try{
  for(let i=0;i<8;i++)expect(s.coordinator.tryEnqueueLocal(s.author('g'+i),s.operation('g'+i))).toBe(true)
  expect(s.source).toHaveBeenCalledTimes(8);expect(s.coordinator.queuedFrameCount).toBe(8)
  const rejected=s.author('g8'),before=s.cpu.reservedBytes,count=s.coordinator['replay'].size
  expect(s.coordinator.tryEnqueueLocal(rejected,s.operation('g8'))).toBe(false);expect(s.coordinator['replay'].size).toBe(count);expect(s.cpu.reservedBytes).toBe(before)
  const first=s.coordinator['queue'][0];if(!('kind'in first))throw Error('expected tagged metadata');expect(first.entry.executor.replayReservationCount).toBe(1)
  s.coordinator.advance();expect(s.coordinator.queuedFrameCount).toBe(7);expect(first.entry.executor.replayReservationCount).toBe(0);expect(s.cpu.reservedBytes).toBeLessThan(before)
  expect(s.coordinator.tryEnqueueLocal(rejected,s.operation('g8'))).toBe(true)
  for(let i=0;i<8;i++)s.coordinator.advance()
  expect(s.coordinator.advance()).toEqual({kind:'preview-idle'});expect(s.coordinator.executionPending).toBe(false);expect(s.coordinator.pending).toBe(false)
  expect(s.coordinator.presentationReady).toBe(false);expect(s.coordinator.publishedPresentationReady).toBe(false);expect(s.coordinator.checkpointReady).toBe(false)
  expect(draw).not.toHaveBeenCalled();expect(s.stageCandidate).not.toHaveBeenCalled();expect(s.layer.gpuAllocationSnapshot()).toHaveLength(0)
  expect(s.coordinator.tryEnqueueLocal(s.author('wake'),s.operation('wake'))).toBe(true);expect(s.coordinator.pending).toBe(true);s.coordinator.advance();expect(s.coordinator.advance()).toEqual({kind:'preview-idle'})
 }finally{s.close()}
})
it('consumer7 captures source once and couples original/local prefix with journal only after last callback',()=>{
 const s=replayConsumer7()
 try{
  const author=s.author('many');expect(s.coordinator.tryEnqueueLocal(author,s.operation('many',0,true))).toBe(true);s.coordinator.advance()
  const entry=s.coordinator['entries'][0],state=entry.local!.state,bytes=s.cpu.reservedBytes,journal=s.coordinator['replay'].size,real=entry.executor.prepareReplayFrontier.bind(entry.executor)
  const prepare=vi.spyOn(entry.executor,'prepareReplayFrontier').mockImplementation(input=>{const ticket=real(input);s.setLate(()=>{throw Error('last actual layer callback')});return ticket})
  expect(()=>s.coordinator.tryEnqueueLocal(author,s.operation('many',1,true))).toThrow('last actual layer callback');s.setLate();prepare.mockRestore()
  expect(entry.local!.state).toBe(state);expect(s.coordinator['replay'].size).toBe(journal);expect(entry.executor.replayReservationCount).toBe(0);expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.cpu.reservedBytes).toBe(bytes)
  expect(s.coordinator.tryEnqueueLocal(author,s.operation('many',1,true))).toBe(true);expect(s.source).toHaveBeenCalledTimes(1)
  s.coordinator.advance();const work=s.coordinator.retainReplaySnapshot();expect(work.values()).toHaveLength(2)
  expect(s.coordinator.tryEnqueueLocal(author,s.operation('many',2,true))).toBe(true);expect(work.values()).toHaveLength(2);work.release()
 }finally{s.close()}
})
it('consumer7 keeps original promotion single-admitted and rejects stale originals without journal mutation',()=>{
 const s=replayConsumer7()
 try{
  const author=s.author('promoted'),op=s.operation('promoted',0,true);s.coordinator.tryEnqueueLocal(author,op)
  const entry=s.coordinator['entries'][0],executor=entry.executor,prepare=vi.spyOn(executor,'prepareReplayFrontier');s.coordinator.enqueueRecorded(s.recorded(op,1))
  expect(prepare).not.toHaveBeenCalled();expect(s.source).toHaveBeenCalledTimes(1);expect(s.coordinator.queuedFrameCount).toBe(1);expect(entry.local!.receipts).toHaveLength(0);expect(s.coordinator['replay'].get(op.id)?.value.kind).toBe('recorded')
  const fresh=s.recorded(s.operation('recorded'),2);s.coordinator.enqueueRecorded(fresh);expect(s.source).toHaveBeenCalledTimes(2);expect(s.coordinator.queuedFrameCount).toBe(2)
  const rejected=s.recorded(s.operation('stale'),3),count=s.coordinator['replay'].size;s.stale();expect(()=>s.coordinator.enqueueRecorded(rejected)).toThrow('stale');expect(s.coordinator['replay'].size).toBe(count)
 }finally{s.close()}
})
it('consumer7 postcommit promotion cleanup failure remains fatal without reverting accepted original',()=>{
 const s=replayConsumer7()
 try{
  const author=s.author('cleanup'),op=s.operation('cleanup',0,true);s.coordinator.tryEnqueueLocal(author,op)
  const entry=s.coordinator['entries'][0],error=Error('postcommit original cleanup')
  Reflect.set(entry.local!.receipts[0],'release',()=>{throw error})
  expect(()=>s.coordinator.enqueueRecorded(s.recorded(op,1))).toThrow(error)
  expect(s.coordinator.poisoned).toBe(true);expect(entry.recorded?.lastSeq).toBe(1);expect(entry.local!.receipts).toHaveLength(0);expect(s.coordinator['replay'].get(op.id)?.value.kind).toBe('recorded');expect(s.coordinator.queuedFrameCount).toBe(1);expect(s.coordinator.cleanupFailures).toContain(error)
 }finally{s.close()}
})
it('consumer7 failed pending-ticket cleanup latches fatal while preserving primary admission error',()=>{
 const s=replayConsumer7(),primary=Error('frontier late validation'),cleanup=Error('frontier target rollback')
 try{
  s.reserve.mockImplementationOnce(()=>()=>{throw cleanup})
  const actual=CanonicalFrameExecutor.prototype.prepareReplayFrontier;const prepare=vi.spyOn(CanonicalFrameExecutor.prototype,'prepareReplayFrontier').mockImplementation(function(this:CanonicalFrameExecutor,input){const ticket=actual.call(this,input);s.setLate(()=>{throw primary});return ticket})
  expect(()=>s.coordinator.tryEnqueueLocal(s.author('rollback'),s.operation('rollback'))).toThrow(primary);s.setLate()
  expect(s.coordinator.poisoned).toBe(true);expect(s.coordinator.cleanupFailures).toContain(cleanup);expect(s.coordinator['replay'].size).toBe(0);expect(s.coordinator.queuedFrameCount).toBe(0);prepare.mockRestore()
 }finally{s.setLate();s.close()}
})
it('consumer7 fresh genuine source-child release fault latches fatal and attempts complete rollback',()=>{
 const s=replayConsumer7(),cleanup=Error('fresh source child release'),primary='Recorded textured Auto source binding missing or changed'
 try{
  const reserve=s.cpu.reserve.bind(s.cpu);let wrapped=false
  vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);if(n===2048&&!wrapped){wrapped=true;return()=>{release();throw cleanup}}return release})
  const original=s.source.getMockImplementation()!;s.source.mockImplementationOnce((...args)=>({...original(...args),autoSource:context7('softAuto').primarySource}))
  expect(()=>s.coordinator.tryEnqueueLocal(s.author('bad-source'),s.operation('bad-source'))).toThrow(primary)
  expect(wrapped).toBe(true);expect(s.coordinator.poisoned).toBe(true);expect(s.coordinator.cleanupFailures).toContain(cleanup);expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.coordinator['replay'].size).toBe(0)
 }finally{s.close()}
})
it('consumer7 stage and local rollback faults attempt both and preserve thrown undefined validation',()=>{
 const s=replayConsumer7(),localError=Error('local payload rollback'),stageError=Error('stage metadata rollback')
 try{
  const reserve=s.cpu.reserve.bind(s.cpu);let first=true
  vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);if(first){first=false;return()=>{release();throw localError}}if(n===512)return()=>{release();throw stageError};return release})
  const original=s.source.getMockImplementation()!;s.source.mockImplementationOnce((...args)=>{const result=original(...args);s.setLate(()=>{throw undefined});return result})
  let threw=false,value:unknown='not thrown';try{s.coordinator.tryEnqueueLocal(s.author('undefined'),s.operation('undefined'))}catch(error){threw=true;value=error}s.setLate()
  expect(threw).toBe(true);expect(value).toBeUndefined();expect(s.coordinator.poisoned).toBe(true);expect(s.coordinator.cleanupFailures).toContain(localError);expect(s.coordinator.cleanupFailures).toContain(stageError);expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.coordinator['replay'].size).toBe(0)
 }finally{s.setLate();s.close()}
})


function geometryFrame7(c:CanonicalMaterialContextV7,points:readonly {x:number;y:number}[]){
 const recipe=decoded7(c).definitions[0]
 return buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:points.map(p=>({recipe,role:'primary',x:p.x,y:p.y,opacity:.75,flow:.7,grainDepth:.5})),fences:points.length?[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:points.length,group:0},{kind:'segmentEnd',at:points.length,group:0},{kind:'gestureEnd',at:points.length}]:[]},c).frame
}
it('pending replay targets are SAME deeply frozen clipped negative geometry and refuse receiver/assertion/retirement misuse',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c);let callback:(()=>void)|undefined
 try{
  const e=s.create({replayFrontier:'textured7-buildup-v1',pageBounds:{minX:-3,minY:-2,maxX:5,maxY:4},layer:()=>{callback?.();return{buffer:s.layer,epoch:0}}})
  const input={...submission7(c),frame:geometryFrame7(c,[{x:-5,y:-3}]),composition:{...submission7(c).composition,mode:'buildup' as const}}
  const t=e.prepareReplayFrontier(input),cpu=s.cpu.reservedBytes,query=vi.spyOn(s.gl,'getParameter'),source=vi.spyOn(s.prepass,'brushGlBatchInfo'),reserve=vi.spyOn(s.cpu,'reserve')
  const view=t.targets();expect(t.targets()).toBe(view)
  expect(view).toEqual([{x:-4,y:-4,width:4,height:4,writeBounds:{minX:-3,minY:-2,maxX:-1,maxY:0}},{x:-4,y:0,width:4,height:4,writeBounds:{minX:-3,minY:0,maxX:-1,maxY:1}}])
  expect(Object.isFrozen(view)).toBe(true);for(const target of view){expect(Object.isFrozen(target)).toBe(true);expect(Object.isFrozen(target.writeBounds)).toBe(true)}
  expect(()=>Reflect.set(view[0],'x',0)).not.toThrow();expect(view[0].x).toBe(-4);expect(Reflect.set(view[0].writeBounds!,'minX',0)).toBe(false)
  expect(()=>Reflect.apply(t.targets,{},[])).toThrow('receiver');expect(query).not.toHaveBeenCalled();expect(source).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(cpu)
  callback=()=>{expect(()=>t.targets()).toThrow('in flight')};t.assertCurrent();callback=undefined;t.publish();expect(()=>t.targets()).toThrow();t.release();expect(()=>t.targets()).toThrow();expect(view[0].x).toBe(-4)
  e.cancel();const next=s.create({replayFrontier:'textured7-buildup-v1'}),cancel=next.prepareReplayFrontier(input);cancel.cancel();expect(()=>cancel.targets()).toThrow()
 }finally{callback=undefined;s.close()}
})
it('replay cohort65 rejects atomically after two valid32 cohorts; metadata drain does not retire64 and same-coordinate retry works',()=>{
 const s=replayConsumer7()
 try{
  for(let group=0;group<2;group++){
   const points=Array.from({length:32},(_,i)=>({x:(group*32+i)*8,y:0})),author=s.author('cohort'+group)
   expect(s.coordinator.tryEnqueueLocal(author,s.operation('cohort'+group,0,false,points))).toBe(true);s.coordinator.advance()
  }
  const before=s.cpu.reservedBytes,journal=s.coordinator['replay'].size,entries=s.coordinator['entries'].length,sourceCalls=s.source.mock.calls.length,author=s.author('cohort65')
  expect(()=>s.coordinator.tryEnqueueLocal(author,s.operation('cohort65',0,false,[{x:512,y:0}]))).toThrow('cohort')
  expect(s.coordinator['positions'].size).toBe(64);expect(s.coordinator['replay'].size).toBe(journal);expect(s.coordinator['entries']).toHaveLength(entries);expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.cpu.reservedBytes).toBe(before)
  expect(s.coordinator.tryEnqueueLocal(author,s.operation('cohort65',0,false,[{x:0,y:0}]))).toBe(true)
  expect(s.coordinator['positions'].size).toBe(64);expect(s.source.mock.calls.length).toBe(sourceCalls+2);s.coordinator.advance();expect(s.coordinator['positions'].size).toBe(64)
 }finally{s.close()}
})
it('replay geometry CPU denial preserves primary undefined and old journal; genuine retry publishes once and promotion adds no geometry',()=>{
 const s=replayConsumer7(),reserve=s.cpu.reserve.bind(s.cpu),actual=CanonicalFrameExecutor.prototype.prepareReplayFrontier
 let prepared=false
 const hook=vi.spyOn(CanonicalFrameExecutor.prototype,'prepareReplayFrontier').mockImplementation(function(this:CanonicalFrameExecutor,input){const t=actual.call(this,input);prepared=true;return t})
 const cpu=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(prepared&&n===256)throw undefined;return reserve(n)})
 try{
  const author=s.author('cpu-geometry'),op=s.operation('cpu-geometry',0,false,[{x:0,y:0}]),before=s.cpu.reservedBytes
  let rejected=false;try{s.coordinator.tryEnqueueLocal(author,op)}catch(error){rejected=true;expect(error).toBeUndefined()}
  expect(rejected).toBe(true);expect(s.coordinator['positions'].size).toBe(0);expect(s.coordinator['replay'].size).toBe(0);expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.cpu.reservedBytes).toBe(before)
  cpu.mockRestore();expect(s.coordinator.tryEnqueueLocal(author,op)).toBe(true)
  const positions=s.coordinator['positions'],p=positions.get('0:0'),reservations=s.coordinator['reservations'].length,prepare=vi.spyOn(s.coordinator['entries'][0].executor,'prepareReplayFrontier');prepare.mockClear()
  s.coordinator.enqueueRecorded(s.recorded(op,1));expect(prepare).not.toHaveBeenCalled();expect(positions.size).toBe(1);expect(positions.get('0:0')).toBe(p);expect(s.coordinator['reservations']).toHaveLength(reservations)
 }finally{cpu.mockRestore();hook.mockRestore();s.close()}
})
it('replay geometry reservation callback cancellation releases staging and never publishes positions',()=>{
 const s=replayConsumer7(),reserve=s.cpu.reserve.bind(s.cpu),actual=CanonicalFrameExecutor.prototype.prepareReplayFrontier;let prepared=false
 const hook=vi.spyOn(CanonicalFrameExecutor.prototype,'prepareReplayFrontier').mockImplementation(function(this:CanonicalFrameExecutor,input){const t=actual.call(this,input);prepared=true;return t})
 const cpu=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);if(prepared&&n===256){try{s.coordinator.cancel()}catch(error){release();throw error}}return release})
 try{expect(()=>s.coordinator.tryEnqueueLocal(s.author('reentry-geometry'),s.operation('reentry-geometry',0,false,[{x:0,y:0}]))).toThrow();expect(s.coordinator['positions'].size).toBe(0);expect(s.coordinator['replay'].size).toBe(0);expect(s.coordinator.queuedFrameCount).toBe(0)}finally{cpu.mockRestore();hook.mockRestore();s.close()}
})
it('fully clipped or repeated replay targets allocate no extra persistent position reservation',()=>{
 const s=replayConsumer7({minX:0,minY:0,maxX:8,maxY:8})
 try{
  const old=s.coordinator['reservations'].length
  expect(s.coordinator.tryEnqueueLocal(s.author('clipped'),s.operation('clipped',0,false,[{x:-8,y:-8}]))).toBe(true)
  expect(s.coordinator['positions'].size).toBe(0);expect(s.coordinator['reservations']).toHaveLength(old);s.coordinator.advance()
  expect(s.coordinator.tryEnqueueLocal(s.author('resident'),s.operation('resident',0,false,[{x:0,y:0}]))).toBe(true);s.coordinator.advance()
  const count=s.coordinator['reservations'].length,p=s.coordinator['positions'].get('0:0')
  expect(s.coordinator.tryEnqueueLocal(s.author('duplicate'),s.operation('duplicate',0,false,[{x:0,y:0}]))).toBe(true)
  expect(s.coordinator['reservations']).toHaveLength(count);expect(s.coordinator['positions'].get('0:0')).toBe(p)
 }finally{s.close()}
})
