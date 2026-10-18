import {create as createCoherent,type CoherentOverrides} from './macro14-coherent-advection'
import {MACRO15_SAFE_INTEGER_DITHER_PACK} from './macro15-safe-integer-dither'
import type {Candidate} from './contract'
const anchor='if((p.pad&5u)!=0u)'
if(MACRO15_SAFE_INTEGER_DITHER_PACK.split(anchor).length!==2)throw Error('Coherent local dither source drift')
export const MACRO19_COHERENT_LOCAL_DITHER_PACK=MACRO15_SAFE_INTEGER_DITHER_PACK.replace(anchor,'if((p.pad&4u)!=0u||(stationary[i]>>24u)>0u)')
export async function create(device:GPUDevice,size:number,config:Record<string,number>={},options:CoherentOverrides={}):Promise<Candidate>{
 if(options.packSourceOverride!==undefined)throw Error('Coherent dither owns PACK')
 const base=await createCoherent(device,size,config,{...options,packSourceOverride:MACRO19_COHERENT_LOCAL_DITHER_PACK}),descriptors=Object.getOwnPropertyDescriptors(base.metadata)
 descriptors.algorithm={enumerable:true,value:'u32-coherent-local-safe-dither-PACK-only'}
 descriptors.quantization={enumerable:true,value:'shared-threshold u32 bytefold stochastic rounding; no large constant remainder path'}
 descriptors.packingHashSeed={enumerable:true,value:0}
 descriptors.packingSeedPolicy={enumerable:true,value:'FIXED0: existing phase0 packing uniform; no new seed uniform. Coherent stream field still uses input.seed.'}
 descriptors.physicsChange={enumerable:true,value:false}
 descriptors.extraGPUAllocations={enumerable:true,value:0};descriptors.extraDispatches={enumerable:true,value:0}
 return{...base,metadata:Object.freeze(Object.defineProperties({},descriptors))}
}
export const coherentDitherDefinitions=[{id:'wgsl-macro-coherent-safe-dither',label:'Те же связные потоки: только безопасное округление',create,configs:[
 {steps:256,mobilityGain:3,eddyCells:16,curlStrength:0},
 {steps:256,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,mobilityGain:6,eddyCells:24,curlStrength:128}
]}]
