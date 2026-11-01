import {expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,canonicalDefaultAutoSourcePin,canonicalPressureTexturedSourceMaterialContext,buildCanonicalMaterial,sourceAutoGeometry,type CanonicalMaterialContextV5} from '@grafetto/shared'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalFrameExecutor,canonicalExecutorOperations,type CanonicalFrameSubmissionV5,type CanonicalFrameExecutorOptions} from './CanonicalFrameExecutor'
import {CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
const pattern={id:'asset:'+'b'.repeat(64),size:8,x:0,y:0,width:4,height:4}
function context(profile:typeof G|typeof B=G):CanonicalMaterialContextV5{return canonicalPressureTexturedSourceMaterialContext({version:5,assets:[pattern],primarySource:canonicalDefaultAutoSourcePin({kind:'defaultAuto',descriptorId:'fixed-fixture',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'defaultAuto',generator:'default',shape:'circle',diameter:4,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1},brushScale:1,brushAngle:0,coverageProfile:profile===B?'browser-number-coverage-v1':'neon64-f32-fma-v1'}),primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:1,offsetY:2,strength:'source-pressure-curve-v1'},budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})}
function decoded(profile:typeof G|typeof B=G){const c=context(profile),g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:4,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0}),recipe={kind:'defaultAuto' as const,source:c.primarySource.source,coverageProfile:c.primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false};return buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[0,4,8].map(x=>({recipe,role:'primary' as const,x,y:0,opacity:.75,flow:.7,grainDepth:x===0?0:x===4?.5:1})),fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:3,group:0},{kind:'segmentEnd',at:3,group:0},{kind:'gestureEnd',at:3}]},c).frame}
function fixture(variant=true,rawCompanion=true,profile:typeof G|typeof B=G){
 const{gl,snapshot}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache()
 gl.LUMINANCE=0x1909;gl.TEXTURE1=gl.TEXTURE0+1;gl.STATIC_DRAW=9001;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002;gl.LINEAR=9010;gl.REPEAT=9011
 gl.getShaderPrecisionFormat=()=>({precision:23,rangeMin:127,rangeMax:127});gl.texSubImage2D=vi.fn();gl.copyTexSubImage2D=vi.fn();gl.copyTexImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn()
 const attrib=gl.getAttribLocation;gl.getAttribLocation=(p:unknown,n:string)=>n==='position'?0:attrib(p,n)
 const attachments=new Map(),attach=gl.framebufferTexture2D;gl.framebufferTexture2D=(...args:unknown[])=>{attachments.set(gl.getParameter(gl.FRAMEBUFFER_BINDING),args[3]);attach(...args)};gl.getFramebufferAttachmentParameter=()=>attachments.get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
 const parameters=new Map(),set=gl.texParameteri;gl.texParameteri=(t:number,n:number,v:number)=>{const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);if(!parameters.has(texture))parameters.set(texture,new Map());parameters.get(texture).set(n,v);set(t,n,v)};gl.getTexParameter=(_:number,n:number)=>parameters.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(n)??gl.NEAREST
 const c=context(profile),bank=new CanonicalMaskSourceBank(gl,cache,cpu,[],{gpuBytes:0,cpuBytes:0},undefined,'root-residency'),p=bank.prepareRoot([{kind:'raw-pattern-l8',asset:pattern,pin:c.primaryTexture,readOriginalGray:()=>Uint8Array.from({length:64},(_,i)=>i*3)}],{gpuBytes:0,cpuBytes:0});p.jobs.forEach((_,i)=>p.prepareJob(i));p.assertPreparedPublication();const root=p.publish()
 const prepass=new TransformedMaskPrepass(gl,cache,cpu,'exec-texture');prepass.prepare({width:8,height:8,slots:1},root.preparedResources())
 // Existing default capacity-record metadata is lazy and retained until prepass reset.
 const warm=prepass.retainPreparedCapacity();warm.release()
 const composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'exec-texture-composite'),raw=p.jobs.filter(j=>j.kind==='raw-pattern-l8').map(({key,bytes})=>({key,bytes}))
 composite.prepare({width:4,height:4,operations:canonicalExecutorOperations(profile),...(variant?{texturedOperations:[profile===B?'alphaDarkenBrowserFloat':'alphaDarken32FusedScalar']}:{})},[...root.preparedResources(),...prepass.preparedResources(),...rawCompanion?raw:[]])
 const scratch=new RibbonScratchPool(gl),layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8'),reserve=vi.fn(()=>()=>{}),poison=vi.fn(),changed=vi.fn()
 const options:CanonicalFrameExecutorOptions={rasterProfile:profile,autoSource:c.primarySource,bank:root,primaryTexture:{context:c,root},prepass,composite,scratch,layer:()=>({buffer:layer,epoch:0}),pageBounds:{minX:0,minY:0,maxX:32,maxY:16},reserveTransient:reserve,changed,poison}
 let executor:CanonicalFrameExecutor|undefined
 const create=(override:Partial<CanonicalFrameExecutorOptions>={})=>(executor=new CanonicalFrameExecutor({...options,...override}))
 const submission=(frame=decoded(profile),ordinal=0):CanonicalFrameSubmissionV5=>({gestureId:'gesture',layerId:'layer',layerEpoch:0,ordinal,frame,assets:c.assets,rgb:[200,20,50],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'}})
 const drain=()=>{let turns=0;while(executor!.pending){if(++turns>1000)throw Error('executor stalled');executor!.advance()}}
 const close=()=>{executor?.cancel();layer.destroy();scratch.destroy();prepass.reset();composite.reset();root.release();bank.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)}
 return{gl,cache,cpu,c,bank,root,prepass,composite,scratch,layer,options,create,submission,drain,close,reserve,poison,changed,snapshot}
}

it.each([G,B])('admits standalone5 SAME source/root and draws recorded quantized strength under exact profile %s',profile=>{
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
it('keeps immutable accepted5 capture and releases all resources on source invalidation',()=>{
 const s=fixture();try{const e=s.create(),frame=decoded();e.enqueue(s.submission(frame));Reflect.set(frame.draws[0],'grainDepth',0);s.bank.reset();expect(()=>e.advance()).toThrow();e.cancel()}finally{s.close()}
})

it('captures every material5 strength independently of later DTO mutation',()=>{const s=fixture();const clock=vi.spyOn(performance,'now').mockReturnValue(0);try{const e=s.create(),frame=decoded(),draw=vi.spyOn(s.composite,'drawSource');e.enqueue(s.submission(frame));for(const d of frame.draws)Reflect.set(d,'grainDepth',1);s.drain();const actual=draw.mock.calls.map(([r])=>r.source).filter(r=>r.kind==='texturedMaskRgb');expect(new Set(actual.map(r=>r.kind==='texturedMaskRgb'?r.strengthU8:-1))).toEqual(new Set([0,128,255]));}finally{clock.mockRestore();s.close()}})

it('rejects cross4/5 profile and insufficient texture work before target reservation',()=>{const s=fixture();try{const e=s.create(),frame=decoded(),before=s.cpu.reservedBytes;Reflect.set(frame,'profile','canonical-textured-source-material-v4');expect(()=>e.enqueue(s.submission(frame))).toThrow();expect(s.cpu.reservedBytes).toBe(before);expect(s.reserve).not.toHaveBeenCalled();}finally{s.close()}const t=fixture();try{const limited=canonicalPressureTexturedSourceMaterialContext({...t.c,budget:{...t.c.budget,workUnits:1}});const e=t.create({primaryTexture:{context:limited,root:t.root}}),before=t.cpu.reservedBytes;expect(()=>e.enqueue(t.submission())).toThrow();expect(t.cpu.reservedBytes).toBe(before);expect(t.reserve).not.toHaveBeenCalled();expect(e.pending).toBe(false);}finally{t.close()}})
