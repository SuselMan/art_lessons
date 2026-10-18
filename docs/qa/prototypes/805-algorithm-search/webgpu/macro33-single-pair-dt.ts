import type {CoherentOverrides} from './macro14-coherent-advection'
import type {FixedWetFineHooks} from './fixed-wet-fine-hooks'
import {singlePairSource} from './exact-pair-dispatch'
import {physicalDtSource} from './macro30-physical-dt'
import {create as createFastCoherent} from './macro21-fast-coherent'
import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
import type {PhysicalDtFineConfig} from './macro31-physical-dt-fine'
export const singlePairDtSource=(gain:number)=>singlePairSource(physicalDtSource(gain,4))
function parameters(config:PhysicalDtFineConfig){if(config.physicalDt!==undefined&&config.physicalDt!==4)throw Error('Single pair diagnostic requires physicalDt4');if(config.steps!==undefined&&config.steps!==64)throw Error('Single pair diagnostic requires64steps');return{gain:integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddy:integerOption(config.eddyCells??8,4,64,'eddyCells'),curl:integerOption(config.curlStrength??64,0,128,'curlStrength')}}
function wrap(base:Candidate){return{get metadata(){return{...base.metadata,physicalDt:4,nominalHorizon:256,dispatchOptimization:'existing singlePairSource on literal physicalDtSource(gain,4)',dispatchOptimizationPhysicsChange:false,exactnessScope:'Same-config macro30/31 coarse material arithmetic/helpers unchanged; canonical disjoint pair computed once, both outputs written, singleton edge adsorbed once.',dispatchQualification:'Host workgroup dispatch unchanged. x beyond n/2 exits before state reads; no GPU performance or universal driver proof.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()} satisfies Candidate}
export async function create(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:Pick<CoherentOverrides,'fixedWet'|'observePacking'>={}){const p=parameters(config);return wrap(await createFastCoherent(device,size,{...config,steps:64,mobilityGain:p.gain,eddyCells:p.eddy,curlStrength:p.curl},{...options,pairSourceOverride:singlePairDtSource(p.gain)}))}
export async function createFine(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:{readonly fixedWet?:FixedWetFineHooks}={}){const p=parameters(config);return wrap(await createSmoothFine(device,size,{...config,steps:64,mobilityGain:p.gain},{...options,compactAux:true,compactCarrier:true,affinityBase:config.affinityBase,basePairSourceOverride:singlePairDtSource(p.gain),baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain:p.gain,eddyCells:p.eddy,curlStrength:p.curl},{...o,initializer:initialIntegerDynamicFast})}))}
const common={physicalDt:4,steps:64,mobilityGain:3,eddyCells:8,curlStrength:64}
export const singlePairDtDefinitions=[{id:'wgsl-macro-single-pair-dt',label:'Тот же DT4 — вычисление пары один раз',create,configs:[common]},{id:'wgsl-macro-single-pair-dt-fine',label:'Тот же DT4 и мелкая бумага — пара один раз',create:createFine,configs:[{...common,fineSteps:4,affinityBase:64,paperGain:1,dither:1}]}]
