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
