import {expect,it} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE as native,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as generic,
 CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browser,CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE as browserCoverage,
 canonicalStrokeRasterContract,canonicalStrokeCoverageMatches,decodeCanonicalStrokeFrame,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import {canonicalDefaultAutoSourcePin,canonicalGaussianAutoSourcePin,canonicalDefaultAutoSourceBinding,type CanonicalAutoCoverageProfile,type CanonicalGaussianCoverageProfile} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'
import {buildCanonicalMaterial,unpackCanonicalMaterial,type AnyCanonicalMaterialRecipe,type CanonicalMaterialContextV2,type CanonicalMaterialBuildInputV2} from './canonicalMaterialCodec.js'
import {canonicalRecordedRasterProfiles,prepareCanonicalRecordedAttachment} from './canonicalRecordedAttachment.js'
import {sourceAutoGeometry} from './sourceAutoGeometry.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2} from './canonicalStrokeOperation.js'
import type {BrushDescriptor} from './brushes.js'
import stock from './fixtures/sourceDefaultAutoData/stock.native.js'

type Kind='circle'|'rect'|'gaussian'|'soft'
function fixture(kind:Kind,coverage:CanonicalAutoCoverageProfile|CanonicalGaussianCoverageProfile){
 const base={descriptorId:'synthetic',descriptorVersion:1,descriptorSha256:'a'.repeat(64),brushScale:1,brushAngle:0}
 const source={diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1}
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const normalCoverage=coverage==='scalar-bionic-f64-fma-v1'?'scalar-f64-fma-v1':coverage
 const pin=kind==='soft'?canonicalSoftAutoSourcePin({...base,kind:'softAuto',sourceSlot:0,source:{...source,kind:'softAuto',generator:'soft',shape:'circle',softnessCurve:curve},coverageProfile:normalCoverage,reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
  :kind==='gaussian'?canonicalGaussianAutoSourcePin({...base,kind:'gaussianAuto',source:{...source,kind:'gaussianAuto',generator:'gauss',shape:'circle'},coverageProfile:coverage==='scalar-f64-fma-v1'?'scalar-bionic-f64-fma-v1':coverage})
  :canonicalDefaultAutoSourcePin({...base,kind:'defaultAuto',source:{...source,kind:'defaultAuto',generator:'default',shape:kind},coverageProfile:normalCoverage})
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const geometryRecipe={brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:-0,subX:-0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const recipe:AnyCanonicalMaterialRecipe=pin.kind==='softAuto'?{...geometryRecipe,kind:pin.kind,sourceSlot:0,source:pin.source,coverageProfile:pin.coverageProfile}
  :pin.kind==='gaussianAuto'?{...geometryRecipe,kind:pin.kind,source:pin.source,coverageProfile:pin.coverageProfile}:{...geometryRecipe,kind:pin.kind,source:pin.source,coverageProfile:pin.coverageProfile}
 const material:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:100000,outputBytes:400000,drawPixels:100000}}
 const input:CanonicalMaterialBuildInputV2={masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:.5,flow:.7}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]}
 return{pin,material,input,packed:buildCanonicalMaterial(input,material).packed}
}
function envelope(f:ReturnType<typeof fixture>,profile:CanonicalStrokeRasterProfile){
 const composition={mode:'wash' as const,alphaDarken:'hard' as const,outerResourceOpacity:1,outerBlend:'over' as const}
 const trusted={rasterProfile:profile,brush:'brush:synthetic@1',strokeId:'stroke',frameOrdinal:0,pigmentRgb8:[1,2,3]as const,composition,material:f.material}
 return{trusted,value:{version:canonicalStrokeRasterContract(profile).envelopeVersion,rasterProfile:profile,brush:trusted.brush,strokeId:trusted.strokeId,frameOrdinal:0,pigmentRgb8:trusted.pigmentRgb8,composition,materialPacked:f.packed}}
}
const raw=(packed:string)=>Uint8Array.from(atob(packed.slice(2)),c=>c.charCodeAt(0))
const changed=(packed:string,coverage:number)=>{const bytes=raw(packed);bytes[25]=coverage;return'2|'+btoa(String.fromCharCode(...bytes))}

it('keeps native scalar/NEON bytes frozen before adding the new coverage code',async()=>{
 const hashes=await Promise.all((['circle','rect','gaussian','soft']as const).flatMap(kind=>(['scalar-f64-fma-v1','neon64-f32-fma-v1']as const).map(async coverage=>{const packed=fixture(kind,coverage).packed;const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packed)));return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('')})))
 expect(hashes).toEqual(["7fe0cecb856597d9ebc841762548061154a166214f6ec472cd3a2e53d7412144", "d7d37b3422f22b569aea6fe870da53841eb67c4172d79c4bfb7bb66bcfee1319", "4c7535b67be189c1b4e7769f1bef9a0776e688df8ec33e0c5a50c4b33a070709", "a5aed4aa6d2e523bb1696cdf9068a046bb1236f9a1c962c7cb986361986e7a78", "53f724a0e5bc394cce94d125575a95f7fcb516124d64d2de05cd2634290e19e0", "4b217ffca66c46d52ec112ed113f1242518fa0125a839fe086f30c3f2a06cc42", "6b59f8f215217e3a414d9043d5ba82aecaa6da593fab85d2a42decb6a0116bef", "ffc80d8e54d747e6ae0f6c525f3011dc996252ec99e4ce58f7cabf12a867c8b8"])
})
it('maps only explicit known profiles; browser reuses envelope2 without native coverage identity',()=>{
 expect(canonicalStrokeRasterContract(native).envelopeVersion).toBe(1)
 expect(canonicalStrokeRasterContract(generic).envelopeVersion).toBe(2)
 expect(canonicalStrokeRasterContract(browser).envelopeVersion).toBe(2)
 expect(Object.isFrozen(canonicalStrokeRasterContract(browser))).toBe(true)
 expect(canonicalStrokeCoverageMatches(browser,browserCoverage)).toBe(true)
 for(const profile of [native,generic])expect(canonicalStrokeCoverageMatches(profile,browserCoverage)).toBe(false)
 for(const coverage of ['scalar-f64-fma-v1','scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'])expect(canonicalStrokeCoverageMatches(browser,coverage)).toBe(false)
 for(const unknown of [undefined,null,'browser-highp-rgba8-v2','',{}])expect(()=>canonicalStrokeRasterContract(unknown)).toThrow()
})
it.each(['circle','rect','gaussian','soft']as const)('encodes %s coverage byte3 in the unchanged96byte definition and rejects cross-pins',kind=>{
 const f=fixture(kind,browserCoverage),old=fixture(kind,'neon64-f32-fma-v1'),bytes=raw(f.packed),previous=raw(old.packed)
 expect(bytes.length).toBe(previous.length);expect(bytes[25]).toBe(3);expect(previous[25]).toBe(2)
 const differences=[...bytes.keys()].filter(i=>bytes[i]!==previous[i]);expect(differences).toEqual([25])
 expect(unpackCanonicalMaterial(f.packed,f.material).definitions[0]).toMatchObject({coverageProfile:browserCoverage})
 expect(()=>unpackCanonicalMaterial(f.packed,old.material)).toThrow();expect(()=>unpackCanonicalMaterial(old.packed,f.material)).toThrow()
 for(const byte of [0,4,255])expect(()=>unpackCanonicalMaterial(changed(f.packed,byte),f.material)).toThrow()
})
it('does not let an envelope select arithmetic authority or smuggle browser coverage under a native profile',()=>{
 const f=fixture('circle',browserCoverage),b=envelope(f,browser)
 expect(decodeCanonicalStrokeFrame(b.value,b.trusted).envelope).toMatchObject({version:2,rasterProfile:browser})
 expect(()=>decodeCanonicalStrokeFrame({...b.value,version:3},b.trusted)).toThrow()
 expect(()=>decodeCanonicalStrokeFrame(b.value,{...b.trusted,rasterProfile:native})).toThrow()
 for(const old of [native,generic]){const v=envelope(f,old);expect(()=>decodeCanonicalStrokeFrame(v.value,v.trusted)).toThrow()}
 const n=fixture('circle','neon64-f32-fma-v1'),v=envelope(n,browser);expect(()=>decodeCanonicalStrokeFrame(v.value,v.trusted)).toThrow()
})
it('requires explicit paired source binding; omitted profile stays native and cannot mint browser source policy',()=>{
 const descriptor=stock.rows[0].descriptor as unknown as BrushDescriptor
 expect(()=>canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),browserCoverage)).toThrow()
 expect(canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),browserCoverage,browser).coverageProfile).toBe(browserCoverage)
 expect(()=>canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),'neon64-f32-fma-v1',browser)).toThrow()
})
it('captures browser attachments only under explicit allowed profiles; default receiver still refuses',()=>{
 const f=fixture('circle',browserCoverage),b=envelope(f,browser)
 const snapshot:CanonicalStrokeSnapshotV2={materialVersion:2,material:f.material,assets:[],layerId:'layer',brush:b.trusted.brush,strokeId:'stroke',boardEpoch:1,descriptorSha256:f.pin.descriptorSha256,rasterProfile:browser,pigmentRgb8:b.trusted.pigmentRgb8,composition:b.trusted.composition}
 const op={type:'canonical_stroke',id:'frame',seq:1,userId:'author',timestamp:1,layerId:'layer',frame:decodeCanonicalStrokeFrame(b.value,b.trusted).envelope} satisfies CanonicalStrokeOperation
 const attachment={version:1 as const,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'frame',sequence:1,originalUserId:'author',capability:0}]}
 expect(()=>prepareCanonicalRecordedAttachment(attachment,[op],{roomId:'room',boardEpoch:1})).toThrow()
 const expected={roomId:'room',boardEpoch:1,allowedRasterProfiles:[browser]}
 expect(prepareCanonicalRecordedAttachment(attachment,[op],expected)[0].read?.rasterProfile).toBe(browser)
 expect(canonicalRecordedRasterProfiles({allowedRasterProfiles:[native,generic,browser]})).toEqual([native,generic,browser])
 expect(canonicalRecordedRasterProfiles({})).toEqual([native])
})

it('keeps trusted browser pin/cost metadata immutable and distinct from native coverage',()=>{
 const f=fixture('soft',browserCoverage),old=fixture('soft','neon64-f32-fma-v1')
 expect(Object.isFrozen(f.pin)).toBe(true)
 if(f.pin.kind!=='softAuto')throw Error('soft fixture')
 expect(Object.isFrozen(f.pin.source.softnessCurve.points[0])).toBe(true)
 expect(Object.isFrozen(f.pin.radialCurve.coefficients[0])).toBe(true)
 expect(f.pin.coverageProfile).not.toBe(old.pin.coverageProfile)
 expect(f.pin.reader).toBe('krita-bd6e8d0-v1');expect(f.pin.compilerProfile).toBe('eigen-5.0.1-mapped-arm64-f64-v3')
})
it('validates the browser/native coverage pair for mask pins as well as primary pins',()=>{
 const f=fixture('circle',browserCoverage),old=fixture('circle','neon64-f32-fma-v1'),b=envelope(f,browser)
 expect(()=>decodeCanonicalStrokeFrame(b.value,{...b.trusted,material:{...f.material,maskSource:old.pin}})).toThrow('profile mismatch')
})
it('keeps image tag0 reserved coverage bytes and source-slot flags closed',()=>{
 const f=fixture('soft',browserCoverage),bytes=raw(f.packed)
 // Source-slot1 is not authorized by a primary-only context.
 bytes[27]=1
 expect(()=>unpackCanonicalMaterial('2|'+btoa(String.fromCharCode(...bytes)),f.material)).toThrow()
 bytes[24]=0;bytes[27]=0
 expect(()=>unpackCanonicalMaterial('2|'+btoa(String.fromCharCode(...bytes)),f.material)).toThrow()
})
it('refuses mismatched coverage before descriptor inspection and preserves erase/wet outer guards',()=>{
 const descriptor=stock.rows[0].descriptor as unknown as BrushDescriptor
 let reads=0
 const guarded={...descriptor};Object.defineProperty(guarded,'sourceStamp',{get(){reads++;throw Error('must not inspect source')}})
 expect(()=>canonicalDefaultAutoSourceBinding(guarded,'a'.repeat(64),browserCoverage)).toThrow();expect(reads).toBe(0)
 const behavior=descriptor.behavior,rendering=behavior?.rendering;if(!behavior||!rendering)throw Error('Fixture rendering required')
 for(const changed of [{...descriptor,behavior:{...behavior,erase:true}},
  {...descriptor,behavior:{...behavior,rendering:{...rendering,wetEdges:1}}}]){
  expect(()=>canonicalDefaultAutoSourceBinding(changed,'a'.repeat(64),browserCoverage,browser)).toThrow()
 }
})
