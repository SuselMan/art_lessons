import type { Dab, StrokeOperation } from './stroke.js'

/** Bounded optional input geometry; it never authorizes a primary stamp. */
export function isStrokeEndSample(value:unknown):value is Dab & {baseSize:number} {
  if(!value || typeof value!=='object' || Array.isArray(value))return false
  const v=value as Record<string,unknown>
  const fields=['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t','baseSize','normalizedSpeed']
  if(Object.keys(v).some(k=>!fields.includes(k)))return false
  const number=(key:string,min:number,max:number)=>typeof v[key]==='number' && Number.isFinite(v[key]) && v[key]>=min && v[key]<=max
  return number('x',-1e8,1e8) && number('y',-1e8,1e8) && number('pressure',0,1)
    && number('tiltX',-90,90) && number('tiltY',-90,90) && number('size',0,100000)
    && number('baseSize',Number.MIN_VALUE,100000) && number('aspectRatio',Number.MIN_VALUE,100)
    && number('angle',-100,100) && number('opacity',0,1) && number('t',0,86400000)
    && (v.normalizedSpeed===undefined || number('normalizedSpeed',0,1))
}
export function hasValidStrokeEndSample(op:unknown):boolean {
  if(!op || typeof op!=='object')return false
  const v=op as Record<string,unknown>
  return v.strokeEndSample===undefined || (v.type==='stroke' && v.tool==='digitalBrush' && v.strokeEnd===true
    && typeof v.strokeId==='string' && v.strokeId.length>0 && isStrokeEndSample(v.strokeEndSample))
}
export type StrokeEndSample=NonNullable<StrokeOperation['strokeEndSample']>
