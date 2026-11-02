import {runBrushGlBatch,runBrushGlTurn} from './BrushGlBatch'
import {CanonicalWashLayerCoordinator,type CanonicalWashLayerCoordinatorOptions,type CanonicalLocalWashAuthor} from './CanonicalWashLayerCoordinator'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime,CanonicalRecordedDelivery} from '../oplog/CanonicalRecordedDelivery'
import {canonicalStrokeRasterContract,canonicalStrokeSnapshotV7,packCanonicalTexturedAutoMaterial,prepareCanonicalRecordedAttachment,type CanonicalStrokeOperation,type CanonicalStrokeCloseOperation} from '@grafetto/shared'
import {canonicalTexturedAutoMaterialContext,buildCanonicalTexturedAutoMaterial,canonicalDefaultAutoSourcePin,canonicalGaussianAutoSourcePin,type CanonicalMaterialContextV7,type CanonicalTexturedAutoRecipe} from '@grafetto/shared'
import type {CanonicalFrameSubmissionV7} from './CanonicalFrameExecutor'
import {CanonicalSoftCircleProgramOwner} from './CanonicalSoftCircleProgramOwner'
import {expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,canonicalSoftAutoSourcePin,canonicalSoftNativeDefaultTexturedSourceMaterialContext,buildCanonicalMaterial,sourceAutoGeometry,type CanonicalMaterialContextV6} from '@grafetto/shared'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalFrameExecutor,prepareRenderedPrefixCursor7,canonicalExecutorOperations,type CanonicalFrameSubmissionV6,type CanonicalFrameExecutorOptions} from './CanonicalFrameExecutor'
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
function replayConsumer7(pageBounds?:Readonly<{minX:number;minY:number;maxX:number;maxY:number}>,executable=false,seed?:(s:ReturnType<typeof fixture>)=>void,legacy=false){
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c);let stable=s.layer,derived:TiledLayerBuffer|undefined=new TiledLayerBuffer(s.gl,4,4,undefined,undefined,undefined,'straight-rgba8')
 const scope=Object.freeze({roomId:'frontier-room',boardEpoch:0,rasterProfile:G})
 let current=true,late:(()=>void)|undefined
 const lifetime:CanonicalRecordedLifetime=Object.freeze({assertCurrent(){if(this!==lifetime||!current)throw Error('frontier original stale');return scope}})
 const source=vi.fn<CanonicalWashLayerCoordinatorOptions['source']>(()=>{const child=s.root.retain();return{autoSource:c.primarySource,bank:child,sourceLease:child,primaryTexture:{context:c,root:child}}})
 const stageCandidate=vi.fn(()=>{
  if(!executable)throw Error('explicit staging failure')
  const previous=derived,buffer=new TiledLayerBuffer(s.gl,4,4,undefined,undefined,undefined,'straight-rgba8')
  let pending=true
  return{buffer,assertCurrent(){if(!pending||derived!==previous)throw Error('staged owner replaced')},cancel(){if(!pending)return;pending=false;buffer.destroy()},finish(old:TiledLayerBuffer,disposition='display'){if(!pending||old!==previous||(disposition==='closed-handoff'?stable!==buffer||derived!==undefined:derived!==buffer))throw Error('wrong old presentation');pending=false;old.destroy()}}
 })
 seed?.(s)
 let coordinator:CanonicalWashLayerCoordinator
 try{coordinator=new CanonicalWashLayerCoordinator({...legacy?{}:{mixedReplay7:true as const},replayRetention:{maxEntries:64,maxBytes:1048576},previewCandidate:stageCandidate,...pageBounds?{pageBounds}:{},rasterProfile:G,layerId:'layer',layerEpoch:0,maxGestures:16,layer:()=>{late?.();return{buffer:stable,epoch:0}},presentation:()=>({buffer:derived!,epoch:0}),prepass:s.prepass,composite:s.composite,scratch:s.scratch,source,reserveTransient:s.reserve,changed:vi.fn(),poison:vi.fn()})}catch(primary){derived?.destroy();s.close();throw primary}
 const snapshot=(strokeId:string,mode:'wash'|'buildup'='buildup')=>canonicalStrokeSnapshotV7({materialVersion:7,material:c,assets:c.assets,layerId:'layer',brush:'brush:generic7@1',strokeId,boardEpoch:0,descriptorSha256:c.primarySource.descriptorSha256,rasterProfile:G,pigmentRgb8:[200,20,50],composition:{mode,alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'}},0,G)
 const author=(strokeId:string,mode:'wash'|'buildup'='buildup'):CanonicalLocalWashAuthor=>{const value:CanonicalLocalWashAuthor=Object.freeze({lifetime,snapshot:snapshot(strokeId,mode),userId:'actor',assertCurrent(candidate:CanonicalLocalWashAuthor){if(this!==value||candidate!==value)throw Error('foreign frontier author');return lifetime.assertCurrent()}});return value}
 const operation=(strokeId:string,ordinal=0,empty=false,points?:readonly {x:number;y:number}[],mode:'wash'|'buildup'='buildup'):CanonicalStrokeOperation=>{
  const frame=points?geometryFrame7(c,points):empty?buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},c).frame:decoded7(c)
  const version=canonicalStrokeRasterContract(G).envelopeVersion;if(version!==2)throw Error('GSC envelope2 required')
  return Object.freeze<CanonicalStrokeOperation>({type:'canonical_stroke',id:`frontier-${strokeId}-${ordinal}`,userId:'actor',timestamp:ordinal,layerId:'layer',frame:{version,rasterProfile:G,brush:'brush:generic7@1',strokeId,frameOrdinal:ordinal,pigmentRgb8:[200,20,50],composition:{mode,alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'},texturePhase:c.primaryTexture.phase,materialPacked:packCanonicalTexturedAutoMaterial(frame,c)}})
 }
 const recorded=(op:CanonicalStrokeOperation,seq:number):CanonicalRecordedInput=>{
  const operation={...op,seq},atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:0,capabilities:[{originalUserId:'actor',snapshot:snapshot(op.frame.strokeId,op.frame.composition.mode)}],bindings:[{operationId:op.id,sequence:seq,originalUserId:'actor',capability:0}]},[operation],scope)[0]
  let value:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==value)throw Error('foreign original frontier');lifetime.assertCurrent()}})
  value=Object.freeze({...atom,delivery});return value
 }
 const seal=(frame:CanonicalRecordedInput,patch:Partial<CanonicalStrokeCloseOperation>={},assertion?:()=>void):CanonicalRecordedInput=>{
  const first=frame.operation;if(first.type!=='canonical_stroke')throw Error('original frame required')
  const operation={type:'canonical_stroke_close' as const,id:'close-'+first.frame.strokeId,userId:'operator',timestamp:1,seq:10,layerId:'layer',targetUserId:first.userId,strokeId:first.frame.strokeId,disposition:'commitPartial' as const,recordedNext:1,firstFrameOpId:first.id,lastFrameOpId:first.id,...patch}
  const atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:0,capabilities:[],bindings:[]},[operation],scope)[0]
  let value:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==value)throw Error('foreign original close');lifetime.assertCurrent();assertion?.()}})
  value=Object.freeze({...atom,delivery});return value
 }
 return{...s,coordinator,derived,source,stageCandidate,author,operation,recorded,seal,publish(ticket:import('./CanonicalWashLayerCoordinator').CanonicalPreviewPublication){
   ticket.assertCurrent();const old=stable;ticket.publish()
   if(ticket.disposition==='closed-handoff'){stable=ticket.buffer;derived=undefined}else derived=ticket.buffer
   let failed=false,primary:unknown
   try{ticket.finish()}catch(error){failed=true;primary=error}
   if(ticket.disposition==='closed-handoff')try{old.destroy()}catch(error){if(!failed){failed=true;primary=error}}
   if(failed)throw primary
  },currentPresentation:()=>derived??stable,setLate:(fn?:()=>void)=>{late=fn},stale:()=>{current=false},close(){coordinator.cancel();derived?.destroy();if(stable!==s.layer)stable.destroy();s.close()}}
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
  let parked=false;for(let i=0;i<30;i++){const result=s.coordinator.advance();if(result?.kind==='preview-failed')parked=true;if(!s.coordinator.queuedFrameCount&&parked)break}
  expect(parked).toBe(true);expect(s.coordinator.executionPending).toBe(false);expect(s.coordinator.pending).toBe(true)
  expect(s.coordinator.presentationReady).toBe(false);expect(s.coordinator.publishedPresentationReady).toBe(false);expect(s.coordinator.checkpointReady).toBe(false)
  expect(draw).not.toHaveBeenCalled();expect(s.stageCandidate.mock.calls.length).toBeGreaterThan(0);expect(s.layer.gpuAllocationSnapshot()).toHaveLength(0)
  expect(s.coordinator.tryEnqueueLocal(s.author('wake'),s.operation('wake'))).toBe(true);expect(s.coordinator.pending).toBe(true);for(let i=0;i<4;i++)s.coordinator.advance();expect(s.coordinator['previewFailure']).toBeDefined()
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
   expect(s.coordinator.tryEnqueueLocal(author,s.operation('cohort'+group,0,false,points))).toBe(true);for(let i=0;i<8&&s.coordinator.queuedFrameCount;i++)s.coordinator.advance()
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

// Immutable accepted source capture: structural7, not native/vendor permission.
it('source capture rejects constructor-callback phase mutation after precompare before original pair publication',()=>{
 const s=replayConsumer7(),raw=structuredClone(context7('defaultAuto')),original=s.source.getMockImplementation()!,reserve=s.cpu.reserve.bind(s.cpu)
 let armed=false,mutated=false
 try{
  s.source.mockImplementationOnce((...args)=>{const value=original(...args);armed=true;return{...value,primaryTexture:{context:raw,root:value.sourceLease!}}})
  vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);if(armed&&!mutated&&(n===4096||n===4608)){mutated=true;Reflect.set(raw.primaryTexture.phase,'x',49)}return release})
  const before=s.cpu.reservedBytes,author=s.author('capture-gap'),op=s.operation('capture-gap')
  expect(()=>s.coordinator.tryEnqueueLocal(author,op)).toThrow('Accepted replay source differs from original snapshot')
  expect(mutated).toBe(true);expect(s.coordinator.poisoned).toBe(false);expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.coordinator['entries']).toHaveLength(0);expect(s.coordinator['replay'].size).toBe(0);expect(s.cpu.reservedBytes).toBe(before)
  expect(s.coordinator.tryEnqueueLocal(author,op)).toBe(true)
 }finally{s.close()}
})
it.each(['defaultAuto','gaussianAuto','softAuto']as const)('source capture7 borrows actual immutable constructor refs and genuine child lineage %s',kind=>{
 const c=context7(kind),raw=structuredClone(c),s=fixture(true,true,G,true,c)
 try{
  const e=s.create({replayFrontier:'textured7-buildup-v1',autoSource:raw.primarySource,primaryTexture:{context:raw,root:s.root}}),view=e.replaySource7(),captured=e['primaryTexture']!
  expect(view).toBe(e.replaySource7());expect(view.context).toBe(captured.context);expect(view.autoSource).toBe(e['options'].autoSource);expect(Object.isFrozen(view)).toBe(true);expect(Object.isFrozen(view.context.primaryTexture.phase)).toBe(true);expect(Object.isFrozen(view.autoSource.source)).toBe(true)
  Reflect.set(raw.primaryTexture.phase,'x',1);Reflect.set(raw.primarySource,'brushScale',2);Object.defineProperty(raw.primaryTexture,'phase',{get(){throw Error('raw phase must never be read again')}})
  view.assertCurrent();expect(view.context.primaryTexture.phase).toEqual(c.primaryTexture.phase);expect(view.autoSource.brushScale).toBe(1)
  expect(()=>Reflect.apply(e.replaySource7,{...e},[])).toThrow('Foreign');expect(()=>Reflect.apply(view.assertCurrent,{...view},[])).toThrow('Foreign');expect(()=>Reflect.apply(view.retainRoot,{...view},[])).toThrow('Foreign')
  const baseline=s.cpu.reservedBytes,child=view.retainRoot();expect(s.cpu.reservedBytes).toBe(baseline+2048);expect(child).not.toBe(captured.root);expect(child.patternResource(view.context.primaryTexture,view.context.assets[0],s.prepass.brushGlBatchInfo()).asset.id).toBe(c.assets[0].id);child.release();expect(s.cpu.reservedBytes).toBe(baseline)
  const survivor=view.retainRoot();e.cancel();expect(()=>view.assertCurrent()).toThrow();expect(()=>view.retainRoot()).toThrow();expect(()=>e.replaySource7()).toThrow();expect(survivor.isReady()).toBe(true);survivor.release()
 }finally{s.close()}
})
it('source capture7 getter/assert/retain share one nonreentrant scope without recursive child reservations',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c)
 try{
  const e=s.create({replayFrontier:'textured7-buildup-v1'}),view=e.replaySource7(),reserve=s.cpu.reserve.bind(s.cpu),baseline=s.cpu.reservedBytes
  for(const nested of[()=>e.replaySource7(),()=>view.assertCurrent(),()=>view.retainRoot()]){
   let calls=0;const spy=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);if(n===2048){calls++;expect(nested).toThrow('reentered')}return release})
   const child=view.retainRoot();expect(calls).toBe(1);child.release();expect(s.cpu.reservedBytes).toBe(baseline);spy.mockRestore()
  }
  const prepared=s.composite.preparedCapacity.bind(s.composite),scope=vi.spyOn(s.composite,'preparedCapacity').mockImplementationOnce(()=>{expect(()=>view.retainRoot()).toThrow('reentered');return prepared()})
  view.assertCurrent();scope.mockRestore();expect(s.cpu.reservedBytes).toBe(baseline)
 }finally{s.close()}
})
it('source capture7 cancel during actual child reserve releases only new attempt and invalidates all borrows',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),baseline=s.cpu.reservedBytes
 try{
  const e=s.create({replayFrontier:'textured7-buildup-v1'}),view=e.replaySource7(),reserve=s.cpu.reserve.bind(s.cpu)
  vi.spyOn(s.cpu,'reserve').mockImplementationOnce(n=>{const release=reserve(n);expect(n).toBe(2048);e.cancel();return release})
  expect(()=>view.retainRoot()).toThrow();expect(()=>view.assertCurrent()).toThrow();expect(s.cpu.reservedBytes).toBe(baseline)
 }finally{s.close()}
})
it('source capture7 post-retain undefined failure preserves primary while child cleanup fault latches fatal',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),cleanup=Error('source view child cleanup')
 try{
  const e=s.create({replayFrontier:'textured7-buildup-v1'}),view=e.replaySource7(),reserve=s.cpu.reserve.bind(s.cpu),prepared=s.composite.preparedCapacity.bind(s.composite)
  let afterRetain=false
  vi.spyOn(s.cpu,'reserve').mockImplementationOnce(n=>{const release=reserve(n);expect(n).toBe(2048);afterRetain=true;return()=>{release();throw cleanup}})
  vi.spyOn(s.composite,'preparedCapacity').mockImplementation(()=>{if(afterRetain)throw undefined;return prepared()})
  let threw=false,value:unknown='not thrown';try{view.retainRoot()}catch(error){threw=true;value=error}
  expect(threw).toBe(true);expect(value).toBeUndefined();expect(e.poisoned).toBe(true);expect(e.cleanupFailures).toContain(cleanup);expect(()=>view.assertCurrent()).toThrow()
 }finally{s.close()}
})
it('source capture7 reserves bounded view metadata before capture and leaves ordinary sources closed',()=>{
 const c=context7('softAuto'),s=fixture(true,true,G,true,c)
 try{
  const before=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu),spy=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(n===4608)throw Error('view metadata reservation');return reserve(n)})
  expect(()=>s.create({replayFrontier:'textured7-buildup-v1'})).toThrow('view metadata reservation');expect(s.cpu.reservedBytes).toBe(before);spy.mockRestore()
  const ordinary=s.create();expect(()=>ordinary.replaySource7()).toThrow('unavailable');ordinary.cancel()
 }finally{s.close()}
})


it('buildup exact original close retains SAME input and verifier seal without DRAW/queue/source work',()=>{
 const s=replayConsumer7()
 try{
  const first=s.recorded(s.operation('close-original',0,true),1)
  s.coordinator.enqueueRecorded(first);s.coordinator.advance()
  const entry=s.coordinator['entries'][0],prefix=entry.recorded!,revision=s.coordinator['revision'],count=s.coordinator['replay'].size,bytes=s.cpu.reservedBytes,sourceCalls=s.source.mock.calls.length
  const close=s.seal(first),draw=vi.spyOn(s.composite,'drawSource'),sealPrefix=vi.spyOn(entry.executor,'sealRecordedPrefix')
  s.coordinator.enqueueRecordedSeal(close)
  expect(entry.closeReceipt?.input).toBe(close);expect(entry.closeReceipt?.prefix).toBe(prefix)
  expect(entry.recorded).not.toBe(prefix);expect(entry.recorded?.sealed).toBe(true);expect(prefix.sealed).toBe(false)
  expect(entry.closeReceipt?.seal).toEqual({kind:'commitPartial',closeOperationId:close.operation.id,closeSeq:10,recordedNext:1,firstOperationId:first.operation.id,lastOperationId:first.operation.id,firstSeq:1,lastSeq:1})
  expect(Object.isFrozen(entry.closeReceipt)).toBe(true);expect(Object.isFrozen(entry.closeReceipt?.seal)).toBe(true)
  expect(s.cpu.reservedBytes-bytes).toBe(4608);expect(s.coordinator['revision']).toBe(revision+1);expect(s.coordinator['lastSequence']).toBe(10)
  expect(s.coordinator['replay'].size).toBe(count);expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.source).toHaveBeenCalledTimes(sourceCalls);expect(draw).not.toHaveBeenCalled();expect(sealPrefix).not.toHaveBeenCalled();expect(s.stageCandidate).not.toHaveBeenCalled();expect(s.coordinator.checkpointReady).toBe(false)
  expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow();expect(entry.closeReceipt?.input).toBe(close)
 }finally{s.close()}
})
it('buildup original close rejects bad prefix/range/layer, copied delivery, typed END and unpromoted local tail',()=>{
 for(const variant of ['prefix','range','layer','copy','ended','local'] as const){
  const s=replayConsumer7()
  try{
   const op=s.operation('close-negative',0,variant!=='ended'),first=s.recorded(op,1)
   if(variant==='local')s.coordinator.tryEnqueueLocal(s.author('close-negative'),op)
   else s.coordinator.enqueueRecorded(first)
   const entry=s.coordinator['entries'][0],prefix=entry.recorded,bytes=s.cpu.reservedBytes,last=s.coordinator['lastSequence'],revision=s.coordinator['revision']
   const close=s.seal(first,variant==='prefix'?{firstFrameOpId:'wrong'}:variant==='range'?{recordedNext:2}:variant==='layer'?{layerId:'other'}:{})
   expect(()=>s.coordinator.enqueueRecordedSeal(variant==='copy'?{...close}:close)).toThrow()
   expect(entry.recorded).toBe(prefix);expect(entry.closeReceipt).toBeUndefined();expect(s.cpu.reservedBytes).toBe(bytes);expect(s.coordinator['lastSequence']).toBe(last);expect(s.coordinator['revision']).toBe(revision);expect(s.coordinator.poisoned).toBe(false)
  }finally{s.close()}
 }
})
it('buildup close claims busy before original callback and late undefined rolls back then permits same genuine retry',()=>{
 const s=replayConsumer7()
 try{
  const first=s.recorded(s.operation('close-reentry',0,true),1);s.coordinator.enqueueRecorded(first)
  let calls=0,fail=true;let close:CanonicalRecordedInput
  close=s.seal(first,{},()=>{calls++;expect(()=>s.coordinator.cancel()).toThrow('turn');expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow('busy');if(calls===2&&fail)throw undefined})
  const entry=s.coordinator['entries'][0],prefix=entry.recorded,bytes=s.cpu.reservedBytes
  let caught=false;try{s.coordinator.enqueueRecordedSeal(close)}catch(error){caught=true;expect(error).toBeUndefined()}
  expect(caught).toBe(true);expect(s.cpu.reservedBytes).toBe(bytes);expect(entry.recorded).toBe(prefix);expect(entry.closeReceipt).toBeUndefined();expect(s.coordinator.poisoned).toBe(false)
  fail=false;s.coordinator.enqueueRecordedSeal(close);expect(entry.closeReceipt?.input).toBe(close)
 }finally{s.close()}
})
it('buildup close SAMEcpu reserve denial keeps prefix usable; rollback release failure is fatal and preserves undefined',()=>{
 for(const cleanupFailure of [false,true]){
  const s=replayConsumer7()
  try{
   const first=s.recorded(s.operation('close-cpu',0,true),1);s.coordinator.enqueueRecorded(first)
   const entry=s.coordinator['entries'][0],prefix=entry.recorded,bytes=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu)
   let calls=0;const close=s.seal(first,{},()=>{if(cleanupFailure&&++calls===2)throw undefined})
   const hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(n!==4608)return reserve(n);if(!cleanupFailure)throw undefined;const release=reserve(n);return()=>{release();throw Error('close release cleanup')}})
   let caught=false;try{s.coordinator.enqueueRecordedSeal(close)}catch(error){caught=true;expect(error).toBeUndefined()}
   hook.mockRestore();expect(caught).toBe(true);expect(entry.closeReceipt).toBeUndefined();expect(entry.recorded).toBe(prefix)
   if(cleanupFailure){expect(s.coordinator.poisoned).toBe(true);expect(s.coordinator.cleanupFailures.some(e=>e instanceof Error&&e.message==='close release cleanup')).toBe(true)}
   else{expect(s.cpu.reservedBytes).toBe(bytes);expect(s.coordinator.poisoned).toBe(false);s.coordinator.enqueueRecordedSeal(close);expect(entry.recorded?.sealed).toBe(true)}
  }finally{s.close()}
 }
})
it('buildup close metadata waits for existing Entry replayPins and final release detaches exactly once',()=>{
 const s=replayConsumer7()
 try{
  const first=s.recorded(s.operation('close-pin',0,true),1);s.coordinator.enqueueRecorded(first);s.coordinator.advance()
  const entry=s.coordinator['entries'][0],prefix=entry.recorded!,snapshot=s.coordinator.retainReplaySnapshot(),values=snapshot.values()
  const reserve=s.cpu.reserve.bind(s.cpu),released=vi.fn()
  const hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);return n===4608?()=>{released();release()}:release})
  const close=s.seal(first);s.coordinator.enqueueRecordedSeal(close);hook.mockRestore()
  const receipt=entry.closeReceipt;expect(receipt?.prefix).toBe(prefix);expect(values).toHaveLength(1);expect(snapshot.values()).toBe(values)
  s.coordinator['retireReplayMetadata'](entry);expect(released).not.toHaveBeenCalled();expect(entry.closeReceipt).toBe(receipt)
  snapshot.release();expect(released).toHaveBeenCalledTimes(1);expect(entry.closeReceipt).toBeUndefined();snapshot.release();s.coordinator['retireReplayMetadata'](entry);expect(released).toHaveBeenCalledTimes(1)
 }finally{s.close()}
})


it('buildup close refuses actual source-bank revocation with SAME prepared mask/composite epochs and original scope',()=>{
 const s=replayConsumer7()
 try{
  const first=s.recorded(s.operation('close-revoked-source',0,true),1);s.coordinator.enqueueRecorded(first);s.coordinator.advance()
  const entry=s.coordinator['entries'][0],prefix=entry.recorded,close=s.seal(first),mask=s.prepass.preparedCapacity(),composite=s.composite.preparedCapacity(),last=s.coordinator['lastSequence'],revision=s.coordinator['revision']
  s.bank.reset()
  expect(s.prepass.preparedCapacity()).toEqual(mask);expect(s.composite.preparedCapacity()).toEqual(composite)
  expect(()=>s.coordinator['assertLayers']()).not.toThrow();close.delivery.assertCurrent(close)
  expect(()=>entry.replaySource!.assertCurrent()).toThrow()
  const bytes=s.cpu.reservedBytes
  expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow()
  expect(entry.recorded).toBe(prefix);expect(entry.closeReceipt).toBeUndefined();expect(s.coordinator['lastSequence']).toBe(last);expect(s.coordinator['revision']).toBe(revision);expect(s.cpu.reservedBytes).toBe(bytes);expect(s.coordinator.poisoned).toBe(false)
 }finally{s.close()}
})


function renderedOpen7(c:CanonicalMaterialContextV7){
 const frame=decoded7(c)
 return buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:frame.draws.map(d=>({recipe:frame.definitions[d.definition],role:'primary',x:d.x,y:d.y,opacity:d.opacity,flow:d.flow,grainDepth:d.grainDepth})),fences:frame.fences.filter(f=>f.kind!=='gestureEnd')},c).frame
}
const renderedIdentity={gestureId:'g7',layerId:'layer',layerEpoch:0,nextFrameOrdinal:1}
it('ordinary rendered OPEN cancellation remains rebuild-poisoning witness (no method-absence claim)',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{const e=s.create(),input=submission7(c);e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}});s.drain();expect(e.pending).toBe(false);expect(e['gesture']).toBeDefined();e.cancel();expect(s.poison).toHaveBeenCalledTimes(1);expect(e.poisoned).toBe(true)}finally{clock.mockRestore();s.close()}
})
it.each(['defaultAuto','gaussianAuto','softAuto']as const)('candidate7 retires exact rendered OPEN own resources without END or poison %s',kind=>{
 const c=context7(kind),s=fixture(true,true,G,true,c),baseline=s.cpu.reservedBytes,clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const e=s.create({candidateReplay7:'textured7-buildup-v1'}),input=submission7(c),frame=renderedOpen7(c),draw=vi.spyOn(s.composite,'drawSource')
  expect(e.checkpointReady).toBe(false);e.enqueue({...input,frame,composition:{...input.composition,mode:'buildup'}});s.drain()
  expect(e.pending).toBe(false);expect(e['planned']?.ended).toBe(false);expect(e.checkpointReady).toBe(false);const count=draw.mock.calls.length
  e.retireRenderedPrefix(renderedIdentity)
  expect(draw).toHaveBeenCalledTimes(count);expect(frame.fences.some(f=>f.kind==='gestureEnd')).toBe(false);expect(e['gesture']).toBeUndefined();expect(e['planned']).toBeUndefined();expect(e['maskLease']).toBeUndefined();expect(e['primaryTexture']).toBeUndefined();expect(e['softProgram']).toBeUndefined();expect(s.cpu.reservedBytes).toBe(baseline);expect(s.root.isReady()).toBe(true);expect(s.poison).not.toHaveBeenCalled();expect(e.cleanupFailures).toEqual([]);expect(e.poisoned).toBe(false);expect(e.checkpointReady).toBe(false)
  expect(()=>e.retireRenderedPrefix(renderedIdentity)).toThrow();expect(()=>e.enqueue({...input,frame,ordinal:1,composition:{...input.composition,mode:'buildup'}})).toThrow();expect(()=>e.advance()).toThrow()
 }finally{clock.mockRestore();s.close()}
})
it.each(['defaultAuto','softAuto']as const)('candidate7 genuine END uses existing successful advance then cancel, not OPEN retirement %s',kind=>{
 const c=context7(kind),s=fixture(true,true,G,true,c),baseline=s.cpu.reservedBytes,clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{const e=s.create({candidateReplay7:'textured7-buildup-v1'}),input=submission7(c);e.enqueue({...input,composition:{...input.composition,mode:'buildup'}});s.drain();expect(e.pending).toBe(false);expect(e['gesture']).toBeUndefined();expect(e.checkpointReady).toBe(false);expect(()=>e.retireRenderedPrefix(renderedIdentity)).toThrow();e.cancel();expect(s.cpu.reservedBytes).toBe(baseline);expect(s.poison).not.toHaveBeenCalled();expect(e.cleanupFailures).toEqual([]);expect(e.checkpointReady).toBe(false)}finally{clock.mockRestore();s.close()}
})
it('candidate7 is a captured exclusive role, rejects old6/wash/frontier/seal and never opens checkpoints',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c)
 try{
  const baseline=s.cpu.reservedBytes
  for(const modes of[{washMode:'exclusive' as const},{washMode:'deposition-only' as const},{replayFrontier:'textured7-buildup-v1' as const}])expect(()=>s.create({candidateReplay7:'textured7-buildup-v1',...modes})).toThrow('exclusive')
  expect(s.cpu.reservedBytes).toBe(baseline)
  const options={candidateReplay7:'textured7-buildup-v1' as const},e=s.create(options),input=submission7(c);Reflect.set(options,'candidateReplay7',undefined)
  expect(()=>e.enqueue(input)).toThrow('buildup');expect(()=>e.sealRecordedPrefix({gestureId:'g7',layerId:'layer',layerEpoch:0,recordedNext:1})).toThrow('fabricate');expect(()=>Reflect.apply(e.retireRenderedPrefix,{...e},[renderedIdentity])).toThrow();expect(e.checkpointReady).toBe(false)
 }finally{s.close()}
 const old=fixture(true,true,G,true);try{const baseline=old.cpu.reservedBytes;expect(()=>old.create({candidateReplay7:'textured7-buildup-v1'})).toThrow('material7');expect(old.cpu.reservedBytes).toBe(baseline)}finally{old.close()}
})
it('candidate7 refuses queued, wrong identity, accessor identity, stale root, and layer replacement before terminal mutation',()=>{
 for(const fault of['queued','identity','accessor','root','layer','root-during-layer']as const){
  const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0);let replacement:TiledLayerBuffer|undefined
  try{
   let current=s.layer,armed=false;const e=s.create({candidateReplay7:'textured7-buildup-v1',layer:()=>{if(armed){armed=false;s.bank.reset()}return{buffer:current,epoch:0}}}),input=submission7(c);e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}})
   if(fault!=='queued')s.drain()
   const gesture=e['gesture'],planned=e['planned'];if(fault==='root')s.bank.reset();if(fault==='layer')current=replacement=new TiledLayerBuffer(s.gl,4,4,undefined,undefined,undefined,'straight-rgba8')
   if(fault==='root-during-layer')armed=true
   const bytes=s.cpu.reservedBytes,getter=vi.fn(()=>1),identity=fault==='identity'?{...renderedIdentity,nextFrameOrdinal:2}:fault==='accessor'?Object.defineProperty({...renderedIdentity},'nextFrameOrdinal',{get:getter}):renderedIdentity
   expect(()=>e.retireRenderedPrefix(identity)).toThrow();expect(getter).not.toHaveBeenCalled();expect(e['candidateTerminal']).toBe(false);expect(e['gesture']).toBe(gesture);expect(e['planned']).toBe(planned);if(fault!=='root-during-layer')expect(s.cpu.reservedBytes).toBe(bytes)
  }finally{clock.mockRestore();replacement?.destroy();s.close()}
 }
})
it('candidate7 busy guard precedes layer assertions and refuses nested retire/advance/enqueue/cancel',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0);let callback:(()=>void)|undefined
 try{
  const e=s.create({candidateReplay7:'textured7-buildup-v1',layer:()=>{callback?.();return{buffer:s.layer,epoch:0}}}),input=submission7(c);e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}});s.drain()
  callback=()=>{expect(()=>e.retireRenderedPrefix(renderedIdentity)).toThrow();expect(()=>e.advance()).toThrow();expect(()=>e.enqueue({...input,ordinal:1})).toThrow();expect(()=>e.cancel()).toThrow('batch')}
  e.retireRenderedPrefix(renderedIdentity);expect(s.poison).not.toHaveBeenCalled()
 }finally{callback=undefined;clock.mockRestore();s.close()}
})
it('candidate7 mutation idle barriers reject real participant batch and unrelated active context turn before detachment',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const e=s.create({candidateReplay7:'textured7-buildup-v1'}),input=submission7(c);e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}});s.drain();const gesture=e['gesture'],bytes=s.cpu.reservedBytes
  const query=vi.spyOn(s.gl,'getParameter'),reserve=vi.spyOn(s.cpu,'reserve');e['maskLease']!.assertMutationIdle();s.composite.assertMutationIdle();expect(query).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled();query.mockRestore();reserve.mockRestore()
  const release=e['maskLease']!.enterBrushGlTurn!();try{expect(()=>e.retireRenderedPrefix(renderedIdentity)).toThrow('scope');expect(e['gesture']).toBe(gesture)}finally{release()}
  runBrushGlBatch({participants:[s.composite]},()=>{expect(()=>e.retireRenderedPrefix(renderedIdentity)).toThrow('scope');expect(e['gesture']).toBe(gesture)})
  runBrushGlTurn({participants:[s.prepass]},()=>{expect(()=>e.retireRenderedPrefix(renderedIdentity)).toThrow('scope');expect(e['gesture']).toBe(gesture)})
  expect(s.cpu.reservedBytes).toBe(bytes)
  for(const update of[()=>s.composite.prepareCompanionUpdate(s.composite['companions']),()=>s.prepass.prepareSourceUpdate(s.root.preparedResources(),{additive:true})]){
   const staged=update();try{expect(()=>e.retireRenderedPrefix(renderedIdentity)).toThrow('scope');expect(e['gesture']).toBe(gesture)}finally{staged.cancel()}
  }
  expect(s.cpu.reservedBytes).toBe(bytes);e.retireRenderedPrefix(renderedIdentity);expect(e.cleanupFailures).toEqual([])
 }finally{clock.mockRestore();s.close()}
})
it('candidate7 terminal cleanup attempts all real CPU-owned releases, preserves primary undefined and poisons on any cleanup failure',()=>{
 const c=context7('softAuto'),s=fixture(true,true,G,true,c),baseline=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let armed=false;const released:number[]=[]
 const hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);return()=>{release();if(armed){released.push(n);if(released.length===1)throw undefined;throw Error('secondary owned release')}}})
 try{
  const e=s.create({candidateReplay7:'textured7-buildup-v1'}),input=submission7(c);e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}});s.drain();armed=true
  let caught=false;try{e.retireRenderedPrefix(renderedIdentity)}catch(error){caught=true;expect(error).toBeUndefined()}
  armed=false;hook.mockRestore();expect(caught).toBe(true);expect(released.length).toBeGreaterThanOrEqual(4);expect(s.cpu.reservedBytes).toBe(baseline);expect(e['gesture']).toBeUndefined();expect(e['planned']).toBeUndefined();expect(e['softProgram']).toBeUndefined();expect(e['maskLease']).toBeUndefined();expect(e['primaryTexture']).toBeUndefined();expect(e.poisoned).toBe(true);expect(s.poison).toHaveBeenCalledTimes(1);expect(s.poison.mock.calls[0][1]).toBeUndefined();expect(e.cleanupFailures[0]).toBeUndefined();expect(()=>e.advance()).toThrow();expect(s.root.isReady()).toBe(true)
 }finally{armed=false;hook.mockRestore();clock.mockRestore();s.close()}
})

it('candidate7 rejects actual partial physical plan and failed genuine END instead of claiming retirement success',()=>{
 for(const failedEnd of[false,true]){
  const c=context7('softAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0)
  try{
   const e=s.create({candidateReplay7:'textured7-buildup-v1'}),input=submission7(c);e.enqueue({...input,frame:failedEnd?input.frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}})
   if(failedEnd){vi.spyOn(s.composite,'drawSource').mockImplementationOnce(()=>{throw Error('actual candidate END draw fault')});expect(()=>s.drain()).toThrow('actual candidate END draw fault');expect(e.poisoned).toBe(true);expect(s.poison).toHaveBeenCalledTimes(1)}
   else{let time=0;clock.mockImplementation(()=>time++);e.advance();expect(e.pending).toBe(true);expect(e['queue'][0].physical).toBeDefined();expect(e.hasPendingLayerTargetPreparation).toBe(true)}
   expect(()=>e.retireRenderedPrefix(renderedIdentity)).toThrow();expect(e['candidateTerminal']).toBe(false);expect(e.checkpointReady).toBe(false)
  }finally{clock.mockRestore();s.close()}
 }
})

it('candidate7 requires exact four own DATA identity keys and plain/null prototype without invoking extra accessors',()=>{
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const e=s.create({candidateReplay7:'textured7-buildup-v1'}),input=submission7(c);e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}});s.drain()
  const getter=vi.fn(()=>true),bytes=s.cpu.reservedBytes,gesture=e['gesture'],planned=e['planned']
  for(const bad of[Object.defineProperty({...renderedIdentity},'extra',{get:getter}),Object.defineProperty({...renderedIdentity},Symbol('extra'),{get:getter}),Object.assign(Object.create({inherited:true}),renderedIdentity),Object.defineProperty({...renderedIdentity},'layerEpoch',{get:getter})]){
   expect(()=>Reflect.apply(e.retireRenderedPrefix,e,[bad])).toThrow();expect(e['gesture']).toBe(gesture);expect(e['planned']).toBe(planned);expect(e['candidateTerminal']).toBe(false);expect(s.cpu.reservedBytes).toBe(bytes)
  }
  expect(getter).not.toHaveBeenCalled();e.retireRenderedPrefix(Object.assign(Object.create(null),renderedIdentity));expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();s.close()}
})

// Snapshot groups are private resource observations, never renderer/read grants.
it('groups capture claims busy before callbacks and rejects genuine nested snapshot without changing slot',()=>{
 const s=replayConsumer7()
 try{
  s.coordinator.enqueueRecorded(s.recorded(s.operation('group-busy',0,true),1));s.coordinator.advance()
  let inside=false,hits=0
  s.setLate(()=>{if(!inside){inside=true;hits++;try{expect(()=>s.coordinator.retainReplaySnapshot()).toThrow('busy')}finally{inside=false}}})
  const snapshot=s.coordinator.retainReplaySnapshot();expect(hits).toBeGreaterThan(0)
  s.setLate();expect(snapshot.values()).toHaveLength(1);snapshot.release();expect(s.coordinator['replayWork']).toBeUndefined()
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('groups freeze exact accepted source and frame refs, reject forged groups and charge caller children independently',()=>{
 const s=replayConsumer7()
 try{
  const first=s.recorded(s.operation('group-refs',0,true),1);s.coordinator.enqueueRecorded(first);s.coordinator.advance()
  const owner=s.coordinator['entries'][0],source=owner.replaySource!,sourceCalls=s.source.mock.calls.length,before=s.cpu.reservedBytes
  const snapshot=s.coordinator.retainReplaySnapshot(),values=snapshot.values(),groups=snapshot.groups!(),group=groups[0]
  if(group.kind!=='buildup7')throw Error('expected buildup source group')
  expect(Object.isFrozen(groups)&&Object.isFrozen(group)&&Object.isFrozen(group.frames)&&Object.isFrozen(group.source)).toBe(true)
  expect(group.frames[0].value).toBe(values[0]);expect(group.frames[0].frame).toBe(s.coordinator['replay'].values().next().value?.acceptedFrame);expect(group.source.context).toBe(source.context);expect(group.source.autoSource).toBe(source.autoSource)
  expect(Object.keys(group).sort()).toEqual(['frames','id','kind','source']);expect(Object.keys(group.source).sort()).toEqual(['autoSource','context','rasterProfile'])
  const held=s.cpu.reservedBytes;expect(held).toBeGreaterThan(before)
  expect(()=>snapshot.retainRoot!({...group})).toThrow('Foreign replay group');expect(s.cpu.reservedBytes).toBe(held)
  expect(()=>snapshot.values.call({})).toThrow('receiver');expect(()=>snapshot.groups!.call({})).toThrow('receiver');expect(()=>snapshot.assertCurrent!.call({})).toThrow('receiver');expect(()=>snapshot.retainRoot!.call({},group)).toThrow('receiver');expect(()=>snapshot.release.call({})).toThrow('receiver')
  const child=snapshot.retainRoot!(group);expect(s.cpu.reservedBytes).toBeGreaterThan(held);expect(snapshot.groups!()).toBe(groups)
  child.release();expect(s.cpu.reservedBytes).toBe(held);expect(s.source).toHaveBeenCalledTimes(sourceCalls)
  snapshot.release();expect(s.cpu.reservedBytes).toBe(before);snapshot.release()
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('groups capture close only as of R and keep genuine original input/seal without exposing mutable prefix',()=>{
 const s=replayConsumer7()
 try{
  const first=s.recorded(s.operation('group-close',0,true),1);s.coordinator.enqueueRecorded(first);s.coordinator.advance()
  const old=s.coordinator.retainReplaySnapshot(),oldGroups=old.groups!(),close=s.seal(first)
  s.coordinator.enqueueRecordedSeal(close);expect(old.groups!()).toBe(oldGroups);expect(oldGroups[0].close).toBeUndefined();old.release()
  const owner=s.coordinator['entries'][0],receipt=owner.closeReceipt!,next=s.coordinator.retainReplaySnapshot(),group=next.groups!()[0]
  expect(group.close?.input).toBe(close);expect(group.close?.seal).toBe(receipt.seal);expect(Object.isFrozen(group.close)).toBe(true)
  expect(Object.keys(group.close!).sort()).toEqual(['input','seal']);expect(next.values()).toHaveLength(1)
  const prefix=receipt.prefix,previous=prefix.lastSeq;Reflect.set(prefix,'lastSeq',99)
  expect(()=>next.assertCurrent!()).toThrow('prefix changed');Reflect.set(prefix,'lastSeq',previous);next.assertCurrent!()
  s.coordinator['retireReplayMetadata'](owner);expect(owner.closeReceipt).toBe(receipt);next.release();expect(owner.closeReceipt).toBeUndefined()
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('groups fixed R survives ordinary append and genuine local promotion but FIRST order change invalidates',()=>{
 const s=replayConsumer7()
 try{
  const author=s.author('group-promote'),op=s.operation('group-promote',0,true);s.coordinator.tryEnqueueLocal(author,op)
  const snapshot=s.coordinator.retainReplaySnapshot(),values=snapshot.values(),groups=snapshot.groups!(),accepted=groups[0].frames[0].frame
  s.coordinator.enqueueRecorded(s.recorded(op,1));expect(groups[0].frames[0].frame).toBe(accepted);expect(s.coordinator['replay'].get(op.id)?.acceptedFrame).not.toBe(accepted);expect(snapshot.values()).toBe(values);expect(values[0].kind).toBe('local');expect(snapshot.groups!()).toBe(groups)
  const next=s.operation('group-promote',1,true);s.coordinator.tryEnqueueLocal(author,next);s.coordinator.enqueueRecorded(s.recorded(next,2));expect(snapshot.values()).toHaveLength(1);snapshot.release()
  const late=s.author('late-local');s.coordinator.tryEnqueueLocal(late,s.operation('late-local',0,true))
  const ordered=s.coordinator.retainReplaySnapshot();s.coordinator.enqueueRecorded(s.recorded(s.operation('earlier-recorded',0,true),3))
  expect(()=>ordered.values()).toThrow('retired');ordered.release()
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('groups public observations share busy scope and root revocation cannot prevent private cancel teardown',()=>{
 const s=replayConsumer7()
 try{
  s.coordinator.enqueueRecorded(s.recorded(s.operation('group-observe',0,true),1));s.coordinator.advance()
  const snapshot=s.coordinator.retainReplaySnapshot(),group=snapshot.groups!()[0]
  let inside=false
  s.setLate(()=>{if(!inside){inside=true;try{
   expect(()=>snapshot.values()).toThrow('busy');expect(()=>snapshot.groups!()).toThrow('busy');expect(()=>snapshot.assertCurrent!()).toThrow('busy');expect(()=>snapshot.retainRoot!(group)).toThrow('busy');expect(()=>snapshot.release()).toThrow('busy')
  }finally{inside=false}}})
  snapshot.assertCurrent!();s.setLate();s.bank.reset();expect(()=>snapshot.assertCurrent!()).toThrow()
  s.coordinator.cancel();expect(s.coordinator['replayWork']).toBeUndefined();snapshot.release()
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('groups rollback preserves thrown undefined and releases reserved metadata and retained roots',()=>{
 const s=replayConsumer7()
 try{
  s.coordinator.enqueueRecorded(s.recorded(s.operation('group-undefined',0,true),1));s.coordinator.advance()
  const before=s.cpu.reservedBytes,owner=s.coordinator['entries'][0]
  let armed=false
  // Ordinary layer callback fails after snapshot CPU reservation, before pins.
  s.setLate(()=>{if(armed)throw undefined});armed=true
  let caught=false;try{s.coordinator.retainReplaySnapshot()}catch(error){caught=true;expect(error).toBeUndefined()}
  expect(caught).toBe(true);expect(s.cpu.reservedBytes).toBe(before);expect(s.coordinator['replayWork']).toBeUndefined();expect(owner.replayPins??0).toBe(0)
  s.setLate()
  const snapshot=s.coordinator.retainReplaySnapshot();snapshot.release();expect(s.cpu.reservedBytes).toBe(before)
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('groups reserve before root capture and cleanup faults poison while private teardown attempts every owner',()=>{
 for(const failRelease of [false,true]){
  const s=replayConsumer7()
  try{
   s.coordinator.enqueueRecorded(s.recorded(s.operation('group-budget',0,true),1));s.coordinator.advance()
   const before=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu),hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{
    if(n!==1920)return reserve(n)
    if(!failRelease)throw Error('group metadata denied')
    const release=reserve(n);return()=>{release();throw Error('group metadata release fault')}
   })
   if(!failRelease){expect(()=>s.coordinator.retainReplaySnapshot()).toThrow('metadata denied');expect(s.cpu.reservedBytes).toBe(before);expect(s.coordinator['replayWork']).toBeUndefined()}
   else{const snapshot=s.coordinator.retainReplaySnapshot();snapshot.release();expect(s.coordinator.poisoned).toBe(true);expect(s.coordinator.cleanupFailures.some(e=>String(e).includes('metadata release fault'))).toBe(true);expect(s.coordinator['replayWork']).toBeUndefined();snapshot.release()}
   hook.mockRestore()
  }finally{s.close()}
  expect(s.cpu.reservedBytes).toBe(0)
 }
})

it('groups use SAME accepted envelope despite valid raw local frame mutation before and after capture',()=>{
 for(const beforeCapture of [true,false]){
  const s=replayConsumer7()
  try{
   const op=s.operation('group-raw-mutation',0,true),packed=op.frame.materialPacked;s.coordinator.tryEnqueueLocal(s.author('group-raw-mutation'),op)
   const receipt=s.coordinator['entries'][0].local!.receipts[0],replacement=s.operation('group-raw-mutation',0,false).frame.materialPacked
   expect(Object.isFrozen(op.frame)).toBe(false);expect(Object.isFrozen(receipt.frame)).toBe(true);expect(replacement).not.toBe(packed)
   if(beforeCapture)Reflect.set(op.frame,'materialPacked',replacement)
   const snapshot=s.coordinator.retainReplaySnapshot(),row=snapshot.groups!()[0].frames[0]
   if(!beforeCapture)Reflect.set(op.frame,'materialPacked',replacement)
   expect(row.value).toBe(snapshot.values()[0]);expect(row.frame).toBe(receipt.frame);expect(row.frame.materialPacked).toBe(packed)
   expect(Object.isFrozen(row)).toBe(true);expect(row.value.kind==='local'&&row.value.operation).toBe(op)
   expect(snapshot.groups!()[0].frames[0]).toBe(row);snapshot.release()
  }finally{s.close()}
  expect(s.cpu.reservedBytes).toBe(0)
 }
})
it('groups retain one original child per FIRST group and caller budget denial leaves all fixed groups usable',()=>{
 const s=replayConsumer7()
 try{
  const first=s.recorded(s.operation('group-first',0,true),1),second=s.recorded(s.operation('group-second',0,true),2)
  s.coordinator.enqueueRecorded(first);s.coordinator.enqueueRecorded(second);s.coordinator.advance();s.coordinator.advance()
  const row=s.bank['inputs'].values().next().value;if(!row?.rootOwners)throw Error('Actual pattern root owners missing')
  const owners=row.rootOwners.size,reserve=s.cpu.reserve.bind(s.cpu);let rootReservations=0,deny=false
  const hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(n===2048){rootReservations++;if(deny)throw Error('caller child budget denied')}return reserve(n)})
  const snapshot=s.coordinator.retainReplaySnapshot(),groups=snapshot.groups!(),bytes=s.cpu.reservedBytes
  // Snapshot metadata is independently charged2816 before these two genuine child reservations.
  expect(rootReservations).toBe(2);expect(row.rootOwners.size).toBe(owners+2);expect(groups.map(g=>g.frames[0].value.kind==='recorded'?g.frames[0].value.input:null)).toEqual([first,second])
  expect(groups.map(g=>g.id)).toEqual(s.coordinator['entries'].map(e=>e.id));snapshot.values();snapshot.groups!();snapshot.assertCurrent!();expect(rootReservations).toBe(2)
  deny=true;expect(()=>snapshot.retainRoot!(groups[0])).toThrow('child budget denied');expect(s.cpu.reservedBytes).toBe(bytes);snapshot.assertCurrent!()
  deny=false;const child=snapshot.retainRoot!(groups[1]);expect(rootReservations).toBe(4);expect(row.rootOwners.size).toBe(owners+3);child.release();expect(row.rootOwners.size).toBe(owners+2);expect(s.cpu.reservedBytes).toBe(bytes)
  hook.mockRestore();snapshot.release();expect(row.rootOwners.size).toBe(owners)
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('groups private owned operations reject unowned and recursive callbacks without opening a public busy bypass',()=>{
 const s=replayConsumer7()
 try{
  s.coordinator.enqueueRecorded(s.recorded(s.operation('group-owned',0,true),1));s.coordinator.advance()
  const snapshot=s.coordinator.retainReplaySnapshot(),groups=snapshot.groups!(),work=s.coordinator['replayWork']
  if(!work||!('snapshot'in work))throw Error('Actual owned work slot required')
  expect(()=>work.valuesOwned()).toThrow('retired');expect(()=>work.groupsOwned()).toThrow('retired');expect(()=>work.retainRootOwned(groups[0])).toThrow('retired')
  let inside=false
  s.setLate(()=>{if(!inside){inside=true;try{expect(()=>work.valuesOwned()).toThrow('reentered');expect(()=>work.groupsOwned()).toThrow('reentered');expect(()=>work.retainRootOwned(groups[0])).toThrow('reentered')}finally{inside=false}}})
  const reserve=s.cpu.reserve.bind(s.cpu),hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(n===2048){expect(()=>work.groupsOwned()).toThrow('reentered');expect(()=>work.retainRootOwned(groups[0])).toThrow('reentered')}return reserve(n)})
  s.coordinator['busy']=true
  try{expect(work.valuesOwned()[0]).toBe(groups[0].frames[0].value);const child=work.retainRootOwned(groups[0]);child.release();}finally{s.coordinator['busy']=false;s.setLate();hook.mockRestore()}
  snapshot.release()
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})


it('mixed candidate executes FIRST WASH then per-DRAW buildup and preserves old P until pure publication',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const old=s.currentPresentation(),draw=vi.spyOn(s.composite,'drawSource')
  expect(s.coordinator.tryEnqueueLocal(s.author('first-wash','wash'),s.operation('first-wash',0,false,undefined,'wash'))).toBe(true)
  expect(s.coordinator.tryEnqueueLocal(s.author('second-buildup'),s.operation('second-buildup'))).toBe(true)
  let ticket:import('./CanonicalWashLayerCoordinator').CanonicalPreviewPublication|undefined
  for(let i=0;i<200&&!ticket;i++){
   const result=s.coordinator.advance()
   if(result?.kind==='preview-failed')throw result.error
   expect(s.currentPresentation()).toBe(old)
   if(result?.kind==='preview-ready')ticket=result.ticket
  }
  expect(ticket).toBeDefined()
  const kinds=draw.mock.calls.map(([r])=>r.source.kind)
  const wash=kinds.indexOf('straightRgba8'),over=draw.mock.calls.findIndex(([r])=>r.source.kind==='texturedMaskRgb'&&r.operation.kind==='over32FusedScalar')
  expect(wash).toBeGreaterThanOrEqual(0);expect(over).toBeGreaterThan(wash)
  expect(s.coordinator.checkpointReady).toBe(false);s.publish(ticket!);expect(s.currentPresentation()).not.toBe(old)
  expect(s.coordinator.publishedPresentationReady).toBe(true);expect(s.coordinator.checkpointReady).toBe(false)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('mixed captured WASH root reset invalidates R without granting a new source or changing service epochs',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  expect(s.coordinator.tryEnqueueLocal(s.author('wash-root','wash'),s.operation('wash-root',0,false,undefined,'wash'))).toBe(true)
  for(let i=0;i<100&&s.coordinator.queuedFrameCount;i++)s.coordinator.advance()
  const before=s.source.mock.calls.length,epoch=s.prepass.preparedCapacity().epoch,snapshot=s.coordinator.retainReplaySnapshot(),groups=snapshot.groups!()
  expect(groups[0].kind).toBe('wash');s.bank.reset();expect(s.prepass.preparedCapacity().epoch).toBe(epoch)
  expect(()=>snapshot.assertCurrent!()).toThrow(/root retired|owner\/generation changed/);expect(s.source).toHaveBeenCalledTimes(before)
  snapshot.release()
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it.each([false,true])('full stable-only sentinel A survives candidate active B, mixed=%s',mixed=>{
 let copied=0
 const s=replayConsumer7(undefined,true,f=>{
  const area={minX:0,minY:0,maxX:4,maxY:4},target=f.layer.resolveForPaint(area)[0]
  f.layer.markContentPainted(area);const actual=target.buffer.copyTo.bind(target.buffer)
  vi.spyOn(target.buffer,'copyTo').mockImplementation(other=>{copied++;return actual(other)})
 },!mixed),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const mode=mixed?'buildup':'wash',old=s.currentPresentation()
  expect(s.coordinator.tryEnqueueLocal(s.author('new-B',mode),s.operation('new-B',0,false,[{x:12,y:0}],mode))).toBe(true)
  let ticket:import('./CanonicalWashLayerCoordinator').CanonicalPreviewPublication|undefined
  for(let i=0;i<200&&!ticket;i++){const out=s.coordinator.advance();if(out?.kind==='preview-failed')throw out.error;if(out?.kind==='preview-ready')ticket=out.ticket}
  expect(ticket).toBeDefined();expect(copied).toBeGreaterThan(0)
  expect(ticket!.buffer.resolveVisible({minX:0,minY:0,maxX:4,maxY:4}).some(t=>t.contentRect!==null)).toBe(true)
  expect(s.currentPresentation()).toBe(old);s.publish(ticket!)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('mixed conservative baseline bbox over64 rejects before source/admission and releases constructor metadata',()=>{
 let f:ReturnType<typeof fixture>|undefined
 expect(()=>replayConsumer7(undefined,true,s=>{f=s;for(const x of[0,256]){const box={minX:x,minY:0,maxX:x+4,maxY:4};s.layer.resolveForPaint(box);s.layer.markContentPainted(box)}})).toThrow('bounded target union')
 expect(f!.cpu.reservedBytes).toBe(0)
})
it('mixed constructor rejects same-count shifted native seed during CPU reserve before publishing any positions',()=>{
 let f:ReturnType<typeof fixture>|undefined,hook:ReturnType<typeof vi.spyOn>|undefined
 try{
  expect(()=>replayConsumer7(undefined,true,s=>{
   f=s;s.layer.resolveForPaint({minX:0,minY:0,maxX:4,maxY:4});s.layer.markContentPainted({minX:0,minY:0,maxX:4,maxY:4})
   const reserve=s.cpu.reserve.bind(s.cpu)
   hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);if(n===256){s.layer['contentRects'].clear();s.layer.resolveForPaint({minX:4,minY:0,maxX:8,maxY:4});s.layer.markContentPainted({minX:4,minY:0,maxX:8,maxY:4})}return release})
  })).toThrow('seed changed during reservation')
 }finally{hook?.mockRestore()}
 expect(f!.cpu.reservedBytes).toBe(0)
})

it('mixed completes only selected partial WASH frame before capture and freezes other queued raw work',()=>{
 const s=replayConsumer7(undefined,true);let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>{now+=1;return now})
 try{
  for(const name of['wash-A','wash-B'])expect(s.coordinator.tryEnqueueLocal(s.author(name,'wash'),s.operation(name,0,false,undefined,'wash'))).toBe(true)
  const [a,b]=s.coordinator['entries'];let sawPartial=false,sawFrozen=false,published=false
  for(let i=0;i<400;i++){
   const candidate=s.coordinator['candidate'],beforeB=b.executor.pendingFrameCount
   const out=s.coordinator.advance()
   if(out?.kind==='preview-failed')throw out.error
   if(a.washInFlight){sawPartial=true;expect(b.depositedNextOrdinal).toBe(0);expect(s.coordinator['candidate']).toBeUndefined();expect(()=>s.coordinator.retainReplaySnapshot()).toThrow('incomplete')}
   if(candidate){sawFrozen=true;expect(b.executor.pendingFrameCount).toBe(beforeB);expect(b.depositedNextOrdinal).toBe(0)}
   if(out?.kind==='preview-ready'){expect(a.depositedNextOrdinal).toBe(1);expect(b.depositedNextOrdinal).toBe(0);s.publish(out.ticket);published=true;break}
  }
  expect(sawPartial).toBe(true);expect(sawFrozen).toBe(true);expect(published).toBe(true)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('mixed WASH cumulative65 rejects before retaining position/source and same-coordinate retry keeps64',()=>{
 const s=replayConsumer7()
 try{
  for(let g=0;g<2;g++){
   const name='wash-cohort'+g,points=Array.from({length:32},(_,i)=>({x:(g*32+i)*8,y:0}))
   expect(s.coordinator.tryEnqueueLocal(s.author(name,'wash'),s.operation(name,0,false,points,'wash'))).toBe(true)
  }
  const count=s.coordinator['replay'].size,bytes=s.cpu.reservedBytes,calls=s.source.mock.calls.length,author=s.author('wash-overflow','wash')
  expect(s.coordinator['positions'].size).toBe(64)
  expect(()=>s.coordinator.tryEnqueueLocal(author,s.operation('wash-overflow',0,false,[{x:512,y:0}],'wash'))).toThrow('bounded target union')
  expect(s.coordinator['positions'].size).toBe(64);expect(s.coordinator['replay'].size).toBe(count);expect(s.cpu.reservedBytes).toBe(bytes);expect(s.source).toHaveBeenCalledTimes(calls)
  expect(s.coordinator.tryEnqueueLocal(author,s.operation('wash-overflow',0,false,[{x:0,y:0}],'wash'))).toBe(true)
  expect(s.coordinator['positions'].size).toBe(64)
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('mixed child actual OVER draw throwing undefined is fatal, keeps old P and attempts all owned cleanup',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const old=s.currentPresentation(),actual=s.composite.drawSource.bind(s.composite)
  vi.spyOn(s.composite,'drawSource').mockImplementation((request,frame)=>{
   if(request.source.kind==='texturedMaskRgb'&&request.operation.kind==='over32FusedScalar')throw undefined
   return actual(request,frame)
  })
  expect(s.coordinator.tryEnqueueLocal(s.author('fatal-child'),s.operation('fatal-child'))).toBe(true)
  let threw=false
  try{for(let i=0;i<200;i++)s.coordinator.advance()}catch(error){threw=true;expect(error).toBeUndefined()}
  expect(threw).toBe(true);expect(s.coordinator.poisoned).toBe(true);expect(s.coordinator['candidate']).toBeUndefined();expect(s.coordinator['replayWork']).toBeUndefined()
  expect(s.currentPresentation()).toBe(old);expect(s.coordinator.publishedPresentationReady).toBe(false);expect(s.coordinator.checkpointReady).toBe(false)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('mixed candidate pixel inputs use ONLY accepted immutable envelope, not later caller snapshot headers',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const original=s.author('accepted-header'),raw=structuredClone(original.snapshot)
  const owner:CanonicalLocalWashAuthor=Object.freeze({...original,snapshot:raw,assertCurrent(candidate:CanonicalLocalWashAuthor){if(candidate!==owner)throw Error('foreign original owner');return original.assertCurrent(original)}})
  const op=s.operation('accepted-header');expect(s.coordinator.tryEnqueueLocal(owner,op)).toBe(true)
  const accepted=s.coordinator['replay'].get(op.id)!.acceptedFrame!;expect(Object.isFrozen(accepted)).toBe(true)
  Reflect.set(raw,'pigmentRgb8',[1,2,3]);Reflect.set(raw,'composition',{...raw.composition,outerResourceOpacity:.1})
  const draw=vi.spyOn(s.composite,'drawSource');let published=false
  for(let i=0;i<200&&!published;i++){const out=s.coordinator.advance();if(out?.kind==='preview-failed')throw out.error;if(out?.kind==='preview-ready'){s.publish(out.ticket);published=true}}
  expect(published).toBe(true);expect(accepted.pigmentRgb8).toEqual([200,20,50]);expect(accepted.composition.outerResourceOpacity).toBe(.8)
  const colors=draw.mock.calls.flatMap(([r])=>r.source.kind==='texturedMaskRgb'?[r.source.rgb]:[]);expect(colors.length).toBeGreaterThan(0);for(const color of colors)expect(color).toEqual([200,20,50])
  expect(raw.pigmentRgb8).toEqual([1,2,3]);expect(raw.composition.outerResourceOpacity).toBe(.1)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('mixed decoder workspace denial parks before child/staging, preserves old P and retries only after genuine admission',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const old=s.currentPresentation(),author=s.author('decode-budget'),reserve=s.cpu.reserve.bind(s.cpu)
  const original=s.operation('decode-budget'),c=context7('defaultAuto'),open=Object.freeze({...original,frame:{...original.frame,materialPacked:packCanonicalTexturedAutoMaterial(renderedOpen7(c),c)}})
  expect(s.coordinator.tryEnqueueLocal(author,open)).toBe(true);s.coordinator.advance()
  const bytes=s.cpu.reservedBytes;let denied=0
  let armed=true
  const hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(armed){armed=false;denied++;expect(n).toBeGreaterThan(0);throw Error('bounded decoder workspace')}return reserve(n)})
  const result=s.coordinator.advance();expect(result?.kind).toBe('preview-failed')
  expect(s.cpu.reservedBytes).toBe(bytes);expect(s.currentPresentation()).toBe(old);expect(s.stageCandidate).not.toHaveBeenCalled();expect(s.coordinator.poisoned).toBe(false)
  s.coordinator.advance();s.coordinator.advance();expect(denied).toBe(1);hook.mockRestore()
  expect(s.coordinator.tryEnqueueLocal(author,s.operation('decode-budget',1,true))).toBe(true)
  let published=false
  for(let i=0;i<200&&!published;i++){const out=s.coordinator.advance();if(out?.kind==='preview-failed')throw out.error;if(out?.kind==='preview-ready'){s.publish(out.ticket);published=true}}
  expect(published).toBe(true);expect(s.coordinator.checkpointReady).toBe(false)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

function mixedOpenOperation(s:ReturnType<typeof replayConsumer7>,name:string):CanonicalStrokeOperation {
 const op=s.operation(name),c=context7('defaultAuto')
 return Object.freeze({...op,frame:{...op.frame,materialPacked:packCanonicalTexturedAutoMaterial(renderedOpen7(c),c)}})
}
function mixedReady(s:ReturnType<typeof replayConsumer7>){
 for(let i=0;i<500;i++){const out=s.coordinator.advance();if(out?.kind==='preview-failed')throw out.error;if(out?.kind==='preview-ready')return out.ticket}
 throw Error('Mixed candidate did not become ready')
}
it('mixed genuine FIRST reorder cancels healthy active OPEN child once and restarts SAME accepted journal with old P',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const local=s.author('local-L');expect(s.coordinator.tryEnqueueLocal(local,mixedOpenOperation(s,'local-L'))).toBe(true);s.publish(mixedReady(s))
  const old=s.currentPresentation();expect(s.coordinator.tryEnqueueLocal(local,tailSuffixOperation(s,'local-L',1))).toBe(true)
  let now=0;clock.mockImplementation(()=>++now)
  const draw=vi.spyOn(s.composite,'drawSource');let active=false
  for(let i=0;i<500;i++){s.coordinator.advance();const child=s.coordinator['candidate']?.mixed?.child;if(child&&child.pending&&draw.mock.calls.length){active=true;break}}
  expect(active).toBe(true)
  const abandoned=s.coordinator['candidate']!,stage=abandoned.staged,cancel=vi.spyOn(stage,'cancel'),entries=s.coordinator['entries'].slice(),journal=s.coordinator['replay'].size
  s.coordinator.enqueueRecorded(s.recorded(s.operation('recorded-Q'),1))
  expect(()=>s.coordinator.advance()).not.toThrow();expect(cancel).toHaveBeenCalledTimes(1);expect(s.currentPresentation()).toBe(old);expect(s.coordinator.poisoned).toBe(false)
  expect(s.coordinator['entries']).toContain(entries[0]);expect(s.coordinator['replay'].size).toBe(journal+1);expect(s.coordinator['candidate']).toBeUndefined()
  clock.mockReturnValue(0);const next=mixedReady(s),work=s.coordinator['replayWork'];if(!work||!('snapshot'in work))throw Error('Mixed work required')
  const groups=work.snapshot.groups!();expect(groups[0].frames[0].frame.strokeId).toBe('recorded-Q');expect(groups[1].frames[0].frame.strokeId).toBe('local-L')
  expect(s.currentPresentation()).toBe(old);s.publish(next);expect(s.coordinator.poisoned).toBe(false);expect(cancel).toHaveBeenCalledTimes(1)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
interface MixedTestStagingOwner {
 readonly staged:{readonly buffer:TiledLayerBuffer;cancel():void}
 readonly releaseMetadata:()=>void
}
/** Old unsafe publish can detach C before the external pointer adoption.
 * Keep its exact real staging/metadata owners for test finally, never reset
 * cache counters. Secondary cleanup must not mask the unsafe assertion.
 */
function finishMixedTicketTest(s:ReturnType<typeof replayConsumer7>,clock:{mockRestore():void},owned:MixedTestStagingOwner|undefined,primaryFailed:boolean,primary:unknown):void {
 let cleanupFailed=false,cleanupError:unknown
 const cleanup=(action:()=>void)=>{try{action()}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error}}}
 cleanup(()=>clock.mockRestore());s.setLate()
 if(owned&&s.coordinator['derived']===owned.staged.buffer&&s.currentPresentation()!==owned.staged.buffer){
  cleanup(()=>owned.staged.cancel());cleanup(owned.releaseMetadata)
 }
 cleanup(()=>s.close())
 if(primaryFailed){if(cleanupFailed)console.error('Secondary owned-fixture cleanup failure',cleanupError instanceof Error?cleanupError.message.slice(0,256):typeof cleanupError);throw primary}
 if(cleanupFailed)throw cleanupError
}
it('mixed checked ready ticket rejects genuine FIRST reorder at pure publish before any pointer flip',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let owned:MixedTestStagingOwner|undefined,primaryFailed=false,primary:unknown
 try{
  expect(s.coordinator.tryEnqueueLocal(s.author('local-ticket'),s.operation('local-ticket'))).toBe(true)
  const old=s.currentPresentation(),ticket=mixedReady(s);owned=s.coordinator['candidate'];ticket.assertCurrent()
  s.coordinator.enqueueRecorded(s.recorded(s.operation('recorded-before-local'),1))
  expect(()=>ticket.publish()).toThrow('Stale preview');expect(s.currentPresentation()).toBe(old);expect(s.coordinator.poisoned).toBe(false)
  expect(()=>s.coordinator.advance()).not.toThrow();s.publish(mixedReady(s));expect(s.coordinator.poisoned).toBe(false)
 }catch(error){primaryFailed=true;primary=error}
 finally{finishMixedTicketTest(s,clock,owned,primaryFailed,primary)}
 expect(s.cpu.reservedBytes).toBe(0)
})
it.each(['layer','staged']as const)('publication assertion rejects SAME ticket publish reentry from %s callback',where=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let owned:MixedTestStagingOwner|undefined,primaryFailed=false,primary:unknown
 try{
  expect(s.coordinator.tryEnqueueLocal(s.author('reentry-ticket'),s.operation('reentry-ticket'))).toBe(true)
  const old=s.currentPresentation(),ticket=mixedReady(s);owned=s.coordinator['candidate'];let attempts=0
  const attempt=()=>{attempts++;expect(()=>ticket.publish()).toThrow();expect(s.currentPresentation()).toBe(old)}
  let restore:(()=>void)|undefined
  if(where==='layer')s.setLate(attempt)
  else{const staged=s.coordinator['candidate']!.staged,original=staged.assertCurrent.bind(staged),spy=vi.spyOn(staged,'assertCurrent').mockImplementation(()=>{original();attempt()});restore=()=>spy.mockRestore()}
  ticket.assertCurrent();expect(attempts).toBeGreaterThan(0);s.setLate();restore?.();expect(s.currentPresentation()).toBe(old);s.publish(ticket)
  expect(s.coordinator.poisoned).toBe(false)
 }catch(error){primaryFailed=true;primary=error}
 finally{finishMixedTicketTest(s,clock,owned,primaryFailed,primary)}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('legacy preview genuine FIRST reorder cancels SAME hidden candidate and rebuilds without owner poison or new64 policy',()=>{
 const s=replayConsumer7(undefined,true,undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const local=s.author('legacy-local','wash'),c=context7('defaultAuto'),open=renderedOpen7(c)
  const first=s.operation('legacy-local',0,false,undefined,'wash')
  expect(s.coordinator.tryEnqueueLocal(local,Object.freeze({...first,frame:{...first.frame,materialPacked:packCanonicalTexturedAutoMaterial(open,c)}}))).toBe(true)
  s.publish(mixedReady(s));const old=s.currentPresentation()
  const continued=buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:open.draws.map(d=>({recipe:open.definitions[d.definition],role:'primary',x:d.x,y:d.y,opacity:d.opacity,flow:d.flow,grainDepth:d.grainDepth})),fences:open.fences.map(f=>f.kind==='gestureEnd'?f:{...f,group:1})},c).frame
  const second=s.operation('legacy-local',1,false,undefined,'wash')
  expect(s.coordinator.tryEnqueueLocal(local,Object.freeze({...second,frame:{...second.frame,materialPacked:packCanonicalTexturedAutoMaterial(continued,c)}}))).toBe(true)
  const ticket=mixedReady(s),owned=s.coordinator['candidate']!,cancel=vi.spyOn(owned.staged,'cancel');ticket.assertCurrent()
  s.coordinator.enqueueRecorded(s.recorded(s.operation('legacy-recorded',0,false,undefined,'wash'),1))
  expect(()=>ticket.publish()).toThrow('Stale preview')
  expect(()=>s.coordinator.advance()).not.toThrow();expect(cancel).toHaveBeenCalledTimes(1);expect(s.currentPresentation()).toBe(old);expect(s.coordinator.poisoned).toBe(false)
  s.publish(mixedReady(s));expect(s.coordinator.poisoned).toBe(false);expect(cancel).toHaveBeenCalledTimes(1)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

function mixedOriginalWashOpen(s:ReturnType<typeof replayConsumer7>,name:string,seq=1):CanonicalRecordedInput {
 const op=s.operation(name,0,false,undefined,'wash'),c=context7('defaultAuto')
 return s.recorded(Object.freeze({...op,frame:{...op.frame,materialPacked:packCanonicalTexturedAutoMaterial(renderedOpen7(c),c)}}),seq)
}
function drainMixedWashQueue(s:ReturnType<typeof replayConsumer7>):void {
 for(let i=0;i<500&&s.coordinator.queuedFrameCount;i++)s.coordinator.advance()
 expect(s.coordinator.queuedFrameCount).toBe(0)
}
it('mixed WASH original close retains exact receipt/preclose seal without native seal, raw mutation or queue work',()=>{
 const s=replayConsumer7(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=mixedOriginalWashOpen(s,'wash-exact');s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
  const entry=s.coordinator['entries'][0],prefix=entry.recorded!,before=s.cpu.reservedBytes,revision=s.coordinator['revision'],deposited=entry.depositedNextOrdinal,pending=entry.executor.pendingFrameCount,raw=entry.executor.rawWashTiles().map(t=>t.view.texture),sourceCalls=s.source.mock.calls.length
  const close=s.seal(first),sealNative=vi.spyOn(entry.executor,'sealRecordedPrefix'),draw=vi.spyOn(s.composite,'drawSource')
  expect(s.coordinator.canAcceptRecorded(close)).toBe(true);s.coordinator.enqueueRecordedSeal(close)
  expect(entry.closeReceipt?.input).toBe(close);expect(entry.closeReceipt?.prefix).toBe(prefix);expect(entry.closeReceipt?.seal.kind).toBe('commitPartial');expect(Object.isFrozen(entry.closeReceipt?.seal)).toBe(true)
  expect(entry.recorded).not.toBe(prefix);expect(prefix.sealed).toBe(false);expect(entry.recorded?.sealed).toBe(true);expect(entry.executor.rawWashSealed).toBe(false)
  expect(entry.executor.rawWashTiles().map(t=>t.view.texture)).toEqual(raw);expect(entry.depositedNextOrdinal).toBe(deposited);expect(entry.executor.pendingFrameCount).toBe(pending);expect(s.coordinator.queuedFrameCount).toBe(0)
  expect(s.cpu.reservedBytes-before).toBe(4608);expect(s.coordinator['revision']).toBe(revision+1);expect(s.coordinator['lastSequence']).toBe(10)
  expect(sealNative).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();expect(s.source).toHaveBeenCalledTimes(sourceCalls);expect(s.coordinator.checkpointReady).toBe(false)
  expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow();expect(entry.closeReceipt?.input).toBe(close)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('mixed WASH full8 render queue still accepts original metadata close of already deposited OPEN target without9thslot',()=>{
 const s=replayConsumer7(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=mixedOriginalWashOpen(s,'wash-full');s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
  const entry=s.coordinator['entries'][0],close=s.seal(first),sealNative=vi.spyOn(entry.executor,'sealRecordedPrefix')
  for(let i=0;i<8;i++)s.coordinator.enqueueRecorded(mixedOriginalWashOpen(s,'queued-wash-'+i,i+2))
  expect(s.coordinator.queuedFrameCount).toBe(8);expect(s.coordinator['queue']).not.toContain(entry)
  const draw=vi.spyOn(s.composite,'drawSource'),sourceCalls=s.source.mock.calls.length
  expect(s.coordinator.canAcceptRecorded(close)).toBe(true);expect(()=>s.coordinator.enqueueRecordedSeal(close)).not.toThrow()
  expect(s.coordinator.queuedFrameCount).toBe(8);expect(entry.closeReceipt?.input).toBe(close);expect(s.coordinator['queue']).not.toContain(entry)
  expect(sealNative).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();expect(s.source).toHaveBeenCalledTimes(sourceCalls);expect(s.coordinator.checkpointReady).toBe(false)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('mixed WASH late close does not upgrade captured OPEN R and close receipt stays charged until actual Entry pins retire',()=>{
 const s=replayConsumer7(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=mixedOriginalWashOpen(s,'wash-pin');s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
  const old=s.coordinator.retainReplaySnapshot(),groups=old.groups!(),close=s.seal(first),reserve=s.cpu.reserve.bind(s.cpu);let closeReleases=0
  const hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{const release=reserve(n);return n===4608?()=>{closeReleases++;release()}:release})
  expect(groups[0].kind).toBe('wash');expect(groups[0].close).toBeUndefined();s.coordinator.enqueueRecordedSeal(close);expect(old.groups!()).toBe(groups);expect(groups[0].close).toBeUndefined();old.release()
  const entry=s.coordinator['entries'][0],receipt=entry.closeReceipt!,next=s.coordinator.retainReplaySnapshot(),group=next.groups!()[0]
  expect(group.close?.input).toBe(close);expect(group.close?.seal).toBe(receipt.seal);expect(receipt.prefix).not.toBe(entry.recorded)
  s.coordinator['retireReplayMetadata'](entry);expect(entry.closeReceipt).toBe(receipt);expect(closeReleases).toBe(0);next.release();expect(entry.closeReceipt).toBeUndefined();expect(closeReleases).toBe(1);hook.mockRestore()
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('mixed WASH close CPU denial/late undefined preserves receipt prefix raw and allows SAME issued retry with busy callbacks',()=>{
 for(const kind of['cpu','late']as const){
  const s=replayConsumer7(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
  try{
   const first=mixedOriginalWashOpen(s,'wash-rollback');s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
   const entry=s.coordinator['entries'][0],prefix=entry.recorded,bytes=s.cpu.reservedBytes,last=s.coordinator['lastSequence'];let calls=0,fail=true,close:CanonicalRecordedInput
   close=s.seal(first,{},()=>{calls++;expect(()=>s.coordinator.cancel()).toThrow('turn');expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow('busy');if(kind==='late'&&calls===2&&fail)throw undefined})
   const reserve=s.cpu.reserve.bind(s.cpu),hook=vi.spyOn(s.cpu,'reserve').mockImplementation(n=>{if(kind==='cpu'&&n===4608&&fail)throw undefined;return reserve(n)})
   let caught=false;try{s.coordinator.enqueueRecordedSeal(close)}catch(error){caught=true;expect(error).toBeUndefined()}
   expect(caught).toBe(true);expect(entry.recorded).toBe(prefix);expect(entry.closeReceipt).toBeUndefined();expect(s.coordinator['lastSequence']).toBe(last);expect(s.cpu.reservedBytes).toBe(bytes);expect(entry.executor.rawWashSealed).toBe(false);expect(s.coordinator.poisoned).toBe(false)
   fail=false;s.coordinator.enqueueRecordedSeal(close);hook.mockRestore();expect(entry.closeReceipt?.input).toBe(close)
  }finally{clock.mockRestore();s.close()}
  expect(s.cpu.reservedBytes).toBe(0)
 }
})
it('mixed WASH original close refuses actual pattern-root revocation with SAME mask epochs before receipt publication',()=>{
 const s=replayConsumer7(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=mixedOriginalWashOpen(s,'wash-root-close');s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
  const entry=s.coordinator['entries'][0],prefix=entry.recorded,beforeReset=s.cpu.reservedBytes,mask=s.prepass.preparedCapacity().epoch,composite=s.composite.preparedCapacity().epoch,close=s.seal(first)
  s.bank.reset();const bytes=s.cpu.reservedBytes;expect(bytes).toBeLessThan(beforeReset);expect(s.prepass.preparedCapacity().epoch).toBe(mask);expect(s.composite.preparedCapacity().epoch).toBe(composite)
  expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow();expect(entry.recorded).toBe(prefix);expect(entry.closeReceipt).toBeUndefined();expect(s.cpu.reservedBytes).toBe(bytes)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it.each(['prefix','range','layer','copy','ended','local-tail']as const)('mixed WASH close rejects %s before receipt/sequence/raw publication',kind=>{
 const s=replayConsumer7()
 try{
  const first=kind==='ended'?s.recorded(s.operation('wash-negative',0,false,undefined,'wash'),1):mixedOriginalWashOpen(s,'wash-negative')
  if(first.operation.type!=='canonical_stroke')throw Error('Original frame required')
  if(kind==='local-tail'){
   const op=first.operation,local=s.author('wash-negative','wash'),original=Object.freeze({type:'canonical_stroke' as const,id:op.id,userId:op.userId,timestamp:op.timestamp,layerId:op.layerId,frame:op.frame})
   expect(s.coordinator.tryEnqueueLocal(local,original)).toBe(true);s.coordinator.enqueueRecorded(first)
   expect(s.coordinator.tryEnqueueLocal(local,s.operation('wash-negative',1,true,undefined,'wash'))).toBe(true)
  }else s.coordinator.enqueueRecorded(first)
  const patch:Partial<CanonicalStrokeCloseOperation>=kind==='prefix'?{lastFrameOpId:'wrong-original'}:kind==='range'?{recordedNext:2}:kind==='layer'?{layerId:'other-layer'}:{}
  const issued=s.seal(first,patch),close=kind==='copy'?{...issued}:issued,entry=s.coordinator['entries'][0],prefix=entry.recorded,bytes=s.cpu.reservedBytes,last=s.coordinator['lastSequence'],queue=s.coordinator.queuedFrameCount,native=entry.executor.rawWashSealed
  expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow();expect(entry.recorded).toBe(prefix);expect(entry.closeReceipt).toBeUndefined();expect(s.cpu.reservedBytes).toBe(bytes);expect(s.coordinator['lastSequence']).toBe(last);expect(s.coordinator.queuedFrameCount).toBe(queue);expect(entry.executor.rawWashSealed).toBe(native)
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})


it('closed handoff ticket captures original WASH close disposition before proof finish',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=mixedOriginalWashOpen(s,'closed-disposition')
  s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
  s.coordinator.enqueueRecordedSeal(s.seal(first))
  const ticket=mixedReady(s)
  expect(ticket.disposition).toBe('closed-handoff')
  expect(Object.isFrozen(ticket)).toBe(true)
  expect(s.coordinator.checkpointReady).toBe(false)
  ticket.assertCurrent()
  // Paired index owns stable adoption; do not publish a closed ticket through
  // this fixture's display-only pointer adapter.
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('display disposition cannot upgrade after late exact original close',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=mixedOriginalWashOpen(s,'display-disposition')
  s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
  const ticket=mixedReady(s)
  expect(ticket.disposition).toBe('display')
  s.coordinator.enqueueRecordedSeal(s.seal(first))
  expect(ticket.disposition).toBe('display')
  expect(s.coordinator.checkpointReady).toBe(false)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})


it('late original WASH close requests new R after display proof finish without upgrading old ticket',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=mixedOriginalWashOpen(s,'late-handoff')
  s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
  const display=mixedReady(s);expect(display.disposition).toBe('display');s.publish(display)
  const previous=s.currentPresentation(),revision=s.coordinator['revision']
  expect(s.coordinator['replayWork']).toBeUndefined();expect(s.coordinator['dirty'].size).toBe(0)
  s.coordinator.enqueueRecordedSeal(s.seal(first))
  expect(display.disposition).toBe('display');expect(s.currentPresentation()).toBe(previous)
  expect(s.coordinator['revision']).toBe(revision+1);expect(s.coordinator['dirty'].size).toBeGreaterThan(0)
  expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.coordinator.presentationReady).toBe(false)
  const current=mixedReady(s);expect(current.disposition).toBe('closed-handoff');current.assertCurrent()
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('original promotion stages new R without another native frame after OPEN display finish',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const name='promotion-recapture',author=s.author(name),operation=mixedOpenOperation(s,name)
  expect(s.coordinator.tryEnqueueLocal(author,operation)).toBe(true)
  const display=mixedReady(s);s.publish(display)
  const previous=s.currentPresentation(),revision=s.coordinator['revision'],entry=s.coordinator['entries'][0]
  const original=s.recorded(operation,1),prepare=vi.spyOn(entry.executor,'prepareReplayFrontier')
  expect(s.coordinator['dirty'].size).toBe(0)
  s.coordinator.enqueueRecorded(original)
  expect(entry.recorded?.firstSeq).toBe(1);expect(entry.local?.receipts).toHaveLength(0)
  expect(s.coordinator['revision']).toBe(revision+1);expect(s.coordinator['dirty'].size).toBeGreaterThan(0)
  expect(s.coordinator.queuedFrameCount).toBe(0);expect(prepare).not.toHaveBeenCalled()
  expect(s.currentPresentation()).toBe(previous);expect(display.disposition).toBe('display')
  expect(mixedReady(s).disposition).toBe('display') // Still genuine OPEN, not END.
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('promotion recapture CPU denial preserves SAME local receipt/replay/dirty and issued original retry',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const name='promotion-recapture-denied',author=s.author(name),operation=mixedOpenOperation(s,name)
  expect(s.coordinator.tryEnqueueLocal(author,operation)).toBe(true);s.publish(mixedReady(s))
  const entry=s.coordinator['entries'][0],receipt=entry.local!.receipts[0],replay=s.coordinator['replay'].get(operation.id)!
  const dirty=s.coordinator['dirty'],revision=s.coordinator['revision'],cpu=s.cpu.reservedBytes
  const original=s.recorded(operation,1),reserve=s.cpu.reserve.bind(s.cpu),failure=Object.freeze({recapture:'denied'})
  const hook=vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{
    if(bytes===128+s.coordinator['positions'].size*256)throw failure
    return reserve(bytes)
  })
  let rejected=false,primary:unknown
  try{s.coordinator.enqueueRecorded(original)}catch(error){rejected=true;primary=error}
  expect(rejected).toBe(true);expect(primary).toBe(failure)
  expect(entry.local!.receipts[0]).toBe(receipt);expect(entry.recorded).toBeUndefined()
  expect(s.coordinator['replay'].get(operation.id)).toBe(replay);expect(replay.value.kind).toBe('local')
  expect(s.coordinator['dirty']).toBe(dirty);expect(s.coordinator['revision']).toBe(revision)
  expect(s.cpu.reservedBytes).toBe(cpu);expect(s.coordinator.poisoned).toBe(false)
  hook.mockRestore();expect(()=>s.coordinator.enqueueRecorded(original)).not.toThrow()
  expect(entry.local?.receipts).toHaveLength(0);expect(entry.recorded?.firstSeq).toBe(1)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})


it('blank mixed constructor stays idle without creating an empty synthetic cohort',()=>{
 const s=replayConsumer7(undefined,true)
 try{expect(s.coordinator.advance()).toMatchObject({kind:'preview-idle'});expect(s.stageCandidate).not.toHaveBeenCalled()}
 finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it.each(['zero-END','zero-close','clipped-END','clipped-close']as const)('captures genuine empty-target original %s through SAME closed ticket',kind=>{
 const s=replayConsumer7({minX:0,minY:0,maxX:4,maxY:4},true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const c=context7('defaultAuto'),ended=kind.endsWith('END'),clipped=kind.startsWith('clipped')
  const raw=s.operation('empty-'+kind,0,!clipped,clipped?[{x:-20,y:-20}]:undefined,'wash')
  const operation=clipped&&!ended?Object.freeze({...raw,frame:{...raw.frame,materialPacked:packCanonicalTexturedAutoMaterial({...geometryFrame7(c,[{x:-20,y:-20}]),fences:geometryFrame7(c,[{x:-20,y:-20}]).fences.filter(fence=>fence.kind!=='gestureEnd')},c)}})
   :ended&&!clipped?Object.freeze({...raw,frame:{...raw.frame,materialPacked:buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},c).packed}}):raw
  const first=s.recorded(operation,1);s.coordinator.enqueueRecorded(first);drainMixedWashQueue(s)
  expect(s.coordinator['positions'].size).toBe(0)
  if(!ended){
   const display=mixedReady(s);expect(display.disposition).toBe('display');s.publish(display)
   expect(s.coordinator['dirty'].size).toBe(0)
   s.coordinator.enqueueRecordedSeal(s.seal(first));expect(display.disposition).toBe('display')
  }
  const ticket=mixedReady(s);expect(ticket.disposition).toBe('closed-handoff');ticket.assertCurrent();s.publish(ticket)
  expect(s.coordinator['closed']).toBe(true);expect(s.coordinator['replayWork']).toBeUndefined()
  expect(s.coordinator.checkpointReady).toBe(false) // Old terminal coordinator grants no read authority.
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})


it.each(['zero-END','zero-close','clipped-END','clipped-close']as const)('late original promotion of empty-target %s recaptures real cohort without a dirty tile',kind=>{
 const s=replayConsumer7({minX:0,minY:0,maxX:4,maxY:4},true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const c=context7('defaultAuto'),clipped=kind.startsWith('clipped'),ended=kind.endsWith('END'),name='promote-empty-'+kind
  const frame=clipped?geometryFrame7(c,[{x:-20,y:-20}]):buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:ended?[{at:0,kind:'gestureEnd'}]:[]},c).frame
  const packed=packCanonicalTexturedAutoMaterial({...frame,fences:ended?frame.fences:frame.fences.filter(fence=>fence.kind!=='gestureEnd')},c)
  const raw=s.operation(name,0,true,undefined,'wash'),operation=Object.freeze({...raw,frame:{...raw.frame,materialPacked:packed}})
  expect(s.coordinator.tryEnqueueLocal(s.author(name,'wash'),operation)).toBe(true)
  drainMixedWashQueue(s);const display=mixedReady(s);expect(display.disposition).toBe('display');s.publish(display)
  expect(s.coordinator['positions'].size).toBe(0);expect(s.coordinator['dirty'].size).toBe(0)
  const original=s.recorded(operation,1);s.coordinator.enqueueRecorded(original)
  if(!ended){const promoted=mixedReady(s);expect(promoted.disposition).toBe('display');s.publish(promoted);s.coordinator.enqueueRecordedSeal(s.seal(original))}
  const closed=mixedReady(s);expect(closed.disposition).toBe('closed-handoff');s.publish(closed)
  expect(s.coordinator['closed']).toBe(true);expect(s.coordinator['replayWork']).toBeUndefined()
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})


// Scheduling-only structural source fixture. Real executor/prepass/composite on
// recordingGL; command equivalence is NOT a real GPU pixel/latency claim.
function frameTurnCohort(cheapBetween=false){
 const s=replayConsumer7(undefined,true),name='turn-cohort',author=s.author(name),c=context7('defaultAuto')
 for(let ordinal=0;ordinal<4;ordinal++){
  const op=s.operation(name,ordinal),sourceFrame=cheapBetween&&(ordinal===1||ordinal===2)?buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},c).frame:ordinal===3?decoded7(c):renderedOpen7(c)
  const frame=buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:sourceFrame.draws.map(d=>({recipe:sourceFrame.definitions[d.definition],role:'primary',x:d.x,y:d.y,opacity:d.opacity,flow:d.flow,grainDepth:d.grainDepth})),fences:sourceFrame.fences.map(f=>'group'in f?{...f,group:cheapBetween?(ordinal===3?1:0):ordinal}:f)},c).frame
  const operation=Object.freeze({...op,frame:{...op.frame,materialPacked:packCanonicalTexturedAutoMaterial(frame,c)}})
  expect(s.coordinator.tryEnqueueLocal(author,operation)).toBe(true)
 }
 return s
}
it('mixed frame-turn reuses SAME child for multiple completed cheap captured frames in one advance',()=>{
 const s=frameTurnCohort(true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  let maximumCompleted=0,ready=false
  for(let turn=0;turn<200&&!ready;turn++){
   const previous=s.coordinator['candidate']?.mixed,before=previous?(previous.group?4:previous.frame):0
   const out=s.coordinator.advance(),current=s.coordinator['candidate']?.mixed
   if(out?.kind==='preview-failed')throw out.error
   if(previous&&current===previous)maximumCompleted=Math.max(maximumCompleted,(current.group?4:current.frame)-before)
   if(out?.kind==='preview-ready'){s.publish(out.ticket);ready=true}
  }
  expect(ready).toBe(true);expect(maximumCompleted).toBeGreaterThan(1)
  expect(s.source).toHaveBeenCalledTimes(1);expect(s.coordinator.poisoned).toBe(false)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('mixed frame-turn never spins a pending child and never starts another frame after outer budget',()=>{
 const s=frameTurnCohort();let now=0,steps=0,sawPending=false
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),advance=CanonicalFrameExecutor.prototype.advance,enqueue=CanonicalFrameExecutor.prototype.enqueue
 const calls=vi.spyOn(CanonicalFrameExecutor.prototype,'advance').mockImplementation(function(this:CanonicalFrameExecutor){steps++;return advance.call(this)})
 const starts:{ordinal:number;at:number}[]=[]
 const enqueues=vi.spyOn(CanonicalFrameExecutor.prototype,'enqueue').mockImplementation(function(this:CanonicalFrameExecutor,input){starts.push({ordinal:input.ordinal,at:now});return enqueue.call(this,input)})
 const draw=s.composite.drawSource.bind(s.composite),draws=vi.spyOn(s.composite,'drawSource').mockImplementation((request,frame)=>{const result=draw(request,frame);if(request.source.kind==='texturedMaskRgb')now+=4;return result})
 try{
  let ready=false
  for(let turn=0;turn<200&&!ready;turn++){
   now=0;steps=0;const start=starts.length,out=s.coordinator.advance()
   if(out?.kind==='preview-failed')throw out.error
   for(const input of starts.slice(start))expect(input.at).toBeLessThan(4)
   if(s.coordinator['candidate']?.mixed?.child?.pending){sawPending=true;expect(steps).toBe(1)}
   if(out?.kind==='preview-ready'){s.publish(out.ticket);ready=true}
  }
  expect(ready).toBe(true);expect(sawPending).toBe(true);expect(starts.map(s=>s.ordinal)).toEqual([0,1,2,3])
 }finally{draws.mockRestore();enqueues.mockRestore();calls.mockRestore();clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('mixed frame-turn preserves exact ordered OVER command inputs across cheap and budget-yielded schedules',()=>{
 const run=(cost:number)=>{
  const s=frameTurnCohort();let now=0
  const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),commands:unknown[]=[]
  const draw=s.composite.drawSource.bind(s.composite),hook=vi.spyOn(s.composite,'drawSource').mockImplementation((request,frame)=>{
   if(request.source.kind==='texturedMaskRgb')commands.push({operation:request.operation,strength:request.source.strengthU8,rgb:[...request.source.rgb],bounds:request.writeBounds})
   const result=draw(request,frame);if(request.source.kind==='texturedMaskRgb')now+=cost;return result
  })
  try{
   let ready=false
   for(let turn=0;turn<200&&!ready;turn++){now=0;const out=s.coordinator.advance();if(out?.kind==='preview-failed')throw out.error;if(out?.kind==='preview-ready'){s.publish(out.ticket);ready=true}}
   expect(ready).toBe(true);expect(commands.length).toBeGreaterThan(0);expect(s.source).toHaveBeenCalledTimes(1)
   return JSON.stringify(commands)
  }finally{hook.mockRestore();clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
 }
 expect(run(0)).toBe(run(4))
})

it('mixed frame-turn starts the next actual painted frame after prior pending frame completes in SAME advance',()=>{
 const s=frameTurnCohort(),clock=vi.spyOn(performance,'now').mockReturnValue(0),enqueue=CanonicalFrameExecutor.prototype.enqueue
 const starts:number[]=[];const hook=vi.spyOn(CanonicalFrameExecutor.prototype,'enqueue').mockImplementation(function(this:CanonicalFrameExecutor,input){starts.push(input.ordinal);return enqueue.call(this,input)})
 try{
  let ready=false,combined=false
  for(let turn=0;turn<200&&!ready;turn++){
   const before=s.coordinator['candidate']?.mixed,ordinal=before?.frame,pending=before?.child?.pending,start=starts.length
   const out=s.coordinator.advance()
   if(out?.kind==='preview-failed')throw out.error
   if(pending&&ordinal!==undefined&&starts.slice(start).includes(ordinal+1))combined=true
   if(out?.kind==='preview-ready'){s.publish(out.ticket);ready=true}
  }
  expect(ready).toBe(true);expect(combined).toBe(true);expect(starts).toEqual([0,1,2,3]);expect(s.source).toHaveBeenCalledTimes(1)
 }finally{hook.mockRestore();clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

// Rendered-tail structural commands/state oracle: no physical GPU/pixel claim.
it.each(['defaultAuto','gaussianAuto','softAuto']as const)('rendered cursor transfers actual OPEN state to a normal suffix executor %s',kind=>{
 const c=context7(kind),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 const next=new TiledLayerBuffer(s.gl,4,4,undefined,undefined,undefined,'straight-rgba8')
 const cursor=prepareRenderedPrefixCursor7(s.cpu)
 try{
  const first=s.create({candidateReplay7:'textured7-buildup-v1'}),input=submission7(c),frame=renderedOpen7(c)
  first.enqueue({...input,frame,composition:{...input.composition,mode:'buildup'}});s.drain()
  const state=first['planned'],draw=vi.spyOn(s.composite,'drawSource'),calls=draw.mock.calls.length
  expect(first.takeRenderedPrefix(renderedIdentity,cursor)).toBe(cursor)
  expect(draw.mock.calls.length).toBe(calls);expect(first['planned']).toBeUndefined()
  const resumed=s.create({candidateReplay7:'textured7-buildup-v1',layer:()=>({buffer:next,epoch:0})})
  resumed.resumeRenderedPrefix(cursor);expect(resumed['planned']).toBe(state)
  const empty=buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},c).frame
  resumed.enqueue({...input,ordinal:1,frame:empty,composition:{...input.composition,mode:'buildup'}});s.drain()
  expect(resumed['planned']?.nextFrameOrdinal).toBe(2);expect(draw.mock.calls.length).toBe(calls)
  resumed.retireRenderedPrefix({...renderedIdentity,nextFrameOrdinal:2});cursor.release()
  expect(s.poison).not.toHaveBeenCalled();expect(()=>resumed.resumeRenderedPrefix(cursor)).toThrow()
 }finally{clock.mockRestore();cursor.release();next.destroy();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('rendered tail LAST OPEN append skips accepted prefix commands while full replay remains the oracle',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const author=s.author('tail-cursor'),first=mixedOpenOperation(s,'tail-cursor')
  expect(s.coordinator.tryEnqueueLocal(author,first)).toBe(true);s.publish(mixedReady(s))
  expect(s.coordinator['renderedTail']?.ready).toBe(true);expect(s.coordinator['replayWork']).toBeUndefined()
  const draw=vi.spyOn(s.composite,'drawSource')
  expect(s.coordinator.tryEnqueueLocal(author,s.operation('tail-cursor',1,true))).toBe(true)
  s.publish(mixedReady(s))
  const textured=draw.mock.calls.filter(([request])=>request.source.kind==='texturedMaskRgb')
  expect(textured).toHaveLength(0);expect(s.coordinator['renderedTail']?.groups.at(-1)?.frames).toHaveLength(2)
  expect(s.coordinator.poisoned).toBe(false)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

function renderedSuffix7(c:CanonicalMaterialContextV7,group:number){
 const f=renderedOpen7(c)
 return buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:f.draws.map(d=>({recipe:f.definitions[d.definition],role:'primary',x:d.x,y:d.y,opacity:d.opacity*.5,flow:d.flow,grainDepth:d.grainDepth})),fences:f.fences.map(fence=>'group'in fence?{...fence,group}:fence)},c).frame
}
function tailSuffixOperation(s:ReturnType<typeof replayConsumer7>,name:string,ordinal:number){
 const op=s.operation(name,ordinal),c=context7('defaultAuto')
 return Object.freeze({...op,frame:{...op.frame,materialPacked:packCanonicalTexturedAutoMaterial(renderedSuffix7(c,ordinal),c)}})
}
it('rendered tail nonempty suffix preserves full command strengths and reduces actual prefix drawing',()=>{
 const full=replayConsumer7(undefined,true),inc=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 const fullDraw=vi.spyOn(full.composite,'drawSource'),incDraw=vi.spyOn(inc.composite,'drawSource'),authors=new Map([[full,full.author('prefix')],[inc,inc.author('prefix')]])
 const paint=(spy:typeof fullDraw)=>spy.mock.calls.flatMap(([r])=>r.source.kind==='texturedMaskRgb'?[{strength:r.source.strengthU8,operation:r.operation}]:[])
 try{
  for(const s of[full,inc])expect(s.coordinator.tryEnqueueLocal(authors.get(s)!,mixedOpenOperation(s,'prefix'))).toBe(true)
  inc.publish(mixedReady(inc));const prefix=paint(incDraw);incDraw.mockClear()
  for(const s of[full,inc])expect(s.coordinator.tryEnqueueLocal(authors.get(s)!,tailSuffixOperation(s,'prefix',1))).toBe(true)
  full.publish(mixedReady(full));inc.publish(mixedReady(inc))
  const suffix=paint(incDraw),all=paint(fullDraw)
  expect(prefix.length).toBeGreaterThan(0);expect(suffix.length).toBeGreaterThan(0)
  expect([...prefix,...suffix]).toEqual(all);expect(suffix.length).toBeLessThan(all.length)
  expect(inc.coordinator['renderedTail']?.groups.at(-1)?.frames).toHaveLength(2)
  expect(full.coordinator.poisoned||inc.coordinator.poisoned).toBe(false)
 }finally{clock.mockRestore();inc.close();full.close()}
 expect(inc.cpu.reservedBytes).toBe(0);expect(full.cpu.reservedBytes).toBe(0)
})
it('rendered cursor rejects released, foreign receiver and SAME previous visible target without state mutation',()=>{
 const c=context7('softAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0),cursor=prepareRenderedPrefixCursor7(s.cpu)
 try{
  const e=s.create({candidateReplay7:'textured7-buildup-v1'}),input=submission7(c)
  e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}});s.drain();e.takeRenderedPrefix(renderedIdentity,cursor)
  const destination=s.create({candidateReplay7:'textured7-buildup-v1'})
  expect(()=>Reflect.apply(destination.resumeRenderedPrefix,{...destination},[cursor])).toThrow()
  expect(()=>destination.resumeRenderedPrefix(cursor)).toThrow('target changed');expect(destination['planned']).toBeUndefined()
  expect(()=>Reflect.apply(cursor.release,{},[])).toThrow();cursor.release();cursor.release()
  expect(()=>destination.resumeRenderedPrefix(cursor)).toThrow();expect(destination['planned']).toBeUndefined();expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();cursor.release();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('rendered tail SAME paint promotion preserves suffix reuse; additional group falls back and releases old checkpoint',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const author=s.author('promoted-tail'),first=mixedOpenOperation(s,'promoted-tail')
  s.coordinator.tryEnqueueLocal(author,first);s.publish(mixedReady(s));const checkpoint=s.coordinator['renderedTail']
  expect(checkpoint?.ready).toBe(true)
  s.coordinator.enqueueRecorded(s.recorded(first,1))
  expect(s.coordinator['renderedTail']).toBe(checkpoint)
  const draw=vi.spyOn(s.composite,'drawSource')
  s.coordinator.tryEnqueueLocal(author,s.operation('promoted-tail',1,true));s.publish(mixedReady(s))
  expect(draw.mock.calls.filter(([r])=>r.source.kind==='texturedMaskRgb')).toHaveLength(0)
  const second=s.coordinator['renderedTail'];expect(second?.ready).toBe(true)
  s.coordinator.enqueueRecorded(s.recorded(s.operation('earlier-original'),2))
  // A later original group is not FIRST reorder: fallback owns old P until publication.
  expect(second?.retired).toBe(false);draw.mockClear();s.publish(mixedReady(s))
  expect(draw.mock.calls.filter(([r])=>r.source.kind==='texturedMaskRgb').length).toBeGreaterThan(0)
  expect(second?.retired).toBe(true);expect(s.coordinator.poisoned).toBe(false)
 }finally{clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('cursor precharge reserves before allocation and take rejects callback release without terminal mutation',()=>{
 const tiny=new BrushMipCache(1023);expect(()=>prepareRenderedPrefixCursor7(tiny)).toThrow();expect(tiny.reservedBytes).toBe(0)
 const c=context7('defaultAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0),cursor=prepareRenderedPrefixCursor7(s.cpu)
 let armed=false
 try{
  const e=s.create({candidateReplay7:'textured7-buildup-v1',layer:()=>{if(armed){armed=false;cursor.release()}return{buffer:s.layer,epoch:0}}}),input=submission7(c)
  e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}});s.drain()
  const planned=e['planned'];armed=true;expect(()=>e.takeRenderedPrefix(renderedIdentity,cursor)).toThrow()
  expect(e['planned']).toBe(planned);expect(e['candidateTerminal']).toBe(false);expect(s.poison).not.toHaveBeenCalled()
  e.retireRenderedPrefix(renderedIdentity)
 }finally{clock.mockRestore();cursor.release();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('twenty rendered handoffs retain one cursor metadata reservation and release every previous4096',()=>{
 const c=context7('softAuto'),s=fixture(true,true,G,true,c),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 const other=new TiledLayerBuffer(s.gl,4,4,undefined,undefined,undefined,'straight-rgba8'),baseline=s.cpu.reservedBytes,input=submission7(c)
 let cursor=prepareRenderedPrefixCursor7(s.cpu),destination=s.layer
 try{
  let e=s.create({candidateReplay7:'textured7-buildup-v1'})
  e.enqueue({...input,frame:renderedOpen7(c),composition:{...input.composition,mode:'buildup'}});s.drain();e.takeRenderedPrefix(renderedIdentity,cursor)
  const held=s.cpu.reservedBytes;expect(held-baseline).toBe(5120)
  const empty=buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},c).frame
  for(let ordinal=1;ordinal<=20;ordinal++){
   destination=destination===s.layer?other:s.layer
   const target=destination,next=prepareRenderedPrefixCursor7(s.cpu)
   try{
    e=s.create({candidateReplay7:'textured7-buildup-v1',layer:()=>({buffer:target,epoch:0})})
    e.resumeRenderedPrefix(cursor);cursor.release();cursor=next
    e.enqueue({...input,ordinal,frame:empty,composition:{...input.composition,mode:'buildup'}});s.drain()
    e.takeRenderedPrefix({...renderedIdentity,nextFrameOrdinal:ordinal+1},cursor)
    expect(s.cpu.reservedBytes).toBe(held);expect(e['planned']).toBeUndefined()
   }catch(error){next.release();throw error}
  }
  cursor.release();expect(s.cpu.reservedBytes).toBe(baseline);expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();cursor.release();other.destroy();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('optional CPU owners reclaim once before real mandatory reserve; reentry and undefined cleanup remain fatal',()=>{
 const cpu=new BrushMipCache(32),a=cpu.reserve(16),b=cpu.reserve(8),calls:string[]=[]
 const offA=cpu.registerOptionalReclaim(()=>{calls.push('a');a();expect(()=>cpu.reserve(1)).toThrow('during');expect(()=>cpu.registerOptionalReclaim(()=>{})).toThrow('busy');throw undefined})
 const offB=cpu.registerOptionalReclaim(()=>{calls.push('b');b()})
 let failed=false;try{cpu.reserve(16)}catch(error){failed=true;expect(error).toBeUndefined()}
 expect(failed).toBe(true);expect(calls).toEqual(['a','b']);expect(cpu.reservedBytes).toBe(0);offA();offB()
 const release=cpu.reserve(32);expect(cpu.reservedBytes).toBe(32);release();expect(calls).toEqual(['a','b'])
})
it('late external mandatory CPU reserve evicts idle checkpoint and preserves normal full replay and old P',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let release:(()=>void)|undefined
 try{
  const author=s.author('external-pressure');s.coordinator.tryEnqueueLocal(author,mixedOpenOperation(s,'external-pressure'));s.publish(mixedReady(s))
  const cp=s.coordinator['renderedTail'],old=s.currentPresentation();expect(cp?.ready).toBe(true)
  const request=s.cpu.budgetBytes-s.cpu.reservedBytes+1;release=s.cpu.reserve(request)
  expect(cp?.preempted).toBe(true);expect(cp?.retired).toBe(true);expect(s.coordinator['renderedTail']).toBeUndefined();expect(s.currentPresentation()).toBe(old)
  release();release=undefined
  const draw=vi.spyOn(s.composite,'drawSource');s.coordinator.tryEnqueueLocal(author,s.operation('external-pressure',1,true));s.publish(mixedReady(s))
  expect(draw.mock.calls.filter(([r])=>r.source.kind==='texturedMaskRgb').length).toBeGreaterThan(0);expect(s.coordinator.poisoned).toBe(false)
 }finally{release?.();clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('real constructor boundary pressure preempts old cursor before pixels and chooses full stable replay',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let held:(()=>void)|undefined,armed=false,hit=0
 const reserve=s.cpu.reserve.bind(s.cpu),spy=vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{
  if(armed&&bytes===4096){armed=false;hit++;held=reserve(s.cpu.budgetBytes-s.cpu.reservedBytes-4095)
   try{return reserve(bytes)}finally{held();held=undefined}
  }
  return reserve(bytes)
 })
 try{
  const author=s.author('constructor-pressure');s.coordinator.tryEnqueueLocal(author,mixedOpenOperation(s,'constructor-pressure'));s.publish(mixedReady(s))
  const cp=s.coordinator['renderedTail'],draw=vi.spyOn(s.composite,'drawSource');expect(cp?.ready).toBe(true)
  s.coordinator.tryEnqueueLocal(author,s.operation('constructor-pressure',1,true));armed=true;s.publish(mixedReady(s))
  expect(hit).toBe(1);expect(cp?.preempted).toBe(true)
  expect(draw.mock.calls.filter(([r])=>r.source.kind==='texturedMaskRgb').length).toBeGreaterThan(0);expect(s.coordinator.poisoned).toBe(false)
 }finally{held?.();spy.mockRestore();clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('actual optional root cleanup fault preserves undefined, poisons coordinator and reclaims other owners',()=>{
 const s=replayConsumer7(undefined,true),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let extra:(()=>void)|undefined,armed=false,injected=0
 const original=s.cpu.reserve.bind(s.cpu),spy=vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{
  const release=original(bytes)
  // Frozen real root cannot be monkeypatched. Inject the fault through its
  // actual2048 CPU-header release, identified at the real CP retain callsite.
  if(bytes===2048&&new Error().stack?.includes('prepareRenderedTailOwned')){injected++;return()=>{release();if(armed)throw undefined}}
  return release
 })
 try{
  s.coordinator.tryEnqueueLocal(s.author('cleanup-pressure'),mixedOpenOperation(s,'cleanup-pressure'));s.publish(mixedReady(s))
  const cp=s.coordinator['renderedTail'];if(!cp)throw Error('checkpoint required')
  expect(injected).toBe(1);armed=true
  extra=s.cpu.reserve(8);const free=extra,other=vi.fn(()=>free());const off=s.cpu.registerOptionalReclaim(other)
  let caught=false;try{s.cpu.reserve(s.cpu.budgetBytes-s.cpu.reservedBytes+1)}catch(error){caught=true;expect(error).toBeUndefined()}
  expect(caught).toBe(true);expect(other).toHaveBeenCalledTimes(1);off();expect(s.coordinator.poisoned).toBe(true);expect(cp.retired).toBe(true)
 }finally{armed=false;spy.mockRestore();extra?.();clock.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
