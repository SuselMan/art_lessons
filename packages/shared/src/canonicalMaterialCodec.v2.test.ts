import defaultStock from './fixtures/sourceDefaultAutoData/stock.native.js'
import {canonicalDefaultAutoSourceBinding} from './canonicalDefaultAutoMaterial.js'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import type {BrushDescriptor} from './brushes.js'
import { expect, it, vi } from 'vitest'
import { assertPrimaryCanonicalMaterial, buildCanonicalMaterial, packCanonicalMaterial, unpackCanonicalMaterial, CANONICAL_SOURCE_MATERIAL_PROFILE,
  CANONICAL_MATERIAL_PROFILE, canonicalSourceMaterialContext, canonicalMaskedSourceMaterialContext, type CanonicalMaterialContextV2, type CanonicalMaterialContext, type CanonicalMaterialFrameV2,
  type CanonicalMaterialBuildInputV2, type CanonicalMaterialFrame } from './canonicalMaterialCodec.js'
import { canonicalDefaultAutoStatic, type CanonicalDefaultAutoRecipe } from './canonicalDefaultAutoMaterial.js'
import { decodeCanonicalStrokeFrame, CANONICAL_STROKE_RASTER_PROFILE } from './canonicalStrokeFrame.js'

const source = {kind:'defaultAuto',generator:'default',shape:'circle',diameter:8,ratio:.5,horizontalFade:.3,verticalFade:.6,antialias:false,spikes:2,randomness:0,density:1} as const
const recipe = (extra:Partial<CanonicalDefaultAutoRecipe> = {}):CanonicalDefaultAutoRecipe => ({kind:'defaultAuto',source,coverageProfile:'scalar-f64-fma-v1',brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:4,mirrorH:false,mirrorV:false,...extra})
type MutableContext={-readonly [K in keyof CanonicalMaterialContextV2]:CanonicalMaterialContextV2[K]}
const context = ():MutableContext => ({version:2,assets:[],primarySource:{kind:'defaultAuto',descriptorId:'native-auto',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source,brushScale:1,brushAngle:0,coverageProfile:'scalar-f64-fma-v1'},budget:{workUnits:100000,outputBytes:100000,drawPixels:100000}})
const input = (...recipes:CanonicalDefaultAutoRecipe[]):CanonicalMaterialBuildInputV2 => ({masked:false,entry:{phase:'primary',group:1},draws:recipes.map((recipe,i)=>({recipe,role:'primary',x:i-10,y:-20,opacity:.3,flow:.7})),fences:[]})
const mutate = (packed:string, edit:(v:DataView,b:Uint8Array)=>void) => {const b=Uint8Array.from(atob(packed.slice(2)),x=>x.charCodeAt(0));edit(new DataView(b.buffer),b);return '2|'+btoa(String.fromCharCode(...b))}

it('roundtrips auto without CAS, with explicit profile and full dynamic F64 bits',()=>{
  const r=recipe({rotation:-0,subX:-0,scale:1.0000000000000002}),c=context(),built=buildCanonicalMaterial(input(r),c)
  expect(built.packed.startsWith('2|')).toBe(true)
  expect(atob(built.packed.slice(2)).charCodeAt(6)).toBe(0)
  expect(built.frame.profile).toBe(CANONICAL_SOURCE_MATERIAL_PROFILE)
  const decoded=unpackCanonicalMaterial(JSON.parse(JSON.stringify(built.packed)),c)
  expect(decoded).toEqual(built.frame)
  const d=decoded.definitions[0]!
  expect(d.kind).toBe('defaultAuto')
  expect('asset' in d).toBe(false)
  expect(Object.is(d.rotation,-0)).toBe(true);expect(Object.is(d.subX,-0)).toBe(true)
  expect(d.scale).toBe(r.scale)
  expect(packCanonicalMaterial(decoded,c)).toBe(built.packed)
})
it('canonicalizes ONLY auto static zeros at builder and trusted boundaries',()=>{
  const raw={...source,horizontalFade:-0,randomness:-0},r=recipe({source:raw,brushAngle:-0,rotation:-0,subY:-0}),c=context()
  c.primarySource={...c.primarySource,source:raw,brushAngle:-0} as typeof c.primarySource
  const normalized=canonicalDefaultAutoStatic(raw,1,-0)
  expect(Object.is(normalized.brushAngle,0)).toBe(true)
  const built=buildCanonicalMaterial(input(r),c),d=built.frame.definitions[0]!
  expect(d.kind).toBe('defaultAuto')
  if(d.kind!=='defaultAuto')throw Error('auto')
  expect(Object.is(d.source.horizontalFade,0)).toBe(true)
  expect(Object.is(d.brushAngle,0)).toBe(true)
  expect(Object.is(d.rotation,-0)).toBe(true);expect(Object.is(d.subY,-0)).toBe(true)
  // Raw wire static -0 is noncanonical even when trusted input was -0.
  expect(()=>unpackCanonicalMaterial(mutate(built.packed,v=>v.setFloat64(24+24,-0,true)),c)).toThrow()
})
it('deduplicates saved generation, never substitutes current requested geometry',()=>{
  const saved=recipe({scale:1.0000000000000002}),current=recipe({scale:1.0000000000000004})
  const built=buildCanonicalMaterial(input(saved,saved,recipe({rotation:-0})),context())
  expect(built.frame.definitions).toHaveLength(2)
  expect(built.frame.draws.map(d=>d.definition)).toEqual([0,0,1])
  expect(built.frame.definitions[0]!.scale).toBe(saved.scale)
  expect(built.frame.definitions[0]!.scale).not.toBe(current.scale)
  expect(built.frame.draws.map(d=>d.x)).toEqual([-10,-9,-8])
})
it.each(['scalar-f64-fma-v1','neon64-f32-fma-v1'] as const)('pins explicit profile %s, circle/rect and AA independently',coverageProfile=>{
  for(const shape of ['circle','rect'] as const)for(const antialias of [false,true]){
    const c=context(),s={...source,shape,antialias},r=recipe({source:s,coverageProfile})
    c.primarySource={...c.primarySource,source:s,coverageProfile} as typeof c.primarySource
    expect(unpackCanonicalMaterial(buildCanonicalMaterial(input(r),c).packed,c).definitions[0]).toEqual(r)
  }
})
it('rejects static spoofing, wrong extents, unknown profile and auto-with-asset',()=>{
  const c=context()
  for(const r of [recipe({source:{...source,diameter:9}}),recipe({brushAngle:1}),recipe({width:9}),recipe({coverageProfile:'unknown' as never}),{...recipe(),asset:'asset:'+'b'.repeat(64)}])
    expect(()=>buildCanonicalMaterial(input(r),c)).toThrow()
  const p=buildCanonicalMaterial(input(recipe()),c).packed
  for(const edit of [(v:DataView)=>v.setUint8(25,3),(v:DataView)=>v.setUint8(27,1),(v:DataView)=>v.setUint8(26,128),(v:DataView)=>v.setFloat64(24+8,NaN,true)])
    expect(()=>unpackCanonicalMaterial(mutate(p,edit),c)).toThrow()
})
it('checks aggregate work/output/draw pixels before returning decoded arrays',()=>{
  const c=context(),i=input(recipe())
  for(const budget of [{workUnits:31,outputBytes:1000,drawPixels:1000},{workUnits:1000,outputBytes:127,drawPixels:1000},{workUnits:1000,outputBytes:1000,drawPixels:31}])
    expect(()=>buildCanonicalMaterial(i,{...c,budget})).toThrow()
  const p=buildCanonicalMaterial(i,c).packed
  expect(()=>unpackCanonicalMaterial(p,{...c,budget:{workUnits:31,outputBytes:1000,drawPixels:1000}})).toThrow()
})
it('auto cannot enter the legacy image context or invoke its custom preflight',()=>{
  const preflightDefinition=vi.fn(()=>({workUnits:1,outputBytes:1})),id='asset:'+'b'.repeat(64)
  const old:CanonicalMaterialContext={assets:[{id,size:8,x:0,y:0,width:8,height:4}],primaryAsset:id,preflightDefinition,budget:context().budget}
  const built=buildCanonicalMaterial(input(recipe()),context())
  expect(()=>unpackCanonicalMaterial(built.packed,old)).toThrow()
  expect(()=>packCanonicalMaterial(built.frame as unknown as CanonicalMaterialFrame,old)).toThrow()
  expect(()=>assertPrimaryCanonicalMaterial(built.frame as unknown as CanonicalMaterialFrame,old)).toThrow()
  expect(preflightDefinition).not.toHaveBeenCalled()
})
it('uses the same v2 framing for whole versus chunked recipes and immutable envelope decode',()=>{
  const c=context(),r=recipe(),whole=input(r,r),a=buildCanonicalMaterial(input(r),c)
  const b=buildCanonicalMaterial({...input(r),fences:[{at:1,kind:'primaryEnd',group:1},{at:1,kind:'segmentEnd',group:1},{at:1,kind:'gestureEnd'}]},c)
  const all=buildCanonicalMaterial({...whole,fences:[{at:2,kind:'primaryEnd',group:1},{at:2,kind:'segmentEnd',group:1},{at:2,kind:'gestureEnd'}]},c)
  expect([...a.frame.definitions,...b.frame.definitions]).toEqual([all.frame.definitions[0],all.frame.definitions[0]])
  const composition={mode:'wash',alphaDarken:'creamy',outerResourceOpacity:.6,outerBlend:'over'} as const
  const trusted={brush:'pinned@1',strokeId:'stroke',frameOrdinal:0,pigmentRgb8:[1,2,3] as const,composition,material:c}
  const envelope={version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,...trusted,materialPacked:a.packed};delete (envelope as {material?:unknown}).material
  const decoded=decodeCanonicalStrokeFrame(envelope,trusted)
  expect(Object.isFrozen(decoded.frame.definitions[0])).toBe(true)
  const def=decoded.frame.definitions[0]!
  expect(def.kind==='defaultAuto'&&Object.isFrozen(def.source)).toBe(true)
})
it('image v1 retains its canonical golden bytes and image v2 stays explicitly tagged',()=>{
  const id='asset:'+'1'.repeat(64),asset={id,size:4,x:0,y:0,width:2,height:2},r={asset:id,brushScale:1,brushAngle:-0,scale:1,ratio:1,rotation:-0,subX:-0,subY:0,width:2,height:2,mirrorH:false,mirrorV:false}
  const c:CanonicalMaterialContext={assets:[asset],primaryAsset:id,preflightDefinition:()=>({workUnits:1,outputBytes:16}),budget:context().budget}
  const f:CanonicalMaterialFrame={profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'primary',group:1},definitions:[r],draws:[{definition:0,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[]}
  // Filled from the frozen v1 codec, not computed with the new implementation.
  expect(packCanonicalMaterial(f,c)).toBe(V1_GOLDEN)
  const c2:CanonicalMaterialContextV2={version:2,assets:[asset],primarySource:{kind:'image',asset:id,brushScale:1,brushAngle:-0},budget:c.budget}
  const f2:CanonicalMaterialFrameV2={...f,profile:CANONICAL_SOURCE_MATERIAL_PROFILE,definitions:[{...r,kind:'image'}]}
  const d=unpackCanonicalMaterial(packCanonicalMaterial(f2,c2),c2)
  expect(d.definitions[0]).toEqual({...r,kind:'image'})
  expect(Object.is(d.definitions[0]!.brushAngle,-0)).toBe(true)
})
const V1_GOLDEN='1|Q01BVAEBAQABAAEAAAAAAAAAAAAAAPA/ERERERERERERERERERERERERERERERERERERERERERECAAIAAAAAAAAAAAACAAIAAAAAAAAA8D8AAAAAAAAAgAAAAAAAAPA/AAAAAAAA8D8AAAAAAAAAgAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwPwAAAAAAAPA/AAAAAA=='
it('binds each role to its own static source/profile, not merely any trusted definition',()=>{
  const c=context(),mask=recipe({coverageProfile:'neon64-f32-fma-v1'})
  c.maskSource={...c.primarySource,coverageProfile:'neon64-f32-fma-v1'} as typeof c.primarySource
  const f:CanonicalMaterialFrameV2={profile:CANONICAL_SOURCE_MATERIAL_PROFILE,masked:true,entry:{phase:'primary',group:1},
    definitions:[recipe(),mask],draws:[{definition:0,role:'primary',x:0,y:0,opacity:1,flow:1},{definition:1,role:'mask',x:0,y:0,opacity:1,flow:1}],
    fences:[{kind:'primaryEnd',at:1,group:1},{kind:'segmentEnd',at:2,group:1}]}
  expect(unpackCanonicalMaterial(packCanonicalMaterial(f,c),c)).toEqual(f)
  expect(()=>packCanonicalMaterial({...f,definitions:[mask,recipe()]},c)).toThrow()
})
it('rejects frame/header version mismatch and absent typed source before legacy callback fallback',()=>{
  const c=context(),p=buildCanonicalMaterial(input(recipe()),c).packed
  expect(()=>unpackCanonicalMaterial('1|'+p.slice(2),c)).toThrow()
  expect(()=>unpackCanonicalMaterial(p,{...c,primarySource:undefined} as never)).toThrow()
  expect(()=>buildCanonicalMaterial(input(recipe()),{...c,primarySource:{...c.primarySource,coverageProfile:'unapproved'}} as never)).toThrow()
})
it('keeps the closed per-definition work cap distinct from the larger frame budget',()=>{
  const s={...source,diameter:1024,ratio:1,antialias:true},c=context()
  c.primarySource={...c.primarySource,source:s} as typeof c.primarySource
  c.budget={workUnits:64*1024*1024,outputBytes:16*1024*1024,drawPixels:16*1024*1024}
  expect(()=>buildCanonicalMaterial(input(recipe({source:s,width:1024,height:1024})),c)).toThrow()
  const noAA={...s,antialias:false}
  c.primarySource={...c.primarySource,source:noAA} as typeof c.primarySource
  expect(()=>buildCanonicalMaterial(input(recipe({source:noAA,width:1024,height:1024})),c)).not.toThrow()
})

it('preserves default V2 bytes frozen before Gaussian tag3',()=>{
  // bdfadbf77 codec+material loaded from Git into an in-memory bundle;
  // source hashes and independent generation retained in R52/default-wire-before-gaussian.json.
  expect(buildCanonicalMaterial(input(recipe()),context()).packed).toBe("2|Q01BVAIBAAABAAEAAAAAAAAAAAAAAPA/AQEAAAgABAAAAAAAAAAgQAAAAAAAAOA/MzMzMzMz0z8zMzMzMzPjPwAAAAAAAPA/AAAAAAAAAAAAAAAAAADwPwAAAAAAAPA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPb////s////MzMzMzMz0z9mZmZmZmbmPwAAAAA=")
})

it('keeps direct default-auto binding old-Over-only and admits explicit V2 native wash without changing its source pin',()=>{
 const base=structuredClone(defaultStock.rows[0].descriptor) as unknown as BrushDescriptor
 Object.assign(base.sourceStamp!.settings,{PaintOpAction:'2'});Object.assign(base.sourceStamp!.flags,{indirectPainting:true})
 const old=canonicalDefaultAutoSourceBinding(base,'a'.repeat(64),'scalar-f64-fma-v1')
 for(const blendMode of ['multiply','lighten','colorDodge','overlay'] as const){
  const d=structuredClone(base);Object.assign(d.behavior!.rendering!,{blendMode})
  expect(()=>canonicalDefaultAutoSourceBinding(d,'a'.repeat(64),'scalar-f64-fma-v1')).toThrow('outer composition')
  expect(canonicalDefaultAutoSourceBinding(d,'a'.repeat(64),'scalar-f64-fma-v1',CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toEqual(old)
  Object.assign(d.behavior!,{erase:true});expect(()=>canonicalDefaultAutoSourceBinding(d,'a'.repeat(64),'scalar-f64-fma-v1',CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow()
 }
})

it('captures a seeded Default Auto SOURCE2 context without losing its density or profile',()=>{
  const raw=context(), seededSource={...source,density:.8,randomness:.2}
  raw.primarySource={...raw.primarySource,source:seededSource,coverageProfile:'seeded-auto-mask-browser-v1'} as typeof raw.primarySource
  const captured=canonicalSourceMaterialContext(JSON.parse(JSON.stringify(raw)))
  expect(captured.primarySource).toEqual(raw.primarySource)
  expect(Object.isFrozen(captured.primarySource)).toBe(true)
  expect(()=>canonicalSourceMaterialContext({...raw,primarySource:{...raw.primarySource,coverageProfile:'unknown'}})).toThrow()
  let invoked=0
  const accessor={...seededSource};Object.defineProperty(accessor,'density',{enumerable:true,get(){invoked++;return .8}})
  expect(()=>canonicalSourceMaterialContext({...raw,primarySource:{...raw.primarySource,source:accessor}})).toThrow()
  expect(invoked).toBe(0)
})

it('accounts for ordered role texture assets in an empty paired SOURCE2 probe',()=>{
 const a='asset:'+'a'.repeat(64),b='asset:'+'b'.repeat(64),extra='asset:'+'c'.repeat(64)
 const pin=(asset:string)=>({kind:'canvasTexture' as const,asset,law:'pixel-texture-u8-v1' as const,mode:'multiply' as const,width:4,height:4,periodX:4,periodY:4,phase:{kind:'resolved-stroke-phase-v1' as const,x:0,y:0},strength:'recorded-grain-v1' as const,soft:false})
 const raw=context(),c=canonicalSourceMaterialContext({...raw,assets:[a,b,extra].map(id=>({id,size:4,x:0,y:0,width:4,height:4})),primarySource:{kind:'image',asset:extra,brushScale:1,brushAngle:0},maskSource:raw.primarySource,maskingBlend:'multiply',roleTextures:{primary:pin(a),mask:pin(b)}})
 const packed=buildCanonicalMaterial({masked:true,entry:{phase:'between'},draws:[],fences:[]},c).packed
 expect(unpackCanonicalMaterial(packed,c)).toMatchObject({masked:true,definitions:[],draws:[]})
 expect(()=>unpackCanonicalMaterial(mutate(packed,(_v,bytes)=>{const first=bytes.slice(24,64);bytes.copyWithin(24,64,104);bytes.set(first,64)}),c)).toThrow()
 const bytes=Uint8Array.from(atob(packed.slice(2)),x=>x.charCodeAt(0)),enlarged=new Uint8Array(bytes.length+40);enlarged.set(bytes);enlarged[6]=3;enlarged.fill(0xcc,bytes.length,bytes.length+32);const v=new DataView(enlarged.buffer);v.setUint16(bytes.length+32,4,true);v.setUint16(bytes.length+34,4,true)
 expect(()=>unpackCanonicalMaterial('2|'+btoa(String.fromCharCode(...enlarged)),c)).toThrow()
 const duplicate=canonicalSourceMaterialContext({...c,assets:c.assets.filter(asset=>asset.id!==b),roleTextures:{primary:pin(a),mask:pin(a)}})
 expect(unpackCanonicalMaterial(buildCanonicalMaterial({masked:true,entry:{phase:'between'},draws:[],fences:[]},duplicate).packed,duplicate)).toMatchObject({definitions:[]})
})


it('reuses only genuine owning SOURCE2 constructor results and keeps unknown frozen contexts on the full boundary',()=>{
 const raw=context(),owned=canonicalSourceMaterialContext(raw)
 expect(owned).not.toBe(raw);expect(canonicalSourceMaterialContext(owned)).toBe(owned)
 const frozen=Object.freeze({...context(),primarySource:Object.freeze({...raw.primarySource}),budget:Object.freeze({...raw.budget}),assets:Object.freeze([])})
 const captured=canonicalSourceMaterialContext(frozen);expect(captured).not.toBe(frozen);expect(canonicalSourceMaterialContext(captured)).toBe(captured)
 expect(()=>canonicalSourceMaterialContext(Object.freeze({...frozen,budget:Object.freeze({...raw.budget,workUnits:-1})}))).toThrow()
 expect(()=>canonicalSourceMaterialContext(Object.freeze({...frozen,version:3}))).toThrow()
})
it('owns image frames, crop rows, material planes and budget without freezing or retaining caller aliases',()=>{
 const alpha='asset:'+'d'.repeat(64),gray='asset:'+'e'.repeat(64)
 const raw={version:2 as const,assets:[alpha,gray].map(id=>({id,size:16,x:0,y:0,width:8,height:4})),primarySource:{kind:'image' as const,asset:alpha,brushScale:1,brushAngle:0,frames:[alpha,alpha],frameBounds:[{x:0,y:0,width:8,height:4},{x:1,y:1,width:7,height:3}],imageMaterial:{kind:'lightness-map-v1' as const,grayAsset:gray,strength:1,foregroundAlpha:1,grayFrames:[gray,gray]}},imageFrameIndices:'source-image-pipe-frame-v1' as const,materialParams:'source-material-parameters-v1' as const,colorParams:'source-pigment-rgb8-v1' as const,scaledSource:'source-scale-v1' as const,budget:{workUnits:100000,outputBytes:100000,drawPixels:100000}}
 const owned=canonicalSourceMaterialContext(raw);expect(canonicalSourceMaterialContext(owned)).toBe(owned)
 expect(Object.isFrozen(raw.assets)).toBe(false);expect(Object.isFrozen(raw.primarySource.frameBounds[0])).toBe(false)
 raw.assets[0]!.width=1;raw.primarySource.frames[1]=gray;raw.primarySource.frameBounds[1]!.x=9;raw.primarySource.imageMaterial.grayFrames[1]=alpha;raw.budget.workUnits=0
 expect(owned.assets[0]!.width).toBe(8);expect(owned.primarySource).toMatchObject({kind:'image',frames:[alpha,alpha],frameBounds:[{x:0},{x:1}],imageMaterial:{grayFrames:[gray,gray]}})
 const inspect=(value:unknown):void=>{if(value&&typeof value==='object'){expect(Object.isFrozen(value)).toBe(true);for(const v of Object.values(value))inspect(v)}};inspect(owned)
 expect(Reflect.set(owned.assets[0]!,'width',999)).toBe(false)
})
it('captures Gaussian and paired role texture/spatial metadata as own SOURCE2 output',()=>{
 const gaussian:CanonicalMaterialContextV2={...context(),primarySource:{kind:'gaussianAuto',descriptorId:'own-gauss',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{...source,kind:'gaussianAuto',generator:'gauss'},brushScale:1,brushAngle:0,coverageProfile:'scalar-bionic-f64-fma-v1'}}
 const g=canonicalSourceMaterialContext(gaussian);expect(canonicalSourceMaterialContext(g)).toBe(g);expect(g.primarySource).toEqual(gaussian.primarySource)
 const a='asset:'+'a'.repeat(64),pin={kind:'canvasTexture' as const,asset:a,law:'pixel-texture-u8-v1' as const,mode:'multiply' as const,width:4,height:4,periodX:4,periodY:4,phase:{kind:'resolved-stroke-phase-v1' as const,x:0,y:0},strength:'recorded-grain-v1' as const,soft:false}
 const raw={...context(),assets:[{id:a,size:4,x:0,y:0,width:4,height:4}],maskSource:context().primarySource,maskingBlend:'multiply' as const,roleTextures:{primary:pin,mask:null},sourceColorFields:{primary:{kind:'total-random-rgb8-hash-v1' as const},mask:null}}
 const masked=canonicalMaskedSourceMaterialContext(raw);expect(canonicalSourceMaterialContext(masked)).toBe(masked);expect(masked.maskingBlend).toBe('multiply')
 pin.phase.x=1;raw.sourceColorFields.primary.kind='total-random-rgb8-hash-v1';expect(masked.roleTextures!.primary!.phase.x).toBe(0);expect(Object.isFrozen(masked.sourceColorFields!.primary)).toBe(true)
 expect(Object.isFrozen(raw.roleTextures)).toBe(false)
})
it('keeps packed byte, definition, DRAW, fence, cost and expected-count checks live with an owned SOURCE2 context',()=>{
 const c=canonicalSourceMaterialContext(context()),packed=buildCanonicalMaterial(input(recipe()),c).packed
 expect(unpackCanonicalMaterial(packed,c).draws).toHaveLength(1)
 const edits=[(v:DataView)=>v.setUint16(14,256,true),(v:DataView)=>v.setUint16(24+4,9,true),(v:DataView)=>v.setUint16(24+96,9,true),(v:DataView)=>v.setFloat64(24+96+12,2,true),(v:DataView)=>v.setFloat64(24+56,2,true)]
 for(const edit of edits)expect(()=>unpackCanonicalMaterial(mutate(packed,edit),c)).toThrow()
 const capped=canonicalSourceMaterialContext({...context(),expectedDrawCount:0});expect(()=>unpackCanonicalMaterial(packed,capped)).toThrow()
 const fenced=buildCanonicalMaterial({...input(recipe()),fences:[{kind:'primaryEnd',at:1,group:1},{kind:'segmentEnd',at:1,group:1}]},c).packed
 expect(()=>unpackCanonicalMaterial(mutate(fenced,(v,b)=>v.setUint16(b.length-16,2,true)),c)).toThrow()
 expect(unpackCanonicalMaterial(packed,c).draws).toHaveLength(1)
})
it('does not brand legacy callback contexts or skip their per-definition work callbacks',()=>{
 const id='asset:'+'f'.repeat(64),preflightDefinition=vi.fn(()=>({workUnits:1,outputBytes:32})),legacy:CanonicalMaterialContext={assets:[{id,size:8,x:0,y:0,width:8,height:4}],primaryAsset:id,budget:{workUnits:1000,outputBytes:1000,drawPixels:1000},preflightDefinition}
 const image={asset:id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:4,mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:1},draws:[{recipe:image,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[]},legacy).packed
 preflightDefinition.mockClear();unpackCanonicalMaterial(packed,legacy);const first=preflightDefinition.mock.calls.length;expect(first).toBeGreaterThan(0);unpackCanonicalMaterial(packed,legacy);expect(preflightDefinition.mock.calls.length).toBe(first*2)
 expect(()=>canonicalSourceMaterialContext(legacy)).toThrow()
})
