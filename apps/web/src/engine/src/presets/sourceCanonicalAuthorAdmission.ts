import {extractCanonicalTexturedAutoProgramData} from '@grafetto/shared'
import {extractCanonicalSoftAutoNativeDefaultTextureProgramData,extractCanonicalDefaultAutoPressureTextureProgramData,canonicalStrokeRasterContract,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,extractSeededDensityDefaultAutoSourceDataCapability,extractDefaultAutoSourceDataCapability,extractGaussianAutoSourceDataCapability,extractSoftAutoSourceDataCapability,canonicalSourceComposition,canonicalSourceEffectReject,canonicalImageMaterialPin,extractCanonicalPrimaryTextureCapability,extractCanonicalDefaultAutoFixedTextureCapability,canonicalImageSourceBinding,canonicalImagePipeSourceBinding,isSourceStampData,sourceStampSourceKind,type CanonicalPrimaryTextureCapability,type CanonicalDefaultAutoFixedTextureCapability,type BrushDescriptor,type CanonicalStrokeRasterProfile,type SourceStampData} from '@grafetto/shared'

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
 if(policy?.mode!=='wash'||!data||!isSourceStampData(data)||data.timing.enabled)return{supported:false,reason:'Unsupported canonical pointer material/timing'}
 const seeded=data.version===2&&data.source.kind==='defaultAuto'&&data.source.density<1
 if(seeded&&(profile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||!extractSeededDensityDefaultAutoSourceDataCapability(descriptor).supported))return{supported:false,reason:'Unsupported canonical seeded pointer material/profile'}
 const image=sourceStampSourceKind(data)==='image',size=data.options.find(option=>option.id==='Size')
 if(size?.checked&&(!Number.isFinite(size.min)||!Number.isFinite(size.max)||size.min<0||size.max>1||size.sensors.length!==1||size.sensors[0].id!=='pressure'))return{supported:false,reason:'Unsupported canonical pointer transform/sensor'}
 const rotation=data.options.find(option=>option.id==='Rotation')
 if(data.options.some(option=>(image||seeded?['Ratio','Scatter','Mirror']:['Ratio','Rotation','Scatter','Mirror']).includes(option.id)&&option.checked)
  ||seeded&&rotation?.checked&&(!rotation.useCurve||rotation.sensors.length!==1||rotation.sensors[0].id!=='tiltDirection')
  ||image&&rotation?.checked&&(rotation.sensors.length!==1||rotation.sensors[0].id!=='drawingAngle')
  ||data.options.some(option=>option.checked&&option.useCurve&&option.sensors.some(sensor=>['rotation','tangentialPressure','perspective','speed'].includes(sensor.id))))return{supported:false,reason:'Unsupported canonical pointer transform/sensor'}
 if(image){
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
 if(generic&&data.version===2&&data.source.kind!=='image'&&data.flags.textureEnabled&&(data.compiled?.version===3||data.compiled?.version===4)){
  const metadata=captureMetadata(available),pattern=metadata?.find(a=>a.id===descriptor.texture?.id)
  if(!pattern)return{supported:false,reason:'Canonical textured Auto metadata unavailable'}
  const result=extractCanonicalTexturedAutoProgramData(descriptor,{pattern})
  if(!result.supported)return{supported:false,reason:'Unsupported canonical textured Auto: '+result.reasons.join(',')}
  if(result.data.version!==2||result.data.source.kind==='image')return{supported:false,reason:'Unsupported canonical textured Auto family'}
  const nativeSizePx=result.data.source.diameter*result.data.brush.scale
  if(!Number.isFinite(nativeSizePx)||nativeSizePx<=0)return{supported:false,reason:'Invalid canonical textured Auto native size'}
  return{supported:true,data:result.data,nativeSizePx,material:{kind:'texturedAuto',capability:result}}
 }
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
