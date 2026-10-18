import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {coherentSource} from './macro14-coherent-source'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
import type {CoherentFineConfig} from './macro18-coherent-fine'
export interface TrueCoherentFineConfig extends CoherentFineConfig {affinityBase?:number;compactAux?:boolean;compactCarrier?:boolean}
/** Explicit pair override prevents legacy macro17 mobility fallback from masking the coherent stream shader. */
export async function create(device:GPUDevice,size:number,config:TrueCoherentFineConfig={}):Promise<Candidate>{
 const mobilityGain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddyCells=integerOption(config.eddyCells??16,4,64,'eddyCells'),curlStrength=integerOption(config.curlStrength??128,0,128,'curlStrength')
 const base=await createSmoothFine(device,size,config,{affinityBase:config.affinityBase,compactAux:config.compactAux??true,compactCarrier:config.compactCarrier??true,basePairSourceOverride:coherentSource(mobilityGain),baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain,eddyCells,curlStrength},{...o,initializer:initialIntegerDynamicFast})})
 return{get metadata(){return{...base.metadata,basePhysicalModel:'TRUE coherent pair shader + actual coherent upload field',coherentPairExplicit:true,coherentUploadFieldPreserved:true,mobilityGain,eddyCells,curlStrength,initializer:'macro20 fast exact',historicalQualification:'Legacy macro18/22/23/26 selected mobility pair shader despite uploading stream field. This new ID changes that shader deliberately. No historical pixel equivalence at nonzero curl; no coarse stateHash support claimed.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const trueCoherentFineDefinitions=[{id:'wgsl-macro-true-coherent-fine',label:'Настоящий связный поток и мелкая бумага — исправленная композиция',create,configs:[0,128].flatMap(curlStrength=>[{paperGain:1,affinityBase:128},{paperGain:3,affinityBase:1}].map(p=>({steps:256,fineSteps:12,dither:1,mobilityGain:3,eddyCells:16,curlStrength,compactAux:true,compactCarrier:true,...p})))}]
