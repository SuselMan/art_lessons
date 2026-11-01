/// <reference types="node" />
import {createHash} from 'node:crypto'
import actualRegular from './fixtures/sourceDefaultAutoData/screentonesRegular.texture.native.json' with {type:'json'}
import type {BrushDescriptor} from './brushes.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {canonicalDefaultAutoFixedTextureSourceBinding,canonicalDefaultAutoSourceBinding} from './canonicalDefaultAutoMaterial.js'
import {extractCanonicalDefaultAutoFixedTextureCapability} from './canonicalBrushCapability.js'
import {describe,it,expect} from 'vitest'
import * as codec from './canonicalMaterialCodec.js'
import * as snapshots from './canonicalRecordedAttachment.js'
import {decodeCanonicalStrokeFrame,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as rasterProfile,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browserProfile} from './canonicalStrokeFrame.js'
import {canonicalDefaultAutoSourcePin,canonicalAutoCost} from './canonicalDefaultAutoMaterial.js'
import {sourceAutoGeometry} from './sourceAutoGeometry.js'
import type {CanonicalMaterialContextV4,CanonicalMaterialBuildInputV4,CanonicalMaterialFrameV4} from './canonicalMaterialCodec.js'
/** Parse-only future implementation tests; no execution/BEGIN capability claim.
 * Typed build covers the actual V4 overload. Reflect is used for malformed
 * unknown metadata/selector tests, never a V4-as-V2 projection or fallback. */
function build(i:CanonicalMaterialBuildInputV4,c:CanonicalMaterialContextV4):{packed:string;frame:CanonicalMaterialFrameV4}{return codec.buildCanonicalMaterial(i,c)}
function unpack(p:string,c:unknown):CanonicalMaterialFrameV4{return Reflect.apply(codec.unpackCanonicalMaterial,undefined,[p,c])}
function factory(name:string,...args:unknown[]):unknown {const f=Reflect.get(name==='canonicalStrokeSnapshotV4'?snapshots:codec,name);expect(typeof f,`explicit API ${name}`).toBe('function');return Reflect.apply(f,undefined,args)}
const asset={id:'asset:'+'ab'.repeat(32),size:4,x:0,y:0,width:3,height:2}
const source=()=>canonicalDefaultAutoSourcePin({kind:'defaultAuto',descriptorId:'self-authored-v4',descriptorVersion:1,descriptorSha256:'c'.repeat(64),
 source:{kind:'defaultAuto',generator:'default',shape:'circle',diameter:4,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1},
 brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1'})
const context=():CanonicalMaterialContextV4=>({version:4,assets:[{...asset}],primarySource:source(),primaryTexture:{kind:'canvasTexture',asset:asset.id,law:'subtract-u8-v1',width:3,height:2,periodX:3,periodY:2,offsetX:0,offsetY:0,strength:'fixed-one-v1'},budget:{workUnits:1000000,outputBytes:1000000,drawPixels:1000000}})
const empty=():CanonicalMaterialBuildInputV4=>({masked:false,entry:{phase:'between'},draws:[],fences:[]})
function input(count=1):CanonicalMaterialBuildInputV4 {
 const pin=source(),g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:4,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0})
 const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:-0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false}
 return {masked:false,entry:{phase:'primary',group:0},draws:Array.from({length:count},(_,x)=>({recipe,role:'primary',x,y:-1,opacity:1,flow:-0,grainDepth:1})),fences:[]}
}
const golden='4|Q01BVAQAAQAAAAAAAAAAAAAAAAAAAAAAq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6sDAAIAAAAAAA=='
const raw=(p:string)=>Uint8Array.from(atob(p.slice(2)),x=>x.charCodeAt(0))
const mutate=(p:string,fn:(v:DataView,b:Uint8Array)=>void)=>{const b=raw(p);fn(new DataView(b.buffer),b);return p.slice(0,2)+btoa(String.fromCharCode(...b))}
const composition={mode:'wash' as const,alphaDarken:'hard' as const,outerResourceOpacity:1,outerBlend:'over' as const}
function envelope(p:string){return {version:2,rasterProfile,brush:'brush:self-authored-v4@1',strokeId:'S',frameOrdinal:0,pigmentRgb8:[1,2,3],composition,materialPacked:p}}
function trusted(c:unknown){return {materialVersion:4,rasterProfile,brush:'brush:self-authored-v4@1',strokeId:'S',frameOrdinal:0,pigmentRgb8:[1,2,3],composition,material:c}}
describe('staged unified textured-source material4 parse-only contract',()=>{
 it('pins an independently specified 64-byte EMPTY pattern-only ledger golden',()=>{expect(build(empty(),context()).packed).toBe(golden);expect(unpack(golden,context()).draws).toEqual([])})
 it('uses DEFINITION96 and DRAW40, F64 grainDepth +1 at draw+32; preserves old dynamic signed zero',()=>{
  const b=build(input(2),context()),bytes=raw(b.packed),v=new DataView(bytes.buffer),d=24+40+96
  expect(bytes.length).toBe(d+2*40);expect(bytes[4]).toBe(4);expect(bytes[6]).toBe(1);expect(bytes[7]).toBe(0)
  expect(v.getUint16(8,true)).toBe(1);expect(v.getUint16(10,true)).toBe(2);expect(bytes[64]).toBe(1)
  expect(v.getFloat64(d+32,true)).toBe(1);expect(v.getFloat64(d+40+32,true)).toBe(1)
  expect(Object.is(b.frame.draws[0].flow,-0)).toBe(true);expect(Object.is(b.frame.definitions[0].rotation,-0)).toBe(true)
  expect(Object.hasOwn(b.frame.definitions[0],'asset')).toBe(false);const captured=codec.captureCanonicalTexturedSourceFrame(b.frame,context());expect(captured).toEqual(b.frame);expect(Object.isFrozen(captured.definitions[0].source)).toBe(true)
 })
 it('charges actual existing texture work for EACH DRAW even with one reused definition',()=>{
  const i=input(2),r=i.draws[0].recipe,base=canonicalAutoCost(r,source()),one=codec.canonicalPrimaryTextureDrawWork(r.width,r.height)
  const c={...context(),budget:{...context().budget,workUnits:base.workUnits+2*one}}
  expect(()=>build(i,c)).not.toThrow();expect(()=>build(i,{...c,budget:{...c.budget,workUnits:c.budget.workUnits-1}})).toThrow()
  expect(()=>build(i,{...c,budget:{...c.budget,drawPixels:2*r.width*r.height-1}})).toThrow()
  const p=build(i,c).packed;expect(()=>unpack(p,{...c,budget:{...c.budget,workUnits:c.budget.workUnits-1}})).toThrow()
 })
 it('retains structural phase2, including a zero-DRAW segmentEnd/gestureEnd suffix',()=>{
  const i:CanonicalMaterialBuildInputV4={...empty(),entry:{phase:'mask',group:7},fences:[{at:0,kind:'segmentEnd',group:7},{at:0,kind:'gestureEnd'}]}
  const b=build(i,{...context(),expectedDrawCount:0,expectedStrokeEnd:true});expect(b.frame.entry).toEqual(i.entry);expect(b.frame.fences).toEqual(i.fences);expect(raw(b.packed)[5]).toBe(2)
 })
 it.each([0,-0,.5,1-Number.EPSILON,1+Number.EPSILON,NaN,Infinity])('rejects non-fixed DRAW strength %s, not silently substituting1',grainDepth=>{
  const i=input();Reflect.set(i.draws[0],'grainDepth',grainDepth);expect(()=>build(i,context())).toThrow()
 })
 it('rejects role/recipe/pin/source mismatch, unknown discriminants and no-dummy-tip ledger changes',()=>{
  for(const change of [(c:any)=>c.assets=[],(c:any)=>c.assets.push({...asset,id:'asset:'+'cd'.repeat(32)}),(c:any)=>c.primaryTexture.strength='pressure-identity-v1',(c:any)=>c.primaryTexture.asset='asset:'+'cd'.repeat(32),(c:any)=>c.primaryTexture.periodX=4,(c:any)=>c.primarySource.kind='gaussianAuto']){
   const c=structuredClone(context());change(c);expect(()=>build(empty(),c)).toThrow()
  }
  const c={...context(),primarySource:{...context().primarySource,brushAngle:1}};expect(()=>build(input(),c)).toThrow()
  for(const change of [(i:any)=>i.masked=true,(i:any)=>i.draws[0].role='mask',(i:any)=>i.draws[0].recipe.kind='image',(i:any)=>i.draws[0].extra=1]){const i=structuredClone(input());change(i);expect(()=>build(i,context())).toThrow()}
 })
 it('rejects forged version/header/ledger/padding bytes and dynamic-strength byte mutation',()=>{
  const p=build(input(),context()).packed,d=24+40+96
  for(const change of [(_v:DataView,b:Uint8Array)=>b[4]=3,(_v:DataView,b:Uint8Array)=>b[6]=0,(_v:DataView,b:Uint8Array)=>b[7]=1,(_v:DataView,b:Uint8Array)=>b[14]=1,(v:DataView)=>v.setUint16(56,2,true),(_v:DataView,b:Uint8Array)=>b[d+28]=1,(v:DataView)=>v.setFloat64(d+32,.5,true)])expect(()=>unpack(mutate(p,change),context())).toThrow()
  expect(()=>unpack('3|'+p.slice(2),context())).toThrow()
 })
 it('captures closed context BEFORE any envelope callback and never runs context accessors',()=>{
  let calls=0;const c=context();Object.defineProperty(c,'primaryTexture',{get(){calls++;return null}})
  expect(()=>factory('canonicalTexturedSourceMaterialContext',c)).toThrow();expect(calls).toBe(0)
  const inherited=Object.create({version:4});let nested=0;Object.defineProperty(inherited,'assets',{get(){nested++;return []}});expect(()=>factory('canonicalTexturedSourceMaterialContext',inherited)).toThrow();expect(nested).toBe(0)
  const original=context(),captured:any=factory('canonicalTexturedSourceMaterialContext',original)
  Reflect.set(original.assets[0],'width',1);Reflect.set(original.budget,'workUnits',0);expect(captured.assets[0].width).toBe(3);expect(captured.budget.workUnits).toBe(1000000)
  expect(Object.isFrozen(captured.primarySource.source)).toBe(true);expect(Object.isFrozen(captured.primaryTexture)).toBe(true)
 })
 it('requires own explicit top4 GenericSC awareness, rejects inherited/accessor/old contexts cross-decode',()=>{
  const p=build(empty(),context()).packed,c=context(),t=trusted(c)
  expect(Reflect.apply(decodeCanonicalStrokeFrame,undefined,[envelope(p),t]).frame.profile).toBe(codec.CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE)
  for(const bad of [{...t,materialVersion:2},{...t,materialVersion:3},{...t,materialVersion:undefined},Object.assign(Object.create({materialVersion:4}),Object.fromEntries(Object.entries(t).filter(([k])=>k!=='materialVersion')))])expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,undefined,[envelope(p),bad])).toThrow()
  let calls=0;const getter={...t};Object.defineProperty(getter,'materialVersion',{get(){calls++;return 4}});expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,undefined,[envelope(p),getter])).toThrow();expect(calls).toBe(0)
  const old2={version:2,assets:[],primarySource:source(),budget:context().budget};expect(()=>unpack(p,old2)).toThrow()
  const oldPacked=Reflect.apply(codec.buildCanonicalMaterial,undefined,[empty(),old2]).packed;expect(()=>unpack(oldPacked,c)).toThrow();
  const tip={...asset,id:'asset:'+'ef'.repeat(32)},old3={version:3,assets:[tip,asset],primarySource:{kind:'image',asset:tip.id,brushScale:1,brushAngle:0},primaryTexture:{...c.primaryTexture,strength:'pressure-identity-v1'},budget:c.budget}
  const oldPacked3=Reflect.apply(codec.buildCanonicalMaterial,undefined,[empty(),old3]).packed;expect(()=>unpack(oldPacked3,c)).toThrow();expect(()=>unpack(p,old3)).toThrow();expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,undefined,[envelope(oldPacked),t])).toThrow()
 })
 it('captures4 before a composition getter mutates original assets/budget; downgrade2 still fails',()=>{
  const original=context(),p=build(empty(),original).packed,e=envelope(p),t=trusted(original)
  let calls=0;Object.defineProperty(e,'composition',{enumerable:true,get(){calls++;Reflect.set(original.budget,'workUnits',-1);Reflect.set(original.assets[0],'width',1);return composition}})
  expect(Reflect.apply(decodeCanonicalStrokeFrame,undefined,[e,t]).frame.profile).toBe(codec.CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE);expect(calls).toBeGreaterThan(0)
  const c=context(),old2={version:2,assets:[],primarySource:source(),budget:context().budget},packed2=Reflect.apply(codec.buildCanonicalMaterial,undefined,[empty(),old2]).packed,e2=envelope(packed2)
  Object.defineProperty(e2,'composition',{enumerable:true,get(){Reflect.set(c,'version',2);Reflect.set(c,'assets',[]);Reflect.deleteProperty(c,'primaryTexture');return composition}})
  expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,undefined,[e2,trusted(c)])).toThrow()
 })
 it('rejects numeric-profile mismatch and wrong budget/count/terminal flags through real decode',()=>{
  const p=build(empty(),context()).packed,e=envelope(p),t=trusted(context())
  expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,undefined,[{...e,rasterProfile:'browser-highp-rgba8-v1'},{...t,rasterProfile:'browser-highp-rgba8-v1'}])).toThrow()
  expect(()=>unpack(p,{...context(),expectedDrawCount:1})).toThrow();expect(()=>unpack(p,{...context(),expectedStrokeEnd:true})).toThrow()
  expect(()=>unpack(p,{...context(),budget:{...context().budget,workUnits:-1}})).toThrow()
 })
 it('uses existing BrowserFloat + browser-number coverage byte3 without changing native numeric mapping',()=>{
  const c={...context(),primarySource:{...source(),coverageProfile:'browser-number-coverage-v1' as const}},i=input()
  const browserInput={...i,draws:i.draws.map(d=>({...d,recipe:{...d.recipe,coverageProfile:'browser-number-coverage-v1' as const}}))}
  const b=build(browserInput,c),bytes=raw(b.packed);expect(bytes[65]).toBe(3)
  expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,undefined,[{...envelope(b.packed),rasterProfile:browserProfile},{...trusted(c),rasterProfile:browserProfile}])).not.toThrow()
  expect(()=>Reflect.apply(decodeCanonicalStrokeFrame,undefined,[envelope(b.packed),trusted(c)])).toThrow()
 })
 it('binds ORIGINAL imported Regular to BrowserFloat coverage3, actual pattern and explicit snapshot4 probe',()=>{
  const d=structuredClone(actualRegular.descriptor) as unknown as BrushDescriptor,before=canonicalBrushDescriptorJSON(d)
  const sha=createHash('sha256').update(before).digest('hex'),pattern=actualRegular.patternAsset
  const semantic=extractCanonicalDefaultAutoFixedTextureCapability(d,{pattern});expect(semantic.supported).toBe(true)
  if(!semantic.supported)throw Error('Actual retained Regular semantic refusal')
  const pin=canonicalDefaultAutoFixedTextureSourceBinding(d,sha,'browser-number-coverage-v1',pattern,browserProfile)
  expect(()=>canonicalDefaultAutoSourceBinding(d,sha,'browser-number-coverage-v1',browserProfile)).toThrow()
  const c:CanonicalMaterialContextV4={version:4,assets:[semantic.capability.patternAsset],primarySource:pin,primaryTexture:semantic.capability.primaryTexture,budget:context().budget}
  const g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0})
  const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false}
  const built=build({masked:false,entry:{phase:'primary',group:1},draws:[{recipe,role:'primary',x:-11,y:11,opacity:1,flow:1,grainDepth:1}],fences:[]},c)
  expect(raw(built.packed)[65]).toBe(3);expect(built.frame.definitions[0].source).toEqual(pin.source);expect(built.frame.draws[0].grainDepth).toBe(1)
  const brush='brush:'+d.id+'@'+d.version,e={...envelope(built.packed),rasterProfile:browserProfile,brush},t={...trusted(c),rasterProfile:browserProfile,brush}
  expect(Reflect.apply(decodeCanonicalStrokeFrame,undefined,[e,t]).frame.profile).toBe(codec.CANONICAL_TEXTURED_SOURCE_MATERIAL_PROFILE)
  const s={layerId:'L',brush,strokeId:'S',boardEpoch:2,descriptorSha256:sha,rasterProfile:browserProfile,pigmentRgb8:[1,2,3],composition,assets:c.assets,materialVersion:4,material:c}
  const normalized:any=factory('canonicalStrokeSnapshotV4',s,2,browserProfile)
  expect(normalized.material.primarySource.descriptorSha256).toBe(sha);expect(normalized.assets).toHaveLength(1);expect(normalized.assets[0].id).toBe(pattern.id)
  expect(canonicalBrushDescriptorJSON(d)).toBe(before)
 })
 it('normalizes standalone snapshot4 with exact matching outer pattern and no activation union',()=>{
  const c=context(),s={layerId:'L',brush:'brush:self-authored-v4@1',strokeId:'S',boardEpoch:2,descriptorSha256:'c'.repeat(64),rasterProfile,pigmentRgb8:[1,2,3],composition,assets:c.assets,materialVersion:4,material:c}
  const actual:any=factory('canonicalStrokeSnapshotV4',s,2,rasterProfile);expect(actual.materialVersion).toBe(4);expect(actual.assets).toHaveLength(1);expect(actual.assets[0].id).toBe(asset.id);expect(Object.isFrozen(actual.material.primarySource.source)).toBe(true)
  for(const bad of [{...s,assets:[]},{...s,boardEpoch:3},{...s,extra:true},{...s,assets:[{...asset,width:2}]},{...s,material:{...c,version:3}}])expect(()=>factory('canonicalStrokeSnapshotV4',bad,2,rasterProfile)).toThrow()
 })
})
