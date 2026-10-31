/** Optional diagnostic: requires the previously retained actual NEW-import input.
 * No ignored artifact is required by committed unit tests; no compiler/device. */
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {isBrushLibrary} from '../../../../packages/shared/src/brushes'
import {extractSoftAutoSourceDataCapability,canonicalSourceComposition} from '../../../../packages/shared/src/canonicalBrushCapability'
import {canonicalSoftAutoSourceBinding} from '../../../../packages/shared/src/canonicalSoftAutoMaterial'
import {CANONICAL_STROKE_RASTER_PROFILE as oldProfile,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as newProfile,decodeCanonicalStrokeFrame} from '../../../../packages/shared/src/canonicalStrokeFrame'
import {buildCanonicalMaterial,type CanonicalMaterialContextV2} from '../../../../packages/shared/src/canonicalMaterialCodec'
import {sourceAutoGeometry} from '../../../../packages/shared/src/sourceAutoGeometry'
const path=process.argv[2];if(!path)throw Error('Pass the retained soft-six-compiled-descriptors.json path explicitly')
const hash=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex'),bytes=fs.readFileSync(path)
if(bytes.length!==209659||hash(bytes)!=='721d0c7ca7245dd3b561a6fa4a0d5974035d196e4ab4f497c016072c19600c13')throw Error('Unexpected actual-import diagnostic input')
const input=JSON.parse(bytes.toString())
// Retained descriptors still name a historical fallback LUT. Supply only the
// importer-determined metadata required by the library schema; no CAS bytes are
// verified/used, and the canonical procedural material remains assets=[].
const assets=new Map<string,{id:string;size:number;file:string}>()
for(const row of input.rows){const p=row.descriptor.tip.profile;if(p?.kind==='radialCurve'){let size=4;while(size*size<4*(p.resolution+2))size*=2;assets.set(p.lookup,{id:p.lookup,size,file:p.lookup.slice(6)+'.bin'})}}
const library={schemaVersion:1,assets:[...assets.values()],skipped:[],brushes:input.rows.map((row:{descriptor:unknown;name:string})=>({descriptor:row.descriptor,name:row.name,source:'krita-original-kpp',warnings:[]}))}
if(!isBrushLibrary(library))throw Error('Actual NEW descriptors fail the existing shared library validator')
const normalized=(value:unknown):unknown=>Array.isArray(value)?value.map(normalized):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,normalized(v)])):value
const rows=[]
for(let i=0;i<input.rows.length;i++){
 const row=input.rows[i],descriptor=library.brushes[i].descriptor,descriptorSHA256=hash(JSON.stringify(normalized(descriptor)))
 if(!extractSoftAutoSourceDataCapability(descriptor).supported)throw Error('Actual source data readiness changed')
 const profiles=[]
 for(const rasterProfile of [oldProfile,newProfile]){
  const expected=row.index===3||row.index>=60&&row.index<=63&&rasterProfile===newProfile
  let pin:ReturnType<typeof canonicalSoftAutoSourceBinding>|undefined,error:string|undefined
  try{pin=canonicalSoftAutoSourceBinding(descriptor,descriptorSHA256,'neon64-f32-fma-v1',0,rasterProfile)}catch(e){error=String(e)}
  if(!!pin!==expected)throw Error(`Unexpected binding classification ${row.index}/${rasterProfile}: ${error}`)
  if(!pin){profiles.push({rasterProfile,supported:false,error});continue}
  const composition=canonicalSourceComposition(descriptor,rasterProfile);if(!composition)throw Error('Missing selected source composition')
  const scale=Math.min(1,16/pin.source.diameter),geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale,ratio:1,rotation:0},0,0)
  const material:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:1000000,outputBytes:4000000,drawPixels:1000000}}
  const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
  const built=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:-3,y:2,opacity:.7,flow:.8}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},material)
  const context={rasterProfile,brush:`brush:${pin.descriptorId}@${pin.descriptorVersion}`,strokeId:'actual-native-'+row.index,frameOrdinal:0,pigmentRgb8:[17,29,41]as const,composition:{...composition,alphaDarken:'hard' as const,outerResourceOpacity:.63},material}
  const decoded=decodeCanonicalStrokeFrame({version:rasterProfile===oldProfile?1:2,rasterProfile,brush:context.brush,strokeId:context.strokeId,frameOrdinal:0,pigmentRgb8:context.pigmentRgb8,composition:context.composition,materialPacked:built.packed},context)
  profiles.push({rasterProfile,supported:true,composition,pinSHA256:hash(JSON.stringify(pin)),materialSHA256:hash(built.packed),envelopeVersion:decoded.envelope.version,sourceSlot:pin.sourceSlot,immutableRadial:Object.isFrozen(pin.radialCurve.coefficients[0])})
 }
 rows.push({index:row.index,name:row.name,kppSHA256:row.kppSHA256,retainedDescriptorSHA256:row.descriptorSHA256,serverNormalizedDescriptorSHA256:descriptorSHA256,sourceReady:true,nativeBlend:descriptor.behavior?.rendering?.blendMode,profiles})
}
const modules=['canonicalBrushCapability.ts','canonicalDefaultAutoMaterial.ts','canonicalSoftAutoMaterial.ts','canonicalStrokeFrame.ts','canonicalMaterialCodec.ts']
const moduleSHA256=Object.fromEntries(modules.map(name=>[name,hash(fs.readFileSync(new URL('../../../../packages/shared/src/'+name,import.meta.url)))]))
const report={status:'PASS',scriptSHA256:hash(fs.readFileSync(new URL(import.meta.url))),moduleSHA256,scope:'Actual NEW-import descriptors: structural binding/material/decode only, not compiler reattestation, room execution permission, GPU or native GUI proof',inputBytes:bytes.length,inputSHA256:hash(bytes),legacyFallbackMetadataOnly:[...assets.values()],legacyCASBytesVerified:false,canonicalMaterialAssets:0,provider:input.provider,rows}
fs.writeFileSync(new URL('generic-sc4-source-binding-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({status:report.status,sourceReady:rows.length,oldSupported:rows.filter(r=>r.profiles[0].supported).map(r=>r.index),newSupported:rows.filter(r=>r.profiles[1].supported).map(r=>r.index)}))
