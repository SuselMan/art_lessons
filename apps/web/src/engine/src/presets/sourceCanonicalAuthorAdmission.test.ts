import {describe,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browser,CANONICAL_STROKE_RASTER_PROFILE as native,type BrushDescriptor} from '@grafetto/shared'
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
