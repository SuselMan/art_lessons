import {extractCanonicalPixelImageSourceData} from '@grafetto/shared'
import {extractCanonicalNativeImagePipeSourceData} from '@grafetto/shared'
import {extractCanonicalPixelTextureSourceData} from '@grafetto/shared'
import {extractCanonicalDynamicAutoGeometryData} from '@grafetto/shared'
import {extractCanonicalPrimaryGrainImageAuthorData} from '@grafetto/shared'
import {extractCanonicalPlainAutoTiltGeometryData} from '@grafetto/shared'
import {extractCanonicalTexturedAutoProgramData} from '@grafetto/shared'
import {extractCanonicalSoftAutoNativeDefaultTextureProgramData,extractCanonicalDefaultAutoPressureTextureProgramData,canonicalStrokeRasterContract,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,extractSeededDensityDefaultAutoSourceDataCapability,extractDefaultAutoSourceDataCapability,extractGaussianAutoSourceDataCapability,extractSoftAutoSourceDataCapability,canonicalPixelSourceComposition,canonicalSourceComposition,canonicalSourceEffectReject,canonicalImageMaterialPin,extractCanonicalPrimaryTextureCapability,extractCanonicalDefaultAutoFixedTextureCapability,canonicalImageSourceBinding,canonicalImagePipeSourceBinding,isSourceStampData,sourceStampSourceKind,type CanonicalPrimaryTextureCapability,type CanonicalDefaultAutoFixedTextureCapability,type BrushDescriptor,type CanonicalStrokeRasterProfile,type SourceStampData} from '@grafetto/shared'

type ImagePin=ReturnType<typeof canonicalImageSourceBinding>
export type CanonicalSourceAuthorAdmission =
 {readonly supported:true;readonly data:Extract<SourceStampData,{version:2}>;readonly nativeSizePx:number;readonly material:{readonly kind:'auto';readonly coverageProfile?:typeof CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE}}
 |{readonly supported:true;readonly data:SourceStampData;readonly nativeSizePx:number;readonly material:{readonly kind:'image';readonly pin:ImagePin}}
 |{readonly supported:true;readonly data:SourceStampData;readonly nativeSizePx:number;readonly material:{readonly kind:'imageTexture';readonly pin:ImagePin;readonly capability:CanonicalPrimaryTextureCapability}}
 |{readonly supported:false;readonly reason:string}

export type CanonicalSourceAuthorAdmissionV4=CanonicalSourceAuthorAdmission|{readonly supported:true;readonly data:Extract<SourceStampData,{version:2}>;readonly nativeSizePx:number;readonly material:{readonly kind:'autoTexture';readonly capability:CanonicalDefaultAutoFixedTextureCapability}}

export type CanonicalSourceAuthorAdmissionV5=CanonicalSourceAuthorAdmissionV4|{readonly supported:true;readonly data:Extract<SourceStampData,{version:2}>;readonly nativeSizePx:number;readonly material:{readonly kind:'autoPressureTexture';readonly capability:Extract<ReturnType<typeof extractCanonicalDefaultAutoPressureTextureProgramData>,{supported:true}>}}

export type CanonicalSourceAuthorAdmissionV6=CanonicalSourceAuthorAdmissionV5|{readonly supported:true;readonly data:Extract<SourceStampData,{version:2}>;readonly nativeSizePx:number;readonly material:{readonly kind:'autoSoftPressureTexture';readonly capability:Extract<ReturnType<typeof extractCanonicalSoftAutoNativeDefaultTextureProgramData>,{supported:true}>}}
export type CanonicalSourceAuthorAdmissionV7=CanonicalSourceAuthorAdmissionV6|{readonly supported:true;readonly data:Extract<SourceStampData,{version:2}>;readonly nativeSizePx:number;readonly material:{readonly kind:'texturedAuto';readonly capability:Extract<ReturnType<typeof extractCanonicalTexturedAutoProgramData>,{supported:true}>}}
/** Declared metadata only; never pixels, a resource owner or BEGIN authority. */
function captureMetadata(values:readonly {readonly id:string;readonly size:number}[]|undefined){
 if(!values||!Array.isArray(values)||values.length<1||values.length>256)return undefined
 const result:{id:string;size:number}[]=[],ids=new Set<string>()
 for(let i=0;i<values.length;i++){
  const entry=Object.getOwnPropertyDescriptor(values,String(i));if(!entry||!Object.hasOwn(entry,'value')||!entry.value||typeof entry.value!=='object')return undefined
  const id=Object.getOwnPropertyDescriptor(entry.value,'id'),size=Object.getOwnPropertyDescriptor(entry.value,'size')
  if(!id||!Object.hasOwn(id,'value')||!size||!Object.hasOwn(size,'value')||typeof id.value!=='string'||typeof size.value!=='number')return undefined
  if(ids.has(id.value))return undefined
  ids.add(id.value);result.push({id:id.value,size:size.value})
 }
 return result
}
export interface CanonicalSourceAuthorAdmissionOptions {readonly primaryTextureSource?:'pressure-identity-subtract-v3';readonly texturedSource?:never;readonly pressureTexturedSource?:never;readonly softPressureTexturedSource?:never;readonly texturedAutoSource?:never}

export interface CanonicalSourceAuthorAdmissionV4Options extends Omit<CanonicalSourceAuthorAdmissionOptions,'texturedSource'> {readonly texturedSource:'fixed-default-auto-texture-v4'}

export interface CanonicalSourceAuthorAdmissionV5Options extends Omit<CanonicalSourceAuthorAdmissionOptions,'texturedSource'|'pressureTexturedSource'> {readonly texturedSource?:'fixed-default-auto-texture-v4';readonly pressureTexturedSource:'pressure-default-auto-texture-v5'}

export interface CanonicalSourceAuthorAdmissionV6Options extends Omit<CanonicalSourceAuthorAdmissionOptions,'texturedSource'|'pressureTexturedSource'|'softPressureTexturedSource'>{readonly texturedSource?:'fixed-default-auto-texture-v4';readonly pressureTexturedSource?:'pressure-default-auto-texture-v5';readonly softPressureTexturedSource:'pressure-soft-auto-texture-v6'}
export interface CanonicalSourceAuthorAdmissionV7Options extends Omit<CanonicalSourceAuthorAdmissionOptions,'texturedSource'|'pressureTexturedSource'|'softPressureTexturedSource'|'texturedAutoSource'>{readonly texturedSource?:'fixed-default-auto-texture-v4';readonly pressureTexturedSource?:'pressure-default-auto-texture-v5';readonly softPressureTexturedSource?:'pressure-soft-auto-texture-v6';readonly texturedAutoSource:'textured-auto-material-v7'}
/** Static pointer-domain query over original validated source data. DATA1 image
 * remains DATA1; wire material V2 and real server BEGIN are separate boundaries. */
export function canonicalSourceAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly {readonly id:string;readonly size:number}[]|undefined,options:CanonicalSourceAuthorAdmissionV7Options):CanonicalSourceAuthorAdmissionV7
export function canonicalSourceAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly {readonly id:string;readonly size:number}[]|undefined,options:CanonicalSourceAuthorAdmissionV6Options):CanonicalSourceAuthorAdmissionV6
export function canonicalSourceAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly {readonly id:string;readonly size:number}[]|undefined,options:CanonicalSourceAuthorAdmissionV5Options):CanonicalSourceAuthorAdmissionV5
export function canonicalSourceAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly {readonly id:string;readonly size:number}[]|undefined,options:CanonicalSourceAuthorAdmissionV4Options):CanonicalSourceAuthorAdmissionV4
export function canonicalSourceAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available?:readonly {readonly id:string;readonly size:number}[],options?:CanonicalSourceAuthorAdmissionOptions):CanonicalSourceAuthorAdmission
export function canonicalSourceAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available?:readonly {readonly id:string;readonly size:number}[],options?:CanonicalSourceAuthorAdmissionOptions|CanonicalSourceAuthorAdmissionV4Options|CanonicalSourceAuthorAdmissionV5Options|CanonicalSourceAuthorAdmissionV6Options|CanonicalSourceAuthorAdmissionV7Options):CanonicalSourceAuthorAdmissionV7 {
 const generic=options&&'texturedAutoSource'in options?options.texturedAutoSource:undefined
 if(generic!==undefined&&generic!=='textured-auto-material-v7')return{supported:false,reason:'Unsupported canonical textured Auto policy'}
 if(generic){try{if(!canonicalStrokeRasterContract(profile).genericSC)return{supported:false,reason:'Unsupported canonical textured Auto profile'}}catch{return{supported:false,reason:'Unsupported canonical textured Auto profile'}}}
 const softPressure=options&&'softPressureTexturedSource'in options?options.softPressureTexturedSource:undefined
 if(softPressure!==undefined&&softPressure!=='pressure-soft-auto-texture-v6')return{supported:false,reason:'Unsupported canonical Soft texture policy/profile'}
 if(softPressure){try{if(!canonicalStrokeRasterContract(profile).genericSC)return{supported:false,reason:'Unsupported canonical Soft texture policy/profile'}}catch{return{supported:false,reason:'Unsupported canonical Soft texture policy/profile'}}}
 const pressure=options&&'pressureTexturedSource'in options?options.pressureTexturedSource:undefined
 if(pressure!==undefined&&pressure!=='pressure-default-auto-texture-v5')return{supported:false,reason:'Unsupported canonical pressure texture policy/profile'}
 if(pressure){try{if(!canonicalStrokeRasterContract(profile).genericSC)return{supported:false,reason:'Unsupported canonical pressure texture policy/profile'}}catch{return{supported:false,reason:'Unsupported canonical pressure texture policy/profile'}}}
 const texture=options?.primaryTextureSource,fixed=options&&'texturedSource'in options?options.texturedSource:undefined
 if(fixed!==undefined&&fixed!=='fixed-default-auto-texture-v4')return{supported:false,reason:'Unsupported canonical fixed texture policy/profile'}
 if(fixed){try{if(!canonicalStrokeRasterContract(profile).genericSC)return{supported:false,reason:'Unsupported canonical fixed texture policy/profile'}}catch{return{supported:false,reason:'Unsupported canonical fixed texture policy/profile'}}}
 if(texture!==undefined&&texture!=='pressure-identity-subtract-v3')return{supported:false,reason:'Unsupported canonical primary texture policy/profile'}
 const unsupported=canonicalSourceEffectReject(descriptor,profile)
 if(unsupported)return{supported:false,reason:'Unsupported canonical source effect: '+unsupported}
 const policy=canonicalSourceComposition(descriptor,profile),data=descriptor.sourceStamp
 if(!(policy?.mode==='wash'||generic==='textured-auto-material-v7'&&policy?.mode==='buildup'&&policy.outerBlend==='over')||!data||!isSourceStampData(data)||data.timing.enabled)return{supported:false,reason:'Unsupported canonical pointer material/timing'}
 const seeded=data.version===2&&data.source.kind==='defaultAuto'&&data.source.density<1
 if(seeded&&(profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||!extractSeededDensityDefaultAutoSourceDataCapability(descriptor).supported))return{supported:false,reason:'Unsupported canonical seeded pointer material/profile'}
 const image=sourceStampSourceKind(data)==='image',size=data.options.find(option=>option.id==='Size')
 if(size?.checked&&(!Number.isFinite(size.min)||!Number.isFinite(size.max)||size.min<0||size.max>1||size.sensors.length!==1||size.sensors[0].id!=='pressure'))return{supported:false,reason:'Unsupported canonical pointer transform/sensor'}
 // Capture the genuine generic7 capability before granting its single native
 // TiltDirection pointer consumer. Historical constructors remain closed.
 let genericCapability:Extract<ReturnType<typeof extractCanonicalTexturedAutoProgramData>,{supported:true}>|undefined
 if(generic&&data.version===2&&data.source.kind!=='image'&&data.flags.textureEnabled&&(data.compiled?.version===3||data.compiled?.version===4)){
  const metadata=captureMetadata(available),pattern=metadata?.find(a=>a.id===descriptor.texture?.id)
  if(!pattern)return{supported:false,reason:'Canonical textured Auto metadata unavailable'}
  const result=extractCanonicalTexturedAutoProgramData(descriptor,{pattern})
  if(!result.supported)return{supported:false,reason:'Unsupported canonical textured Auto: '+result.reasons.join(',')}
  genericCapability=result
 }
 const rotation=data.options.find(option=>option.id==='Rotation')
 const texturedTilt=!!genericCapability&&rotation?.checked===true&&rotation.useCurve&&rotation.sensors.length===1&&rotation.sensors[0].id==='tiltDirection'
 if(data.options.some(option=>(image||seeded||texturedTilt?['Ratio','Scatter','Mirror']:['Ratio','Rotation','Scatter','Mirror']).includes(option.id)&&option.checked)
  ||seeded&&rotation?.checked&&(!rotation.useCurve||rotation.sensors.length!==1||rotation.sensors[0].id!=='tiltDirection')
  ||image&&rotation?.checked&&(rotation.sensors.length!==1||rotation.sensors[0].id!=='drawingAngle')
  ||data.options.some(option=>option.checked&&option.useCurve&&option.sensors.some(sensor=>['rotation','tangentialPressure','perspective','speed'].includes(sensor.id))))return{supported:false,reason:'Unsupported canonical pointer transform/sensor'}
 if(image){
  if(policy?.mode!=='wash')return{supported:false,reason:'Unsupported canonical pointer material/timing'}
  const metadata=captureMetadata(available),nativeSizePx=Math.max(data.brush.width,data.brush.height)*data.brush.scale
  if(!metadata||!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return{supported:false,reason:'Canonical image metadata unavailable'}
  try{
   const asset=metadata.find(a=>a.id===descriptor.tip.mask)
   if(!asset)throw Error('Missing primary image')
   if(texture&&data.flags.textureEnabled){
    if(profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)return{supported:false,reason:'Unsupported canonical primary texture policy/profile'}
    const pattern=metadata.find(a=>a.id===descriptor.texture?.id)
    if(!pattern)return{supported:false,reason:'Canonical primary texture metadata unavailable'}
    const result=extractCanonicalPrimaryTextureCapability(descriptor,{primary:asset,pattern})
    if(!result.supported)return{supported:false,reason:'Unsupported canonical primary texture: '+result.reasons.join(',')}
    const capability=result.capability,pin=canonicalImageMaterialPin({kind:'image',asset:capability.asset.id,brushScale:capability.brushScale,brushAngle:capability.brushAngle},[capability.asset])
    return{supported:true,data,nativeSizePx,material:{kind:'imageTexture',pin,capability}}
   }
   const pin=descriptor.tip.animation?canonicalImagePipeSourceBinding(descriptor,metadata):canonicalImageSourceBinding(descriptor,asset)
   return{supported:true,data,nativeSizePx,material:{kind:'image',pin}}
  }catch{return{supported:false,reason:'Unsupported canonical image source binding'}}
 }
 if(genericCapability){
  const result=genericCapability
  if(result.data.version!==2||result.data.source.kind==='image')return{supported:false,reason:'Unsupported canonical textured Auto family'}
  const nativeSizePx=result.data.source.diameter*result.data.brush.scale
  if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return{supported:false,reason:'Invalid canonical textured Auto native size'}
  return{supported:true,data:result.data,nativeSizePx,material:{kind:'texturedAuto',capability:result}}
 }
 if(policy?.mode!=='wash')return{supported:false,reason:'Unsupported canonical pointer material/timing'}
 if(softPressure&&data.flags.textureEnabled&&data.compiled?.version===4){
  const metadata=captureMetadata(available),pattern=metadata?.find(a=>a.id===descriptor.texture?.id)
  if(!pattern)return{supported:false,reason:'Canonical Soft pressure texture metadata unavailable'}
  const result=extractCanonicalSoftAutoNativeDefaultTextureProgramData(descriptor,{pattern})
  if(!result.supported)return{supported:false,reason:'Unsupported canonical Soft pressure texture: '+result.reasons.join(',')}
  const nativeSizePx=result.data.source.diameter*result.data.brush.scale
  if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return{supported:false,reason:'Invalid canonical Soft pressure texture native size'}
  return{supported:true,data:result.data,nativeSizePx,material:{kind:'autoSoftPressureTexture',capability:result}}
 }
 if(pressure&&data.flags.textureEnabled&&data.compiled?.version===3){
  const metadata=captureMetadata(available),pattern=metadata?.find(a=>a.id===descriptor.texture?.id)
  if(!pattern)return{supported:false,reason:'Canonical pressure texture metadata unavailable'}
  const result=extractCanonicalDefaultAutoPressureTextureProgramData(descriptor,{pattern})
  if(!result.supported)return{supported:false,reason:'Unsupported canonical pressure texture: '+result.reasons.join(',')}
  if(result.data.version!==2||result.data.source.kind!=='defaultAuto')return{supported:false,reason:'Unsupported canonical pressure texture source'}
  const nativeSizePx=result.data.source.diameter*result.data.brush.scale
  if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return{supported:false,reason:'Invalid canonical pressure texture native size'}
  return{supported:true,data:result.data,nativeSizePx,material:{kind:'autoPressureTexture',capability:result}}
 }
 if(fixed&&data.flags.textureEnabled){
  const metadata=captureMetadata(available),pattern=metadata?.find(a=>a.id===descriptor.texture?.id)
  if(!pattern)return{supported:false,reason:'Canonical fixed texture metadata unavailable'}
  const result=extractCanonicalDefaultAutoFixedTextureCapability(descriptor,{pattern})
  if(!result.supported)return{supported:false,reason:'Unsupported canonical fixed texture: '+result.reasons.join(',')}
  return{supported:true,data:result.data,nativeSizePx:result.data.source.diameter,material:{kind:'autoTexture',capability:result.capability}}
 }
 if(data.version!==2||data.source.kind==='image')return{supported:false,reason:'Unsupported canonical pointer material/timing'}
 if(!seeded){
  const capability=data.source.kind==='defaultAuto'?extractDefaultAutoSourceDataCapability(descriptor):data.source.kind==='gaussianAuto'?extractGaussianAutoSourceDataCapability(descriptor):extractSoftAutoSourceDataCapability(descriptor)
  if(!capability.supported)return{supported:false,reason:'Unsupported canonical auto source: '+capability.reasons.join(',')}
 }
 return{supported:true,data,nativeSizePx:data.source.diameter,material:seeded?{kind:'auto',coverageProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE}:{kind:'auto'}}
}

/** Static original-DATA query, never a BEGIN/read grant. Historical entries stay closed. */
export type CanonicalPlainAutoGeometryCapability=Extract<ReturnType<typeof extractCanonicalPlainAutoTiltGeometryData>,{supported:true}>
export interface CanonicalPlainAutoGeometryAuthorOptions {readonly authorPlainTiltSource:'plain-auto-tilt-v1'}
export type CanonicalPlainAutoGeometryAuthorAdmission={readonly supported:true;readonly data:CanonicalPlainAutoGeometryCapability['data'];readonly nativeSizePx:number;readonly material:{readonly kind:'auto';readonly coverageProfile?:never};readonly geometryCapability:CanonicalPlainAutoGeometryCapability}|{readonly supported:false;readonly reason:string}
export function canonicalPlainAutoGeometryAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,options:CanonicalPlainAutoGeometryAuthorOptions):CanonicalPlainAutoGeometryAuthorAdmission {
 try{
  const field=Object.getOwnPropertyDescriptor(options,'authorPlainTiltSource')
  if(!field||!Object.hasOwn(field,'value')||field.value!=='plain-auto-tilt-v1'||!canonicalStrokeRasterContract(profile).genericSC)return{supported:false,reason:'Unsupported plain Auto geometry policy/profile'}
  const capability=extractCanonicalPlainAutoTiltGeometryData(descriptor)
  if(!capability.supported)return{supported:false,reason:capability.reasons.join(',')}
  return Object.freeze({supported:true,data:capability.data,nativeSizePx:capability.data.source.diameter,material:Object.freeze({kind:'auto'}),geometryCapability:capability})
 }catch{return{supported:false,reason:'Invalid plain Auto geometry input'}}
}

/** Explicit static SOURCE8 DATA query only: no service/BEGIN/read grant. */
export function canonicalPrimaryGrainImageAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly{readonly id:string;readonly size:number}[]|undefined){
 const reject=(reason:string)=>({supported:false as const,reason})
 if(profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)return reject('Primary-grain image requires GSC')
 const tip=Object.getOwnPropertyDescriptor(descriptor,'tip'),texture=Object.getOwnPropertyDescriptor(descriptor,'texture')
 if(!tip||!Object.hasOwn(tip,'value')||!texture||!Object.hasOwn(texture,'value')||!tip.value||!texture.value)return reject('Primary-grain image metadata unavailable')
 const primaryId=Object.getOwnPropertyDescriptor(tip.value,'mask'),patternId=Object.getOwnPropertyDescriptor(texture.value,'id'),metadata=captureMetadata(available)
 if(!primaryId||!Object.hasOwn(primaryId,'value')||!patternId||!Object.hasOwn(patternId,'value')||!metadata)return reject('Primary-grain image metadata unavailable')
 const primary=metadata.find(a=>a.id===primaryId.value),pattern=metadata.find(a=>a.id===patternId.value)
 if(!primary||!pattern)return reject('Primary-grain image assets unavailable')
 const capability=extractCanonicalPrimaryGrainImageAuthorData(descriptor,{primary,pattern})
 if(!capability.supported)return reject(capability.reasons.join(','))
 const nativeSizePx=Math.max(capability.data.brush.width,capability.data.brush.height)*capability.data.brush.scale
 if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return reject('Invalid primary-grain image size')
 return{supported:true as const,data:capability.data,nativeSizePx,material:{kind:'primaryGrainImage' as const,capability}}
}

/** Explicit dynamic geometry policy, independent of historical plainTilt9. */
export function canonicalDynamicAutoGeometryAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly{readonly id:string;readonly size:number}[]|undefined,options:Readonly<{authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1';texturedAutoSource?:'textured-auto-material-v7'}>){
 const reject=(reason:string)=>({supported:false as const,reason})
 try{
  const field=Object.getOwnPropertyDescriptor(options,'authorPlainAutoGeometrySource')
  if(!field||!Object.hasOwn(field,'value')||field.value!=='dynamic-auto-geometry-v1'||!canonicalStrokeRasterContract(profile).genericSC)return reject('Unsupported dynamic Auto policy/profile')
  const metadata=captureMetadata(available),pattern=metadata?.find(a=>a.id===descriptor.texture?.id)
  const capability=extractCanonicalDynamicAutoGeometryData(descriptor,pattern?{pattern}:undefined,metadata,profile)
  if(!capability.supported)return reject(capability.reasons.join(','))
  const data=capability.data
  if(data.version!==2||data.source.kind==='image')return reject('Unsupported dynamic Auto source family')
  const policy=canonicalPixelSourceComposition(capability.descriptor,profile)
  if(data.flags.textureEnabled){
   const token=Object.getOwnPropertyDescriptor(options,'texturedAutoSource')
   if(!token||!Object.hasOwn(token,'value')||token.value!=='textured-auto-material-v7'||!pattern)return reject('Dynamic textured Auto policy unavailable')
   const material=extractCanonicalTexturedAutoProgramData(capability.descriptor,{pattern})
   const legacyPolicy=canonicalSourceComposition(capability.descriptor,profile)
   if(!material.supported||!(legacyPolicy?.mode==='wash'||legacyPolicy?.mode==='buildup'&&legacyPolicy.outerBlend==='over'))return reject('Unsupported dynamic textured Auto composition')
   return{supported:true as const,data,nativeSizePx:data.source.diameter*data.brush.scale,material:{kind:'texturedAuto' as const,capability:material},geometryCapability:capability}
  }
  if(!policy)return reject('Unsupported dynamic plain Auto composition')
  return{supported:true as const,data,nativeSizePx:data.source.diameter*data.brush.scale,material:{kind:'auto' as const},geometryCapability:capability}
 }catch{return reject('Invalid dynamic Auto input')}
}

/** Named native Pixel texture DATA; policy/BEGIN are checked by the caller. */
export function canonicalPixelTextureAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly{readonly id:string;readonly size:number}[]|undefined){
 const reject=(reason:string)=>({supported:false as const,reason})
 try{
  if(!canonicalStrokeRasterContract(profile).genericSC)return reject('Pixel texture requires genericSC')
  const metadata=captureMetadata(available);if(!metadata)return reject('Pixel texture asset metadata unavailable')
  const capability=extractCanonicalPixelTextureSourceData(descriptor,metadata,profile);if(!capability.supported)return reject(capability.reasons.join(','))
  const d=capability.data,nativeSizePx=(d.source.kind==='image'?Math.max(d.brush.width,d.brush.height):d.source.diameter)*d.brush.scale
  if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return reject('Invalid Pixel texture size')
  return{supported:true as const,data:d,nativeSizePx,material:{kind:'pixelTexture' as const,capability}}
 }catch{return reject('Invalid Pixel texture original DATA')}
}

/** Native GIH DATA query, with exact original dimensions and per-cell assets. */
export function canonicalNativeImagePipeAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly{readonly id:string;readonly size:number}[]|undefined){
 const reject=(reason:string)=>({supported:false as const,reason})
 try{
  if(!canonicalStrokeRasterContract(profile).genericSC)return reject('Native image pipe requires genericSC')
  const metadata=captureMetadata(available);if(!metadata)return reject('Native image pipe assets unavailable')
  const capability=extractCanonicalNativeImagePipeSourceData(descriptor,metadata);if(!capability.supported)return reject(capability.reasons.join(','))
  const d=capability.data,nativeSizePx=Math.max(d.brush.width,d.brush.height)*d.brush.scale
  if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return reject('Invalid native image pipe size')
  return{supported:true as const,data:d,nativeSizePx,material:{kind:'nativeImagePipe' as const,capability}}
 }catch{return reject('Invalid native image pipe original DATA')}
}

/** Named full native image consumer; historical PNG admission stays closed. */
export function canonicalPixelImageAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available:readonly{readonly id:string;readonly size:number}[]|undefined){
 const reject=(reason:string)=>({supported:false as const,reason})
 try{
  if(!canonicalStrokeRasterContract(profile).genericSC)return reject('Pixel image requires genericSC')
  const metadata=captureMetadata(available);if(!metadata)return reject('Pixel image assets unavailable')
  const capability=extractCanonicalPixelImageSourceData(descriptor,metadata,profile);if(!capability.supported)return reject(capability.reasons.join(','))
  const d=capability.data,nativeSizePx=Math.max(d.brush.width,d.brush.height)*d.brush.scale
  if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return reject('Invalid Pixel image size')
  return{supported:true as const,data:d,nativeSizePx,material:{kind:'pixelImage' as const,capability}}
 }catch{return reject('Invalid Pixel image original DATA')}
}
