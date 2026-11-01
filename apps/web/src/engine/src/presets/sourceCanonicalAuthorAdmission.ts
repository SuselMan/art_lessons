import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,extractSeededDensityDefaultAutoSourceDataCapability,canonicalSourceComposition,canonicalSourceEffectReject,canonicalImageMaterialPin,extractCanonicalPrimaryTextureCapability,canonicalImageSourceBinding,canonicalImagePipeSourceBinding,isSourceStampData,sourceStampSourceKind,type CanonicalPrimaryTextureCapability,type BrushDescriptor,type CanonicalStrokeRasterProfile,type SourceStampData} from '@grafetto/shared'

type ImagePin=ReturnType<typeof canonicalImageSourceBinding>
export type CanonicalSourceAuthorAdmission =
 {readonly supported:true;readonly data:Extract<SourceStampData,{version:2}>;readonly nativeSizePx:number;readonly material:{readonly kind:'auto';readonly coverageProfile?:typeof CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE}}
 |{readonly supported:true;readonly data:SourceStampData;readonly nativeSizePx:number;readonly material:{readonly kind:'image';readonly pin:ImagePin}}
 |{readonly supported:true;readonly data:SourceStampData;readonly nativeSizePx:number;readonly material:{readonly kind:'imageTexture';readonly pin:ImagePin;readonly capability:CanonicalPrimaryTextureCapability}}
 |{readonly supported:false;readonly reason:string}

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
export interface CanonicalSourceAuthorAdmissionOptions {readonly primaryTextureSource?:'pressure-identity-subtract-v3'}

/** Static pointer-domain query over original validated source data. DATA1 image
 * remains DATA1; wire material V2 and real server BEGIN are separate boundaries. */
export function canonicalSourceAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,available?:readonly {readonly id:string;readonly size:number}[],options?:CanonicalSourceAuthorAdmissionOptions):CanonicalSourceAuthorAdmission {
 const texture=options?.primaryTextureSource
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
 if(data.version!==2||data.source.kind==='image')return{supported:false,reason:'Unsupported canonical pointer material/timing'}
 return{supported:true,data,nativeSizePx:data.source.diameter,material:seeded?{kind:'auto',coverageProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE}:{kind:'auto'}}
}
