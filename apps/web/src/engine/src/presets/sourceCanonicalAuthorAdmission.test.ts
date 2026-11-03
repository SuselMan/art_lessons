import marker from './fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json'
import {describe,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as generic,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as density,extractDefaultAutoSourceDataCapability,extractGaussianAutoSourceDataCapability,extractSoftAutoSourceDataCapability,isBrushLibrary,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browser,CANONICAL_STROKE_RASTER_PROFILE as native,type BrushDescriptor} from '@grafetto/shared'
import basic6 from './fixtures/sourcePngWholePath/guiStroke.native.json'
import mountains from './fixtures/sourceImagePipe/mountains.native.json'
import graphite from './fixtures/sourceImagePipe/pencilRandom.native.json'
import gaussianStock from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.mapped.native'
import softStock from '../../../../../../packages/shared/src/fixtures/sourceSoftAutoData/stock.native'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {canonicalSourceAuthorAdmission,canonicalDynamicAutoGeometryAuthorAdmission} from './sourceCanonicalAuthorAdmission'
import {canonicalSourceAuthorAdmission as publicAdmission} from '../../brushLibrary'
type Mutable<T>={-readonly[K in keyof T]:Mutable<T[K]>}
function brush(index=4){const row=stock.rows.find(r=>r.index===index);if(!row)throw Error('Native descriptor missing');return structuredClone(row.descriptor) as unknown as Mutable<BrushDescriptor>}
function source(d:BrushDescriptor){if(d.sourceStamp?.version!==2)throw Error('V2 source fixture required');return d.sourceStamp}
describe('pure canonical source author admission shared with engine preparation',()=>{
 it('exports the same data query at the public library boundary without an engine or resource owner',()=>{expect(publicAdmission).toBe(canonicalSourceAuthorAdmission);const d=brush();Object.freeze(d);expect(publicAdmission(d,browser).supported).toBe(true)})
 for(const profile of [native,browser])for(const index of [4,8])it(`retains actual native source ${index} under ${profile}`,()=>{
  const d=brush(index),before=JSON.stringify(d),result=canonicalSourceAuthorAdmission(d,profile)
  expect(result.supported).toBe(true);if(!result.supported)throw Error(result.reason)
  expect(result.data).toBe(d.sourceStamp);if(result.data.version!==2)throw Error('Expected auto DATA2');expect(result.data.source).toMatchObject({kind:'defaultAuto',antialias:true});expect(JSON.stringify(d)).toBe(before)
 })
 it('rejects absent/image source and enabled timing without preparing resources',()=>{
  for(const mutate of [(d:Mutable<BrushDescriptor>)=>{delete d.sourceStamp},(d:Mutable<BrushDescriptor>)=>{Object.assign(source(d),{version:1});Reflect.deleteProperty(d.sourceStamp!,'source')},(d:Mutable<BrushDescriptor>)=>{Object.assign(source(d).timing,{enabled:true})}]){
   const d=brush();mutate(d);expect(canonicalSourceAuthorAdmission(d,browser)).toMatchObject({supported:false})
  }
 })
 it('keeps effect rejection and closed composition as the same first gate',()=>{
  for(const mutate of [(d:Mutable<BrushDescriptor>)=>{d.behavior!.erase=true},(d:Mutable<BrushDescriptor>)=>{d.behavior!.rendering!.wetEdges=1},(d:Mutable<BrushDescriptor>)=>{Reflect.set(d.behavior!,'grain',{})}]){
   const d=brush();mutate(d);expect(canonicalSourceAuthorAdmission(d,browser)).toMatchObject({supported:false});expect(canonicalSourceAuthorAdmission(d,browser)).toEqual({supported:false,reason:'Unsupported canonical source effect: '+(d.behavior?.grain?'brush-effect':'outer-composition')})
  }
 })
 it('accepts bounded one-pressure Size but rejects overflow, negative, nonfinite and multiple sensors',()=>{
  for(const min of [0,.2]){const d=brush(8),size=source(d).options.find(o=>o.id==='Size')!;Object.assign(size,{checked:true,min,max:1,sensors:[{...size.sensors[0],id:'pressure'}]});expect(canonicalSourceAuthorAdmission(d,browser).supported).toBe(true)}
  for(const patch of [{min:-.01},{max:1.01},{min:NaN},{max:Infinity},{sensors:[]},{sensors:[{id:'speed'}]},{sensors:[{id:'pressure'},{id:'pressure'}]}]){
   const d=brush(8),size=source(d).options.find(o=>o.id==='Size')!;Object.assign(size,{checked:true,min:0,max:1},patch);expect(canonicalSourceAuthorAdmission(d,browser)).toMatchObject({supported:false})
  }
 })
 for(const id of ['Ratio','Rotation','Scatter','Mirror'])it(`rejects checked ${id} before any source preparation`,()=>{
  const d=brush(),options=source(d).options,option=options.find(o=>o.id===id);if(!option)throw Error('Retained option missing');Object.assign(option,{checked:true});expect(canonicalSourceAuthorAdmission(d,browser)).toEqual({supported:false,reason:'Unsupported canonical pointer transform/sensor'})
 })
 for(const id of ['rotation','tangentialPressure','perspective','speed'])it(`rejects unsupported ${id} sensor payload before source preparation`,()=>{
  const d=brush(),option=source(d).options.find(o=>o.id==='Opacity')!;Object.assign(option,{checked:true,useCurve:true,sensors:[{...option.sensors[0],id}]});expect(canonicalSourceAuthorAdmission(d,browser)).toMatchObject({supported:false})
 })
})

describe('original image author data, separate from wire V2 authority',()=>{
 for(const [name,fixture,size]of [['basic6',basic6,7.5],['mountains',mountains,360],['graphite',graphite,16]] as const)it(`admits original ${name} metadata with unpadded native size`,()=>{
  const descriptor=fixture.descriptor as unknown as BrushDescriptor,assets='asset'in fixture?[{id:fixture.asset.id,size:fixture.asset.size}]:fixture.assets.map(a=>({id:a.id,size:a.size})),result=canonicalSourceAuthorAdmission(descriptor,native,assets)
  expect(result.supported).toBe(true);if(!result.supported)throw Error(result.reason)
  expect(result.data).toBe(descriptor.sourceStamp);expect(result.nativeSizePx).toBe(size);expect(result.material.kind).toBe('image')
  if(result.material.kind!=='image')throw Error('Expected original image')
  expect(result.material.pin.assets).toHaveLength(assets.length);expect(result.material.pin.primarySource.frames).toEqual(descriptor.tip.animation?.frames)
 })
 it('rejects incomplete pipe metadata and mismatched native side before any compile/effect',()=>{
  const d=mountains.descriptor as unknown as BrushDescriptor,assets=mountains.assets.map(a=>({id:a.id,size:a.size}))
  for(const metadata of [undefined,assets.slice(0,-1),assets.map((a,i)=>i? a:{...a,size:128})])expect(canonicalSourceAuthorAdmission(d,native,metadata)).toMatchObject({supported:false})
 })
 it('rejects metadata accessors without invoking them',()=>{
  const get=vi.fn(()=>256),asset={id:basic6.asset.id};Object.defineProperty(asset,'size',{get})
  expect(canonicalSourceAuthorAdmission(basic6.descriptor as unknown as BrushDescriptor,native,[asset as {id:string;size:number}])).toMatchObject({supported:false});expect(get).not.toHaveBeenCalled()
 })
 for(const id of ['pressure','speed','rotation','tangentialPressure']as const)it(`does not admit image Rotation ${id} as drawingAngle`,()=>{
  const d=structuredClone(basic6.descriptor)as unknown as Mutable<BrushDescriptor>,rotation=d.sourceStamp!.options.find(o=>o.id==='Rotation')!;rotation.sensors[0].id=id
  expect(canonicalSourceAuthorAdmission(d,native,[{id:basic6.asset.id,size:256}])).toMatchObject({supported:false})
 })
 it('keeps malformed source fan law closed',()=>{
  for(const fanStep of [0,4,91,361]){const d=structuredClone(basic6.descriptor)as unknown as Mutable<BrushDescriptor>;d.sourceStamp!.options.find(o=>o.id==='Rotation')!.sensors[0].fanStep=fanStep;expect(canonicalSourceAuthorAdmission(d,native,[{id:basic6.asset.id,size:256}])).toMatchObject({supported:false})}
 })
})

function markerDescriptor(){
 const library:unknown={schemaVersion:1,brushes:[marker.imported],assets:[],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid original Marker')
 return library.brushes[0].descriptor
}
describe('strict seeded source data candidate, not BEGIN authority',()=>{
 it('admits actual mapped Marker only as GenericSC D with original fixed35 and source identity',()=>{
  const d=markerDescriptor(),before=JSON.stringify(d),result=canonicalSourceAuthorAdmission(d,generic)
  expect(result).toMatchObject({supported:true,nativeSizePx:35,material:{kind:'auto',coverageProfile:density}})
  if(!result.supported)throw Error(result.reason)
  expect(result.data).toBe(d.sourceStamp);expect(JSON.stringify(d)).toBe(before)
  for(const p of [native,browser])expect(canonicalSourceAuthorAdmission(d,p)).toMatchObject({supported:false})
 })
 it('keeps non-D rotation and unsupported D sensor/source/effect domains closed',()=>{
  const edits:((d:Mutable<BrushDescriptor>)=>void)[]=[
   d=>{const data=source(d);if(data.source.kind!=='defaultAuto')throw Error('Wrong source');Object.assign(data.source,{density:1})},
   d=>{Reflect.deleteProperty(source(d),'compiled')},
   d=>{Object.assign(source(d),{unsupported:[...source(d).unsupported,'another-unsupported-mechanism']})},
   d=>{Object.assign(source(d).options.find(o=>o.id==='Rotation')!.sensors[0],{id:'drawingAngle'})},
   d=>{Object.assign(source(d).options.find(o=>o.id==='Rotation')!,{useCurve:false})},
   d=>{const r=source(d).options.find(o=>o.id==='Rotation')!;Object.assign(r,{sensors:[...r.sensors,{...r.sensors[0]}]})},
   ...['Ratio','Scatter','Mirror'].map(id=>(d:Mutable<BrushDescriptor>)=>{Object.assign(source(d).options.find(o=>o.id===id)!,{checked:true})}),
   d=>{d.behavior!.erase=true},d=>{Object.assign(source(d).timing,{enabled:true})},
  ]
  for(const edit of edits){const d=structuredClone(markerDescriptor()) as Mutable<BrushDescriptor>;edit(d);expect(canonicalSourceAuthorAdmission(d,generic)).toMatchObject({supported:false})}
 })
 it('retains bounded one-pressure Size for D but refuses wider or mixed sensors',()=>{
  for(const min of [0,.2]){const d=structuredClone(markerDescriptor()) as Mutable<BrushDescriptor>;Object.assign(source(d).options.find(o=>o.id==='Size')!,{checked:true,min,max:1});expect(canonicalSourceAuthorAdmission(d,generic).supported).toBe(true)}
  for(const patch of [{min:-.1},{max:1.1},{sensors:[]},{sensors:[{id:'tiltDirection'}]},{sensors:[{id:'pressure'},{id:'pressure'}]}]){
   const d=structuredClone(markerDescriptor()) as Mutable<BrushDescriptor>;Object.assign(source(d).options.find(o=>o.id==='Size')!,{checked:true,min:0,max:1},patch);expect(canonicalSourceAuthorAdmission(d,generic)).toMatchObject({supported:false})
  }
 })
})

// Self-authored texture metadata over the existing valid image source harness;
// this is not a genuine stock preset provenance claim.
function textureAdmissionFixture(){
 const d=structuredClone(basic6.descriptor)as unknown as Mutable<BrushDescriptor>,pattern={id:'asset:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as const,size:8}
 d.sourceStamp!.flags.textureEnabled=true
 Object.assign(d.sourceStamp!.settings,{'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true','Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true','Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1','Texture/Strength/curveMode':'0','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'})
 d.texture={id:pattern.id,strength:1,periodPx:4,patternSize:{width:4,height:4},application:{mode:'subtract',soft:false},offset:{x:0,y:0,randomX:false,randomY:false}}
 return{d,pattern,available:[{id:basic6.asset.id,size:basic6.asset.size},pattern]}
}
describe('explicit primary texture source pointer policy remains default OFF',()=>{
 const options={primaryTextureSource:'pressure-identity-subtract-v3' as const}
 it('uses genuine shared extraction and returns separate tip pin/pattern capability without mutation',()=>{
  const{d,available,pattern}=textureAdmissionFixture(),before=JSON.stringify(d)
  expect(canonicalSourceAuthorAdmission(d,generic,available)).toMatchObject({supported:false})
  const result=canonicalSourceAuthorAdmission(d,generic,available,options)
  expect(result.supported).toBe(true);if(!result.supported||result.material.kind!=='imageTexture')throw Error('texture admission failed')
  expect(result.material.pin.assets).toHaveLength(1);expect(result.material.capability.patternAsset.id).toBe(pattern.id)
  expect(result.material.capability.primaryTexture.strength).toBe('pressure-identity-v1');expect(result.data).toBe(d.sourceStamp);expect(JSON.stringify(d)).toBe(before)
 })
 it.each(['native','browser','missingPattern','wrongMode','rawCurve','sensor','timing'] as const)('refuses %s while preserving ordinary pointer guards',mode=>{
  const{d,available}=textureAdmissionFixture()
  if(mode==='wrongMode')Reflect.set(d.texture!.application!,'mode','multiply')
  if(mode==='rawCurve')Reflect.set(d.sourceStamp!.settings,'Texture/Strength/Sensor','<params id="pressure"><curve>0,1;1,0;</curve></params>')
  if(mode==='sensor'){const size=d.sourceStamp!.options.find(o=>o.id==='Size')!;size.checked=true;size.sensors[0].id='speed'}
  if(mode==='timing')d.sourceStamp!.timing.enabled=true
  const profile=mode==='native'?native:mode==='browser'?browser:generic
  expect(canonicalSourceAuthorAdmission(d,profile,mode==='missingPattern'?available.slice(0,1):available,options)).toMatchObject({supported:false})
 })
})

it('keeps ordinary image and auto admission identical when primary texture support is enabled globally',()=>{
 const options={primaryTextureSource:'pressure-identity-subtract-v3' as const},image=basic6.descriptor as unknown as BrushDescriptor,available=[{id:basic6.asset.id,size:basic6.asset.size}]
 for(const profile of [native,browser,generic]){
  expect(canonicalSourceAuthorAdmission(image,profile,available,options)).toEqual(canonicalSourceAuthorAdmission(image,profile,available))
  expect(canonicalSourceAuthorAdmission(brush(8),profile,undefined,options)).toEqual(canonicalSourceAuthorAdmission(brush(8),profile))
 }
 const{d,available:assets}=textureAdmissionFixture();Reflect.set(d.texture!.application!,'mode','multiply')
 expect(canonicalSourceAuthorAdmission(d,generic,assets,options)).toMatchObject({supported:false})
})

describe('auto eligibility requires the SAME pure family capability as canonical binding',()=>{
 // Soft inventory retains raw sourceStamp only: the descriptor container is
 // explicitly self-authored from the existing default fixture, not stock identity.
 const families=[['defaultAuto',stock,extractDefaultAutoSourceDataCapability],['gaussianAuto',gaussianStock,extractGaussianAutoSourceDataCapability],['softAuto',{rows:softStock.rows.map(row=>({index:row.index,descriptor:{...brush(),sourceStamp:row.sourceStamp}}))},extractSoftAutoSourceDataCapability]] as const
 for(const [kind,originals,extract]of families){
  it(`never offers original ${kind} outside actual source-data capability`,()=>{
   expect(originals.rows.length).toBeGreaterThan(0)
   for(const row of originals.rows){
    const d=row.descriptor as unknown as BrushDescriptor,before=JSON.stringify(d),cap=extract(d)
    for(const profile of [native,browser,generic]){
     const result=canonicalSourceAuthorAdmission(d,profile)
     if(result.supported)expect(cap.supported,`${kind} actual row ${row.index}`).toBe(true)
    }
    expect(JSON.stringify(d)).toBe(before)
   }
  })
  for(const fault of ['texture','unsupported','rawProgram']as const)it(`rejects ${kind} ${fault} rather than advertising unsupported auto`,()=>{
   // Original family data remains original; edits are explicit diagnostic test
   // cases, never importer provenance or online descriptor migration.
   for(const row of originals.rows){
    const d=structuredClone(row.descriptor) as unknown as Mutable<BrushDescriptor>
    if(!d.sourceStamp)throw Error('Actual source missing')
    if(fault==='texture')d.sourceStamp.flags.textureEnabled=true
    else if(fault==='unsupported')d.sourceStamp.unsupported.push('test-unimplemented-mechanism')
    else {
     Reflect.deleteProperty(d.sourceStamp,'compiled')
     const option=d.sourceStamp.options.find(o=>o.id==='Size')!
     const curve={text:'0,0;0.5,0.25;1,1;',points:[{x:0,y:0,corner:false},{x:.5,y:.25,corner:false},{x:1,y:1,corner:false}]}
     Object.assign(option,{checked:true,useCurve:true,useSameCurve:true,commonCurve:curve});option.sensors=[{id:'pressure',sourceId:'pressure',sourceSlot:0,curve}]
    }
    expect(extract(d).supported).toBe(false)
    expect(canonicalSourceAuthorAdmission(d,generic).supported).toBe(false)
    expect(canonicalSourceAuthorAdmission(d,generic,undefined,{primaryTextureSource:'pressure-identity-subtract-v3'}).supported).toBe(false)
   }
  })
 }
})

import pressureActual from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json'
const pressureDescriptor=pressureActual.descriptor as unknown as BrushDescriptor
it('admits genuine37 only through explicit independent pressure5 with native diameter100',()=>{
 const admitted=Reflect.apply(canonicalSourceAuthorAdmission,undefined,[pressureDescriptor,generic,[pressureActual.patternAsset],{pressureTexturedSource:'pressure-default-auto-texture-v5'}])
 expect(admitted.supported).toBe(true);expect(admitted.nativeSizePx).toBe(100);expect(admitted.material.kind).toBe('autoPressureTexture')
 expect(canonicalSourceAuthorAdmission(pressureDescriptor,generic,[pressureActual.patternAsset]).supported).toBe(false)
 expect(canonicalSourceAuthorAdmission(pressureDescriptor,generic,[pressureActual.patternAsset],{texturedSource:'fixed-default-auto-texture-v4'}).supported).toBe(false)
 expect(Reflect.apply(canonicalSourceAuthorAdmission,undefined,[pressureDescriptor,generic,[],{pressureTexturedSource:'pressure-default-auto-texture-v5'}]).supported).toBe(false)
})

import softActual from '../../../../../../packages/shared/src/fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json'
import gaussianActual from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/pencil3.texture-pressure.compiled3.metadata.json'
describe('future generic7 buildup static DATA admission, not BEGIN authority',()=>{
 const option={texturedAutoSource:'textured-auto-material-v7' as const}
 function variant(f:typeof pressureActual|typeof softActual){
  const d=structuredClone(f.descriptor) as unknown as Mutable<BrushDescriptor>
  d.sourceStamp!.settings.PaintOpAction='1';d.sourceStamp!.flags.indirectPainting=false
  return d
 }
 for(const [name,f]of [['Default',pressureActual],['Soft',softActual]]as const)for(const profile of [generic,browser]){
  it(`admits consistent self-authored ${name} buildup OVER only through generic7 under ${profile}`,()=>{
   const d=variant(f),before=JSON.stringify(d)
   expect(canonicalSourceAuthorAdmission(d,profile,[f.patternAsset],option)).toMatchObject({supported:true,material:{kind:'texturedAuto'}})
   expect(JSON.stringify(d)).toBe(before)
   for(const flags of [undefined,{pressureTexturedSource:'pressure-default-auto-texture-v5' as const},{softPressureTexturedSource:'pressure-soft-auto-texture-v6' as const},{texturedSource:'fixed-default-auto-texture-v4' as const}])expect(Reflect.apply(canonicalSourceAuthorAdmission,undefined,[d,profile,[f.patternAsset],flags]).supported).toBe(false)
  })
  it(`preserves original ${name} WASH metadata and generic7 admission under ${profile}`,()=>{
   const before=JSON.stringify(f)
   expect(canonicalSourceAuthorAdmission(f.descriptor as unknown as BrushDescriptor,profile,[f.patternAsset],option)).toMatchObject({supported:true,material:{kind:'texturedAuto'}})
   expect(JSON.stringify(f)).toBe(before)
  })
 }
 it('admits genuine Gaussian single TiltDirection only after generic7 extraction, without metadata edits',()=>{
  const before=JSON.stringify(gaussianActual)
  expect(canonicalSourceAuthorAdmission(gaussianActual.descriptor as unknown as BrushDescriptor,generic,[gaussianActual.patternAsset],option)).toMatchObject({supported:true,material:{kind:'texturedAuto'}})
  expect(JSON.stringify(gaussianActual)).toBe(before)
 })
 it('does not downgrade malformed buildup to older routes or bypass effects, timing or sensors',()=>{
  const edits:((d:Mutable<BrushDescriptor>)=>void)[]=[
   d=>{Reflect.deleteProperty(d.sourceStamp!,'compiled')},d=>{d.sourceStamp!.flags.textureEnabled=false},
   d=>{d.sourceStamp!.timing.enabled=true},d=>{d.behavior!.erase=true},
   d=>{Reflect.set(d.behavior!,'dual',{brush:brush()})},
   d=>{d.behavior!.rendering!.blendMode='multiply'},
   d=>{d.sourceStamp!.options.find(o=>o.id==='Rotation')!.checked=true},
   d=>{const s=d.sourceStamp!.options.find(o=>o.id==='Size')!;s.checked=true;s.sensors[0].id='speed'},
   d=>{Reflect.set(d.texture!.application!,'mode','multiply')},
   d=>{Reflect.set(source(d).source,'kind','image')},
  ]
  for(const edit of edits){const d=variant(pressureActual);edit(d);expect(canonicalSourceAuthorAdmission(d,generic,[pressureActual.patternAsset],option).supported).toBe(false)}
  const d=variant(pressureActual)
  for(const assets of [[],[{...pressureActual.patternAsset,size:1}]])expect(canonicalSourceAuthorAdmission(d,generic,assets,option).supported).toBe(false)
  const image=structuredClone(basic6.descriptor)as unknown as Mutable<BrushDescriptor>;image.sourceStamp!.settings.PaintOpAction='1';image.sourceStamp!.flags.indirectPainting=false
  expect(canonicalSourceAuthorAdmission(image,generic,[{id:basic6.asset.id,size:basic6.asset.size}],option).supported).toBe(false)
  const plain=brush();plain.sourceStamp!.settings.PaintOpAction='1';plain.sourceStamp!.flags.indirectPainting=false
  expect(canonicalSourceAuthorAdmission(plain,generic,[],option).supported).toBe(false)
 })
})

it('keeps genuine Pencil3 older routes and unsupported Rotation sensors closed',()=>{
 const d=gaussianActual.descriptor as unknown as BrushDescriptor
 for(const profile of[generic,browser]){
  expect(canonicalSourceAuthorAdmission(d,profile,[gaussianActual.patternAsset],{texturedAutoSource:'textured-auto-material-v7'})).toMatchObject({supported:true,nativeSizePx:10,material:{kind:'texturedAuto'}})
  for(const flags of[undefined,{pressureTexturedSource:'pressure-default-auto-texture-v5'},{softPressureTexturedSource:'pressure-soft-auto-texture-v6'}])expect(Reflect.apply(canonicalSourceAuthorAdmission,undefined,[d,profile,[gaussianActual.patternAsset],flags]).supported).toBe(false)
 }
 for(const sensor of['xTilt','yTilt','tiltElevation','rotation','drawingAngle','speed']){
  const changed=structuredClone(d)as Mutable<BrushDescriptor>;changed.sourceStamp!.options.find(o=>o.id==='Rotation')!.sensors[0].id=sensor as 'pressure'
  expect(canonicalSourceAuthorAdmission(changed,generic,[gaussianActual.patternAsset],{texturedAutoSource:'textured-auto-material-v7'}).supported).toBe(false)
 }
})

import {canonicalPlainAutoGeometryAuthorAdmission} from './sourceCanonicalAuthorAdmission'
import {canonicalPlainAutoGeometryAuthorAdmission as publicPlainGeometryAdmission} from '../../brushLibrary'
const plainGeometryOriginal=()=>JSON.parse("{\"id\":\"imported-67f65bbe3ded26b41e1b77ef\",\"version\":27,\"model\":\"stamp\",\"category\":\"paint\",\"tip\":{\"kind\":\"procedural\",\"hardness\":0.93,\"aspect\":1,\"angle\":-1.5708,\"rotation\":\"fixed\",\"profile\":{\"kind\":\"standard\",\"shape\":\"ellipse\",\"horizontalFade\":0.93,\"verticalFade\":0.93,\"antialias\":false}},\"paperInteraction\":0,\"spacing\":0.04,\"flow\":1,\"flowPer\":\"stamp\",\"sizeByPressure\":[[0,1],[1,1]],\"flowByPressure\":[[0,1],[1,1]],\"opacityByPressure\":{\"kind\":\"uniform\",\"samples\":[0,0.00234143401048978,0.004684426943197697,0.007030537720341888,0.009381325264140488,0.011738348496811638,0.01410316634057347,0.016477337717644123,0.01886242155024174,0.02125997676058445,0.023671562270890387,0.02609873700337769,0.028543059880264506,0.031006089823768967,0.0334893857561092,0.03599450659950335,0.038523011276169555,0.04107644754335461,0.043655731983274645,0.04626082449598981,0.04889160516449116,0.05154795407176976,0.05422975130081657,0.05693687693462265,0.059669211056179026,0.062426633748476644,0.06520902509450663,0.06801626517725987,0.07084823407972753,0.07370481188490047,0.0765858786757699,0.07949131453532667,0.08242099954656193,0.08537481379246656,0.08835263735603174,0.09135435032024834,0.09437983276810749,0.09742896478260013,0.1005016264467174,0.10359769784345016,0.10671705905578954,0.10985959016672647,0.11302517125925213,0.11621368241635735,0.11942500372103329,0.12265901525627085,0.12591559710506114,0.1291946293503952,0.13249599207526394,0.1358195653626584,0.1391652292955698,0.14253286395698883,0.14592234942990678,0.1493335657973145,0.15276639314220325,0.15622071154756367,0.1596964010963871,0.1631933418716644,0.16671141395638678,0.17025049743354498,0.17381047238613018,0.17739121889713333,0.18099261704954564,0.18461454692635793,0.1882568886105612,0.19191952218514657,0.1956023277331051,0.19930518533742775,0.20302797508110546,0.20677057704712937,0.21053287131849052,0.21431473797817974,0.21811605710918824,0.22193670879450694,0.22577657311712693,0.22963553016003918,0.23351346000623474,0.2374102427387046,0.2413257584404398,0.24525988719443131,0.24921250908367026,0.2531835041911475,0.2571727525998542,0.2611801343927814,0.26520552965291994,0.26924881846326104,0.27330988090679564,0.27738859706651464,0.28148484702540927,0.2855985108664704,0.2897294686726891,0.2938776005270564,0.29804278651256333,0.30222490671220087,0.30642384120896005,0.31063947008583187,0.31487167342580746,0.3191203313118776,0.32338532382703356,0.32766653105426635,0.33196383307656674,0.336277109976926,0.3406062418383351,0.344951108743785,0.34931159077626667,0.35368756801877127,0.35807892055428975,0.3624855284658131,0.3669072718363324,0.37134403074883865,0.37579568528632284,0.380262115531776,0.3847432015681892,0.3892388234785533,0.39374886134585957,0.39827319525309895,0.40281170528326227,0.40736427151934074,0.4119307740443254,0.41651109294120703,0.4211051082929769,0.4257127001826259,0.43033374869314517,0.43496813390752576,0.43961573590875835,0.4442764347798344,0.4489501106037447,0.4536366434634801,0.45833591344203206,0.46304780062239115,0.4677721850875488,0.47250894692049555,0.4772579662042229,0.48201912302172173,0.48679229745598285,0.4915773695899973,0.49637421950675653,0.501182727289251,0.506002773020472,0.5108342367834107,0.5156769986610579,0.5205309387364045,0.5253959370924419,0.5302718738121608,0.5351586289785523,0.5400560826746075,0.5449641149833173,0.5498826059876728,0.5548114357706652,0.5597504844152852,0.5646996320045239,0.5696587586213724,0.5746277443488216,0.5796064692698626,0.5845948134674867,0.5895926570246842,0.594599880024447,0.5996163625497655,0.604641984683631,0.6096766265090341,0.6147201681089665,0.6197724895664186,0.6248334709643819,0.629902992385847,0.6349809339138053,0.6400671756312476,0.645161597621165,0.6502640799665483,0.655374502750389,0.6604927460556775,0.6656186899654053,0.6707522145625632,0.6758931999301424,0.6810415261511337,0.6861970733085283,0.691359721485317,0.696529350764491,0.7017058412290412,0.7068890729619589,0.7120789260462347,0.71727528056486,0.7224780166008257,0.7276870142371226,0.7329021535567419,0.7381233146426748,0.7433503775779119,0.7485832224454446,0.7538217293282636,0.7590657783093604,0.7643152494717256,0.7695700228983503,0.7748299786722254,0.7800949968763423,0.7853649575936916,0.7906397409072647,0.7959192269000522,0.8012032956550456,0.8064918272552356,0.8117847017836133,0.8170817993231695,0.8223829999568957,0.8276881837677824,0.8329972308388209,0.8383100212530024,0.8436264350933177,0.8489463524427575,0.8542696533843135,0.8595962180009762,0.8649259263757367,0.8702586585915862,0.8755942947315157,0.880932714878516,0.8862737991155785,0.8916174275256938,0.8969634801918531,0.9023118371970474,0.9076623786242679,0.9130149845565052,0.9183695350767509,0.9237259102679953,0.9290839902132303,0.9344436549954463,0.9398047846976343,0.9451672594027855,0.950530959193891,0.9558957641539415,0.9612615543659284,0.9666282099128426,0.9719956108776749,0.9773636373434168,0.9827321693930589,0.9881010871095923,0.993470270576008,0.998839599875297,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],\"endpointEpsilon\":1e-06,\"preserveInputSign\":true},\"pressureSmoothingPx\":0,\"opacity\":1,\"behavior\":{\"version\":2,\"speedInput\":{\"version\":1,\"space\":\"view\",\"maximum\":30,\"estimator\":\"grafettoEMA30ms\"},\"rendering\":{\"opacityCeiling\":\"uniform\",\"mode\":\"buildUp\",\"blendMode\":\"normal\",\"wetEdges\":0,\"burntEdges\":0,\"burntEdgesMode\":\"multiply\",\"accumulation\":\"alphaDarken\"},\"spacing\":{\"mode\":\"diameter\",\"coefficient\":0.04},\"modulations\":{\"size\":[{\"control\":\"tiltElevation\",\"minimum\":0,\"jitter\":0,\"curve\":{\"kind\":\"uniform\",\"samples\":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0.9972506705797348,0.9932791720636099,0.9893076735474851,0.9853361750313602,0.9813646765152353,0.9773931779991101,0.9734216794829852,0.9694501809668603,0.9654786824507354,0.9615071839346105,0.9575356854184855,0.9535641869023604,0.9495926883862356,0.9456211898701107,0.9416496913539858,0.9376781928378609,0.9337066943217359,0.929735195805611,0.9257636972894862,0.9217921987733613,0.9178207002572363,0.9138492017411113,0.9098777032249863,0.9059062047088614,0.9019347061927365,0.8979632076766116,0.8939917091604865,0.8900202106443615,0.8860487121282367,0.8820772136121118,0.8781057150959869,0.874134216579862,0.870162718063737,0.8661912195476121,0.8622197210314873,0.8582482225153623,0.8542767239992374,0.8503052254831124,0.8463337269669874,0.8423622284508625,0.8383907299347376,0.8344192314186127,0.8304477329024876,0.8264762343863628,0.8225047358702378,0.8185332373541129,0.814561738837988,0.8105902403218631,0.8066187418057382,0.8026472432896131,0.7986757447734882,0.7947042462573634,0.7907327477412385,0.7867612492251135,0.7827897507089886,0.7788182521928636,0.7748467536767386,0.7708752551606137,0.7669037566444887,0.7629322581283638,0.758960759612239,0.754989261096114,0.7510177625799891,0.7470462640638642,0.7430747655477392,0.7391032670316143,0.7351317685154893,0.7311602699993645,0.7271887714832396,0.7232172729671146,0.7192457744509897,0.7152742759348647,0.7113027774187397,0.7073312789026148,0.7033597803864898,0.699388281870365,0.6954167833542401,0.6914452848381152,0.6874737863219901,0.6835022878058652,0.6795307892897403,0.6755592907736154,0.6715877922574905,0.6676162937413656,0.6636447952252407,0.6596732967091157,0.6557017981929907,0.6517302996768658,0.6477588011607409,0.6437873026446159,0.6398158041284909,0.635844305612366,0.6318728070962412,0.6279013085801162,0.6239298100639912,0.6199583115478663,0.6159868130317414,0.6120153145156165,0.6080438159994916,0.6040723174833666,0.6001008189672415,0.5961293204511167,0.5921578219349918,0.5881863234188669,0.584214824902742,0.580243326386617,0.5762718278704921,0.572300329354367,0.5683288308382421,0.5643573323221173,0.5603858338059924,0.5564143352898674,0.5524428367737425,0.5484713382576176,0.5444998397414926,0.5405283412253677,0.5365568427092428,0.5325853441931178,0.5286138456769929,0.524642347160868,0.5206708486447431,0.5166993501286181,0.5127278516124932,0.5087563530963682,0.5047848545802432,0.5008133560641184,0.4968418575479935,0.49287035903186854,0.4888988605157436,0.48492736199961867,0.48095586348349373,0.47698436496736885,0.47301286645124385,0.4690413679351189,0.465069869418994,0.4610983709028691,0.45712687238674415,0.4531553738706192,0.44918387535449433,0.4452123768383693,0.44124087832224435,0.43726937980611946,0.4332978812899946,0.4293263827738696,0.4253548842577447,0.4213833857416198,0.4174118872254949,0.41344038870936994,0.40946889019324495,0.40549739167712,0.4015258931609951,0.3975543946448702,0.39358289612874525,0.38961139761262037,0.38563989909649543,0.3816684005803704,0.37769690206424544,0.37372540354812056,0.3697539050319956,0.3657824065158707,0.3618109079997458,0.3578394094836209,0.3538679109674959,0.34989641245137104,0.34592491393524605,0.34195341541912105,0.33798191690299617,0.3340104183868713,0.33003891987074635,0.3260674213546214,0.32209592283849653,0.3181244243223715,0.31415292580624654,0.3101814272901216,0.3062099287739967,0.30223843025787184,0.2982669317417469,0.29429543322562196,0.290323934709497,0.28635243619337214,0.28238093767724715,0.2784094391611222,0.27443794064499727,0.2704664421288724,0.26649494361274745,0.2625234450966225,0.2585519465804976,0.2545804480643726,0.25060894954824764,0.24663745103212276,0.24266595251599782,0.2386944539998729,0.23472295548374797,0.23075145696762306,0.22677995845149812,0.22280845993537324,0.21883696141924822,0.2148654629031233,0.21089396438699837,0.20692246587087346,0.20295096735474855,0.1989794688386236,0.1950079703224987,0.19103647180637365,0.18706497329024874,0.18309347477412383,0.17912197625799892,0.17515047774187398,0.17117897922574907,0.16720748070962416,0.16323598219349922,0.1592644836773743,0.15529298516124931,0.15132148664512438,0.14734998812899947,0.14337848961287455,0.13940699109674962,0.1354354925806247,0.13146399406449982,0.12749249554837475,0.12352099703224984,0.11954949851612492,0.115578],\"endpointEpsilon\":1e-06,\"preserveInputSign\":true}}],\"roundness\":[{\"control\":\"tiltElevation\",\"minimum\":0,\"jitter\":0,\"curve\":{\"kind\":\"uniform\",\"samples\":[0.0351759,0.0355642249951167,0.03595323704205962,0.03634362319265497,0.03673607049872894,0.03713126601210778,0.03752989678461769,0.037932649868084874,0.03834021231433556,0.038753271175195954,0.03917251350249227,0.03959862634805071,0.040032296763697524,0.04047421180125889,0.04092505851256103,0.04138552394943015,0.04185629516369249,0.04233805920717425,0.04283150313170164,0.04333731398910087,0.04385617883119816,0.044388784709819724,0.04493581867679177,0.04549796778394052,0.046075919083092186,0.04667035962607298,0.0472819764647091,0.047911456650826786,0.048559487236252245,0.04922675527281167,0.04991394781233131,0.05062175190663734,0.05135085460755601,0.0521019429669135,0.05287570403653604,0.05367282486824987,0.05449399251388116,0.055339894025256124,0.05621121645420101,0.05710864685254202,0.05803287227210533,0.058984579764717215,0.059964456382203844,0.060973189176391454,0.06201146519910625,0.06307997150217443,0.06417939513742224,0.06531042315667589,0.06647374261176156,0.06767004055450548,0.06890000403673387,0.07016432011027296,0.07146367582694893,0.072798758238588,0.0741702543970164,0.07557885135406034,0.07702523616154604,0.07851009587129967,0.0800341175351475,0.08159798820491573,0.08320239493243053,0.08484802476951818,0.08653556476800486,0.0882657019797168,0.09003912345648014,0.09185651625012119,0.0937185674124661,0.09562596392436595,0.09757919908167,0.09957815047952737,0.1016225736460636,0.10371222410940391,0.1058468573976739,0.10802622903899874,0.11025009456150389,0.11251820949331473,0.11483032936255667,0.11718620969735515,0.11958560602583546,0.12202827387612297,0.12451396877634305,0.1270424462546212,0.1296134618390827,0.13222677105785294,0.13488212943905736,0.13757929251082135,0.14031801580127018,0.14309805483852925,0.1459191651507241,0.14878110226597996,0.15168362171242225,0.15462647901817636,0.15760942971136777,0.16063222932012167,0.16369463337256368,0.1667963973968189,0.16993727692101296,0.173117027473271,0.1763354045817187,0.17959216377448126,0.18288706057968407,0.18621985052545248,0.189590289139912,0.1929981319511879,0.19644313448740564,0.19992505227669055,0.20344364084716798,0.20699865572696347,0.21058985244420209,0.21421698652700966,0.21787981350351127,0.22157808890183228,0.22531156825009824,0.2290800070764344,0.23288316090896616,0.23672078527581908,0.2405926357051183,0.2444984677249893,0.24843803686355742,0.2524110986489482,0.2564174086092868,0.26045672227269867,0.2645287951673093,0.26863338282124405,0.2727702407626282,0.2769391245195873,0.28113978962024655,0.2853719915927314,0.28963548596516725,0.29393002826567943,0.29825537402239344,0.3026112787634345,0.3069974980169282,0.31141378731099983,0.3158599021737747,0.3203355981333782,0.3248406307179357,0.3293747554555727,0.33393772787441456,0.33852930350258653,0.3431492378682143,0.3477972864994229,0.3524732049243378,0.3571767486710844,0.3619076732677883,0.36666573424257454,0.3714506871235687,0.3762622874388961,0.38110029071668217,0.38596445248505246,0.390854528272132,0.3957702736060463,0.40071144401492076,0.40567779502688084,0.41066908217005194,0.4156850609725592,0.4207254869625284,0.4257901156680846,0.4308787026173533,0.43599100333845975,0.4411267733595295,0.4462857682086877,0.4514677434140602,0.456672454503772,0.46189965700594854,0.4671491064487153,0.4724205583601977,0.47771376826852074,0.48302849170181017,0.48836448418819134,0.4937215012557896,0.4990992984327304,0.504497631247139,0.5099162552271408,0.5153549259008611,0.5208133987964255,0.5262914294419592,0.5317887733655875,0.5373051860954362,0.5428404231596303,0.5483942400862952,0.5539663924035568,0.5595566356395398,0.5651647253223698,0.5707904169801723,0.5764334661410725,0.582093628333196,0.5877706590846682,0.5934643139236142,0.5991743483781596,0.6049005179764296,0.6106425782465499,0.6164002847166457,0.6221733929148421,0.6279616583692651,0.6337648366080395,0.6395826831592909,0.6454149535511451,0.6512614033117268,0.6571217879691618,0.6629958630515752,0.6688833840870926,0.6747841066038393,0.6806977861299407,0.6866241781935224,0.6925630383227095,0.6985141220456272,0.7044771848904012,0.710451982385157,0.7164382700580196,0.7224358034371148,0.7284443380505677,0.7344636294265037,0.7404934330930485,0.7465335045783268,0.7525835994104647,0.7586434731175872,0.7647128812278198,0.7707915792692878,0.7768793227701165,0.7829758672584317,0.7890809682623583,0.795194381310022,0.801315861929548,0.8074451656490618,0.8135820479966885,0.8197262645005539,0.8258775706887833,0.8320357220895017,0.8382004742308352,0.8443715826409083,0.8505488028478472,0.8567318903797766,0.8629206007648222,0.8691146895311096,0.8753139122067638,0.8815180243199106,0.8877267813986748,0.8939399389711822,0.9001572525655581,0.9063784777099279,0.9126033699324169,0.9188316847611505,0.9250631777242544,0.9312976043498533,0.9375347201660734,0.9437742807010394,0.9500160414828771,0.9562597580397116,0.9625051858996684,0.968752080590873,0.9750001976414507,0.981249292579527,0.987499120933227,0.9937494382306762,1],\"endpointEpsilon\":1e-06,\"preserveInputSign\":true}},{\"control\":\"off\",\"minimum\":0,\"jitter\":0,\"curve\":[[0,1],[1,1]]}]},\"dynamics\":{\"angle\":{\"control\":\"tiltDirection\",\"minimum\":0,\"jitter\":0,\"curve\":[[0,0],[1,1]]}}},\"sourceStamp\":{\"version\":2,\"source\":{\"kind\":\"defaultAuto\",\"generator\":\"default\",\"shape\":\"circle\",\"diameter\":60,\"ratio\":1,\"horizontalFade\":0.93,\"verticalFade\":0.93,\"antialias\":false,\"spikes\":2,\"randomness\":0,\"density\":1},\"reader\":\"krita-bd6e8d0-v1\",\"role\":\"primary\",\"settings\":{\"ColorSource/Type\":\"plain\",\"FlowSensor\":\"<!DOCTYPE params> <params id=\\\"pressure\\\"/> \",\"FlowUseCurve\":\"false\",\"FlowUseSameCurve\":\"true\",\"FlowValue\":\"1\",\"FlowcurveMode\":\"0\",\"HorizontalMirrorEnabled\":\"false\",\"KisPrecisionOption/AutoPrecisionEnabled\":\"true\",\"KisPrecisionOption/DeltaValue\":\"30\",\"KisPrecisionOption/SizeToStartFrom\":\"10\",\"KisPrecisionOption/precisionLevel\":\"4\",\"MaskingBrush/Enabled\":\"false\",\"MaskingBrush/MaskingCompositeOp\":\"multiply\",\"MaskingBrush/MasterSizeCoeff\":\"4.154166666666667\",\"MaskingBrush/UseMasterSize\":\"true\",\"MirrorSensor\":\"<!DOCTYPE params> <params id=\\\"pressure\\\"> <curve>0,0;1,1;</curve> </params> \",\"MirrorUseCurve\":\"true\",\"MirrorUseSameCurve\":\"true\",\"MirrorValue\":\"1\",\"MirrorcurveMode\":\"0\",\"OpacitySensor\":\"<!DOCTYPE params> <params id=\\\"pressure\\\"> <curve>0,0;0.0653266,0.040201;0.914573,1;</curve> </params> \",\"OpacityUseCurve\":\"true\",\"OpacityUseSameCurve\":\"true\",\"OpacityValue\":\"1\",\"OpacitycurveMode\":\"0\",\"PaintOpAction\":\"2\",\"PaintOpSettings/ignoreSpacing\":\"false\",\"PaintOpSettings/isAirbrushing\":\"false\",\"PaintOpSettings/rate\":\"20\",\"PaintOpSettings/updateSpacingBetweenDabs\":\"false\",\"PressureDarken\":\"false\",\"PressureMirror\":\"false\",\"PressureMix\":\"false\",\"PressureRate\":\"false\",\"PressureRatio\":\"true\",\"PressureRotation\":\"true\",\"PressureScatter\":\"false\",\"PressureSharpness\":\"false\",\"PressureSize\":\"true\",\"PressureSoftness\":\"false\",\"PressureSpacing\":\"false\",\"PressureTexture/Strength/\":\"true\",\"Pressureh\":\"false\",\"Pressures\":\"false\",\"Pressurev\":\"false\",\"RateSensor\":\"<!DOCTYPE params> <params id=\\\"pressure\\\"/> \",\"RateUseCurve\":\"true\",\"RateUseSameCurve\":\"true\",\"RateValue\":\"1\",\"RatecurveMode\":\"0\",\"RatioSensor\":\"<!DOCTYPE params> <params id=\\\"declination\\\"> <curve>0,0.0351759;0.262443,0.0954774;1,1;</curve> </params> \",\"RatioUseCurve\":\"true\",\"RatioUseSameCurve\":\"true\",\"RatioValue\":\"1\",\"RatiocurveMode\":\"0\",\"RotationSensor\":\"<!DOCTYPE params> <params id=\\\"ascension\\\"> <curve>0,0;1,1;</curve> </params> \",\"RotationUseCurve\":\"true\",\"RotationUseSameCurve\":\"true\",\"RotationValue\":\"1\",\"RotationcurveMode\":\"0\",\"ScatterSensor\":\"<!DOCTYPE params> <params id=\\\"pressure\\\"> <curve>0,0;1,1;</curve> </params> \",\"ScatterUseCurve\":\"true\",\"ScatterUseSameCurve\":\"true\",\"ScatterValue\":\"1\",\"ScattercurveMode\":\"0\",\"Scattering/AxisX\":\"true\",\"Scattering/AxisY\":\"true\",\"Sharpness/threshold\":\"4\",\"SharpnessSensor\":\"<!DOCTYPE params> <params id=\\\"pressure\\\"> <curve>0,0;1,1;</curve> </params> \",\"SharpnessUseCurve\":\"true\",\"SharpnessUseSameCurve\":\"true\",\"SharpnessValue\":\"1\",\"SharpnesscurveMode\":\"0\",\"SizeSensor\":\"<!DOCTYPE params> <params id=\\\"declination\\\"> <curve>0.126697,1;1,0.115578;</curve> </params> \",\"SizeUseCurve\":\"true\",\"SizeUseSameCurve\":\"true\",\"SizeValue\":\"1\",\"SizecurveMode\":\"0\",\"SoftnessSensor\":\"<!DOCTYPE params> <params id=\\\"pressure\\\"> <curve>0,0;1,1;</curve> </params> \",\"SoftnessUseCurve\":\"true\",\"SoftnessUseSameCurve\":\"true\",\"SoftnessValue\":\"1\",\"SoftnesscurveMode\":\"0\",\"Spacing/Isotropic\":\"false\",\"SpacingSensor\":\"<!DOCTYPE params> <params id=\\\"pressure\\\"/> \",\"SpacingUseCurve\":\"true\",\"SpacingUseSameCurve\":\"true\",\"SpacingValue\":\"1\",\"SpacingcurveMode\":\"0\",\"Texture/Pattern/Enabled\":\"false\",\"VerticalMirrorEnabled\":\"false\",\"brush_definition\":\"<Brush autoSpacingCoeff=\\\"1\\\" BrushVersion=\\\"2\\\" useAutoSpacing=\\\"0\\\" density=\\\"1\\\" spacing=\\\"0.04\\\" angle=\\\"1.5708\\\" randomness=\\\"0\\\" type=\\\"auto_brush\\\"> <MaskGenerator ratio=\\\"1\\\" antialiasEdges=\\\"0\\\" diameter=\\\"60\\\" vfade=\\\"0.93\\\" id=\\\"default\\\" hfade=\\\"0.93\\\" spikes=\\\"2\\\" type=\\\"circle\\\"/> </Brush> \"},\"brush\":{\"width\":60,\"height\":60,\"scale\":1,\"angle\":1.5708},\"spacing\":{\"value\":0.04,\"automatic\":false,\"coefficient\":1,\"isotropic\":false},\"timing\":{\"enabled\":false,\"rate\":20,\"ignoreDistance\":false},\"precision\":{\"level\":4,\"automatic\":true},\"flags\":{\"scatterX\":true,\"scatterY\":true,\"mirrorX\":false,\"mirrorY\":false,\"indirectPainting\":true,\"textureEnabled\":false,\"materialFixed1\":true},\"options\":[{\"id\":\"Size\",\"checkable\":true,\"checked\":true,\"useCurve\":true,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0.126697,1;1,0.115578;\",\"points\":[{\"x\":0.126697,\"y\":1,\"corner\":false},{\"x\":1,\"y\":0.115578,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":1,\"sensors\":[{\"id\":\"tiltElevation\",\"sourceId\":\"declination\",\"sourceSlot\":7,\"curve\":{\"text\":\"0.126697,1;1,0.115578;\",\"points\":[{\"x\":0.126697,\"y\":1,\"corner\":false},{\"x\":1,\"y\":0.115578,\"corner\":false}]}}]},{\"id\":\"Rotation\",\"checkable\":true,\"checked\":true,\"useCurve\":true,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":1,\"sensors\":[{\"id\":\"tiltDirection\",\"sourceId\":\"ascension\",\"sourceSlot\":6,\"curve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]}}]},{\"id\":\"Ratio\",\"checkable\":true,\"checked\":true,\"useCurve\":true,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0,0.0351759;0.262443,0.0954774;1,1;\",\"points\":[{\"x\":0,\"y\":0.0351759,\"corner\":false},{\"x\":0.262443,\"y\":0.0954774,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":1,\"sensors\":[{\"id\":\"tiltElevation\",\"sourceId\":\"declination\",\"sourceSlot\":7,\"curve\":{\"text\":\"0,0.0351759;0.262443,0.0954774;1,1;\",\"points\":[{\"x\":0,\"y\":0.0351759,\"corner\":false},{\"x\":0.262443,\"y\":0.0954774,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]}}]},{\"id\":\"Scatter\",\"checkable\":true,\"checked\":false,\"useCurve\":true,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":5,\"sensors\":[{\"id\":\"pressure\",\"sourceId\":\"pressure\",\"sourceSlot\":0,\"curve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]}}]},{\"id\":\"Opacity\",\"checkable\":false,\"checked\":true,\"useCurve\":true,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0,0;0.0653266,0.040201;0.914573,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":0.0653266,\"y\":0.040201,\"corner\":false},{\"x\":0.914573,\"y\":1,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":1,\"sensors\":[{\"id\":\"pressure\",\"sourceId\":\"pressure\",\"sourceSlot\":0,\"curve\":{\"text\":\"0,0;0.0653266,0.040201;0.914573,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":0.0653266,\"y\":0.040201,\"corner\":false},{\"x\":0.914573,\"y\":1,\"corner\":false}]}}]},{\"id\":\"Flow\",\"checkable\":false,\"checked\":true,\"useCurve\":false,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":1,\"sensors\":[{\"id\":\"pressure\",\"sourceId\":\"pressure\",\"sourceSlot\":0,\"curve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]}}]},{\"id\":\"Mirror\",\"checkable\":true,\"checked\":false,\"useCurve\":true,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":1,\"sensors\":[{\"id\":\"pressure\",\"sourceId\":\"pressure\",\"sourceSlot\":0,\"curve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]}}]},{\"id\":\"Spacing\",\"checkable\":true,\"checked\":false,\"useCurve\":true,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":1,\"sensors\":[{\"id\":\"pressure\",\"sourceId\":\"pressure\",\"sourceSlot\":0,\"curve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]}}]},{\"id\":\"Rate\",\"checkable\":true,\"checked\":false,\"useCurve\":true,\"useSameCurve\":true,\"commonCurve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]},\"curveMode\":0,\"strength\":1,\"min\":0,\"max\":1,\"sensors\":[{\"id\":\"pressure\",\"sourceId\":\"pressure\",\"sourceSlot\":0,\"curve\":{\"text\":\"0,0;1,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]}}]}],\"unsupported\":[],\"compiled\":{\"version\":2,\"reader\":\"krita-bd6e8d0-v1\",\"profile\":\"eigen-5.0.1-mapped-arm64-f64-v3\",\"buildId\":\"5c6b74ca30b91f2c2529e6096f4230bec55e5056550b306734b2e9934a35d097\",\"curves\":[{\"source\":{\"text\":\"0.126697,1;1,0.115578;\",\"points\":[{\"x\":0.126697,\"y\":1,\"corner\":false},{\"x\":1,\"y\":0.115578,\"corner\":false}]},\"coefficients\":[[0,0,-1.0127321216118577,1.1283101216118576]]},{\"source\":{\"text\":\"0,0.0351759;0.262443,0.0954774;1,1;\",\"points\":[{\"x\":0,\"y\":0.0351759,\"corner\":false},{\"x\":0.262443,\"y\":0.0954774,\"corner\":false},{\"x\":1,\"y\":1,\"corner\":false}]},\"coefficients\":[[1.8987106624804972,0,0.09899367405214471,0.0351759],[-0.6756133049965888,2.0268399149897665,-0.4329362737575146,0.08170966376433682]]},{\"source\":{\"text\":\"0,0;0.0653266,0.040201;0.914573,1;\",\"points\":[{\"x\":0,\"y\":0,\"corner\":false},{\"x\":0.0653266,\"y\":0.040201,\"corner\":false},{\"x\":0.914573,\"y\":1,\"corner\":false}]},\"coefficients\":[[4.308178982459895,0,0.5969994184806231,0],[-0.33139814913029303,0.9092633983336185,0.5376003321630421,0.001293446784078025]]}]}}}") as BrushDescriptor

it('plain geometry admits original compiled2 DATA only through named author mechanism',()=>{
 const d=plainGeometryOriginal(),before=JSON.stringify(d)
 expect(publicPlainGeometryAdmission).toBe(canonicalPlainAutoGeometryAuthorAdmission)
 for(const profile of[generic,browser]){
  expect(canonicalSourceAuthorAdmission(d,profile).supported).toBe(false)
  const result=canonicalPlainAutoGeometryAuthorAdmission(d,profile,{authorPlainTiltSource:'plain-auto-tilt-v1'})
  expect(result.supported).toBe(true);if(!result.supported)throw Error(result.reason)
  expect(result.material.kind).toBe('auto');expect(result.geometryCapability.kind).toBe('plain-auto-tilt-v1')
  expect(result.data).toBe(result.geometryCapability.descriptor.sourceStamp);expect(result.data).not.toBe(d.sourceStamp)
  expect(Object.isFrozen(result.data)).toBe(true);expect(result.nativeSizePx).toBe(60)
 }
 expect(JSON.stringify(d)).toBe(before)
 const getter=vi.fn(()=> 'plain-auto-tilt-v1');const options=Object.defineProperty({},'authorPlainTiltSource',{get:getter})
 expect(canonicalPlainAutoGeometryAuthorAdmission(d,generic,options as never).supported).toBe(false);expect(getter).not.toHaveBeenCalled()
 for(const patch of[(x:Mutable<BrushDescriptor>)=>{x.sourceStamp!.timing.enabled=true},(x:Mutable<BrushDescriptor>)=>{x.sourceStamp!.options.find(o=>o.id==='Size')!.sensors[0].id='pressure'},(x:Mutable<BrushDescriptor>)=>{Object.assign(source(x),{source:{kind:'softAuto'}})}]){const bad=structuredClone(d)as Mutable<BrushDescriptor>;patch(bad);expect(canonicalPlainAutoGeometryAuthorAdmission(bad,generic,{authorPlainTiltSource:'plain-auto-tilt-v1'}).supported).toBe(false)}
})

it('binds real fallback CAS metadata through named dynamic admission and the original program compiler',async()=>{
 const {createHash}=await import('node:crypto')
 const {canonicalBrushDescriptorJSON,canonicalDynamicAutoSourceBinding,extractCanonicalDynamicAutoGeometryData}=await import('@grafetto/shared')
 const {sourceDynamicAutoAuthorProgram}=await import('./sourceStrokeAuthorDescriptor')
 // The SOURCE kernel stays original Default; the descriptor also retains a
 // legitimate legacy bitmap fallback. Its CAS identity is not a new mask grant.
 const d=brush(4)
 const asset:{id:`asset:${string}`;size:number}={id:`asset:${'ab'.repeat(32)}`,size:8}
 d.tip={...d.tip,kind:'bitmap',mask:asset.id};delete d.tip.profile
 const before=canonicalBrushDescriptorJSON(d)
 expect(isBrushLibrary({schemaVersion:1,brushes:[{descriptor:d,name:'authored fallback',source:'synthetic',warnings:[]}],assets:[{...asset,file:asset.id.slice(6)+'.bin'}],skipped:[]})).toBe(true)
 expect(extractCanonicalDynamicAutoGeometryData(d).supported).toBe(false)
 expect(canonicalDynamicAutoGeometryAuthorAdmission(d,generic,[{...asset,size:3}],{authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1'}).supported).toBe(false)
 const admitted=canonicalDynamicAutoGeometryAuthorAdmission(d,generic,[asset],{authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1'})
 expect(admitted.supported).toBe(true);if(!admitted.supported)throw Error(admitted.reason)
 expect(admitted.geometryCapability.originalAssets).toEqual([asset])
 const sha=createHash('sha256').update(before).digest('hex')
 const pin=canonicalDynamicAutoSourceBinding(d,sha,'neon64-f32-fma-v1',generic,undefined,admitted.geometryCapability.originalAssets)
 expect(pin.descriptorSha256).toBe(sha)
 const compiled=sourceDynamicAutoAuthorProgram(d,{descriptorSha256:sha,geometryCapability:admitted.geometryCapability,inputProfile:'krita-freehand-no-smoothing-v1',colorIdentity:'captured-test-pigment',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})
 expect(compiled.supported).toBe(true)
 expect(canonicalBrushDescriptorJSON(d)).toBe(before)
 asset.size=4
 expect(admitted.geometryCapability.originalAssets[0].size).toBe(8)
})

it.each(['normal','multiply','lighten','colorDodge','overlay','color','erase'] as const)('keeps named dynamic composition on the shared Pixel selector (%s), without widening historical admission',async blend=>{
 const {canonicalPixelSourceComposition,canonicalDynamicAutoSourceBinding,canonicalBrushDescriptorJSON}=await import('@grafetto/shared')
 const {sourceDynamicAutoAuthorProgram}=await import('./sourceStrokeAuthorDescriptor')
 const {createHash}=await import('node:crypto')
 const d=brush(4)
 if(!d.sourceStamp||!d.behavior?.rendering)throw Error('Actual compiled Default fixture required')
 d.behavior.rendering.blendMode=blend==='erase'?'normal':blend
 d.behavior.erase=blend==='erase'
 Object.assign(d.sourceStamp.settings,{PaintOpAction:'2',CompositeOp:blend==='normal'?'over':blend})
 Object.assign(d.sourceStamp.flags,{indirectPainting:true})
 const policy=canonicalPixelSourceComposition(d,generic)
 expect(policy).toEqual({mode:'wash',outerBlend:blend==='normal'?'over':blend==='color'?'colorHsyBrowser':blend})
 const admitted=canonicalDynamicAutoGeometryAuthorAdmission(d,generic,[],{authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1'})
 expect(admitted.supported).toBe(true);if(!admitted.supported)throw Error(admitted.reason)
 const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex'),pin=canonicalDynamicAutoSourceBinding(d,sha,'neon64-f32-fma-v1',generic,undefined,[])
 const program=sourceDynamicAutoAuthorProgram(d,{descriptorSha256:sha,geometryCapability:admitted.geometryCapability,assets:[],coverageProfile:pin.coverageProfile,inputProfile:'krita-freehand-no-smoothing-v1',colorIdentity:'captured-canonical-pigment',lodScale:1})
 expect(program.supported).toBe(true)
 if(blend==='erase'||blend==='color')expect(canonicalSourceAuthorAdmission(d,generic).supported).toBe(false)
 const unknown=structuredClone(d);Object.assign(unknown.behavior!.rendering!,{blendMode:'unknown-pixel-mode'})
 expect(canonicalDynamicAutoGeometryAuthorAdmission(unknown,generic,[],{authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1'}).supported).toBe(false)
})
