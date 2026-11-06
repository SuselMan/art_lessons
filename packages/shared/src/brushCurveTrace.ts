import {isBrushBehavior,type BrushDynamic}from'./brushBehavior.js'
/** History-derived quadratic/cubic paths, distinct from scalar sensor curves. */
export interface BrushCurveTrace {
 version:1
 history:number
 smoothing:boolean
 connect:boolean
 opacity:number
 dynamics?:{width?:BrushDynamic[];opacity?:BrushDynamic[]}
}
export function isBrushCurveTrace(value:unknown):value is BrushCurveTrace{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 if(Object.keys(v).some(k=>!['version','history','smoothing','connect','opacity','dynamics'].includes(k))||v.version!==1||!Number.isInteger(v.history)||(v.history as number)<2||(v.history as number)>128||typeof v.smoothing!=='boolean'||typeof v.connect!=='boolean'||typeof v.opacity!=='number'||!Number.isFinite(v.opacity)||v.opacity<0||v.opacity>1)return false
 if(v.dynamics!==undefined){
  if(!v.dynamics||typeof v.dynamics!=='object'||Array.isArray(v.dynamics))return false
  for(const [key,controls]of Object.entries(v.dynamics))if(!['width','opacity'].includes(key)||!isBrushBehavior({version:2,modulations:{size:controls}}))return false
 }
 return true
}
