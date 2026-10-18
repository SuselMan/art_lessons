import {create as createFastCoherent} from './macro21-fast-coherent'
import {exchangeSchedule,gatedExchangeSource} from './macro25-gated-exchange'
import {integerOption,type Candidate} from './contract'
const helper=`
fn limitedPigmentFlux(donor:Cell,receiver:Cell,q:u32,cap:u32,ia:u32,ib:u32,fromA:bool,axis:u32)->u32{
 let den=max(donor.w,1u);let free=cap-receiver.m.a-receiver.d.a;
 let baseFlux=(donor.m.a*q+den/2u)/den;let ordinary=min(baseFlux,free);
 if(q==0u||donor.w==0u||receiver.w==0u){return ordinary;}
 let di=select(ib,ia,fromA);let pos=vec2i(i32(di%p.n),i32(di/p.n));let direction=select(vec2i(1,0),vec2i(0,1),axis==1u);
 let up=pos+select(direction,-direction,fromA);if(any(up<vec2i(0))||any(up>=vec2i(i32(p.n)))){return ordinary;}
 let upstream=src[u32(up.y)*p.n+u32(up.x)];if(upstream.w==0u){return ordinary;}
 let c=i32(donor.m.a*256u/donor.w);let cu=i32(upstream.m.a*256u/upstream.w);let cr=i32(receiver.m.a*256u/receiver.w);
 let left=c-cu;let right=cr-c;var slope=0;if(left>0&&right>0){slope=min(left,right);}else if(left<0&&right<0){slope=max(left,right);}
 // |slope|<=floor(256M/W); q<=4W/5. The product below is <=65535*65536/4 <2^30.
 let factor=(donor.w-q)*256u/donor.w;let correction=(q*u32(abs(slope))*factor+65536u)/131072u;
 var adjusted=baseFlux+correction;if(slope<0){adjusted=baseFlux-min(baseFlux,correction);}
 return min(min(adjusted,donor.m.a),free);
}
`
export function limitedAdvectionSource(gain:number,limiter:number){
 let source=gatedExchangeSource(gain);if(limiter===0)return source;if(limiter!==1)throw Error('Limiter must0/1')
 const anchor='let alpha=min((donor.m.a*q+den/2u)/den,cap-receiver.m.a-receiver.d.a);let ma=max(donor.m.a,1u);'
 if(source.split(anchor).length!==2||source.split('fn head(').length!==2)throw Error('Limited advection source drift')
 source=source.replace('fn head(',helper+'fn head(')
 // Remove unused den only in this advection block. Absorption retains its own denominator.
 source=source.replace('let cap=select(aux[ia].x,aux[ib].x,fromA);let den=max(donor.w,1u);','let cap=select(aux[ia].x,aux[ib].x,fromA);')
 return source.replace(anchor,'let alpha=limitedPigmentFlux(donor,receiver,q,cap,ia,ib,fromA,axis);let ma=max(donor.m.a,1u);')
}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={}):Promise<Candidate>{
 const steps=integerOption(config.steps??256,256,256,'steps'),limiter=integerOption(config.limiter??1,0,1,'limiter'),active=integerOption(config.exchangeActiveSteps??128,64,256,'exchangeActiveSteps'),gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain')
 const base=await createFastCoherent(device,size,{...config,steps,mobilityGain:gain,eddyCells:config.eddyCells??8,curlStrength:config.curlStrength??64},{pairSourceOverride:limitedAdvectionSource(gain,limiter),exchangeSchedule:exchangeSchedule(active,steps)})
 return{get metadata(){return{...base.metadata,algorithm:'u32-limited-concentration-face-advection',limiter,exchangeActiveSteps:active,physicsChange:limiter!==0||active!==256,limitation:'NEW concentration-Q8 minmod face correction; conservative bounded alpha packet, original donor color ratios. Upstream src is prior split-phase while pair may be exchanged. No whole-solver TVD/nonoscillation/CFD claim.',optimizationScope:'Quality hypothesis, extra upstream read/divisions; no speedup claim'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const limitedAdvectionDefinitions=[{id:'wgsl-macro-limited-coherent-advection',label:'Перенос с ограничением численного размытия',create,configs:[
 {steps:256,limiter:0,exchangeActiveSteps:128,mobilityGain:3,eddyCells:8,curlStrength:64},
 {steps:256,limiter:1,exchangeActiveSteps:128,mobilityGain:3,eddyCells:8,curlStrength:64},
 {steps:256,limiter:1,exchangeActiveSteps:64,mobilityGain:3,eddyCells:8,curlStrength:64}
]}]
