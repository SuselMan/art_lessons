import type {FixedWetFineHooks} from './fixed-wet-fine-hooks'
import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {physicalDtSource} from './macro30-physical-dt'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
import type {CoherentFineConfig} from './macro18-coherent-fine'
export interface PhysicalDtFineConfig extends CoherentFineConfig {physicalDt?:number;affinityBase?:number}
/** Actual enlarged physical pair shader plus independently configured compact fine regularization. */
export async function create(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:{readonly fixedWet?:FixedWetFineHooks}={}):Promise<Candidate>{
 const physicalDt=config.physicalDt??1;if(![1,2,4].includes(physicalDt))throw Error('physicalDt must1/2/4')
 const steps=256/physicalDt;if(config.steps!==undefined&&config.steps!==steps)throw Error('steps*physicalDt must256')
 const mobilityGain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddyCells=integerOption(config.eddyCells??16,4,64,'eddyCells'),curlStrength=integerOption(config.curlStrength??128,0,128,'curlStrength')
 const base=await createSmoothFine(device,size,{...config,steps,mobilityGain},{...options,compactAux:true,compactCarrier:true,affinityBase:config.affinityBase,basePairSourceOverride:physicalDtSource(mobilityGain,physicalDt),baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain,eddyCells,curlStrength},{...o,initializer:initialIntegerDynamicFast})})
 return{get metadata(){return{...base.metadata,basePhysicalModel:'actual physicalDtSource in coherent factory; compact smooth fine',physicalDt,steps,nominalHorizon:256,physicsChange:physicalDt!==1,coherentPairExplicit:true,coherentUploadFieldPreserved:true,mobilityGain,eddyCells,curlStrength,initializer:'macro20 exact fast',qualification:'t1 same-config is true-coherent29; t2/t4 approximate noncommuting split-operator compression, not historical byte equivalence or guaranteed elapsed speed. Fine exchange phases are separately configured; coarse field geometry unchanged.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const physicalDtFineDefinitions=[{id:'wgsl-macro-physical-dt-fine',label:'Связный укрупнённый шаг и компактная мелкая бумага',create,configs:[
 {physicalDt:1,steps:256,fineSteps:12,affinityBase:128,paperGain:1,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {physicalDt:2,steps:128,fineSteps:4,affinityBase:64,paperGain:1,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {physicalDt:4,steps:64,fineSteps:4,affinityBase:64,paperGain:1,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {physicalDt:4,steps:64,fineSteps:0,affinityBase:64,paperGain:1,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128}
]}]
