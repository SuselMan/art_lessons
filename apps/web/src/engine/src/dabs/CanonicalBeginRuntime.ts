import type {Dab} from '@grafetto/shared'
import type {ILayerBuffer} from '../buffers/ILayerBuffer'
export {gridBindingKey as canonicalBeginBindingKey} from './GridWashRuntime'
import type {GridWashBinding,GridWashNotReady,GridWashLease,GridBeginResult,GridWashPaintResult,GridWashPrepareResult} from './GridWashRuntime'
/** Runtime-only authority. No operation/Dab field and no second source registry. */
export type CanonicalBeginCapability='grid137'|'bristleSoak139'
export type CanonicalBeginBinding=GridWashBinding
export type CanonicalBeginNotReady=GridWashNotReady
export type CanonicalBeginLease=GridWashLease
export type CanonicalBeginResult=GridBeginResult
export type CanonicalBeginPrepareResult=GridWashPrepareResult
export type CanonicalBeginPaintResult=GridWashPaintResult
export interface CanonicalBeginRuntime{readonly capability?:CanonicalBeginCapability;readonly binding:CanonicalBeginBinding}
export interface CanonicalBeginOwnerInfo{readonly target:ILayerBuffer;readonly binding:CanonicalBeginBinding;readonly capability:CanonicalBeginCapability}
export interface BristleFirstLine139{readonly previous:Dab;readonly current:Dab}
/** Native Soak begins only on a real line; END metadata never supplies a dab. */
export function isBristleAnchor139(dab:Dab):boolean{return Number.isFinite(dab.size)&&dab.size>0}
export function firstBristleLine139(dabs:readonly Dab[],previous?:Dab):BristleFirstLine139|undefined{
 let anchor=previous&&isBristleAnchor139(previous)?previous:undefined
 for(const dab of dabs){if(!isBristleAnchor139(dab))continue;if(anchor)return{previous:anchor,current:dab};anchor=dab}
 return undefined
}
export function canonicalBeginRenderable139(capability:CanonicalBeginCapability,dabs:readonly Dab[],previous?:Dab):boolean{
 return capability==='grid137'?dabs.some(isBristleAnchor139):firstBristleLine139(dabs,previous)!==undefined
}
