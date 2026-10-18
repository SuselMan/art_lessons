import {create as createCoherentFine,type CoherentFineConfig} from './macro18-coherent-fine'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import type {Candidate} from './contract'
export interface PackedAuxConfig extends CoherentFineConfig {affinityBase?:number}
/** Exact aux-storage reduction. No pair/pack arithmetic changes. */
export async function create(device:GPUDevice,size:number,config:PackedAuxConfig={}):Promise<Candidate>{
 const {affinityBase,...rest}=config
 const base=await createCoherentFine(device,size,rest,{initializer:initialIntegerDynamicFast,compactAux:true,...(affinityBase===undefined?{}:{affinityBase})})
 return{get metadata(){return{...base.metadata,initializer:'macro20 exact fast initializer',optimizationScope:'Exact fine aux storage 16→4bytes/pixel; same fine/coarse arithmetic'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const packedAuxDefinitions=[{id:'wgsl-macro-packed-aux-coherent-fine',label:'Та же мелкая бумага — компактная память',create,configs:[
 {steps:256,fineSteps:12,paperGain:3,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:1,affinityBase:128,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:1,affinityBase:64,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128}
]}]
