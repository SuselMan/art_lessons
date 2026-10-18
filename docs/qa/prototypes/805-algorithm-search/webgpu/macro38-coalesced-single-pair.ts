import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import type {FixedWetBaseOptions} from './fixed-wet-coarse-hooks'
import {singlePairDtSource} from './macro33-single-pair-dt'
import {create as createFastCoherent} from './macro21-fast-coherent'
import {create as createSmoothFine} from './macro17-smooth-fine-paper'
import {create as createCoherent} from './macro14-coherent-advection'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
import type {PhysicalDtFineConfig} from './macro31-physical-dt-fine'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Coalesced single pair source drift');return s.replace(a,b)}
export function coalescedSinglePairSource(gain:number){
 let s=singlePairDtSource(gain)
 s=once(s,'if(gid.y>=p.n||gid.x>p.n/2u){return;}\n let axis=p.phase%2u;let offset=p.phase/2u;','let axis=p.phase%2u;let offset=p.phase/2u;\n let pairCoord=select(gid.x,gid.y,axis==1u);let line=select(gid.y,gid.x,axis==1u);\n if(line>=p.n||pairCoord>p.n/2u){return;}')
 s=once(s,'let first=2*i32(gid.x)-i32(offset);','let first=2*i32(pairCoord)-i32(offset);')
 s=once(s,'select(gid.y*p.n+coord,coord*p.n+gid.y,axis==1u)','select(line*p.n+coord,coord*p.n+line,axis==1u)')
 s=once(s,'select(gid.y*p.n+u32(first),u32(first)*p.n+gid.y,axis==1u)','select(line*p.n+u32(first),u32(first)*p.n+line,axis==1u)')
 return once(s,'select(gid.y*p.n+u32(second),u32(second)*p.n+gid.y,axis==1u)','select(line*p.n+u32(second),u32(second)*p.n+line,axis==1u)')
}
/** Enumerate actual global-id mapping, not the old line/pair task order. */
export function coalescedPairTasks(n:number,phase:number){if(!Number.isInteger(n)||n<2||n%2||!Number.isInteger(phase)||phase<0||phase>3)throw Error('Pair mapping range');const tasks:number[][]=[],vertical=phase%2===1,offset=phase>>1;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const pairCoord=vertical?y:x,line=vertical?x:y;if(line>=n||pairCoord>n/2)continue;const first=2*pairCoord-offset,second=first+1;if(second<0||first>=n)continue;const index=(v:number)=>vertical?v*n+line:line*n+v;tasks.push(first<0||second>=n?[index(Math.max(0,Math.min(n-1,first)))]:[index(first),index(second)])}return tasks}

function parameters(config:PhysicalDtFineConfig){if(config.physicalDt!==undefined&&config.physicalDt!==4)throw Error('Single pair diagnostic requires physicalDt4');if(config.steps!==undefined&&config.steps!==64)throw Error('Single pair diagnostic requires64steps');return{gain:integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddy:integerOption(config.eddyCells??8,4,64,'eddyCells'),curl:integerOption(config.curlStrength??64,0,128,'curlStrength')}}
function wrap(base:Candidate){return{get metadata(){return{...base.metadata,physicalDt:4,nominalHorizon:256,dispatchOptimization:'singlePair33 with axis-aware global-id mapping; unchanged physicalDt4 arithmetic',dispatchOptimizationPhysicsChange:false,exactnessScope:'Same-config macro30/31 coarse material arithmetic/helpers unchanged; canonical disjoint pair computed once, both outputs written, singleton edge adsorbed once.',dispatchQualification:'Host workgroup dispatch unchanged. Vertical consecutive gid.x lanes now contiguous lineX; arithmetic/hostdispatch unchanged. Coalescing is a hypothesis, no GPU speed claim.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()} satisfies Candidate}
export async function create(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:FixedWetBaseOptions={}){const p=parameters(config);return wrap(await createFastCoherent(device,size,{...config,steps:64,mobilityGain:p.gain,eddyCells:p.eddy,curlStrength:p.curl},{...options,pairSourceOverride:coalescedSinglePairSource(p.gain)}))}
export async function createFine(device:GPUDevice,size:number,config:PhysicalDtFineConfig={},options:FixedWetFineOptions={}){const p=parameters(config);return wrap(await createSmoothFine(device,size,{...config,steps:64,mobilityGain:p.gain},{...options,compactAux:true,compactCarrier:true,affinityBase:config.affinityBase,basePairSourceOverride:coalescedSinglePairSource(p.gain),baseFactory:(d,s,c,o)=>createCoherent(d,s,{...c,mobilityGain:p.gain,eddyCells:p.eddy,curlStrength:p.curl},{...o,initializer:initialIntegerDynamicFast})}))}
const common={physicalDt:4,steps:64,mobilityGain:3,eddyCells:8,curlStrength:64}
export const coalescedSinglePairDefinitions=[{id:'wgsl-macro-coalesced-single-pair-dt',label:'Тот же DT4 — вертикальные пары соседними линиями',create,configs:[common]},{id:'wgsl-macro-coalesced-single-pair-dt-fine',label:'Тот же DT4 и мелкая бумага — соседние вертикальные линии',create:createFine,configs:[{...common,fineSteps:4,affinityBase:64,paperGain:1,dither:1}]}]
