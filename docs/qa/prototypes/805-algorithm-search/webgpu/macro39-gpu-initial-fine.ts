import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createGpuInitial} from './macro34-gpu-initial'
import {physicalDtSource} from './macro30-physical-dt'
import {MACRO10_LOCAL_PACK} from './macro10-wetness'
import {integerOption,type Candidate} from './contract'
import type {PhysicalDtFineConfig} from './macro31-physical-dt-fine'
export interface GpuInitialFineConfig extends PhysicalDtFineConfig {verifyInitializer?:number}
export async function create(device:GPUDevice,size:number,config:GpuInitialFineConfig={},options:FixedWetFineOptions={}):Promise<Candidate>{
 if(Object.keys(config).some(k=>!['physicalDt','steps','fineSteps','mobilityGain','eddyCells','curlStrength','verifyInitializer','affinityBase','paperGain','dither'].includes(k)))throw Error('Unsupported GPU initial Fine config')
 if(config.physicalDt!==undefined&&config.physicalDt!==4||config.steps!==undefined&&config.steps!==64)throw Error('GPU initial Fine requires dt4/steps64');if(config.fineSteps!==undefined&&![0,4].includes(config.fineSteps))throw Error('GPU initial Fine requires0or4fine phases')
 const fineSteps=config.fineSteps??4
 const gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddy=integerOption(config.eddyCells??8,4,64,'eddyCells'),curl=integerOption(config.curlStrength??64,0,128,'curlStrength'),verify=integerOption(config.verifyInitializer??0,0,1,'verifyInitializer'),affinityBase=integerOption(config.affinityBase??64,1,256,'affinityBase'),paperGain=integerOption(config.paperGain??1,0,4,'paperGain'),dither=integerOption(config.dither??1,0,1,'dither')
 const base=await createSmoothFine(device,size,{steps:64,fineSteps,mobilityGain:gain,paperGain,dither},{...options,compactAux:true,compactCarrier:true,affinityBase,basePairSourceOverride:physicalDtSource(gain,4),baseFactory:(d,s,c,o)=>{
 if(!c||Object.keys(c).some(k=>!['steps','mixing','smooth'].includes(k))||c.steps!==64||c.mixing!==1||c.smooth!==0)throw Error('Unexpected internal fine base config')
 if(Object.keys(o??{}).some(k=>!['stateHash','pairSourceOverride','observePacking','fixedWet'].includes(k)))throw Error('Unexpected internal fine base option')
 return createGpuInitial(d,s,{steps:64,physicalDt:4,mobilityGain:gain,eddyCells:eddy,curlStrength:curl,verifyInitializer:verify},{...(o?.fixedWet?{fixedWet:o.fixedWet}:{}),observePacking:o?.observePacking,pairSourceOverride:o?.pairSourceOverride,stateHash:o?.stateHash,packSourceOverride:MACRO10_LOCAL_PACK})
 }})
 return{get metadata(){return{...base.metadata,algorithm:'GPU exact initializer +same31 compact fine',physicalDt:4,steps:64,fineSteps,mobilityGain:gain,eddyCells:eddy,curlStrength:curl,affinityBase,paperGain,verifyInitializer:verify,composition:'Macro34 owns shared state/stationary/output; fine borrows handles, old31 basePACK exact override, allnoninitializer GPU programs same31',gpuTimingBoundary:'3compute passes: GPUinitializer; coarse64+basePACK; fineINIT+fineSteps pair+finePACK. Not isolated old solver-only GPU time.',qualification:verify?'Initializer snapshots+CPUoracle diagnostic; NOTperf':'Exactness candidate vs31sameconfig; wholeRGBA device proof required. CPUvalidate/paper/stream still run; no capacity-aware36 policy combined.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const gpuInitialFineDefinitions=[{id:'wgsl-macro-gpu-initial-fine',label:'Тот же DT4 и мелкая бумага — подготовка на GPU',create,configs:[{physicalDt:4,steps:64,fineSteps:4,mobilityGain:3,eddyCells:8,curlStrength:64,affinityBase:64,paperGain:1,dither:1,verifyInitializer:0}]}]
