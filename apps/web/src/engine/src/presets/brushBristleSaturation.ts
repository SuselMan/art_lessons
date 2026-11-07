import {bristleHslSaturationRgb8,type BristleInkProfile} from './brushBristleInk'
import type {BristleInkSpan} from './brushBristleInkBulk'
export type BristleRgb=readonly[number,number,number]
export interface BristleSaturationCursor {index:number;color:[number,number,number]}
const unit=(n:number)=>Number.isFinite(n)&&n>=0&&n<=1
const clamp=(n:number)=>Math.max(0,Math.min(1,n))
/** Native Hairy resets the source color at EACH hair trajectory, not gesture.
 * The reference below includes byte feedback, even for invisible deposits. */
export function beginBristleSaturation(color:BristleRgb):BristleSaturationCursor{
 if(color.length!==3||!color.every(unit))throw RangeError('Invalid Bristle saturation color')
 return {index:0,color:[...color]}
}
export function bristleSaturationFactor(profile:BristleInkProfile,span:BristleInkSpan,index:number):number{
 if(!Number.isSafeInteger(index)||index<0||index>=span.samples)throw RangeError('Invalid Bristle saturation index')
 const remaining=(offset:number)=>1-profile.depletion[Math.min(profile.amount-1,span.counter+offset)]
 const oldInk=index===0?span.initialInk:Math.fround(remaining(index-1)),current=remaining(index)
 return profile.useWeights?span.pressure*profile.pressureWeight+span.length*profile.bristleLengthWeight+oldInk*profile.bristleInkAmountWeight+current*profile.inkDepletionWeight:span.pressure*span.length*oldInk*current
}
/** Bounded reference only: no geometry arrays, no ink mutation, no rendering
 * admission. Caller snapshots cursor to continue; max2048 actual transforms. */
export function advanceBristleSaturationReference(profile:BristleInkProfile,span:BristleInkSpan,cursor:BristleSaturationCursor,maxSteps:number):{steps:number;done:boolean}{
 if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>2048||!Number.isSafeInteger(cursor.index)||cursor.index<0||cursor.index>span.samples||!cursor.color.every(unit))throw RangeError('Invalid Bristle saturation continuation')
 const steps=Math.min(maxSteps,span.samples-cursor.index)
 for(let j=0;j<steps;j++){
  if(profile.useSaturation)cursor.color=bristleHslSaturationRgb8(cursor.color,bristleSaturationFactor(profile,span,cursor.index))
  cursor.index++
 }
 return {steps,done:cursor.index===span.samples}
}
/** Prewarm-only curve prefix; no hidden cache or renderer resource. */
export interface BristleSaturationPrefix {readonly logRemaining:readonly number[];readonly zeros:readonly number[];readonly amount:number;readonly tail:number}
const prefixProfiles=new WeakMap<BristleSaturationPrefix,BristleInkProfile>()
export function prepareBristleSaturationPrefix(profile:BristleInkProfile):BristleSaturationPrefix{
 const logRemaining=[0],zeros=[0]
 for(const d of profile.depletion){const r=1-d;logRemaining.push(logRemaining.at(-1)!+(r===0?0:Math.log(r)));zeros.push(zeros.at(-1)!+Number(r===0))}
 const prefix=Object.freeze({logRemaining:Object.freeze(logRemaining),zeros:Object.freeze(zeros),amount:profile.amount,tail:1-profile.depletion.at(-1)!});prefixProfiles.set(prefix,profile);return prefix
}
/** Closed cumulative HSL product ONLY where every multiplier<=1. This removes
 * repeated RGB8 feedback intentionally; use it as an explicit analytic model.
 * Arbitrary weighted factors and pressure*length>1 are refused, not approximated.
 * Two prefix reads + tail arithmetic, regardless of trajectory length. */
export function bristleSaturationAnalytic(prefix:BristleSaturationPrefix,profile:BristleInkProfile,span:BristleInkSpan,index:number,source:BristleRgb):[number,number,number]{
 if(prefixProfiles.get(prefix)!==profile)throw TypeError('Expected matching Bristle saturation prefix')
 if(profile.useWeights||span.pressure*span.length>1)throw RangeError('Bristle analytic saturation requires unweighted nonexpanding factors')
 if(!Number.isSafeInteger(index)||index<0||index>=span.samples||!source.every(unit))throw RangeError('Invalid Bristle analytic saturation sample')
 if(!profile.useSaturation)return [...source]
 const n=index+1,p=span.pressure*span.length,start=Math.min(span.counter,prefix.amount),stop=Math.min(span.counter+n-1,prefix.amount),tailCount=n-1-(stop-start)
 const zero=span.initialInk===0||p===0||prefix.zeros[stop]-prefix.zeros[start]>0||(tailCount>0&&prefix.tail===0)
 const last=span.counter+n-1>=prefix.amount?prefix.tail:1-profile.depletion[span.counter+n-1]
 const log=zero||last===0?-Infinity:n*Math.log(p)+Math.log(span.initialInk)+Math.log(last)+2*(prefix.logRemaining[stop]-prefix.logRemaining[start]+(tailCount?tailCount*Math.log(prefix.tail):0))
 const factor=Math.exp(log),high=Math.max(...source),low=Math.min(...source),light=(high+low)/2
 return source.map(v=>clamp(light+(v-light)*factor)) as [number,number,number]
}
