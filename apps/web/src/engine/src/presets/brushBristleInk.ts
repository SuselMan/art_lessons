/** Gesture-owned Bristle ink, based on Krita hairy bd6e8d0. This module does
 * not enable a descriptor/renderer route. Call once per actual hair trajectory,
 * before tile rendering; never once per tile or once per network packet. */
export interface BristleInkSettings {
 /** Canonically sampled source depletion curve; length is native inkAmount. */
 readonly depletion:readonly number[]
 readonly useOpacity:boolean
 readonly useSaturation:boolean
 readonly useWeights:boolean
 readonly pressureWeight:number
 readonly bristleLengthWeight:number
 readonly bristleInkAmountWeight:number
 /** Native loadSettings leaves this weight in its raw 0..100 range. */
 readonly inkDepletionWeight:number
}
export interface BristleInkProfile extends BristleInkSettings {readonly amount:number}
export interface BristleInkHairState {counter:number;inkAmount:number}
export interface BristleInkState {hairs:BristleInkHairState[]}
export interface BristleInkLine {
 readonly hair:number
 readonly length:number
 readonly pressure:number
 readonly start:readonly [number,number]
 readonly end:readonly [number,number]
 readonly steps:number
 readonly samples:number
 readonly axis:'x'|'y'
 readonly sampleAlpha?:number
 index:number
 color:[number,number,number]
}
export interface BristleInkSample {x:number;y:number;opacity:number;color:[number,number,number]}
const unit=(v:number)=>Number.isFinite(v)&&v>=0&&v<=1
const clamp=(v:number)=>Math.max(0,Math.min(1,v))
export function createBristleInkProfile(input:BristleInkSettings):BristleInkProfile {
 if(!Array.isArray(input.depletion)||input.depletion.length<1||input.depletion.length>65536||!input.depletion.every(unit))throw new RangeError('Invalid Bristle ink curve')
 if(![input.pressureWeight,input.bristleLengthWeight,input.bristleInkAmountWeight].every(unit)||!Number.isFinite(input.inkDepletionWeight)||input.inkDepletionWeight<0||input.inkDepletionWeight>100||![input.useOpacity,input.useSaturation,input.useWeights].every(v=>typeof v==='boolean'))throw new RangeError('Invalid Bristle ink controls')
 const depletion=input.depletion.map(v=>Math.fround(v))
 return Object.freeze({amount:depletion.length,useOpacity:input.useOpacity,useSaturation:input.useSaturation,useWeights:input.useWeights,pressureWeight:input.pressureWeight,bristleLengthWeight:input.bristleLengthWeight,bristleInkAmountWeight:input.bristleInkAmountWeight,inkDepletionWeight:input.inkDepletionWeight,depletion:Object.freeze(depletion)})
}
export function createBristleInkState(population:number):BristleInkState {
 if(!Number.isInteger(population)||population<1||population>4096)throw new RangeError('Invalid Bristle ink population')
 // Native Bristle starts at zero, then adopts 1-depletion after the first sample.
 return {hairs:Array.from({length:population},()=>({counter:0,inkAmount:0}))}
}
export function beginBristleInkLine(state:BristleInkState,hair:number,start:readonly[number,number],end:readonly[number,number],length:number,pressure:number,color:readonly[number,number,number],antialias:boolean,sampleAlpha?:number):BristleInkLine {
 if(!Number.isInteger(hair)||!state.hairs[hair]||!unit(length)||!Number.isFinite(pressure)||pressure<0||pressure>2||![...start,...end].every(Number.isFinite)||![...start,...end].every(v=>Math.abs(v)<=Number.MAX_SAFE_INTEGER)||!color.every(unit)||typeof antialias!=='boolean')throw new RangeError('Invalid Bristle ink line')
 if(sampleAlpha!==undefined&&!unit(sampleAlpha))throw RangeError('Invalid Bristle sampled alpha')
 const dx=end[0]-start[0],dy=end[1]-start[1],axis=Math.abs(dy)>Math.abs(dx)?'y':'x',at=axis==='x'?0:1,steps=Math.abs(Math.trunc(end[at])-Math.trunc(start[at]))
 if(!Number.isSafeInteger(steps))throw new RangeError('Bristle ink trajectory exceeds safe domain')
 return {hair,length,pressure,...(sampleAlpha===undefined?{}:{sampleAlpha}),start:[...start],end:[...end],steps,samples:steps+(antialias?1:2),axis,index:0,color:[...color]}
}
/** HSL compatibility saturation: native type=1, compatibilityMode default=true.
 * Functional RGB bytes are quantized at every sample, including transparent ones. */
export function bristleHslSaturationRgb8(rgb:readonly[number,number,number],factor:number):[number,number,number] {
 const high=Math.max(...rgb),low=Math.min(...rgb),light=(high+low)/2,chroma=high-low
 if(chroma===0)return [...rgb]
 const target=Math.min(1-Math.abs(high+low-1),chroma*Math.max(0,factor)),minimum=light-target/2
 const channel=(v:number)=>Math.round(clamp(minimum+(v-low)*target/chroma)*255)/255
 return [channel(rgb[0]),channel(rgb[1]),channel(rgb[2])]
}
/** Bounded continuation. Snapshot BOTH state and line to pause/clone at any
 * chunk boundary. The final cap is omitted only for AA, just as native hairy. */
export function advanceBristleInkLine(profile:BristleInkProfile,state:BristleInkState,line:BristleInkLine,maxSamples:number):{samples:BristleInkSample[];done:boolean} {
 if(!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>2048)throw new RangeError('Invalid Bristle ink chunk')
 const hair=state.hairs[line.hair]
 if(!hair||!Number.isSafeInteger(hair.counter)||hair.counter<0||!unit(hair.inkAmount)||!Number.isInteger(line.index)||line.index<0||line.index>line.samples)throw new RangeError('Invalid Bristle ink continuation')
 const count=Math.min(maxSamples,line.samples-line.index)
 if(hair.counter>Number.MAX_SAFE_INTEGER-count)throw new RangeError('Bristle ink counter exhausted')
 const samples:BristleInkSample[]=[],dx=line.end[0]-line.start[0],dy=line.end[1]-line.start[1],dominant=line.axis==='x'?dx:dy
 for(let i=0;i<count;i++){
  const index=line.index++,depletion=profile.depletion[Math.min(hair.counter,profile.amount-1)]
  const weighted=line.pressure*profile.pressureWeight+line.length*profile.bristleLengthWeight+hair.inkAmount*profile.bristleInkAmountWeight+(1-depletion)*profile.inkDepletionWeight
  if(profile.useSaturation)line.color=bristleHslSaturationRgb8(line.color,profile.useWeights?weighted:line.pressure*line.length*hair.inkAmount*(1-depletion))
  const opacity=profile.useOpacity?clamp(profile.useWeights?weighted:line.length*hair.inkAmount):(line.sampleAlpha??line.length)
  const final=index>line.steps,t=dominant===0?0:index/Math.abs(dominant)
  samples.push({x:final?line.end[0]:line.start[0]+t*dx,y:final?line.end[1]:line.start[1]+t*dy,opacity,color:[...line.color]})
  hair.inkAmount=Math.fround(1-depletion);hair.counter++
 }
 return {samples,done:line.index===line.samples}
}
