import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import type {FixedWetBaseOptions} from './fixed-wet-coarse-hooks'
import {boundedPressureSource} from './macro32-bounded-pressure'
import {create as createFastCoherent} from './macro21-fast-coherent'
import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
import type {PhysicalDtFineConfig} from './macro31-physical-dt-fine'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Relaxed curl source drift');return s.replace(a,b)}
export function relaxCurlSource(source:string,t:number){
 if(![1,2,4].includes(t))throw Error('physicalDt must1/2/4');if(t===1)return source
 const helper=`fn relaxedCurl(w:u32,rate:u32,wet:u32)->u32{let lq=(rate*wet+128u)/256u;let rq=32768u-lq;let r2=(rq*rq+16384u)/32768u;${t===4?'let r4=(r2*r2+16384u)/32768u;return (w*(32768u-r4)+16384u)/32768u;':'return (w*(32768u-r2)+16384u)/32768u;'}}
`
 return once(once(once(source,`let curl0=(upwind*u32(abs(rate))*${t}u+256u)/512u;`,''),'let curlQ=(curl0*curlWet+8192u)/16384u;','let curlQ=relaxedCurl(upwind,u32(abs(rate)),curlWet);'),'fn head(',helper+'fn head(')
}
export const relaxedCurlSource=(gain:number,t:number)=>relaxCurlSource(boundedPressureSource(gain,t),t)
function parameters(config:PhysicalDtFineConfig){const t=config.physicalDt??4;if(![1,2,4].includes(t))throw Error('physicalDt must1/2/4');const steps=256/t;if(config.steps!==undefined&&config.steps!==steps)throw Error('steps*physicalDt must256');return{t,steps,gain:integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddy:integerOption(config.eddyCells??8,4,64,'eddyCells'),curl:integerOption(config.curlStrength??64,0,128,'curlStrength')}}
function wrap(base:Candidate,t:number){return{get metadata(){return{...base.metadata,physicalDt:t,nominalHorizon:256,pressureIntegrator:'macro32 bounded pressure component unchanged',curlIntegrator:'NEW Q15 frozen one-way fraction1-(1-lambda)^t, lambda=absrate/512*curlWet/16384; t1 literal old two-stage rounding',qualification:'Approximate compression, not exact multicell flow. Mixing/absorption and final donor0.8/recipient clamps unchanged. Curl may reverse head; bounded fraction does not eliminate all combined/capacity clamps or prove no banding. Q15 rounds new t2/t4 coefficients.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()} satisfies Candidate}
export async function create(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:FixedWetBaseOptions={}){const p=parameters(config);return wrap(await createFastCoherent(device,size,{...config,steps:p.steps,mobilityGain:p.gain,eddyCells:p.eddy,curlStrength:p.curl},{...options,pairSourceOverride:relaxedCurlSource(p.gain,p.t)}),p.t)}
export async function createFine(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:FixedWetFineOptions={}){const p=parameters(config);return wrap(await createSmoothFine(device,size,{...config,steps:p.steps,mobilityGain:p.gain},{...options,compactAux:true,compactCarrier:true,affinityBase:config.affinityBase,basePairSourceOverride:relaxedCurlSource(p.gain,p.t),baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain:p.gain,eddyCells:p.eddy,curlStrength:p.curl},{...o,initializer:initialIntegerDynamicFast})}),p.t)}
const common={physicalDt:4,steps:64,mobilityGain:3,eddyCells:8,curlStrength:64}
export const relaxedCurlDefinitions=[{id:'wgsl-macro-relaxed-curl-dt',label:'Укрупнённый шаг с ограниченной долей потока',create,configs:[common]},{id:'wgsl-macro-relaxed-curl-dt-fine',label:'Ограниченная доля потока и мелкая бумага',create:createFine,configs:[{...common,fineSteps:4,affinityBase:64,paperGain:1,dither:1}]}]
