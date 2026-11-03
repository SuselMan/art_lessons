import type {CanonicalPrimaryGrainReadSource,CanonicalAuthorPrimaryGrainSource,CanonicalPlainAutoGeometryReadSource,CanonicalAuthorPlainAutoGeometrySource,CanonicalPixelMaskedReadSource,CanonicalAuthorPixelMaskedSource,CanonicalImageMaterialReadSource,CanonicalAuthorImageMaterialSource} from '@grafetto/shared'
import {extractCanonicalPixelDualSourceData,extractCanonicalPixelImageSourceData,canonicalStrokeRasterContract} from '@grafetto/shared'
import {canonicalDynamicAutoGeometryAuthorAdmission,canonicalPixelTextureAuthorAdmission} from '../../engine/src/presets/sourceCanonicalAuthorAdmission'
import type {CanonicalAuthorPlainTiltSource} from '@grafetto/shared'
import type {CanonicalStrokeRasterProfile,CanonicalAuthorPrimaryTextureSource,CanonicalAuthorTexturedSource,CanonicalAuthorPressureTexturedSource,CanonicalAuthorSoftPressureTexturedSource,CanonicalAuthorTexturedAutoSource,ImportedBrush} from '@grafetto/shared'
import type {CanonicalRecordedLifetime} from '../../engine'
import {canonicalSourceAuthorAdmission,canonicalPlainAutoGeometryAuthorAdmission} from '../../engine/brushLibrary'
import {TOOL_SCHEMAS,type ToolSchema} from './toolSchemas'

/** Current eligibility metadata only; preparation and BEGIN retain their own authority. */
export interface CanonicalToolRead extends Pick<CanonicalRecordedLifetime,'assertCurrent'> {
 readonly primaryGrainSource?:CanonicalPrimaryGrainReadSource
 readonly authorPrimaryGrainSource?:CanonicalAuthorPrimaryGrainSource
 readonly plainAutoGeometrySource?:CanonicalPlainAutoGeometryReadSource
 readonly authorPlainAutoGeometrySource?:CanonicalAuthorPlainAutoGeometrySource
 readonly pixelMaskedSource?:CanonicalPixelMaskedReadSource
 readonly authorPixelMaskedSource?:CanonicalAuthorPixelMaskedSource
 readonly imageMaterialSource?:CanonicalImageMaterialReadSource
 readonly authorImageMaterialSource?:CanonicalAuthorImageMaterialSource
 readonly authorRasterProfile:CanonicalStrokeRasterProfile
 readonly authorPrimaryTextureSource?:CanonicalAuthorPrimaryTextureSource
 readonly authorTexturedSource?:CanonicalAuthorTexturedSource
 readonly authorPressureTexturedSource?:CanonicalAuthorPressureTexturedSource
 readonly authorSoftPressureTexturedSource?:CanonicalAuthorSoftPressureTexturedSource
 readonly authorPlainTiltSource?:CanonicalAuthorPlainTiltSource
 readonly authorTexturedAutoSource?:CanonicalAuthorTexturedAutoSource
}
export interface CanonicalToolOption {readonly id:string;readonly sizePx:number;readonly scalable?:true}
export interface CanonicalToolAvailability {
 readonly status:'restoring'|'empty'|'ready'
 readonly options:readonly CanonicalToolOption[]
 readonly schema:ToolSchema
}
/** Eligibility only. Original owner, preparation and BEGIN still enforce live authority. */
export function canonicalToolAvailability(canonical:boolean,contentReady:boolean,read:CanonicalToolRead|undefined,library:readonly ImportedBrush[],assetMetadata?:(preset:string)=>Parameters<typeof canonicalSourceAuthorAdmission>[2]):CanonicalToolAvailability|undefined {
 if(!canonical)return undefined
 let authorPlainTiltSource:CanonicalAuthorPlainTiltSource|undefined,profile:CanonicalStrokeRasterProfile|undefined,primaryTextureSource:'pressure-identity-subtract-v3'|undefined,texturedSource:'fixed-default-auto-texture-v4'|undefined,pressureTexturedSource:'pressure-default-auto-texture-v5'|undefined,softPressureTexturedSource:'pressure-soft-auto-texture-v6'|undefined,texturedAutoSource:'textured-auto-material-v7'|undefined
 if(contentReady&&read)try{read.assertCurrent();authorPlainTiltSource=read.authorPlainTiltSource;profile=read.authorRasterProfile;primaryTextureSource=read.authorPrimaryTextureSource;texturedSource=read.authorTexturedSource;pressureTexturedSource=read.authorPressureTexturedSource;softPressureTexturedSource=read.authorSoftPressureTexturedSource;texturedAutoSource=read.authorTexturedAutoSource}catch{/* Restoring, not a cached eligibility grant. */}
 const latest=new Map<string,ImportedBrush>()
 for(const brush of library){const old=latest.get(brush.descriptor.id);if(!old||old.descriptor.version<brush.descriptor.version)latest.set(brush.descriptor.id,brush)}
 const options:CanonicalToolOption[]=[],labels:Record<string,string>={},descriptions:Record<string,string>={}
 if(contentReady&&profile)for(const brush of latest.values()){
  let metadata:Parameters<typeof canonicalSourceAuthorAdmission>[2]
  try{metadata=assetMetadata?.(`brush:${brush.descriptor.id}@${brush.descriptor.version}`)}catch{continue}
  const historicalAdmission=texturedAutoSource==='textured-auto-material-v7'
   ?canonicalSourceAuthorAdmission(brush.descriptor,profile,metadata,{primaryTextureSource,...texturedSource?{texturedSource}:{},...pressureTexturedSource?{pressureTexturedSource}:{},...softPressureTexturedSource?{softPressureTexturedSource}:{},texturedAutoSource})
   :softPressureTexturedSource==='pressure-soft-auto-texture-v6'
   ?canonicalSourceAuthorAdmission(brush.descriptor,profile,metadata,{primaryTextureSource,...texturedSource?{texturedSource}:{},...pressureTexturedSource?{pressureTexturedSource}:{},softPressureTexturedSource})
   :pressureTexturedSource==='pressure-default-auto-texture-v5'
   ?canonicalSourceAuthorAdmission(brush.descriptor,profile,metadata,{primaryTextureSource,...texturedSource?{texturedSource}:{},pressureTexturedSource})
   :texturedSource==='fixed-default-auto-texture-v4'
   ?canonicalSourceAuthorAdmission(brush.descriptor,profile,metadata,{primaryTextureSource,texturedSource})
   :canonicalSourceAuthorAdmission(brush.descriptor,profile,metadata,{primaryTextureSource})
  // These are menu metadata only. Actual prepare/BEGIN bind the original
  // descriptor, selected scale, negotiated lifetime and resource budgets again.
  let scalable=false,newSize:number|undefined
  if(read&&canonicalStrokeRasterContract(profile).genericSC){
   const descriptor=brush.descriptor,data=descriptor.sourceStamp
   if(data){
    const nativeSize=(data.version===2&&data.source.kind!=='image'?data.source.diameter:Math.max(data.brush.width,data.brush.height))*data.brush.scale
    if(read.primaryGrainSource==='primary-grain-image-v1'&&read.authorPrimaryGrainSource==='primary-grain-image-v1'&&data.flags.textureEnabled){
     const c=canonicalPixelTextureAuthorAdmission(descriptor,profile,metadata);if(c.supported){scalable=true;newSize=c.nativeSizePx}
    }else if(descriptor.behavior?.dual&&read.pixelMaskedSource==='pixel-masked-v1'&&read.authorPixelMaskedSource==='pixel-masked-v1'){
     const c=extractCanonicalPixelDualSourceData(descriptor,metadata??[],undefined,profile);if(c.supported){scalable=true;newSize=nativeSize}
    }else if(read.imageMaterialSource==='pixel-image-material-v1'&&read.authorImageMaterialSource==='pixel-image-material-v1'&&(data.version===1||data.source.kind==='image')&&descriptor.tip.kind==='bitmap'){
     const c=extractCanonicalPixelImageSourceData(descriptor,metadata??[],profile)
     if(c.supported){scalable=true;newSize=nativeSize}
    }else if(!data.flags.textureEnabled&&read.plainAutoGeometrySource==='dynamic-auto-geometry-v1'&&read.authorPlainAutoGeometrySource==='dynamic-auto-geometry-v1'){
     const c=canonicalDynamicAutoGeometryAuthorAdmission(descriptor,profile,metadata,{authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1'})
     if(c.supported){scalable=true;newSize=c.nativeSizePx}
    }
   }
  }
  // Preserve historically admitted tools; only an unsupported old branch
  // may enter the separately authorized plain geometry mechanism.
  const admission=historicalAdmission.supported||authorPlainTiltSource!=='plain-auto-tilt-v1'
   ?historicalAdmission
   :canonicalPlainAutoGeometryAuthorAdmission(brush.descriptor,profile,{authorPlainTiltSource})
  if(!admission.supported&&!scalable)continue
  const sizePx=newSize??(admission.supported?admission.nativeSizePx:undefined)
  if(sizePx===undefined||!Number.isFinite(sizePx)||sizePx<=0)continue
  options.push({id:brush.descriptor.id,sizePx,...scalable?{scalable:true as const}:{}})
  labels[brush.descriptor.id]=brush.name;descriptions[brush.descriptor.id]=brush.warnings.join(' · ')
 }
 // Both surfaces receive this same object; the global legacy schema is untouched.
 const base=TOOL_SCHEMAS.digitalBrush
 const schema:ToolSchema={brush:{...base.brush,default:options[0]?.id??'',valueType:{kind:'enumOptions',options:options.map(o=>o.id)},optionLabels:labels,optionDescriptions:descriptions},...options.some(option=>option.scalable)?{size:base.size}:{},pattern:base.pattern,color:base.color,opacity:base.opacity}
 return{status:!contentReady||!profile?'restoring':options.length?'ready':'empty',options,schema}
}
export function canonicalToolOffered(availability:CanonicalToolAvailability|undefined,tool:string):boolean {
 return !availability||tool==='hand'||(tool==='digitalBrush'&&availability.status==='ready')
}
