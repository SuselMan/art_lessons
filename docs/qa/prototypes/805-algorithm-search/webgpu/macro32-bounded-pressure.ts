import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import type {FixedWetBaseOptions} from './fixed-wet-coarse-hooks'
import {physicalDtSource} from './macro30-physical-dt'
import {create as createFastCoherent} from './macro21-fast-coherent'
import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
import type {PhysicalDtFineConfig} from './macro31-physical-dt-fine'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Bounded pressure source drift');return s.replace(a,b)}
export function boundPressureSource(source:string,t:number){
 if(![1,2,4].includes(t))throw Error('physicalDt must1/2/4');if(t===1)return source
 const helper=`fn boundedPressure(q:u32,dh:u32)->u32{if(dh==0u){return 0u;}let q2=(2u*q*(dh-q)+dh/2u)/dh;${t===4?'return (2u*q2*(dh-q2)+dh/2u)/dh;':'return q2;'}}
`
 return once(once(source,`let pressureQ=((q0*meanW+32767u)/65535u)*${t}u;`,'let pressureQ=boundedPressure((q0*meanW+32767u)/65535u,dh);'),'fn head(',helper+'fn head(')
}
export const boundedPressureSource=(gain:number,t:number)=>boundPressureSource(physicalDtSource(gain,t),t)
function parameters(config:PhysicalDtFineConfig){const t=config.physicalDt??4;if(![1,2,4].includes(t))throw Error('physicalDt must1/2/4');const steps=256/t;if(config.steps!==undefined&&config.steps!==steps)throw Error('steps*physicalDt must256');return{t,steps,gain:integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddy:integerOption(config.eddyCells??8,4,64,'eddyCells'),curl:integerOption(config.curlStrength??64,0,128,'curlStrength')}}
function wrap(base:Candidate,t:number){return{get metadata(){return{...base.metadata,physicalDt:t,nominalHorizon:256,pressureIntegrator:'NEW frozen pressure-pair rational relaxation; exact integer rounding, no head inversion in pressure-only transfer',pressureHead:'w+6paper-floor((absCap-s)/4); abs difference<=73193',pressureQualification:'Only pressure component bounded before curl/absorption. Curl can reverse total head; enlarged split step is not whole-solver monotone/equivalent. t1 literal physicalDtSource; mixing/curl/absorption unchanged from macro30.',physicsChange:t!==1}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()} satisfies Candidate}
export async function create(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:FixedWetBaseOptions={}){const p=parameters(config);return wrap(await createFastCoherent(device,size,{...config,steps:p.steps,mobilityGain:p.gain,eddyCells:p.eddy,curlStrength:p.curl},{...options,pairSourceOverride:boundedPressureSource(p.gain,p.t)}),p.t)}
export async function createFine(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:FixedWetFineOptions={}){const p=parameters(config);return wrap(await createSmoothFine(device,size,{...config,steps:p.steps,mobilityGain:p.gain},{...options,compactAux:true,compactCarrier:true,affinityBase:config.affinityBase,basePairSourceOverride:boundedPressureSource(p.gain,p.t),baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain:p.gain,eddyCells:p.eddy,curlStrength:p.curl},{...o,initializer:initialIntegerDynamicFast})}),p.t)}
const common={physicalDt:4,steps:64,mobilityGain:3,eddyCells:8,curlStrength:64}
export const boundedPressureDefinitions=[{id:'wgsl-macro-bounded-pressure-dt',label:'Связный шаг с ограниченной релаксацией давления',create,configs:[common]},{id:'wgsl-macro-bounded-pressure-dt-fine',label:'Ограниченная релаксация давления и мелкая бумага',create:createFine,configs:[{...common,fineSteps:4,affinityBase:64,paperGain:1,dither:1}]}]
