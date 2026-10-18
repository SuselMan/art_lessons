import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import {create as createCoherentFine,coherentFineDefinitions,type CoherentFineConfig} from './macro18-coherent-fine'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import type {Candidate} from './contract'
/** Exact CPU preparation optimization only. Actual coherent original PACK and every fine kernel remain unchanged. */
export async function create(device:GPUDevice,size:number,config:CoherentFineConfig={},options:FixedWetFineOptions={}):Promise<Candidate>{
 const base=await createCoherentFine(device,size,config,{...options,initializer:initialIntegerDynamicFast})
 return{get metadata(){return{...base.metadata,initializer:'macro20 initialIntegerDynamicFast; exact state/aux/stationary/summary',optimizationScope:'CPU initializer only; coherent original PACK and full fine shader sources unchanged'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const fastCoherentFineDefinitions=[{id:'wgsl-macro-fast-coherent-smooth-fine-paper',label:'Связное растекание и мелкая бумага — быстрая подготовка',create,configs:coherentFineDefinitions[0].configs.map(config=>({...config}))}]
