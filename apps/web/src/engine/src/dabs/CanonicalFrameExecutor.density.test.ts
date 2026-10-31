import {CanonicalFrameExecutor,canonicalExecutorOperations} from './CanonicalFrameExecutor'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
import {describe,it,expect,vi} from 'vitest'
import {CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_MATERIAL_LIMITS,buildCanonicalMaterial,type CanonicalDefaultAutoRecipe,type CanonicalDefaultAutoSource} from '@grafetto/shared'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {TransformedMaskPrepass,transformedMaskPrepassBudget,type CanonicalAutoMaskRequest} from './TransformedMaskPrepass'
import {canonicalAutoMaskRevision,prepareCanonicalAutoMask} from './TransformedMaskPlan'
import {prepareSourceSeededDefaultAutoDab,sourceDefaultAutoDab,prepareSourceDefaultAutoDensity} from '../presets/sourceDefaultAutoDab'
import {MAX_SOURCE_DENSITY_GESTURE_ID,createSourceDefaultAutoDensityRandom} from '../presets/sourceDefaultAutoDensitySeed'
const identity=(drawOrdinal=0)=>({gestureId:'original-gesture',descriptorSha256:'a'.repeat(64),role:'primary' as const,drawOrdinal})
const source={kind:'defaultAuto',generator:'default',shape:'rect',diameter:180,ratio:.9,horizontalFade:.9,verticalFade:.9,antialias:false,spikes:2,randomness:0,density:.8} as const
const request=()=>({dialect:'krita-default-auto-qt5-arm64-v1' as const,tip:{...source,kind:'auto' as const,softness:1 as const,spikes:2 as const},storedScale:1,storedAngle:0,shape:{scale:1,ratio:1,rotation:0},subpixelX:0,subpixelY:0,coverageProfile:D,maxPixels:1048576,maxWorkSamples:16*1048576})
function expected(ordinal=0){
 const mask=sourceDefaultAutoDab({...request(),coverageProfile:'neon64-f32-fma-v1',tip:{...request().tip,density:1}}).mask
 const rng=createSourceDefaultAutoDensityRandom(identity(ordinal)),cursor=prepareSourceDefaultAutoDensity(mask,.8,()=>rng.generateNormalized())
 while(!cursor.done)cursor.advance(127)
 return mask
}
function material(ordinal=0){
 const base=sourceDefaultAutoDab({...request(),coverageProfile:'neon64-f32-fma-v1',tip:{...request().tip,density:1}})
 const [width,height]=base.geometry.maskSize
 const pin:CanonicalDefaultAutoSource={kind:'defaultAuto',descriptorId:'behavior',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source,brushScale:1,brushAngle:0,coverageProfile:D}
 const recipe:CanonicalDefaultAutoRecipe={kind:'defaultAuto',source,coverageProfile:D,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width,height,mirrorH:false,mirrorV:false}
 return{kind:'canonicalAuto' as const,recipe,trustedSource:pin,densityIdentity:identity(ordinal)}
}
describe('seeded density actual stripe material consumer',()=>{
 it('keeps total base+density work bounded and output independent of stripe and sample cuts',()=>{
  const render=(stripe:number,quantum:number)=>{
   const {evaluator}=prepareSourceSeededDefaultAutoDab(request(),identity()),mask=new Uint8Array(evaluator.pixels),target=new Uint8Array(stripe)
   let filled=0,out=0,work=0
   while(!evaluator.done){const step=evaluator.advance(target,filled,quantum);expect(step.consumed).toBeLessThanOrEqual(quantum);work+=step.consumed;filled+=step.written
    if(filled===target.length||step.done){mask.set(target.subarray(0,filled),out);out+=filled;filled=0}}
   expect(out).toBe(mask.length);expect(evaluator.workSamples).toBe(work)
   expect(work).toBe(evaluator.pixels*2)
   return mask
  }
  expect(render(180*20,1)).toEqual(expected())
  expect(render(180*7,37)).toEqual(expected())
 })
 it('uploads full row-major density masks through the existing prepass and separates equal-shaped dabs',()=>{
  const {gl}=recordingGL(),cpu=new BrushMipCache(),cache=new BrushTextureCache(gl),pass=new TransformedMaskPrepass(gl,cache,cpu,'density')
  const uploads:number[]=[];gl.texSubImage2D=vi.fn((...args:unknown[])=>{const w=args[4] as number,h=args[5] as number,b=args[8] as Uint8Array;for(let i=0;i<w*h;i++)uploads.push(b[i*4])})
  pass.prepare({width:256,height:256,slots:1},[])
  expect(cpu.reservedBytes).toBeGreaterThanOrEqual(2*MAX_SOURCE_DENSITY_GESTURE_ID+512)
  try{const owner={},base=cpu.reservedBytes
   for(const ordinal of [0,1,0]){
    uploads.length=0;const m=material(ordinal),r:CanonicalAutoMaskRequest={owner,role:'primary',profile:'neon4-summed-wordsize64',rect:{x:0,y:0,width:m.recipe.width,height:m.recipe.height},material:m}
    expect(pass.beginAutoGeneration(r)).toBe(false)
    while(true){const step=pass.advanceAutoGeneration(64);expect(step.consumed).toBeLessThanOrEqual(64);if(step.done)break}
    expect(new Uint8Array(uploads)).toEqual(expected(ordinal));expect(cpu.reservedBytes).toBe(base)
    expect(pass.beginAutoGeneration(r)).toBe(true)
   }
   expect(canonicalAutoMaskRevision(material(0))).not.toBe(canonicalAutoMaskRevision(material(1)))
   expect(expected(0)).not.toEqual(expected(1))
   pass.releaseOwner(owner)
  }finally{pass.reset();cache.clear()}
  expect(cpu.reservedBytes).toBe(0)
 })
 it('rejects missing identity and releases cancellation/failure stripe ownership without replay drift',()=>{
  const {gl}=recordingGL(),cpu=new BrushMipCache(),cache=new BrushTextureCache(gl),pass=new TransformedMaskPrepass(gl,cache,cpu,'cancel-density')
  pass.prepare({width:256,height:256,slots:1},[])
  const m=material(),r:CanonicalAutoMaskRequest={owner:{},role:'primary',profile:'neon4-summed-wordsize64',rect:{x:0,y:0,width:m.recipe.width,height:m.recipe.height},material:m}
  try{expect(()=>prepareCanonicalAutoMask({...m,densityIdentity:undefined})).toThrow()
   expect(()=>prepareCanonicalAutoMask({...m,densityIdentity:{...identity(),descriptorSha256:'b'.repeat(64)}})).toThrow()
   const baseline=cpu.reservedBytes
   expect(()=>pass.beginAutoGeneration({...r,role:'mask'})).toThrow('primary role')
   pass.beginAutoGeneration(r);pass.advanceAutoGeneration(1);pass.cancelAutoGeneration();expect(cpu.reservedBytes).toBe(baseline)
   pass.beginAutoGeneration(r);gl.texSubImage2D=vi.fn(()=>{throw Error('upload')})
   expect(()=>{while(!pass.advanceAutoGeneration(64).done){}}).toThrow('upload');expect(cpu.reservedBytes).toBe(baseline)
  }finally{pass.reset();cache.clear()}
  expect(cpu.reservedBytes).toBe(0)
 })
})

it('derives the replayed physical ordinal before clipping in the actual executor across empty frames',()=>{
 const run=(empty:boolean)=>{
  const {gl}=recordingGL(),cpu=new BrushMipCache(),cache=new BrushTextureCache(gl),m=material(),captured:number[]=[]
  gl.TEXTURE1=gl.TEXTURE0+1;gl.STATIC_DRAW=9001;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002;gl.LINEAR=9010;gl.REPEAT=9011
  gl.copyTexSubImage2D=vi.fn();gl.copyTexImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn();gl.isContextLost=()=>false
  const attrib=gl.getAttribLocation;gl.getAttribLocation=(p:unknown,n:string)=>n==='position'?0:attrib(p,n)
  const attachments=new Map(),attach=gl.framebufferTexture2D
  gl.framebufferTexture2D=(...args:unknown[])=>{attachments.set(gl.getParameter(gl.FRAMEBUFFER_BINDING),args[3]);attach(...args)}
  gl.getFramebufferAttachmentParameter=()=>attachments.get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
  const parameters=new Map(),set=gl.texParameteri
  gl.texParameteri=(t:number,n:number,v:number)=>{const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);if(!parameters.has(texture))parameters.set(texture,new Map());parameters.get(texture).set(n,v);set(t,n,v)}
  gl.getTexParameter=(_:number,n:number)=>parameters.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(n)??gl.NEAREST
  gl.texSubImage2D=vi.fn((...args:unknown[])=>{const w=args[4] as number,h=args[5] as number,b=args[8] as Uint8Array;if(w===m.recipe.width)for(let i=0;i<w*h;i++)captured.push(b[i*4])})
  const prepass=new TransformedMaskPrepass(gl,cache,cpu,'exec-density'),composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'exec-density-composite'),scratch=new RibbonScratchPool(gl),layer=new TiledLayerBuffer(gl,256,256,undefined,undefined,undefined,'straight-rgba8')
  prepass.prepare({width:256,height:256,slots:1},[])
  composite.prepare({width:256,height:256,operations:canonicalExecutorOperations(G)},prepass.preparedResources())
  const executor=new CanonicalFrameExecutor({rasterProfile:G,autoSource:m.trustedSource,prepass,composite,scratch,pageBounds:{minX:0,minY:0,maxX:256,maxY:256},layer:()=>({buffer:layer,epoch:0}),reserveTransient:()=>()=>{},changed:()=>{},poison:()=>{}})
  const context={version:2 as const,assets:[],primarySource:m.trustedSource,budget:CANONICAL_MATERIAL_LIMITS}
  let ordinal=0
  const submit=(x:number|undefined,begin:boolean,end:boolean)=>{
   const count=x===undefined?0:1
   const frame=buildCanonicalMaterial({masked:false,entry:begin?{phase:'between'}:{phase:'primary',group:0},draws:x===undefined?[]:[{recipe:m.recipe,role:'primary',x,y:0,opacity:1,flow:1}],fences:[...(begin?[{at:0,kind:'segmentBegin' as const,group:0}]:[]),...(end?[{at:count,kind:'primaryEnd' as const,group:0},{at:count,kind:'segmentEnd' as const,group:0},{at:count,kind:'gestureEnd' as const}]:[])]},context).frame
   executor.enqueue({gestureId:identity().gestureId,layerId:'layer',layerEpoch:0,ordinal:ordinal++,frame,assets:[],rgb:[0,0,0],composition:{mode:'buildup',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'}})
   let turns=0;while(executor.pending){if(++turns>10000)throw Error('stalled');executor.advance()}
  }
  try{submit(-1000,true,false);if(empty)submit(undefined,false,false);submit(0,false,true);expect(executor.checkpointReady).toBe(true);return new Uint8Array(captured)}
  finally{executor.cancel();layer.destroy();scratch.destroy();prepass.reset();composite.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)}
 }
 expect(run(false)).toEqual(expected(1));expect(run(true)).toEqual(expected(1))
})
it('cancels pending quantized spans and rejects retargeting without publishing unthinned pixels',()=>{
 const a=prepareSourceSeededDefaultAutoDab(request(),identity()).evaluator,target=new Uint8Array(7)
 const first=a.advance(target,0,1);expect(first.written).toBe(0);expect(first.consumed).toBe(1)
 expect(()=>a.advance(new Uint8Array(7),0,1)).toThrow('stripe changed')
 expect(()=>a.advance(target,0,1)).toThrow('cancelled')
 const b=prepareSourceSeededDefaultAutoDab(request(),identity()).evaluator
 b.advance(target,0,1);b.cancel();expect(()=>b.advance(target,0,1)).toThrow('cancelled')
 const full=request(),all=prepareSourceSeededDefaultAutoDab({...full,tip:{...full.tip,density:1}},identity()).evaluator
 const mask=new Uint8Array(all.pixels);while(!all.done)all.advance(mask,all.completedPixels,23)
 expect(all.workSamples).toBe(all.pixels)
 expect(mask).toEqual(sourceDefaultAutoDab({...full,coverageProfile:'neon64-f32-fma-v1',tip:{...full.tip,density:1}}).mask)
})

it('keeps maximum identity revision compact and reserves fixed slot metadata before GL allocation',()=>{
 const maximum={...material(),densityIdentity:{...identity(),gestureId:'x'.repeat(MAX_SOURCE_DENSITY_GESTURE_ID)}}
 expect(canonicalAutoMaskRevision(maximum).length).toBeLessThan(2048)
 const limits={width:256,height:256,slots:1},budget=transformedMaskPrepassBudget(limits)
 const {gl}=recordingGL(),cpu=new BrushMipCache(budget.cpuBytes-1),cache=new BrushTextureCache(gl),pass=new TransformedMaskPrepass(gl,cache,cpu,'budget-density')
 try{expect(()=>pass.prepare(limits,[])).toThrow('budgets');expect(gl.texImage2D).not.toHaveBeenCalled();expect(cpu.reservedBytes).toBe(0)}
 finally{pass.reset();cache.clear()}
})
