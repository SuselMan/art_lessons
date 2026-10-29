import { isDabSourceSize, isDabSourceScale, isDabSourceAngle, isDabSourceTime, packDabs, unpackDabs, packEndpointBaseSize, unpackEndpointBaseSize } from './dabCodec.js'
import type { Dab, StrokeOperation } from './stroke.js'
import type { Operation } from './operations.js'

/** Bounded optional input geometry; it never authorizes a primary stamp. */
export function isStrokeEndSample(value:unknown):value is Dab & {baseSize:number} {
  if(!value || typeof value!=='object' || Array.isArray(value))return false
  const v=value as Record<string,unknown>
  const fields=['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t','baseSize','normalizedSpeed','sourceSize','sourceScale','sourceAngle','sourceTime']
  if(Object.keys(v).some(k=>!fields.includes(k)))return false
  const number=(key:string,min:number,max:number)=>typeof v[key]==='number' && Number.isFinite(v[key]) && v[key]>=min && v[key]<=max
  return number('x',-1e8,1e8) && number('y',-1e8,1e8) && number('pressure',0,1)
    && number('tiltX',-90,90) && number('tiltY',-90,90) && number('size',0,100000)
    && number('baseSize',Number.MIN_VALUE,100000) && number('aspectRatio',Number.MIN_VALUE,100)
    && number('angle',-100,100) && number('opacity',0,1) && number('t',0,86400000)
    && (v.normalizedSpeed===undefined || number('normalizedSpeed',0,1))
    && (v.sourceSize===undefined || isDabSourceSize(v.sourceSize))
    && (v.sourceAngle===undefined || isDabSourceAngle(v.sourceAngle))
    && (v.sourceTime===undefined || isDabSourceTime(v.sourceTime))
    && (v.sourceScale===undefined || isDabSourceScale(v.sourceScale))
}
/** Decode at every semantic endpoint consumer; never infer precision from angle value. */
export function strokeEndSample(op: Pick<StrokeOperation,'strokeEndSample'|'strokeEndSamplePacked'>): StrokeEndSample | undefined {
  if(op.strokeEndSamplePacked!==undefined){
    if(op.strokeEndSample!==undefined)throw Error('endpoint: conflicting representations')
    return unpackStrokeEndSample(op.strokeEndSamplePacked)
  }
  return op.strokeEndSample
}
export function packStrokeEndSample(sample: StrokeEndSample): string {
  if(!isStrokeEndSample(sample))throw Error('endpoint: invalid sample')
  const packed=`1|${packDabs([sample])}|${packEndpointBaseSize(sample.baseSize)}`
  // Reject values whose existing F32 channel law would leave the bounded domain.
  unpackStrokeEndSample(packed)
  return packed
}
export function unpackStrokeEndSample(text: string): StrokeEndSample {
  if(typeof text!=='string' || text.length>256)throw Error('endpoint: invalid encoding')
  const parts=text.split('|')
  if(parts.length!==3 || parts[0]!=='1')throw Error('endpoint: unsupported encoding')
  const dabs=unpackDabs(parts[1])
  if(dabs.length!==1 || packDabs(dabs)!==parts[1])throw Error('endpoint: invalid record')
  const sample={...dabs[0],baseSize:unpackEndpointBaseSize(parts[2])}
  if(!isStrokeEndSample(sample))throw Error('endpoint: invalid sample')
  return sample
}
export function hasValidStrokeEndSample(op:unknown):boolean {
  if(!op || typeof op!=='object')return false
  const v=op as Record<string,unknown>
  if(v.strokeEndSample===undefined && v.strokeEndSamplePacked===undefined)return true
  if(v.type!=='stroke' || v.tool!=='digitalBrush' || v.strokeEnd!==true || typeof v.strokeId!=='string' || !v.strokeId.length)return false
  try{return isStrokeEndSample(strokeEndSample(v as unknown as StrokeOperation))}catch{return false}
}
/** Canonicalize only new numerical inputs; historical plain payloads stay intact. */
export function canonicalStrokeStorage(op: Operation): Operation {
  if(op.type!=='stroke')return op
  if(!hasValidStrokeEndSample(op))throw Error('endpoint: invalid operation')
  let result=op
  if(op.dabs?.some(d=>d.sourceAngle!==undefined||d.sourceTime!==undefined)) {
    if(op.dabsPacked!==undefined)throw Error('dabs: conflicting representations')
    const {dabs,...rest}=result
    result={...rest,dabsPacked:packDabs(dabs!)}
  }
  if(op.strokeEndSample && (op.strokeEndSample.sourceAngle!==undefined||op.strokeEndSample.sourceTime!==undefined)){
    const {strokeEndSample:sample,...rest}=result
    result={...rest,strokeEndSamplePacked:packStrokeEndSample(sample!)}
  }
  return result
}
export type StrokeEndSample=NonNullable<StrokeOperation['strokeEndSample']>
