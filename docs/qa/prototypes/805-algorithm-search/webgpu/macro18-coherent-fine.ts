import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {integerOption,type Candidate} from './contract'
import type {FineConfig} from './macro11-fine-paper'
export interface CoherentFineConfig extends FineConfig {mobilityGain?:number;eddyCells?:number;curlStrength?:number}
/** Actual coherent factory/upload, including aux.w stream construction; never shader-only composition. */
export async function create(device:GPUDevice,size:number,config:CoherentFineConfig={}):Promise<Candidate>{
 const mobilityGain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddyCells=integerOption(config.eddyCells??16,4,64,'eddyCells'),curlStrength=integerOption(config.curlStrength??128,0,128,'curlStrength')
 const base=await createSmoothFine(device,size,{...config,mobilityGain},{baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain,eddyCells,curlStrength},o)})
 return{get metadata(){return{...base.metadata,basePhysicalModel:'macro14 actual coherent factory+upload stream field',mobilityGain,eddyCells,curlStrength,coherentUploadFieldPreserved:true,seedUsed:curlStrength>0||(config.dither??1)!==0,composition:'Actual coherent factory owns field construction/aux upload; macro17 owns smooth fine M/D; macro11 owns conservative fine mobile exchange. No coarse stateHash support promised.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const coherentFineDefinitions=[{id:'wgsl-macro-coherent-smooth-fine-paper',label:'Связное растекание и мелкая бумага',create,configs:[
 {steps:256,fineSteps:12,paperGain:3,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:3,dither:1,mobilityGain:3,eddyCells:16,curlStrength:0},
 {steps:256,fineSteps:0,paperGain:0,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:3,dither:1,mobilityGain:6,eddyCells:24,curlStrength:128}
]}]
