import {isStationary195Structure,type BrushStructurePolicy} from './brushStructurePolicy.js'
import{isBrushBehavior,type BrushDynamic}from'./brushBehavior.js'
export interface BrushHatching{
 version:1
 opaqueBackground?:true
 angle:number
 separation:number
 thickness:number
 origin:[number,number]
 style:'none'|'perpendicular'|'minusPlus'|'plusMinus'|'moire'
 intervals:number
 antialias:boolean
 subpixel:boolean
 dynamics?:{angle?:BrushDynamic[];cross?:BrushDynamic[];separation?:BrushDynamic[];thickness?:BrushDynamic[]}
}
export function isBrushHatching(value:unknown):value is BrushHatching{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 if(Object.keys(v).some(k=>!['version','angle','separation','thickness','origin','style','intervals','antialias','subpixel','dynamics','opaqueBackground'].includes(k))||v.version!==1||!n(v.angle,-360,360)||!n(v.separation,.1,10000)||!n(v.thickness,.1,1000)||!Number.isInteger(v.intervals)||!n(v.intervals,2,7)||!Array.isArray(v.origin)||v.origin.length!==2||!v.origin.every(x=>n(x,-1e9,1e9))||!['none','perpendicular','minusPlus','plusMinus','moire'].includes(v.style as string)||typeof v.antialias!=='boolean'||typeof v.subpixel!=='boolean')return false
 if(v.opaqueBackground!==undefined&&v.opaqueBackground!==true)return false
 if(v.dynamics!==undefined){if(!v.dynamics||typeof v.dynamics!=='object'||Array.isArray(v.dynamics))return false;for(const[k,controls]of Object.entries(v.dynamics))if(!['angle','cross','separation','thickness'].includes(k)||!isBrushBehavior({version:2,modulations:{size:controls}}))return false}
 return true
}

/** Shared family structure; only explicit195 mode lifts its timing clause. */
export function isHatchingDescriptor(d:Record<string,unknown>,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(d,policy)
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(d.hatching===undefined)return true
 if(!record(d.tip))return false
 return !(!isBrushHatching(d.hatching)||d.model!=='stamp'||d.spray!==undefined||d.sketch!==undefined||d.bristle!==undefined||d.curveTrace!==undefined||d.mixer!==undefined||d.scatter!==undefined||d.texture!==undefined||d.paperInteraction!==0||!record(d.behavior)||d.behavior.version!==2||d.behavior.dual!==undefined||!stationary&&d.behavior.timing!==undefined||d.behavior.wetMix!==undefined||!record(d.behavior.rendering)||d.behavior.rendering.accumulation!=='directOver')
}
