import { expect, it, vi } from 'vitest'
import { assertPrimaryCanonicalMaterial, buildCanonicalMaterial, packCanonicalMaterial, unpackCanonicalMaterial, CANONICAL_SOURCE_MATERIAL_PROFILE,
  CANONICAL_MATERIAL_PROFILE, type CanonicalMaterialContextV2, type CanonicalMaterialContext, type CanonicalMaterialFrameV2,
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
