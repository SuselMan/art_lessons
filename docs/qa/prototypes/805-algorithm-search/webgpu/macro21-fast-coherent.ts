import {create as createLite} from './macro19-coherent-dither'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import type {CoherentOverrides} from './macro14-coherent-advection'
import type {Candidate} from './contract'
export async function create(device:GPUDevice,size:number,config:Record<string,number>={},options:CoherentOverrides={}):Promise<Candidate>{
 if(options.initializer!==undefined)throw Error('Fast coherent owns initial reducer')
 const base=await createLite(device,size,config,{...options,initializer:initialIntegerDynamicFast}),descriptors=Object.getOwnPropertyDescriptors(base.metadata)
 descriptors.algorithm={enumerable:true,value:'u32-coherent-safe-dither-fast-initial'}
 descriptors.initialReducer={enumerable:true,value:'macro20 initialIntegerDynamicFast; exact state/aux/stationary/summary contract'}
 descriptors.optimizationScope={enumerable:true,value:'CPU preparation only; SAME macro19 pair, streamfunction, safe local PACK, GPU buffers and dispatches'}
 return{...base,metadata:Object.freeze(Object.defineProperties({},descriptors))}
}
export const fastCoherentDefinitions=[{id:'wgsl-macro-coherent-fast-initial',label:'Те же связные потоки: меньше работы подготовки',create,configs:[
 {steps:256,mobilityGain:3,eddyCells:16,curlStrength:0},
 {steps:256,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,mobilityGain:6,eddyCells:24,curlStrength:128}
]}]
