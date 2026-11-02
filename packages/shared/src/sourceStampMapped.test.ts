import {describe,expect,it} from 'vitest'
import original from './fixtures/sourceSoftAutoData/stock.native.js'
import stock from './fixtures/sourceDefaultAutoData/stock.native.js'
import {extractSoftAutoSourceDataCapability,hasCanonicalSourceCurvePrograms} from './canonicalBrushCapability.js'
import type {BrushDescriptor} from './brushes.js'
import {captureSourceTextureNativeDefaultProgram,captureSourceTexturePressureProgram,isSourceStampData,sourceStampDataBudget,sourceStampRequiredCurves,SOURCE_STAMP_MAPPED_COMPILER_PROFILE,type SourceStampCurveData} from './sourceStampData.js'

// Schema probes use dummy numeric coefficients; they do not attest a compiler.
function mappedData() {
  const data:unknown=structuredClone(original.rows.find(r=>r.index===72)!.sourceStamp)
  if(!isSourceStampData(data) || data.version!==2 || data.source.kind!=='softAuto')throw Error('Invalid original soft source')
  const entry=(source:SourceStampCurveData)=>({source,coefficients:Array.from({length:Math.max(1,source.points.length-1)},()=>[0,0,0,0])})
  const required=sourceStampRequiredCurves(data.options)
  return {...data,compiled:{version:2,reader:data.reader,profile:SOURCE_STAMP_MAPPED_COMPILER_PROFILE,buildId:'a'.repeat(64),
    curves:required.map(source=>entry(structuredClone(source))),radialCurve:entry(structuredClone(data.source.softnessCurve))}}
}
describe('mapped source dictionary schema',()=>{
  it('binds sensor and separate radial data, with matching variable budget',()=>{
    const data=mappedData()
    expect(isSourceStampData(data)).toBe(true)
    const entries=[...data.compiled.curves,data.compiled.radialCurve]
    const expected=entries.reduce((sum,e)=>sum+64+new TextEncoder().encode(e.source.text).length+32*e.source.points.length+32*e.coefficients.length,0)
    expect(sourceStampDataBudget(data)-sourceStampDataBudget({...data,compiled:undefined})).toBe(expected)
  })
  it('rejects unknown build/profile, missing radial, rebinding and wrong intervals',()=>{
    const data=mappedData()
    for(const patch of [{buildId:'not-a-build'},{profile:'eigen-3.4.0-sparselu-f64-no-fma-v1'},{version:1},{radialCurve:undefined},
      {radialCurve:{...data.compiled.radialCurve,coefficients:[]}},
      {radialCurve:{...data.compiled.radialCurve,source:{text:'0,0;1,1',points:[{x:0,y:0,corner:false},{x:1,y:1,corner:false}]}}},
      {extra:true}])expect(isSourceStampData({...data,compiled:{...data.compiled,...patch}})).toBe(false)
    expect(isSourceStampData({...data,source:{kind:'image'}})).toBe(false)
  })
})

describe('soft source data readiness without raster permission',()=>{
  function descriptor() {
    const data=mappedData()
    return {...stock.rows[0].descriptor,sourceStamp:{...data,unsupported:[],role:'primary',
      flags:{...data.flags,materialFixed1:true,textureEnabled:false},
      source:{...data.source,ratio:1,spikes:2,antialias:false,randomness:0,density:1}}} as unknown as BrushDescriptor
  }
  it('requires a separate mapped radial program even for identity sensors',()=>{
    const d=descriptor(),result=extractSoftAutoSourceDataCapability(d)
    expect(result.supported).toBe(true)
    if(result.supported) {
      expect(result.status).toBe('source-data-only')
      expect(result.rasterReady).toBe(false)
    }
    const missing=structuredClone(d)
    Reflect.deleteProperty(missing.sourceStamp!,'compiled')
    expect(extractSoftAutoSourceDataCapability(missing).supported).toBe(false)
    const forged=structuredClone(d)
    if(forged.sourceStamp?.compiled?.version===2)Reflect.deleteProperty(forged.sourceStamp.compiled,'radialCurve')
    expect(extractSoftAutoSourceDataCapability(forged).supported).toBe(false)
  })
  it('keeps historical frontiers and unsupported material consumers closed',()=>{
    for(const row of original.rows)expect(extractSoftAutoSourceDataCapability({...descriptor(),sourceStamp:row.sourceStamp} as unknown as BrushDescriptor).supported).toBe(false)
    for(const patch of [{antialias:true},{spikes:9},{density:.5},{randomness:.1}]) {
      const d=descriptor()
      if(d.sourceStamp?.version===2)Object.assign(d.sourceStamp.source,patch)
      expect(extractSoftAutoSourceDataCapability(d).supported).toBe(false)
    }
    const mask=descriptor()
    Object.assign(mask.sourceStamp!,{role:'mask'})
    expect(extractSoftAutoSourceDataCapability(mask).supported).toBe(false)
    const texture=descriptor()
    Object.assign(texture.sourceStamp!.flags,{textureEnabled:true})
    expect(extractSoftAutoSourceDataCapability(texture).supported).toBe(false)
  })
})


// Self-authored DATA schema extension of existing soft fixture; coefficients are
// structural probes, NOT native compiler attestation or genuine catalog output.
function nativeDefaultData(){
 const data=mappedData()
 const settings={...data.settings,'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true',
  'Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true','Texture/Strength/UseSameCurve':'true',
  'Texture/Strength/Value':'1','Texture/Strength/curveMode':'0','Texture/Strength/Sensor':'<!DOCTYPE params> <params id="pressure"/> '}
 const source={text:'0,0;1,1;',points:[{x:0,y:0,corner:false},{x:1,y:1,corner:false}]}
 return {...data,settings,flags:{...data.flags,textureEnabled:true,materialFixed1:true},compiled:{...data.compiled,version:4,
  textureStrength:{kind:'texture-pressure-native-default-v1',curve:{source,coefficients:[[0,0,1,0]]}}}}
}
describe('native-default pressure Soft DATA only',()=>{
 it('keeps raw, radial and old nine options; captures independent frozen metadata',()=>{
  const data=nativeDefaultData(),before=JSON.stringify(data)
  expect(isSourceStampData(data)).toBe(true);const captured=captureSourceTextureNativeDefaultProgram(data);expect(JSON.stringify(data)).toBe(before)
  expect(captured.program.kind).toBe('texture-pressure-native-default-v1')
  expect(hasCanonicalSourceCurvePrograms(captured.data)).toBe(false)
  expect(captured.program.curve.source.text).toBe('0,0;1,1;')
  expect(captured.data.options).toEqual(data.options);expect(captured.data.options).toHaveLength(9)
  expect(captured.data.source).toEqual(data.source);expect(captured.data.compiled).toEqual(data.compiled)
  expect(Object.isFrozen(captured.program.curve.source.points)).toBe(true)
  data.compiled.textureStrength.curve.source.points[1].y=.2
  expect(captured.program.curve.source.points[1].y).toBe(1)
  expect(()=>captureSourceTexturePressureProgram(nativeDefaultData())).toThrow()
  expect(sourceStampDataBudget(nativeDefaultData())).toBeGreaterThan(sourceStampDataBudget(mappedData()))
 })
 it('rejects overrides, nonclosed XML and version/kind/radial mismatches',()=>{
  for(const [key,value]of [['CustomTexture/Strength/','false'],['CurveTexture/Strength/','0,0;1,1;'],['Texture/Strength/commonCurve',''],
   ['Texture/Strength/UseCurve','false'],['Texture/Strength/UseSameCurve','false'],['Texture/Strength/Value','.5'],
   ['Texture/Strength/Sensor','<params id="pressure" extra="1"/>'],['Texture/Strength/Sensor','<params id="pressure"><curve>0,0;1,1;</curve></params>']]){
    const data=nativeDefaultData();Object.assign(data.settings,{[key]:value})
    expect(isSourceStampData(data)).toBe(false);expect(()=>captureSourceTextureNativeDefaultProgram(data)).toThrow()
   }
  for(const mutate of [(d:ReturnType<typeof nativeDefaultData>)=>{d.compiled.version=3},
   (d:ReturnType<typeof nativeDefaultData>)=>{d.compiled.textureStrength.kind='texture-pressure-curve-v1'},
   (d:ReturnType<typeof nativeDefaultData>)=>{Object.assign(d.compiled,{radialCurve:undefined})}]){
    const data=nativeDefaultData();mutate(data);expect(isSourceStampData(data)).toBe(false)
   }
 })
 it('rejects accessors before invocation and does not open old Soft capability',()=>{
  const data=nativeDefaultData();let calls=0
  Object.defineProperty(data.settings,'Texture/Strength/commonCurve',{get(){calls++;return ''},enumerable:true})
  expect(()=>captureSourceTextureNativeDefaultProgram(data)).toThrow();expect(calls).toBe(0)
  const descriptor={...stock.rows[0],sourceStamp:nativeDefaultData()} as unknown as BrushDescriptor
  expect(extractSoftAutoSourceDataCapability(descriptor).supported).toBe(false)
 })
})


describe('public compiled4 DATA predicate own-data boundary',()=>{
 it.each(['settings','curvepoint','coefficient','compiledversion'] as const)('rejects %s accessor without invoking it',surface=>{
  const data=nativeDefaultData();let calls=0
  const [owner,key]=surface==='settings'?[data.settings,'Texture/Strength/Sensor']:
   surface==='curvepoint'?[data.compiled.textureStrength.curve.source.points[0],'x']:
   surface==='coefficient'?[data.compiled.textureStrength.curve.coefficients[0],'0']:[data.compiled,'version']
  const value=Object.getOwnPropertyDescriptor(owner,key)!.value
  Object.defineProperty(owner,key,{get(){calls++;return value},enumerable:true,configurable:true})
  expect(isSourceStampData(data)).toBe(false);expect(calls).toBe(0)
 })
})
