import { expect, it } from 'vitest'
import { buildCanonicalMaterial, unpackCanonicalMaterial, packCanonicalMaterial, type CanonicalMaterialContextV2, type CanonicalMaterialBuildInputV2 } from './canonicalMaterialCodec.js'
import { canonicalSoftAutoSourcePin, canonicalSoftAutoCost, canonicalSoftAutoDataEqual, type CanonicalSoftAutoSource, type CanonicalSoftAutoRecipe } from './canonicalSoftAutoMaterial.js'
import { decodeCanonicalStrokeFrame, CANONICAL_STROKE_RASTER_PROFILE } from './canonicalStrokeFrame.js'
import { sourceAutoGeometry } from './sourceAutoGeometry.js'

function fixture() {
  const curve = (reverse:boolean) => ({text:reverse?'0,1;1,0':'0,0;1,1',points:[{x:0,y:reverse?1:0,corner:false},{x:1,y:reverse?0:1,corner:false}]})
  const pin = (sourceSlot:0|1):CanonicalSoftAutoSource => {
    const softnessCurve=curve(sourceSlot===1)
    return {kind:'softAuto',sourceSlot,descriptorId:'synthetic-soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),
      source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve},
      brushScale:1,brushAngle:0,coverageProfile:'scalar-f64-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),
      radialCurve:{source:softnessCurve,coefficients:[[0,0,sourceSlot===1?-1:1,sourceSlot===1?1:0]]}}
  }
  const primarySource=pin(0),maskSource=pin(1)
  const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
  const recipe=(p:ReturnType<typeof pin>):CanonicalSoftAutoRecipe=>({kind:'softAuto',sourceSlot:p.sourceSlot,source:p.source,coverageProfile:p.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:-0,subX:-0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false})
  const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource,maskSource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
  const input:CanonicalMaterialBuildInputV2={masked:true,entry:{phase:'between'},draws:[{recipe:recipe(primarySource),role:'primary',x:0,y:0,opacity:1,flow:1},{recipe:recipe(maskSource),role:'mask',x:0,y:0,opacity:1,flow:1}],
    fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:2,kind:'segmentEnd',group:0}]}
  return {context,input,primarySource,maskSource}
}
it('keeps equal geometry and different trusted radial curves in distinct tag4 source slots',()=>{
  const {context,input}=fixture(),built=buildCanonicalMaterial(input,context)
  expect(built.frame.definitions).toHaveLength(2)
  const bytes=Uint8Array.from(atob(built.packed.slice(2)),c=>c.charCodeAt(0))
  expect(bytes.length).toBe(24+2*96+2*32+3*16)
  expect([bytes[24],bytes[27],bytes[120],bytes[123]]).toEqual([4,0,4,1])
  expect(unpackCanonicalMaterial(built.packed,context)).toEqual(built.frame)
})
function mutate(packed:string,edit:(v:DataView)=>void) {
  const bytes=Uint8Array.from(atob(packed.slice(2)),c=>c.charCodeAt(0));edit(new DataView(bytes.buffer))
  return '2|'+btoa(String.fromCharCode(...bytes))
}
it.each([1,2])('preserves mirrors, exact dynamic F64 bits and profile code%i',profile=>{
  const f=fixture(),coverageProfile=profile===1?'scalar-f64-fma-v1':'neon64-f32-fma-v1'
  const context:CanonicalMaterialContextV2={...f.context,primarySource:{...f.primarySource,coverageProfile},maskSource:{...f.maskSource,coverageProfile}}
  const input:CanonicalMaterialBuildInputV2={...f.input,draws:f.input.draws.map(d=>{if(d.recipe.kind!=='softAuto')throw Error('Expected soft');return {...d,recipe:{...d.recipe,coverageProfile,mirrorH:true,mirrorV:true}}})}
  const built=buildCanonicalMaterial(input,context),bytes=Uint8Array.from(atob(built.packed.slice(2)),c=>c.charCodeAt(0))
  expect(bytes[25]).toBe(profile);expect(bytes[26]).toBe(3)
  expect(packCanonicalMaterial(built.frame,context)).toBe(built.packed)
  for(const d of built.frame.definitions){expect(Object.is(d.rotation,-0)).toBe(true);expect(Object.is(d.subX,-0)).toBe(true)}
})
it.each([
  (v:DataView)=>v.setUint8(27,2),
  (v:DataView)=>v.setUint8(27,1),
  (v:DataView)=>v.setUint8(25,0),
  (v:DataView)=>v.setUint8(25,3),
  (v:DataView)=>v.setUint8(25,2),
  (v:DataView)=>v.setUint8(26,4),
  (v:DataView)=>v.setUint8(24,5),
  (v:DataView)=>v.setFloat64(32,9,true),
  (v:DataView)=>v.setUint16(28,9,true),
  (v:DataView)=>v.setUint8(216+2,1),
  (v:DataView)=>v.setUint8(24+192+64+2,4),
])('rejects forged slot/profile/static/flags/dimensions/role/fence before returning a decoded frame %#',edit=>{
  const {context,input}=fixture(),built=buildCanonicalMaterial(input,context),snapshot=structuredClone(context)
  expect(()=>unpackCanonicalMaterial(mutate(built.packed,edit),context)).toThrow()
  expect(context).toEqual(snapshot)
})
it('rejects absent, aliased, wrong-kind or wrong-role trusted slots',()=>{
  const f=fixture(),built=buildCanonicalMaterial(f.input,f.context)
  for(const context of [{...f.context,maskSource:undefined},{...f.context,maskSource:f.primarySource},{...f.context,primarySource:f.maskSource},
    {...f.context,primarySource:{kind:'image',asset:'asset:'+'a'.repeat(64),brushScale:1,brushAngle:0}}]) {
    expect(()=>unpackCanonicalMaterial(built.packed,context as CanonicalMaterialContextV2)).toThrow()
  }
})
it('checks pin identity, mapped source/coefficient integrity, closed keys and table domain',()=>{
  const {primarySource:p}=fixture()
  for(const patch of [
    {reader:'another'}, {compilerProfile:'legacy'}, {buildId:'bad'}, {descriptorSha256:'bad'}, {descriptorVersion:0}, {sourceSlot:2}, {coverageProfile:'scalar-bionic-f64-fma-v1'},
    {radialCurve:{...p.radialCurve,source:{...p.radialCurve.source,text:'0,1;1,0'}}},
    {radialCurve:{...p.radialCurve,coefficients:[[0,0,Infinity,0]]}},
    {radialCurve:{...p.radialCurve,coefficients:[]}},
    {source:{...p.source,diameter:4096}}, {source:{...p.source,ratio:2}}, {source:{...p.source,antialias:true}}, {extra:1},
  ])expect(()=>canonicalSoftAutoSourcePin({...p,...patch} as CanonicalSoftAutoSource)).toThrow()
})
it('pins and deeply freezes source and radial data independently of mutable caller objects',()=>{
  const {primarySource}=fixture(),original=structuredClone(primarySource),pin=canonicalSoftAutoSourcePin(original)
  expect(pin).not.toBe(original);expect(pin.source.softnessCurve).not.toBe(original.source.softnessCurve)
  for(const item of [pin,pin.source,pin.source.softnessCurve,pin.source.softnessCurve.points,pin.source.softnessCurve.points[0],pin.radialCurve,pin.radialCurve.source,pin.radialCurve.coefficients,pin.radialCurve.coefficients[0]])expect(Object.isFrozen(item)).toBe(true)
  Object.assign(original.source.softnessCurve.points[0],{y:.5});Object.assign(original.radialCurve.coefficients[0],{0:42})
  expect(pin.source.softnessCurve.points[0].y).toBe(0);expect(pin.radialCurve.coefficients[0][0]).toBe(0)
  expect(canonicalSoftAutoDataEqual(pin,canonicalSoftAutoSourcePin(primarySource))).toBe(true)
  for(const changed of [{...pin,buildId:'c'.repeat(64)},{...pin,descriptorSha256:'c'.repeat(64)},{...pin,sourceSlot:1},{...pin,radialCurve:{...pin.radialCurve,coefficients:[[0,0,2,0]]}}])expect(canonicalSoftAutoDataEqual(pin,changed)).toBe(false)
})
it('deep freezes decoded nested soft curves at the stroke-envelope boundary',()=>{
  const {context,input}=fixture(),built=buildCanonicalMaterial(input,context)
  const composition={mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'} as const
  const envelope={version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:'brush:synthetic-soft@1',strokeId:'s',frameOrdinal:0,pigmentRgb8:[1,2,3],composition,materialPacked:built.packed}
  const decoded=decodeCanonicalStrokeFrame(envelope,{...envelope,pigmentRgb8:[1,2,3],material:context})
  for(const d of decoded.frame.definitions){
    expect(d.kind).toBe('softAuto')
    if(d.kind==='softAuto')for(const item of [d,d.source,d.source.softnessCurve,d.source.softnessCurve.points,...d.source.softnessCurve.points])expect(Object.isFrozen(item)).toBe(true)
  }
})
it('charges each role definition and rejects independently exhausted budgets',()=>{
  const f=fixture(),r=f.input.draws[0].recipe
  if(r.kind!=='softAuto')throw Error('Expected synthetic soft recipe')
  const pixels=r.width*r.height
  expect(canonicalSoftAutoCost(r,f.primarySource)).toEqual({workUnits:pixels,outputBytes:pixels*4})
  for(const budget of [{...f.context.budget,workUnits:2*pixels-1},{...f.context.budget,outputBytes:8*pixels-1},{...f.context.budget,drawPixels:2*pixels-1}])expect(()=>buildCanonicalMaterial(f.input,{...f.context,budget})).toThrow()
  for(const patch of [{sourceSlot:1},{coverageProfile:'neon64-f32-fma-v1'}, {width:r.width+1},{source:f.maskSource.source}])expect(()=>canonicalSoftAutoCost({...r,...patch} as CanonicalSoftAutoRecipe,f.primarySource)).toThrow()
})
it('never deduplicates identical sources across two explicit roles',()=>{
  const f=fixture(),mask=canonicalSoftAutoSourcePin({...f.primarySource,sourceSlot:1})
  const base=f.input.draws[0].recipe
  if(base.kind!=='softAuto')throw Error('Expected soft')
  const input:CanonicalMaterialBuildInputV2={...f.input,draws:f.input.draws.map(d=>d.role==='primary'?d:{...d,recipe:{...base,sourceSlot:1,source:mask.source}})}
  const built=buildCanonicalMaterial(input,{...f.context,maskSource:mask})
  expect(built.frame.definitions).toHaveLength(2)
})
it('rejects forged same-size radial curve data before dictionary construction',()=>{
  const f=fixture(),first=f.input.draws[0]
  if(first.recipe.kind!=='softAuto')throw Error('Expected soft')
  const forged={...first,recipe:{...first.recipe,source:{...first.recipe.source,softnessCurve:f.maskSource.source.softnessCurve}}}
  const before=structuredClone(f.input)
  expect(()=>buildCanonicalMaterial({...f.input,draws:[forged,...f.input.draws.slice(1)]},f.context)).toThrow()
  expect(f.input).toEqual(before)
})
it('owns decoded soft curves after a mutable expected context is subsequently edited',()=>{
  const f=fixture(),built=buildCanonicalMaterial(f.input,f.context),definition=built.frame.definitions[0]
  if(definition.kind!=='softAuto')throw Error('Expected soft')
  Object.assign(f.primarySource.source.softnessCurve.points[0],{y:.5})
  expect(definition.source.softnessCurve.points[0].y).toBe(0)
  expect(()=>unpackCanonicalMaterial(built.packed,f.context)).toThrow()
})
it('keeps tags1/2/3 exact 96-byte legacy layouts and their byte+3 reserved-zero rule',()=>{
  const f=fixture(),original=f.input.draws[0].recipe
  const staticSource={diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2 as const,randomness:0,density:1}
  const pinBase={descriptorId:'legacy',descriptorVersion:1,descriptorSha256:'a'.repeat(64),brushScale:1,brushAngle:0}
  const geometry={brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:-0,subX:-0,subY:0,width:original.width,height:original.height,mirrorH:false,mirrorV:false}
  const cases:Array<{pin:import('./canonicalDefaultAutoMaterial.js').CanonicalAutoSource;recipe:import('./canonicalDefaultAutoMaterial.js').CanonicalAutoRecipe;tag:number}>=[]
  for(const shape of ['circle','rect'] as const) {
    const source={...staticSource,kind:'defaultAuto' as const,generator:'default' as const,shape}
    cases.push({pin:{...pinBase,kind:'defaultAuto',source,coverageProfile:'scalar-f64-fma-v1'},recipe:{...geometry,kind:'defaultAuto',source,coverageProfile:'scalar-f64-fma-v1'},tag:shape==='circle'?1:2})
  }
  const source={...staticSource,kind:'gaussianAuto' as const,generator:'gauss' as const,shape:'circle' as const}
  cases.push({pin:{...pinBase,kind:'gaussianAuto',source,coverageProfile:'scalar-bionic-f64-fma-v1'},recipe:{...geometry,kind:'gaussianAuto',source,coverageProfile:'scalar-bionic-f64-fma-v1'},tag:3})
  for(const row of cases) {
    const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:row.pin,budget:f.context.budget}
    const built=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:0},draws:[{recipe:row.recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[]},context)
    const bytes=new Uint8Array(24+96+32),v=new DataView(bytes.buffer)
    bytes.set([67,77,65,84,2,1,0,0]);v.setUint16(8,1,true);v.setUint16(10,1,true)
    bytes[24]=row.tag;bytes[25]=1;v.setUint16(28,original.width,true);v.setUint16(30,original.height,true)
    ;[8,1,1,1,1,0,1,1,-0,-0,0].forEach((value,i)=>v.setFloat64(32+i*8,value,true))
    v.setFloat64(120+12,1,true);v.setFloat64(120+20,1,true)
    expect(built.packed).toBe('2|'+btoa(String.fromCharCode(...bytes)))
    expect(()=>unpackCanonicalMaterial(mutate(built.packed,v=>v.setUint8(27,1)),context)).toThrow()
  }
})
