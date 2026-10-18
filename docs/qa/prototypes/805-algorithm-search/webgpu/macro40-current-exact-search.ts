import type {FixedWetBaseOptions} from './fixed-wet-coarse-hooks'
import {fastDivideSource} from './exact-program'
import {physicalDtSource} from './macro30-physical-dt'
import {coalescedSinglePairSource} from './macro38-coalesced-single-pair'
import {create as createFastCoherent} from './macro21-fast-coherent'
import {integerOption,type Candidate} from './contract'
const fixed={physicalDt:4,steps:64,mobilityGain:3,eddyCells:8,curlStrength:64}
/** Four actual source programs, same current physical kernel and operation schedule. */
export function currentExactProgramSource(program:number){integerOption(program,0,3,'program');const source=program&2?coalescedSinglePairSource(3):physicalDtSource(3,4);return program&1?fastDivideSource(source):source}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={},options:FixedWetBaseOptions={}):Promise<Candidate>{
 for(const [key,value]of Object.entries(fixed))if(config[key]!==undefined&&config[key]!==value)throw Error('Current exact program search fixes '+key+'='+value)
 const program=integerOption(config.program??0,0,3,'program'),base=await createFastCoherent(device,size,fixed,{...options,pairSourceOverride:currentExactProgramSource(program),stateHash:true})
 return{get metadata(){return{...base.metadata,physicalDt:4,nominalHorizon:256,exactProgram:program,exactProgramTransforms:[...(program&1?['existing bounded exact quotient']:[]),...(program&2?['existing coalesced single pair']:[])],exactProgramSpaceSize:4,optimizationScope:'Bounded current-kernel ordered source variants; same literal material arithmetic except proven bounded exact quotient substitution and canonical pair invocation mapping.',qualification:'Not formal universal superoptimization, not new physics, no performance claim before full-output device equality and balanced timing. f32 quotient estimate is corrected by exact u32 checks under existing bounded ratio contract.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const currentExactSearchDefinitions=[{id:'wgsl-macro-current-exact-program',label:'Тот же DT4 — четыре точных программы ядра',create,configs:[0,1,2,3].map(program=>({...fixed,program}))}]
