import {isBrushBehavior,type BrushDynamic} from './brushBehavior.js'
/** Connections between canonical author input points within one gesture. */
export interface BrushSketch {
 version:1
 mode:'simple'
 width:number
 offset:number
 probability:number
 connect:boolean
 magnetify:boolean
 randomRGB:boolean
 randomOpacity:boolean
 distanceDensity:boolean
 distanceOpacity:boolean
 antialias:boolean
 dynamics?:{width?:BrushDynamic[];offset?:BrushDynamic[];probability?:BrushDynamic[]}
}
export function isBrushSketch(value:unknown):value is BrushSketch{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,number=(x:unknown,lo:number,hi:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi
 if(Object.keys(v).some(k=>!['version','mode','width','offset','probability','connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias','dynamics'].includes(k)))return false
 if(v.version!==1||v.mode!=='simple'||!number(v.width,.01,1000)||!number(v.offset,-10,10)||!number(v.probability,0,1)||!['connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias'].every(k=>typeof v[k]==='boolean'))return false
 if(v.dynamics!==undefined){
  if(!v.dynamics||typeof v.dynamics!=='object'||Array.isArray(v.dynamics))return false
  for(const [key,controls]of Object.entries(v.dynamics))if(!['width','offset','probability'].includes(key)||!isBrushBehavior({version:2,modulations:{size:controls}}))return false
 }
 return true
}
