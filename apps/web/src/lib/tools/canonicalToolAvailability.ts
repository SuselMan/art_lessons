import type {CanonicalStrokeRasterProfile,ImportedBrush} from '@grafetto/shared'
import type {CanonicalRecordedEmptyRoomRead} from '../../engine'
import {canonicalSourceAuthorAdmission} from '../../engine/brushLibrary'
import {TOOL_SCHEMAS,type ToolSchema} from './toolSchemas'

export interface CanonicalToolOption {readonly id:string;readonly sizePx:number}
export interface CanonicalToolAvailability {
 readonly status:'restoring'|'empty'|'ready'
 readonly options:readonly CanonicalToolOption[]
 readonly schema:ToolSchema
}
/** Eligibility only. Original owner, preparation and BEGIN still enforce live authority. */
export function canonicalToolAvailability(canonical:boolean,contentReady:boolean,read:Pick<CanonicalRecordedEmptyRoomRead,'authorRasterProfile'|'assertCurrent'>|undefined,library:readonly ImportedBrush[],assetMetadata?:(preset:string)=>Parameters<typeof canonicalSourceAuthorAdmission>[2]):CanonicalToolAvailability|undefined {
 if(!canonical)return undefined
 let profile:CanonicalStrokeRasterProfile|undefined
 if(contentReady&&read)try{read.assertCurrent();profile=read.authorRasterProfile}catch{/* Restoring, not a cached eligibility grant. */}
 const latest=new Map<string,ImportedBrush>()
 for(const brush of library){const old=latest.get(brush.descriptor.id);if(!old||old.descriptor.version<brush.descriptor.version)latest.set(brush.descriptor.id,brush)}
 const options:CanonicalToolOption[]=[],labels:Record<string,string>={},descriptions:Record<string,string>={}
 if(contentReady&&profile)for(const brush of latest.values()){
  let metadata:Parameters<typeof canonicalSourceAuthorAdmission>[2]
  try{metadata=assetMetadata?.(`brush:${brush.descriptor.id}@${brush.descriptor.version}`)}catch{continue}
  const admission=canonicalSourceAuthorAdmission(brush.descriptor,profile,metadata)
  if(!admission.supported)continue
  options.push({id:brush.descriptor.id,sizePx:admission.nativeSizePx})
  labels[brush.descriptor.id]=brush.name;descriptions[brush.descriptor.id]=brush.warnings.join(' · ')
 }
 // Both surfaces receive this same object; the global legacy schema is untouched.
 const base=TOOL_SCHEMAS.digitalBrush
 const schema:ToolSchema={brush:{...base.brush,default:options[0]?.id??'',valueType:{kind:'enumOptions',options:options.map(o=>o.id)},optionLabels:labels,optionDescriptions:descriptions},color:base.color,opacity:base.opacity}
 return{status:!contentReady||!profile?'restoring':options.length?'ready':'empty',options,schema}
}
export function canonicalToolOffered(availability:CanonicalToolAvailability|undefined,tool:string):boolean {
 return !availability||tool==='hand'||(tool==='digitalBrush'&&availability.status==='ready')
}
