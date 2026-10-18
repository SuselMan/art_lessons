import {create as createCoherentFine,type CoherentFineConfig} from './macro18-coherent-fine'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
export interface SoftPaperConfig extends CoherentFineConfig {affinityBase?:number}
/** NEW relative affinity contrast control. CPU fast preparation and coherent physical field remain actual factories. */
export async function create(device:GPUDevice,size:number,config:SoftPaperConfig={}):Promise<Candidate>{
 const {affinityBase:requestedBase,...rest}=config,affinityBase=integerOption(requestedBase??64,1,256,'affinityBase'),paperGain=integerOption(config.paperGain??1,0,4,'paperGain')
 if(affinityBase+Math.floor(255*paperGain/4)>256)throw Error('Affinity maximum exceeds256')
 const base=await createCoherentFine(device,size,{...rest,paperGain},{initializer:initialIntegerDynamicFast,affinityBase})
 return{get metadata(){return{...base.metadata,initializer:'macro20 exact fast initializer',paperAffinityBase:affinityBase,paperAffinityGlobalMax:affinityBase+Math.floor(255*paperGain/4),paperContrastQualification:'NEW relative fine affinity contrast control, not native matching or artistic score. Coherent coarse model unchanged.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const softPaperDefinitions=[{id:'wgsl-macro-soft-paper-coherent-fine',label:'Связное растекание с мягкой бумажной фактурой',create,configs:[
 {steps:256,fineSteps:12,paperGain:1,affinityBase:64,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:1,affinityBase:128,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:3,affinityBase:64,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128},
 {steps:256,fineSteps:12,paperGain:0,affinityBase:64,dither:1,mobilityGain:3,eddyCells:16,curlStrength:128}
]}]
