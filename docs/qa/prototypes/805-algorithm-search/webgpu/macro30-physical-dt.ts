import {create as createFastCoherent} from './macro21-fast-coherent'
import {coherentSource} from './macro14-coherent-source'
import {integerOption,type Candidate} from './contract'
function once(source:string,anchor:string,replacement:string){if(source.split(anchor).length!==2)throw Error('Physical dt source drift');return source.replace(anchor,replacement)}
export function physicalDtSource(gain:number,t:number){
 if(![1,2,4].includes(t))throw Error('physicalDt must1/2/4');let source=coherentSource(gain);if(t===1)return source
 source=once(source,'var A=packet(a.m,k);',`let relaxation=256u-2u*k;let r2=(relaxation*relaxation+128u)/256u;${t===4?'let r4=(r2*r2+128u)/256u;':''}k=(256u-${t===4?'r4':'r2'})/2u;var A=packet(a.m,k);`)
 source=once(source,'let pressureQ=(q0*meanW+32767u)/65535u;',`let pressureQ=((q0*meanW+32767u)/65535u)*${t}u;`)
 source=once(source,'(upwind*u32(abs(rate))+256u)/512u',`(upwind*u32(abs(rate))*${t}u+256u)/512u`)
 return once(source,'c.w/select(32u,128u,(p.pad&2u)!=0u)',`c.w/select(32u,${128/t}u,(p.pad&2u)!=0u)`)
}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={}):Promise<Candidate>{
 const physicalDt=config.physicalDt??1;if(![1,2,4].includes(physicalDt))throw Error('physicalDt must1/2/4');const steps=256/physicalDt;if(config.steps!==undefined&&config.steps!==steps)throw Error('steps*physicalDt must256')
 const gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),base=await createFastCoherent(device,size,{...config,steps,mobilityGain:gain,eddyCells:config.eddyCells??8,curlStrength:config.curlStrength??64},{pairSourceOverride:physicalDtSource(gain,physicalDt)})
 return{get metadata(){return{...base.metadata,algorithm:'coherent enlarged physical timestep',physicalDt,nominalHorizon:256,steps,physicsChange:physicalDt!==1,coefficients:'Pressure*t; curl numerator*t before rounding; absorption128/t; exact bounded effective local symmetric mixing relaxation',qualification:'Approximate compression of noncommuting four-phase operators. Frozen-rate pair mixing analogy only; not same water/whole solver/TVD or guaranteed4x elapsed speed. Donor/cap clamps retained; original donor color ratios and all-channel mass transfer.',optimizationScope:'Fewer physical pair dispatches; actual coherent field/fast initializer/Lite safe PACK unchanged'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const physicalDtDefinitions=[{id:'wgsl-macro-coherent-physical-dt',label:'Связное растекание — укрупнённый шаг времени',create,configs:[1,2,4].map(physicalDt=>({physicalDt,steps:256/physicalDt,mobilityGain:3,eddyCells:8,curlStrength:64}))}]
