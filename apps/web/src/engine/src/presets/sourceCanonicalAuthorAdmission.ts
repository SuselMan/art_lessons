import {canonicalSourceComposition,canonicalSourceEffectReject,type BrushDescriptor,type CanonicalStrokeRasterProfile,type SourceStampData} from '@grafetto/shared'

export type CanonicalSourceAuthorAdmission = {readonly supported:true;readonly data:Extract<SourceStampData,{version:2}>}
 | {readonly supported:false;readonly reason:string}

/** Static pointer-domain query over an already validated
 * descriptor; no renderer/program/quota is acquired. This is neither source compiler attestation nor resource/BEGIN
 * authority: actual preparation still validates and owns those boundaries. */
export function canonicalSourceAuthorAdmission(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile):CanonicalSourceAuthorAdmission {
 const unsupported=canonicalSourceEffectReject(descriptor,profile)
 if(unsupported)return{supported:false,reason:'Unsupported canonical source effect: '+unsupported}
 const policy=canonicalSourceComposition(descriptor,profile),data=descriptor.sourceStamp
 if(policy?.mode!=='wash'||!data||data.version!==2||!['defaultAuto','gaussianAuto','softAuto'].includes(data.source.kind)||data.timing.enabled)return{supported:false,reason:'Unsupported canonical pointer material/timing'}
 const size=data.options.find(option=>option.id==='Size')
 if(size?.checked&&(!Number.isFinite(size.min)||!Number.isFinite(size.max)||size.min<0||size.max>1||size.sensors.length!==1||size.sensors[0].id!=='pressure'))return{supported:false,reason:'Unsupported canonical pointer transform/sensor'}
 if(data.options.some(option=>['Ratio','Rotation','Scatter','Mirror'].includes(option.id)&&option.checked)
  ||data.options.some(option=>option.checked&&option.useCurve&&option.sensors.some(sensor=>['rotation','tangentialPressure','perspective','speed'].includes(sensor.id))))return{supported:false,reason:'Unsupported canonical pointer transform/sensor'}
 return{supported:true,data}
}
