import {describe,expect,it,vi} from 'vitest'
import actual from './fixtures/sourceDefaultAutoData/screentonesRegular.texture.native.json' with {type:'json'}
import type {BrushDescriptor} from './brushes.js'
import {isBrushLibrary} from './brushes.js'
import {canonicalFixedPrimaryTexturePin,canonicalPrimaryTexturePin} from './canonicalPrimaryTexture.js'
import {extractCanonicalDefaultAutoFixedTextureCapability,extractDefaultAutoSourceDataCapability,extractSeededDensityDefaultAutoSourceDataCapability,extractCanonicalPrimaryTextureCapability} from './canonicalBrushCapability.js'
const descriptor=()=>structuredClone(actual.descriptor) as unknown as BrushDescriptor
const pattern=()=>({...actual.patternAsset})
const extract=(d=descriptor())=>extractCanonicalDefaultAutoFixedTextureCapability(d,{pattern:pattern()})
describe('genuine Regular fixed-one DefaultAuto texture semantic metadata only',()=>{
 it('keeps original source/settings intact and old public auto/pressure capabilities closed',()=>{
  const d=descriptor(),before=structuredClone(d)
  expect(isBrushLibrary({schemaVersion:1,brushes:[{descriptor:d,name:actual.name,source:'native',warnings:[]}],assets:[{...pattern(),file:pattern().id.slice(6)+'.bin'}],skipped:[]})).toBe(true)
  const result=extract(d);expect(result.supported).toBe(true)
  if(!result.supported)throw Error('Real retained Regular must be supported data')
  expect(result.status).toBe('source-data-only');expect(result.rasterReady).toBe(false)
  expect(result.data).toBe(d.sourceStamp);expect(d).toEqual(before)
  expect(result.capability.primaryTexture).toEqual({kind:'canvasTexture',asset:pattern().id,law:'subtract-u8-v1',width:11,height:11,periodX:11,periodY:11,offsetX:0,offsetY:0,strength:'fixed-one-v1'})
  expect(result.capability.strengthProgram).toBe('fixed-one-v1');expect(Object.isFrozen(result.capability.primaryTexture)).toBe(true)
  expect(result.data.options.find(o=>o.id==='Size')?.useCurve).toBe(true)
  expect(result.data.settings['Texture/Strength/Sensor']).toBe('<!DOCTYPE params> <params id="pressure"/> ')
  expect(extractDefaultAutoSourceDataCapability(d).supported).toBe(false)
  expect(extractSeededDensityDefaultAutoSourceDataCapability(d).supported).toBe(false)
  expect(extractCanonicalPrimaryTextureCapability(d,{primary:{id:'asset:'+'a'.repeat(64),size:16},pattern:pattern()}).supported).toBe(false)
 })
 it('rejects the genuine unchanged Soft/pressure sibling rather than normalizing it',()=>{
  const soft=structuredClone(actual.negativeSoft),before=structuredClone(soft)
  expect(extractCanonicalDefaultAutoFixedTextureCapability(soft.descriptor as unknown as BrushDescriptor,{pattern:soft.patternAsset}).supported).toBe(false)
  expect(soft).toEqual(before)
 })
 it('has separate closed pin factories; never widens a pressure token',()=>{
  const d=descriptor(),result=extract(d);if(!result.supported)throw Error('actual fixture')
  const pin=result.capability.primaryTexture,asset=result.capability.patternAsset
  expect(()=>canonicalPrimaryTexturePin(pin,asset)).toThrow(TypeError)
  expect(()=>canonicalFixedPrimaryTexturePin({...pin,strength:'pressure-identity-v1'},asset)).toThrow(TypeError)
  expect(canonicalPrimaryTexturePin({...pin,strength:'pressure-identity-v1'},asset).strength).toBe('pressure-identity-v1')
  for(const patch of [{extra:true},{offsetX:-0},{offsetX:11},{periodY:12},{width:17},{strength:'1'}])expect(()=>canonicalFixedPrimaryTexturePin({...pin,...patch},asset)).toThrow(TypeError)
  const getter=vi.fn(()=> 'fixed-one-v1'),input={...pin};Object.defineProperty(input,'strength',{get:getter,enumerable:true})
  expect(()=>canonicalFixedPrimaryTexturePin(input,asset)).toThrow(TypeError);expect(getter).not.toHaveBeenCalled()
  expect(()=>canonicalFixedPrimaryTexturePin(pin,{...asset,id:'asset:'+'b'.repeat(64)})).toThrow(TypeError)
 })
 it('does not execute inactive sensor metadata or rewrite it into identity',()=>{
  const d=descriptor(),sensor='<params id="pressure"><curve>0,1;1,0;</curve></params>'
  Object.assign(d.sourceStamp!.settings,{'Texture/Strength/Sensor':sensor})
  expect(extract(d).supported).toBe(true);expect(d.sourceStamp!.settings['Texture/Strength/Sensor']).toBe(sensor)
 })
 it.each([
  ['enabled curve',(d:BrushDescriptor)=>Object.assign(d.sourceStamp!.settings,{'Texture/Strength/UseCurve':'true'})],
  ['enabled pressure',(d:BrushDescriptor)=>Object.assign(d.sourceStamp!.settings,{'PressureTexture/Strength/':'true'})],
  ['active nonlinear',(d:BrushDescriptor)=>Object.assign(d.sourceStamp!.settings,{'Texture/Strength/UseCurve':'true','PressureTexture/Strength/':'true','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;0.5,0.1;1,1;</curve></params>'})],
  ['value not one',(d:BrushDescriptor)=>Object.assign(d.sourceStamp!.settings,{'Texture/Strength/Value':'.5'})],
  ['custom consumer',(d:BrushDescriptor)=>Object.assign(d.sourceStamp!.settings,{'CustomTexture/Strength/Value':'1'})],
  ['random phase',(d:BrushDescriptor)=>Object.assign(d.texture!.offset!,{randomX:true})],
  ['soft application',(d:BrushDescriptor)=>Object.assign(d.texture!.application!,{soft:true})],
  ['multiply',(d:BrushDescriptor)=>Object.assign(d.texture!.application!,{mode:'multiply'})],
  ['dual',(d:BrushDescriptor)=>Reflect.set(d.behavior!,'dual',{unsupported:true})],
  ['unsupported',(d:BrushDescriptor)=>Reflect.set(d.sourceStamp!,'unsupported',['unresolved-real-feature'])],
  ['source randomness',(d:BrushDescriptor)=>{if(d.sourceStamp?.version===2&&d.sourceStamp.source.kind==='defaultAuto')Reflect.set(d.sourceStamp.source,'randomness',.1)}],
  ['missing compiler',(d:BrushDescriptor)=>{Reflect.deleteProperty(d.sourceStamp!,'compiled')}],
  ['soft source',(d:BrushDescriptor)=>{if(d.sourceStamp?.version===2)Reflect.set(d.sourceStamp.source,'kind','softAuto')}],
 ] as const)('rejects %s without normalized clone',(_name,edit)=>{const d=descriptor();edit(d);expect(extract(d).supported).toBe(false)})
 it('captures settings/texture/asset data descriptors without evaluating accessors',()=>{
  const getter=vi.fn(()=> 'false'),d=descriptor();Object.defineProperty(d.sourceStamp!.settings,'Texture/Strength/UseCurve',{get:getter,enumerable:true})
  expect(extract(d).supported).toBe(false);expect(getter).not.toHaveBeenCalled()
  const d2=descriptor(),textureGetter=vi.fn(()=>d.texture);Object.defineProperty(d2,'texture',{get:textureGetter,enumerable:true})
  expect(extract(d2).supported).toBe(false);expect(textureGetter).not.toHaveBeenCalled()
  const p=pattern(),assetGetter=vi.fn(()=>p.id);Object.defineProperty(p,'id',{get:assetGetter,enumerable:true})
  expect(extractCanonicalDefaultAutoFixedTextureCapability(descriptor(),{pattern:p}).supported).toBe(false);expect(assetGetter).not.toHaveBeenCalled()
 })
})
