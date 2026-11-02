/// <reference types="node" />
import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import defaultData from './fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json' with {type:'json'}
import softData from './fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json' with {type:'json'}
import gaussianData from './fixtures/sourceGaussianAutoData/pencil3.texture-pressure.compiled3.metadata.json' with {type:'json'}
import type {BrushDescriptor} from './brushes.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {canonicalDefaultAutoPressureTextureSourceBinding,canonicalGaussianAutoSourcePin,canonicalAutoCost} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoNativeDefaultTextureSourceBinding,canonicalSoftAutoCost} from './canonicalSoftAutoMaterial.js'
import {sourceAutoGeometry} from './sourceAutoGeometry.js'
import * as c from './canonicalMaterialCodec.js'
import {decodeCanonicalTexturedAutoStrokeFrame,decodeCanonicalStrokeFrame,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,CANONICAL_STROKE_RASTER_PROFILE as OLD} from './canonicalStrokeFrame.js'
import {canonicalStandaloneStrokeSnapshotV7} from './canonicalTexturedAutoStandalone.js'
import type {CanonicalStrokeSnapshot} from './canonicalStrokeOperation.js'
import {canonicalRecordedPrimaryTexturePin,canonicalPrimaryTexturePin,canonicalFixedPrimaryTexturePin,canonicalPressureCurvePrimaryTexturePin} from './canonicalPrimaryTexture.js'
import {canonicalStrokeSnapshotV6} from './canonicalRecordedAttachment.js'
type Kind='defaultAuto'|'softAuto'|'gaussianAuto'
const asset={id:'asset:'+'cd'.repeat(32),size:64,x:0,y:0,width:51,height:51}
const sha=(d:BrushDescriptor)=>createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex')
function source(kind:Kind,browser=false):c.CanonicalTexturedAutoSource {
 const profile=browser?B:G,coverage=browser?'browser-number-coverage-v1':'neon64-f32-fma-v1'
 if(kind==='defaultAuto'){const d=defaultData.descriptor as unknown as BrushDescriptor;return canonicalDefaultAutoPressureTextureSourceBinding(d,sha(d),coverage,defaultData.patternAsset,profile)}
 if(kind==='softAuto'){const d=softData.descriptor as unknown as BrushDescriptor;return canonicalSoftAutoNativeDefaultTextureSourceBinding(d,sha(d),coverage,softData.patternAsset,profile)}
 // Structural source pin from real metadata, NOT a new Gaussian texture binder/grant.
 const d=gaussianData.descriptor as unknown as BrushDescriptor,data=d.sourceStamp!
 if(data.version!==2||data.source.kind!=='gaussianAuto')throw Error('fixture family')
 return canonicalGaussianAutoSourcePin({kind:'gaussianAuto',descriptorId:d.id,descriptorVersion:d.version,descriptorSha256:sha(d),source:data.source,brushScale:data.brush.scale,brushAngle:data.brush.angle,coverageProfile:coverage})
}
function context(kind:Kind,browser=false):c.CanonicalMaterialContextV7 {return c.canonicalTexturedAutoMaterialContext({version:7,assets:[asset],primarySource:source(kind,browser),primaryTexture:{kind:'canvasTexture',asset:asset.id,law:'subtract-u8-v1',width:51,height:51,periodX:51,periodY:51,phase:{kind:'resolved-stroke-phase-v1',x:50,y:37},strength:'recorded-grain-v1'},budget:{workUnits:64000000,outputBytes:16000000,drawPixels:16000000}})}
function recipe(pin:c.CanonicalTexturedAutoSource):c.CanonicalTexturedAutoRecipe {
 const g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:.1,ratio:1,rotation:0},.25,.5)
 const common={source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:.1,ratio:1,rotation:-0,subX:.25,subY:.5,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:true}
 if(pin.kind==='softAuto')return {...common,kind:'softAuto',sourceSlot:0,source:pin.source,coverageProfile:pin.coverageProfile}
 return pin.kind==='defaultAuto'?{...common,kind:'defaultAuto',source:pin.source,coverageProfile:pin.coverageProfile}:{...common,kind:'gaussianAuto',source:pin.source,coverageProfile:pin.coverageProfile}
}
function input(context:c.CanonicalMaterialContextV7):c.CanonicalMaterialBuildInputV7 {const r=recipe(context.primarySource);return {masked:false,entry:{phase:'between'},draws:[-0,.5,1].map((grainDepth,i)=>({role:'primary',recipe:r,x:-19+i,y:-7,opacity:.75,flow:.5,grainDepth})),fences:[{at:0,kind:'segmentBegin',group:9},{at:3,kind:'primaryEnd',group:9},{at:3,kind:'segmentEnd',group:9},{at:3,kind:'gestureEnd'}]}}
const empty={masked:false as const,entry:{phase:'between' as const},draws:[],fences:[]}
const composition={mode:'wash' as const,alphaDarken:'hard' as const,outerResourceOpacity:1,outerBlend:'over' as const}
function trusted(context:c.CanonicalMaterialContextV7,browser=false){return{materialVersion:7 as const,rasterProfile:browser?B:G,brush:'brush:'+context.primarySource.descriptorId+'@'+context.primarySource.descriptorVersion,strokeId:'stroke7',frameOrdinal:0,pigmentRgb8:[123,45,201]as const,composition,material:context}}
function envelope(packed:string,t:ReturnType<typeof trusted>){return{version:2 as const,rasterProfile:t.rasterProfile,brush:t.brush,strokeId:t.strokeId,frameOrdinal:t.frameOrdinal,pigmentRgb8:t.pigmentRgb8,composition:t.composition,materialPacked:packed,texturePhase:t.material.primaryTexture.phase}}
function snapshot(context:c.CanonicalMaterialContextV7,browser=false){const t=trusted(context,browser);return{layerId:'layer-1',brush:t.brush,strokeId:t.strokeId,boardEpoch:3,descriptorSha256:context.primarySource.descriptorSha256,rasterProfile:t.rasterProfile,pigmentRgb8:t.pigmentRgb8,composition,assets:context.assets,materialVersion:7 as const,material:context}}
function changed(packed:string,offset:number,value:number){const b=Buffer.from(packed.slice(2),'base64');b[offset]=value;return '7|'+b.toString('base64')}
describe('standalone generic textured-Auto7 DATA codec',()=>{
 it.each<Kind>(['defaultAuto','gaussianAuto','softAuto'])('roundtrips %s through one codec, profile-specific coverage and DRAW40',kind=>{
  for(const browser of [false,true]){const ctx=context(kind,browser),built=c.buildCanonicalTexturedAutoMaterial(input(ctx),ctx),f=c.unpackCanonicalTexturedAutoMaterial(built.packed,ctx),bytes=Buffer.from(built.packed.slice(2),'base64')
   expect(built.packed.startsWith('7|')).toBe(true);expect(bytes[4]).toBe(7);expect(bytes[6]).toBe(1);expect(bytes[7]).toBe(0)
   expect(bytes[64]).toBe(kind==='softAuto'?4:kind==='gaussianAuto'?3:1);expect(bytes[65]).toBe(browser?3:2)
   expect(f.definitions).toHaveLength(1);expect(f.definitions[0].kind).toBe(kind);expect(f.draws.map(x=>x.grainDepth)).toEqual([-0,.5,1])
   expect(Object.is(f.draws[0].grainDepth,-0)).toBe(true);expect(c.packCanonicalTexturedAutoMaterial(f,ctx)).toBe(built.packed)
   const t=trusted(ctx,browser),parsed=decodeCanonicalTexturedAutoStrokeFrame(envelope(built.packed,t),t)
   expect(parsed.frame).toEqual(f);expect(Object.isFrozen(parsed.frame)).toBe(true);expect(Object.isFrozen(parsed.frame.definitions[0].source)).toBe(true)
  }
 })
 it('uses one source kind per context; foreign kind, radial/sourceSlot, image, mask and source mismatch fail',()=>{
  const ctx=context('defaultAuto'),bad=input(ctx);Reflect.set(bad.draws,0,{...bad.draws[0],recipe:recipe(source('gaussianAuto'))});expect(()=>c.buildCanonicalTexturedAutoMaterial(bad,ctx)).toThrow()
  const soft=context('softAuto'),i=input(soft);Reflect.set(i.draws[0].recipe,'sourceSlot',1);expect(()=>c.buildCanonicalTexturedAutoMaterial(i,soft)).toThrow()
  const changedSource=structuredClone(input(ctx));Reflect.set(changedSource.draws[0].recipe,'brushScale',99);expect(()=>c.buildCanonicalTexturedAutoMaterial(changedSource,ctx)).toThrow()
  expect(()=>c.buildCanonicalTexturedAutoMaterial({...input(ctx),masked:true}as unknown as c.CanonicalMaterialBuildInputV7,ctx)).toThrow()
  const wrong=structuredClone(ctx);Reflect.set(wrong.primarySource,'kind','unknown');expect(()=>c.canonicalTexturedAutoMaterialContext(wrong)).toThrow()
 })
 it('charges texture work per repeated DRAW, exact boundary and both decode/build reject one-unit short',()=>{
  for(const kind of ['defaultAuto','gaussianAuto','softAuto']as const){const ctx=context(kind),i=input(ctx),r=i.draws[0].recipe,pin=ctx.primarySource
   const cost=r.kind==='softAuto'&&pin.kind==='softAuto'?canonicalSoftAutoCost(r,pin):r.kind!=='softAuto'&&pin.kind!=='softAuto'?canonicalAutoCost(r,pin):(()=>{throw Error('family')})()
   const required=cost.workUnits+3*c.canonicalPrimaryTextureDrawWork(r.width,r.height),budget={workUnits:required,outputBytes:cost.outputBytes,drawPixels:r.width*r.height*3}
   const exact=c.canonicalTexturedAutoMaterialContext({...ctx,budget}),built=c.buildCanonicalTexturedAutoMaterial(i,exact)
   expect(built.frame.definitions).toHaveLength(1)
   const short=c.canonicalTexturedAutoMaterialContext({...ctx,budget:{...budget,workUnits:required-1}})
   expect(()=>c.buildCanonicalTexturedAutoMaterial(i,short)).toThrow();expect(()=>c.unpackCanonicalTexturedAutoMaterial(built.packed,short)).toThrow()
  }
 })
 it('captures phase/context/source/frame data before callbacks and rejects accessors/unknown keys',()=>{
  let calls=0
  for(const make of [(x:c.CanonicalMaterialContextV7)=>x,(x:c.CanonicalMaterialContextV7)=>x.primaryTexture.phase,(x:c.CanonicalMaterialContextV7)=>x.primarySource]){
   const raw=structuredClone(context('defaultAuto')),o=make(raw),key=o===raw?'primaryTexture':o===raw.primarySource?'source':'x'
   Object.defineProperty(o,key,{get(){calls++;throw Error('getter')}});expect(()=>c.canonicalTexturedAutoMaterialContext(raw)).toThrow()
  }
  const ctx=context('defaultAuto'),f=structuredClone(c.buildCanonicalTexturedAutoMaterial(input(ctx),ctx).frame)
  Object.defineProperty(f.definitions[0],'source',{get(){calls++;throw Error('getter')}});expect(()=>c.captureCanonicalTexturedAutoFrame(f,ctx)).toThrow();expect(calls).toBe(0)
  const mutable=structuredClone(ctx),captured=c.canonicalTexturedAutoMaterialContext(mutable);Reflect.set(mutable.primaryTexture.phase,'x',0);expect(captured.primaryTexture.phase.x).toBe(50);expect(Object.isFrozen(captured.primaryTexture.phase)).toBe(true)
 })
 it('shares one recorded pin boundary and keeps old tokens/crop/CAS closed',()=>{
  const ctx=context('defaultAuto'),pin=ctx.primaryTexture
  expect(canonicalRecordedPrimaryTexturePin(pin,asset)).toEqual(pin)
  expect(()=>canonicalPrimaryTexturePin(pin,asset)).toThrow();expect(()=>canonicalFixedPrimaryTexturePin(pin,asset)).toThrow();expect(()=>canonicalPressureCurvePrimaryTexturePin(pin,[asset])).toThrow()
  for(const a of [{...asset,id:'asset:'+'ef'.repeat(32)},{...asset,width:50},{...asset,x:1},{...asset,size:32}])expect(()=>canonicalRecordedPrimaryTexturePin(pin,a)).toThrow()
  expect(()=>canonicalRecordedPrimaryTexturePin({...pin,strength:'source-pressure-curve-v1'},asset)).toThrow()
 })
 it('rejects malformed phase, layout, tag, role, grain and exact dictionary rectangle',()=>{
  const ctx=context('defaultAuto'),built=c.buildCanonicalTexturedAutoMaterial(input(ctx),ctx)
  for(const bad of [{...ctx,version:6},{...ctx,primaryTexture:{...ctx.primaryTexture,phase:{kind:'resolved-stroke-phase-v1',x:51,y:0}}},{...ctx,primaryTexture:{...ctx.primaryTexture,offsetX:0}},{...ctx,primaryTexture:{...ctx.primaryTexture,strength:'source-pressure-curve-v1'}},{...ctx,primaryTexture:{...ctx.primaryTexture,law:'multiply'}},{...ctx,primaryTexture:{...ctx.primaryTexture,periodX:64}}])expect(()=>c.canonicalTexturedAutoMaterialContext(bad)).toThrow()
  for(const [at,val]of [[4,6],[64,0],[65,4],[67,1],[24+32,50]]as const)expect(()=>c.unpackCanonicalTexturedAutoMaterial(changed(built.packed,at,val),ctx)).toThrow()
  for(const grainDepth of [NaN,Infinity,-.1,1.1]){const i=input(ctx);Reflect.set(i.draws,0,{...i.draws[0],grainDepth});expect(()=>c.buildCanonicalTexturedAutoMaterial(i,ctx)).toThrow()}
  expect(()=>c.unpackCanonicalTexturedAutoMaterial(built.packed+'AAAA',ctx)).toThrow()
 })
 it('keeps all old public codec/frame/snapshot dispatches closed to7 even through JS',()=>{
  const ctx=context('defaultAuto'),f=c.buildCanonicalTexturedAutoMaterial(empty,ctx),t=trusted(ctx),s=snapshot(ctx)
  // Deliberate hostile JS boundary exercises runtime rejection, not compatibility casts.
  expect(()=>Reflect.apply(c.buildCanonicalMaterial,null,[empty,ctx])).toThrow();expect(()=>Reflect.apply(c.packCanonicalMaterial,null,[f.frame,ctx])).toThrow();expect(()=>Reflect.apply(c.unpackCanonicalMaterial,null,[f.packed,ctx])).toThrow()
  expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,null,[envelope(f.packed,t),t])).toThrow();expect(()=>canonicalStrokeSnapshotV6(s,3,G)).toThrow()
  function typeOnly(){
   // @ts-expect-error standalone7 is not global historical Any
   const any:c.AnyCanonicalMaterialContext=ctx
   // Coherent7 extends actual snapshot DATA; old decoder/Any remain closed.
   const actual:CanonicalStrokeSnapshot=s
   // @ts-expect-error old decoder overloads remain1–6
   decodeCanonicalStrokeFrame(envelope(f.packed,t),t)
   return [any,actual]
  }
  expect(typeOnly).toBeTypeOf('function')
 })
 it.each<Kind>(['defaultAuto','gaussianAuto','softAuto'])('normalizes standalone snapshot for %s without minting read authority',kind=>{
  for(const browser of [false,true]){const ctx=context(kind,browser),raw=snapshot(ctx,browser),out=canonicalStandaloneStrokeSnapshotV7(raw,3,browser?B:G)
   expect(out.materialVersion).toBe(7);expect(out.material.primaryTexture.phase).toEqual(ctx.primaryTexture.phase);expect(Object.isFrozen(out)).toBe(true)
   expect(()=>canonicalStandaloneStrokeSnapshotV7(raw,4,browser?B:G)).toThrow();expect(()=>canonicalStandaloneStrokeSnapshotV7({...raw,descriptorSha256:'0'.repeat(64)},3,browser?B:G)).toThrow();expect(()=>canonicalStandaloneStrokeSnapshotV7({...raw,brush:raw.brush+'x'},3,browser?B:G)).toThrow()
  }
 })
 it('rejects snapshot source/asset/profile/selector/accessor and frame-local expectations before publication',()=>{
  const ctx=context('defaultAuto'),raw=snapshot(ctx)
  for(const bad of [{...raw,rasterProfile:OLD},{...raw,rasterProfile:B},{...raw,assets:[{...asset,width:50}]},{...raw,materialVersion:6},{...raw,material:{...ctx,expectedDrawCount:undefined}},{...raw,material:{...ctx,expectedStrokeEnd:false}}])expect(()=>canonicalStandaloneStrokeSnapshotV7(bad,3,bad.rasterProfile)).toThrow()
  let calls=0;const accessor={...raw};Object.defineProperty(accessor,'materialVersion',{get(){calls++;return 7}});expect(()=>canonicalStandaloneStrokeSnapshotV7(accessor,3,G)).toThrow();expect(calls).toBe(0)
  const ownctx=structuredClone(ctx),t=trusted(ownctx),e=envelope(c.buildCanonicalTexturedAutoMaterial(empty,ctx).packed,t)
  Object.defineProperty(ownctx.primaryTexture.phase,'x',{get(){calls++;return 0}});Object.defineProperty(e,'composition',{get(){calls++;return composition}})
  expect(()=>decodeCanonicalTexturedAutoStrokeFrame(e,t)).toThrow();expect(calls).toBe(0)
 })
})
