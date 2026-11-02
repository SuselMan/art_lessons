/// <reference types="node" />
import{describe,it,expect}from'vitest'
import{createHash}from'node:crypto'
import genuine from './fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json' with{type:'json'}
import type{BrushDescriptor}from'./brushes.js'
import{canonicalBrushDescriptorJSON}from'./canonicalBrushDescriptor.js'
import{extractCanonicalSoftAutoNativeDefaultTextureProgramData,extractCanonicalDefaultAutoPressureTextureProgramData,extractSoftAutoSourceDataCapability,hasCanonicalSourceCurvePrograms}from'./canonicalBrushCapability.js'
import{canonicalSoftAutoNativeDefaultTextureSourceBinding,canonicalSoftAutoSourceBinding,canonicalSoftAutoSourcePin,canonicalSoftAutoCost}from'./canonicalSoftAutoMaterial.js'
import{isSourceStampData}from'./sourceStampData.js'
import{canonicalPressureCurvePrimaryTexturePin}from'./canonicalPrimaryTexture.js'
import{sourceAutoGeometry}from'./sourceAutoGeometry.js'
import{canonicalPressureTexturedSourceMaterialContext,canonicalTexturedSourceMaterialContext,canonicalSoftNativeDefaultTexturedSourceMaterialContext,captureCanonicalSoftNativeDefaultTexturedSourceFrame,buildCanonicalMaterial,packCanonicalMaterial,unpackCanonicalMaterial,canonicalPrimaryTextureDrawWork,type CanonicalMaterialBuildInputV6,type CanonicalMaterialContextV6}from'./canonicalMaterialCodec.js'
import{canonicalStrokeSnapshotV6,canonicalStrokeSnapshotV5,decodeCanonicalRecordedSnapshotFrame}from'./canonicalRecordedAttachment.js'
import{decodeCanonicalStrokeFrame,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,CANONICAL_STROKE_RASTER_PROFILE as OLD}from'./canonicalStrokeFrame.js'
const descriptor=genuine.descriptor as unknown as BrushDescriptor,hash=(d:BrushDescriptor)=>createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex'),sha=hash(descriptor)
const asset={...genuine.patternAsset,x:0,y:0,width:descriptor.texture!.patternSize!.width,height:descriptor.texture!.patternSize!.height}
function source(browser=false){return canonicalSoftAutoNativeDefaultTextureSourceBinding(descriptor,sha,browser?'browser-number-coverage-v1':'neon64-f32-fma-v1',genuine.patternAsset,browser?B:G)}
function context(browser=false){return canonicalSoftNativeDefaultTexturedSourceMaterialContext({version:6,assets:[asset],primarySource:source(browser),primaryTexture:{kind:'canvasTexture',asset:asset.id,law:'subtract-u8-v1',width:asset.width,height:asset.height,periodX:asset.width,periodY:asset.height,offsetX:0,offsetY:0,strength:'source-pressure-curve-v1'},budget:{workUnits:64000000,outputBytes:16000000,drawPixels:16000000}})}
function recipe(browser=false){const s=source(browser),geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:s.source.diameter,ratio:s.source.ratio,spikes:2,scale:s.brushScale,angle:s.brushAngle},{scale:.25,ratio:1,rotation:0},.25,.5);return{kind:'softAuto' as const,sourceSlot:0 as const,source:s.source,coverageProfile:s.coverageProfile,brushScale:s.brushScale,brushAngle:s.brushAngle,scale:.25,ratio:1,rotation:0,subX:.25,subY:.5,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:true}}
function input(browser=false):CanonicalMaterialBuildInputV6{return{masked:false,entry:{phase:'between'},draws:[{recipe:recipe(browser),role:'primary',x:-19,y:252,opacity:1,flow:.5,grainDepth:-0},{recipe:recipe(browser),role:'primary',x:-18,y:252,opacity:1,flow:.5,grainDepth:.75}],fences:[{at:0,kind:'segmentBegin',group:7},{at:2,kind:'primaryEnd',group:7},{at:2,kind:'segmentEnd',group:7},{at:2,kind:'gestureEnd'}]}}
const composition={mode:'wash' as const,alphaDarken:'hard' as const,outerResourceOpacity:1,outerBlend:'over' as const}
function envelope(packed:string,browser=false){return{version:2 as const,rasterProfile:browser?B:G,brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'s',frameOrdinal:0,pigmentRgb8:[1,2,3]as const,composition,materialPacked:packed}}
function trusted(browser=false){const e=envelope('',browser);return{...e,materialVersion:6 as const,material:context(browser)}}
function bytes(packed:string){return Uint8Array.from(Buffer.from(packed.slice(2),'base64'))}
function changed(packed:string,offset:number,value:number){const b=bytes(packed);b[offset]=value;return'6|'+Buffer.from(b).toString('base64')}
describe('standalone native-default Soft6 unified material',()=>{
 it('existing unified codec admits explicit native Soft6 DATA rather than old DefaultAuto5 reinterpretation',()=>{
  const data=descriptor.sourceStamp
  if(!isSourceStampData(data)||data.version!==2||data.source.kind!=='softAuto'||data.compiled?.version!==4)throw Error('Whole genuine compiled4 metadata invalid')
  // Existing pure Soft pin is metadata, never a room/source grant. Deliberately
  // avoid all NEW6 helper calls so baseline exercises actual old codec refusal.
  const pin=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256:sha,source:data.source,brushScale:data.brush.scale,brushAngle:data.brush.angle,coverageProfile:'neon64-f32-fma-v1',reader:data.reader,compilerProfile:data.compiled.profile,buildId:data.compiled.buildId,radialCurve:data.compiled.radialCurve})
  const primaryTexture=canonicalPressureCurvePrimaryTexturePin({kind:'canvasTexture',asset:asset.id,law:'subtract-u8-v1',width:9,height:9,periodX:9,periodY:9,offsetX:0,offsetY:0,strength:'source-pressure-curve-v1'},[asset])
  const c:CanonicalMaterialContextV6={version:6,assets:[asset],primarySource:pin,primaryTexture,budget:{workUnits:1000,outputBytes:1000,drawPixels:1000}}
  expect(buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},c).packed.startsWith('6|')).toBe(true)
 })

 it('binds whole normal genuine descriptor, original radial and pattern, without old capability widening',()=>{
  const cap=extractCanonicalSoftAutoNativeDefaultTextureProgramData(descriptor,{pattern:genuine.patternAsset})
  expect(cap.supported).toBe(true);if(!cap.supported)throw Error('Actual genuine capability rejected')
  expect(cap.rasterReady).toBe(false);expect(cap.data.compiled?.version).toBe(4);expect(cap.program.kind).toBe('texture-pressure-native-default-v1')
  expect(source().descriptorSha256).toBe(sha);expect(source().radialCurve.source).toEqual(cap.data.source.softnessCurve)
  expect(hasCanonicalSourceCurvePrograms(cap.data)).toBe(false)
  expect(extractSoftAutoSourceDataCapability(descriptor).supported).toBe(false)
  const old2=structuredClone(descriptor);if(!old2.sourceStamp)throw Error('source missing');Object.assign(old2.sourceStamp.compiled!,{version:2});Reflect.deleteProperty(old2.sourceStamp.compiled!,'textureStrength');expect(extractCanonicalSoftAutoNativeDefaultTextureProgramData(old2,{pattern:genuine.patternAsset}).supported).toBe(false)
  expect(extractCanonicalDefaultAutoPressureTextureProgramData(descriptor,{pattern:genuine.patternAsset}).supported).toBe(false)
  expect(()=>canonicalSoftAutoSourceBinding(descriptor,sha,'neon64-f32-fma-v1',0,G)).toThrow()
  expect(()=>canonicalSoftAutoNativeDefaultTextureSourceBinding(descriptor,'bad','neon64-f32-fma-v1',genuine.patternAsset,G)).toThrow()
  expect(()=>canonicalSoftAutoNativeDefaultTextureSourceBinding(descriptor,sha,'browser-number-coverage-v1',genuine.patternAsset,G)).toThrow()
  expect(()=>canonicalSoftAutoNativeDefaultTextureSourceBinding(descriptor,sha,'neon64-f32-fma-v1',genuine.patternAsset,OLD)).toThrow()
  expect(()=>canonicalSoftAutoNativeDefaultTextureSourceBinding(descriptor,sha,'neon64-f32-fma-v1',{...genuine.patternAsset,id:'asset:'+'0'.repeat(64)},G)).toThrow()
 })
 it.each([false,true])('roundtrips DRAW40/tag4/sourceSlot0 and grain binary64; browser=%s',browser=>{
  const c=context(browser),i=input(browser),built=buildCanonicalMaterial(i,c),f=unpackCanonicalMaterial(built.packed,c),b=bytes(built.packed),view=new DataView(b.buffer)
  expect(built.packed.startsWith('6|')).toBe(true);expect(b[4]).toBe(6);expect(b[6]).toBe(1);expect(b[7]).toBe(0)
  expect(view.getUint16(8,true)).toBe(1);expect(view.getUint16(10,true)).toBe(2)
  expect(b[24+40]).toBe(4);expect(b[24+40+1]).toBe(browser?3:2);expect(b[24+40+3]).toBe(0)
  const draw=24+40+96;expect(Object.is(view.getFloat64(draw+32,true),-0)).toBe(true);expect(view.getFloat64(draw+40+32,true)).toBe(.75)
  expect(f.definitions).toHaveLength(1);expect(f.definitions[0].kind).toBe('softAuto');expect(f.definitions[0].sourceSlot).toBe(0)
  expect(f.definitions[0].source.softnessCurve).toEqual(c.primarySource.source.softnessCurve)
  expect(packCanonicalMaterial(f,c)).toBe(built.packed)
  expect(decodeCanonicalStrokeFrame(envelope(built.packed,browser),trusted(browser)).frame).toEqual(f)
  expect(()=>decodeCanonicalStrokeFrame(envelope(built.packed,browser),{...trusted(browser),materialVersion:undefined} as never)).toThrow()
  expect(()=>unpackCanonicalMaterial(built.packed,{...c,version:5} as never)).toThrow()
  expect(()=>canonicalPressureTexturedSourceMaterialContext({...c,version:5})).toThrow();expect(()=>canonicalTexturedSourceMaterialContext({...c,version:4})).toThrow()
 })
 it('has a forced pattern ledger golden empty frame and preserved phase2 structural tail',()=>{
  const c=context(),empty=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},c),b=bytes(empty.packed)
  expect(b.length).toBe(64);expect([...b.slice(0,16)]).toEqual([67,77,65,84,6,0,1,0,0,0,0,0,0,0,0,0]);expect([...b.slice(16,24)]).toEqual(Array(8).fill(0))
  expect(Buffer.from(b.slice(24,56)).toString('hex')).toBe(asset.id.slice(6))
  expect([...b.slice(56)]).toEqual([9,0,9,0,0,0,0,0])
  const tail=buildCanonicalMaterial({masked:false,entry:{phase:'mask',group:7},draws:[],fences:[{at:0,kind:'segmentEnd',group:7},{at:0,kind:'gestureEnd'}]},c)
  expect(unpackCanonicalMaterial(tail.packed,c).entry.phase).toBe('mask')
  expect(()=>buildCanonicalMaterial({...input(),masked:true} as never,c)).toThrow()
  expect(()=>buildCanonicalMaterial({...input(),draws:[{...input().draws[0],role:'mask'}]} as never,c)).toThrow()
 })
 it('charges every reused-definition draw and enforces cost/count/input bounds',()=>{
  const c=context(),r=recipe(),base=canonicalSoftAutoCost(r,c.primarySource),one=canonicalPrimaryTextureDrawWork(r.width,r.height),pixels=r.width*r.height
  const exact={...c,budget:{workUnits:base.workUnits+2*one,outputBytes:base.outputBytes,drawPixels:2*pixels}}
  expect(buildCanonicalMaterial(input(),exact).frame.draws).toHaveLength(2)
  for(const budget of[{...exact.budget,workUnits:exact.budget.workUnits-1},{...exact.budget,outputBytes:exact.budget.outputBytes-1},{...exact.budget,drawPixels:exact.budget.drawPixels-1}])expect(()=>buildCanonicalMaterial(input(),{...c,budget})).toThrow()
  expect(()=>buildCanonicalMaterial(input(),{...c,expectedDrawCount:3})).toThrow()
  for(const grainDepth of[NaN,Infinity,-.1,1.1])expect(()=>buildCanonicalMaterial({...input(),draws:[{...input().draws[0],grainDepth}]},c)).toThrow()
 })
 it('rejects malformed binary layout/context proof and accessor data before getters',()=>{
  const c=context(),packed=buildCanonicalMaterial(input(),c).packed
  for(const[o,v]of[[6,0],[7,1],[64,1],[65,4],[67,1],[64+96+3,1]]as const)expect(()=>unpackCanonicalMaterial(changed(packed,o,v),c)).toThrow()
  for(const modify of[(x:ReturnType<typeof context>)=>Object.assign(x.primarySource,{sourceSlot:1}),(x:ReturnType<typeof context>)=>Object.assign(x.primarySource.source,{density:.5}),(x:ReturnType<typeof context>)=>Object.assign(x.primarySource.radialCurve.source.points[0],{y:.2}),(x:ReturnType<typeof context>)=>Object.assign(x.primaryTexture,{offsetX:9})]){
   const x=structuredClone(c);modify(x);expect(()=>canonicalSoftNativeDefaultTexturedSourceMaterialContext(x)).toThrow()
  }
  for(const location of['pin','curve','coefficient','budget']as const){const x=structuredClone(c);let calls=0;const[owner,key]=location==='pin'?[x.primarySource,'radialCurve']:location==='curve'?[x.primarySource.source.softnessCurve.points[0],'x']:location==='coefficient'?[x.primarySource.radialCurve.coefficients[0],'0']:[x.budget,'workUnits'];const v=Object.getOwnPropertyDescriptor(owner,key)!.value;Object.defineProperty(owner,key,{get(){calls++;return v},enumerable:true});expect(()=>canonicalSoftNativeDefaultTexturedSourceMaterialContext(x)).toThrow();expect(calls).toBe(0)}
  const captured=captureCanonicalSoftNativeDefaultTexturedSourceFrame(buildCanonicalMaterial(input(),c).frame,c)
  expect(Object.isFrozen(captured.definitions[0].source.softnessCurve.points[0])).toBe(true)
 })
 it('normalizes standalone snapshot6 with exact sourceSHA/epoch/asset roles and rejects old5 entry',()=>{
  const c=context(),raw={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'s',boardEpoch:1,descriptorSha256:sha,rasterProfile:G,pigmentRgb8:[1,2,3],composition,assets:c.assets,materialVersion:6,material:c},s=canonicalStrokeSnapshotV6(raw,1,G)
  expect(s.materialVersion).toBe(6);expect(Object.isFrozen(s.material.primarySource.radialCurve.coefficients[0])).toBe(true)
  expect(()=>canonicalStrokeSnapshotV5(raw,1,G)).toThrow();expect(()=>canonicalStrokeSnapshotV6(raw,2,G)).toThrow()
  expect(()=>canonicalStrokeSnapshotV6({...raw,descriptorSha256:'0'.repeat(64)},1,G)).toThrow()
  expect(()=>canonicalStrokeSnapshotV6({...raw,assets:[{...asset,id:'asset:'+'0'.repeat(64)}]},1,G)).toThrow()
  expect(()=>canonicalStrokeSnapshotV6({...raw,material:{...c,expectedDrawCount:0}},1,G)).toThrow()
  const packed=buildCanonicalMaterial(input(),c).packed
  // The recorded decoder supports6 after the online contract was connected;
  // decoding alone does not grant a read capability.
  expect(decodeCanonicalStrokeFrame(envelope(packed),{...trusted(),material:s.material}).frame.draws).toHaveLength(2)
  expect(decodeCanonicalRecordedSnapshotFrame(envelope(packed),s,0).frame.draws).toHaveLength(2)
  expect(()=>decodeCanonicalRecordedSnapshotFrame(envelope(packed),{...s,materialVersion:7} as never,0)).toThrow()
 })
})
