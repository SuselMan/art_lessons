import {beginBristleInkLine,type BristleInkProfile,type BristleInkState} from './brushBristleInk'
/** Immutable per-trajectory shader input. Counters are clamped only in the GPU
 * representation; the gesture state keeps the exact safe-integer count. */
export interface BristleInkSpan {
 readonly sampleAlpha?:number
 readonly counter:number
 readonly initialInk:number
 readonly samples:number
 readonly steps:number
 readonly axis:'x'|'y'
 readonly start:readonly[number,number]
 readonly end:readonly[number,number]
 readonly length:number
 readonly pressure:number
}
export function advanceBristleInkBulk(profile:BristleInkProfile,state:BristleInkState,hairIndex:number,start:readonly[number,number],end:readonly[number,number],length:number,pressure:number,antialias:boolean):BristleInkSpan {
 if(profile.useSaturation)throw new Error('Bristle saturation requires sequential color evaluation')
 const line=beginBristleInkLine(state,hairIndex,start,end,length,pressure,[0,0,0],antialias),hair=state.hairs[hairIndex]
 if(!Number.isSafeInteger(line.samples)||!Number.isSafeInteger(hair.counter)||hair.counter<0||!Number.isFinite(hair.inkAmount)||hair.inkAmount<0||hair.inkAmount>1||hair.counter>Number.MAX_SAFE_INTEGER-line.samples)throw new RangeError('Bristle ink counter exhausted')
 const span:BristleInkSpan=Object.freeze({counter:hair.counter,initialInk:hair.inkAmount,samples:line.samples,steps:line.steps,axis:line.axis,start:Object.freeze([...start]) as readonly[number,number],end:Object.freeze([...end]) as readonly[number,number],length,pressure})
 hair.inkAmount=Math.fround(1-profile.depletion[Math.min(profile.amount-1,hair.counter+line.samples-1)])
 hair.counter+=line.samples
 return span
}
/** CPU witness for the spatial shader law; no state mutation or sample array. */
export function bristleInkSpanOpacity(profile:BristleInkProfile,span:BristleInkSpan,index:number):number {
 if(!Number.isSafeInteger(index)||index<0||index>=span.samples)throw new RangeError('Invalid Bristle ink sample')
 const previous=index===0?span.initialInk:Math.fround(1-profile.depletion[Math.min(profile.amount-1,span.counter+index-1)])
 if(!profile.useOpacity)return span.sampleAlpha??span.length
 const depletion=profile.depletion[Math.min(profile.amount-1,span.counter+index)]
 const value=profile.useWeights?span.pressure*profile.pressureWeight+span.length*profile.bristleLengthWeight+previous*profile.bristleInkAmountWeight+(1-depletion)*profile.inkDepletionWeight:span.length*previous
 return Math.max(0,Math.min(1,value))
}
