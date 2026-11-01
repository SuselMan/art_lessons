import marker from './fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json'
import {describe,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as generic,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as density,isBrushLibrary,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browser,CANONICAL_STROKE_RASTER_PROFILE as native,type BrushDescriptor} from '@grafetto/shared'
import basic6 from './fixtures/sourcePngWholePath/guiStroke.native.json'
import mountains from './fixtures/sourceImagePipe/mountains.native.json'
import graphite from './fixtures/sourceImagePipe/pencilRandom.native.json'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {canonicalSourceAuthorAdmission} from './sourceCanonicalAuthorAdmission'
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
