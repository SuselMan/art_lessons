import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import type {FixedWetBaseOptions} from './fixed-wet-coarse-hooks'
import {create as createFine} from './macro11-fine-paper'
import {MACRO17_SMOOTH_FINE_PACK} from './macro17-smooth-fine-paper'
import {capacityAwareInit} from './macro36-capacity-aware-fine'
import {MACRO41_CAPACITY_AWARE_PACK} from './macro41-capacity-aware-lite'
import {MACRO10_LOCAL_PACK} from './macro10-wetness'
import {create as createGpuInitial,type GpuInitialOverrides} from './macro34-gpu-initial'
import {physicalDtSource} from './macro30-physical-dt'
import {integerOption,type Candidate} from './contract'
export interface GpuCapacityConfig {physicalDt?:number;steps?:number;fineSteps?:number;mobilityGain?:number;eddyCells?:number;curlStrength?:number;verifyInitializer?:number;affinityBase?:number;paperGain?:number;dither?:number}
function checked(c:GpuCapacityConfig,fine:boolean){
 const keys=['physicalDt','steps','mobilityGain','eddyCells','curlStrength','verifyInitializer',...(fine?['fineSteps','affinityBase','paperGain','dither']:[])];if(Object.keys(c).some(k=>!keys.includes(k)))throw Error('Unsupported GPU capacity config')
 if(c.physicalDt!==undefined&&c.physicalDt!==4||c.steps!==undefined&&c.steps!==64)throw Error('GPU capacity requires dt4/steps64')
 const mobilityGain=integerOption(c.mobilityGain??3,1,8,'mobilityGain'),eddyCells=integerOption(c.eddyCells??8,4,64,'eddyCells'),curlStrength=integerOption(c.curlStrength??64,0,128,'curlStrength'),verifyInitializer=integerOption(c.verifyInitializer??0,0,1,'verifyInitializer')
 return{physicalDt:4,steps:64,mobilityGain,eddyCells,curlStrength,verifyInitializer}
}
export async function createFine42(device:GPUDevice,size:number,config:GpuCapacityConfig={},options:FixedWetFineOptions={}):Promise<Candidate>{
 const cfg=checked(config,true),fineSteps=config.fineSteps??4;if(![0,4].includes(fineSteps))throw Error('fineSteps must0/4')
 const affinityBase=integerOption(config.affinityBase??64,1,256,'affinityBase'),paperGain=integerOption(config.paperGain??1,0,4,'paperGain'),dither=integerOption(config.dither??1,0,1,'dither');if(affinityBase+Math.floor(255*paperGain/4)>256)throw Error('Affinity exceeds256')
 const base=await createFine(device,size,{steps:64,fineSteps,paperGain,dither},{...options,compactAux:true,compactCarrier:true,initSourceOverride:capacityAwareInit(affinityBase),packSourceOverride:MACRO17_SMOOTH_FINE_PACK,fineDepositPlane:true,smoothInitialization:true,basePairSourceOverride:physicalDtSource(cfg.mobilityGain,4),baseFactory:(d,s,c,o)=>{
 if(!c||Object.keys(c).some(k=>!['steps','mixing','smooth'].includes(k))||c.steps!==64||c.mixing!==1||c.smooth!==0)throw Error('Unexpected fine base config')
 if(Object.keys(o??{}).some(k=>!['stateHash','pairSourceOverride','observePacking','fixedWet'].includes(k)))throw Error('Unexpected fine base options')
 const options:GpuInitialOverrides={...o,packSourceOverride:MACRO10_LOCAL_PACK};return createGpuInitial(d,s,cfg,options)
 }})
 return wrap(base,{model:'same36 capacity-aware fine',...cfg,fineSteps,affinityBase,paperGain,dither,gpuComputePasses:3})
}
export async function createLite43(device:GPUDevice,size:number,config:GpuCapacityConfig={},options:FixedWetBaseOptions={}):Promise<Candidate>{
 const cfg=checked(config,false),base=await createGpuInitial(device,size,cfg,{...options,packSourceOverride:MACRO41_CAPACITY_AWARE_PACK});return wrap(base,{model:'same41 capacity-aware Lite',...cfg,gpuComputePasses:2})
}
function wrap(base:Candidate,fields:Record<string,string|number>):Candidate{return{get metadata(){return{...base.metadata,...fields,optimizationScope:'GPU initializer replaces CPU pigment/water reduction; all noninitializer shader programs identical baseline36/41',qualification:fields.verifyInitializer?'Diagnostic initial snapshots+CPUoracle; NOTperf':'No new physics/reconstruction. Whole-output/coarse/fine equality requires device validation; no35cue combined.',gpuTimingBoundary:'Includes GPU initializer before physical passes; totalReady comparable, isolated old solver timestamp not same boundary.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}}
const fixed={physicalDt:4,steps:64,mobilityGain:3,eddyCells:8,curlStrength:64,verifyInitializer:0}
export const gpuCapacityDefinitions=[{id:'wgsl-macro-gpu-capacity-aware-fine',label:'Плавная ёмкость и мелкая бумага — подготовка GPU',create:createFine42,configs:[{...fixed,fineSteps:4,affinityBase:64,paperGain:1,dither:1}]},{id:'wgsl-macro-gpu-capacity-aware-lite',label:'Плавная ёмкость без мелких проходов — подготовка GPU',create:createLite43,configs:[fixed]}]
