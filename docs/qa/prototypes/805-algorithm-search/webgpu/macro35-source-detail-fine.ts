import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {physicalDtSource} from './macro30-physical-dt'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {sourceDetailPaper,type SourceDetailStats} from './macro35-source-detail-paper'
import {integerOption,type Candidate} from './contract'
import type {PhysicalDtFineConfig} from './macro31-physical-dt-fine'
export interface SourceDetailFineConfig extends PhysicalDtFineConfig {sourceDetailGain?:number}
const sha=async(a:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,'0')).join('')
/** New local source-aware affinity; no additive residual/brightness or hidden base-input mutation. */
export async function create(device:GPUDevice,size:number,config:SourceDetailFineConfig={},options:FixedWetFineOptions={}):Promise<Candidate>{
 if(config.physicalDt!==undefined&&config.physicalDt!==4)throw Error('Source detail diagnostic requires DT4');if(config.steps!==undefined&&config.steps!==64)throw Error('Source detail diagnostic requires64steps')
 const detailGain=integerOption(config.sourceDetailGain??1,0,4,'sourceDetailGain'),gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddy=integerOption(config.eddyCells??8,4,64,'eddyCells'),curl=integerOption(config.curlStrength??64,0,128,'curlStrength')
 let finePaper:Uint8Array|undefined,stats:SourceDetailStats|undefined,derivedSHA:string|null=null,originalSHA:string|null=null
 const base=await createSmoothFine(device,size,{fineSteps:12,paperGain:1,...config,steps:64,mobilityGain:gain},{...options,compactAux:true,compactCarrier:true,affinityBase:config.affinityBase??128,basePairSourceOverride:physicalDtSource(gain,4),finePaperOverride:input=>{const r=sourceDetailPaper(input,detailGain);finePaper=r.paper;stats=r.stats;return r.paper},baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain:gain,eddyCells:eddy,curlStrength:curl},{...o,initializer:initialIntegerDynamicFast})})
 return{get metadata(){return{...base.metadata,physicalDt:4,sourceDetailGain:detailGain,derivedFinePaperSHA:derivedSHA,originalInputPaperSHA:originalSHA,sourceDetailStats:stats?{...stats}:null,sourceDetailQualification:'NEW affinity cue only: clamp(paper-gain*clamp(box3(Awet)-box9(Awet),-32,32),0,255), only3x3 eroded alpha>8/rawW>0 core. No RGB detail recovery, whole-coarse-cell residual, additive mass, or artistic equivalence. CPU preparation+SHA included in upload boundary; original input reaches base unchanged.'}},async upload(input){finePaper=undefined;stats=undefined;derivedSHA=originalSHA=null;try{await base.upload(input);if(!finePaper)throw Error('Missing derived fine paper');[derivedSHA,originalSHA]=await Promise.all([sha(finePaper),sha(input.paper)])}finally{finePaper=undefined}},run:()=>base.run(),readback:()=>base.readback(),destroy(){finePaper=undefined;base.destroy()}}
}
export const sourceDetailFineDefinitions=[{id:'wgsl-macro-source-detail-fine',label:'Связное растекание с локальной фактурой исходного мазка',create,configs:[1,2].map(sourceDetailGain=>({physicalDt:4,steps:64,fineSteps:12,affinityBase:128,paperGain:1,dither:1,mobilityGain:3,eddyCells:8,curlStrength:64,sourceDetailGain}))}]
