import {create as createFastCoherent} from './macro21-fast-coherent'
import {coherentSource} from './macro14-coherent-source'
import {integerOption,type Candidate} from './contract'
export function exchangeSchedule(activeSteps:number,steps=256):boolean[]{
 if(steps!==256||![64,128,256].includes(activeSteps))throw Error('Exchange schedule requires256steps and active64/128/256')
 const on=activeSteps/16;return Array.from({length:steps},(_,step)=>step%16<on)
}
export function gatedExchangeSource(gain:number){const source=coherentSource(gain),anchor='if((p.pad&2u)!=0u){let mixed=exchange(a,b,aux[ia].x,aux[ib].x);';if(source.split(anchor).length!==2)throw Error('Exchange gate source drift');return source.replace(anchor,'if((p.pad&2u)!=0u&&(p.pad&8u)!=0u){let mixed=exchange(a,b,aux[ia].x,aux[ib].x);')}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={}):Promise<Candidate>{
 const steps=integerOption(config.steps??256,256,256,'steps'),active=integerOption(config.exchangeActiveSteps??64,64,256,'exchangeActiveSteps'),gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),schedule=exchangeSchedule(active,steps)
 const base=await createFastCoherent(device,size,{...config,steps,mobilityGain:gain,eddyCells:config.eddyCells??8,curlStrength:config.curlStrength??64},{pairSourceOverride:gatedExchangeSource(gain),exchangeSchedule:schedule})
 return{get metadata(){return{...base.metadata,algorithm:'u32-coherent-gated-symmetric-exchange',physicsChange:active!==256,exchangeActiveSteps:active,exchangeTotalSteps:steps,exchangeParityCounts:[0,1,2,3].map(phase=>schedule.reduce((s,on,i)=>s+Number(on&&i%4===phase),0)),exchangeSchedule:'period16: first4/8/16 phases ON, remainingOFF; complete4phase blocks preserveaxes/parities',optimizationScope:'NEW exchange schedule; advection/adsorption all256phases unchanged, CPU fast initializer and Lite safe PACK preserved',extraGPUAllocations:4,extraGPUBytes:64,extraDispatches:0,qualification:'Not exact old pixels when exchangeActiveSteps<256; no GPU speed/artistic win claimed.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const gatedExchangeDefinitions=[{id:'wgsl-macro-coherent-gated-exchange',label:'Связное растекание с ограниченным выравниванием',create,configs:[64,128,256].map(exchangeActiveSteps=>({steps:256,exchangeActiveSteps,mobilityGain:3,eddyCells:8,curlStrength:64}))}]
