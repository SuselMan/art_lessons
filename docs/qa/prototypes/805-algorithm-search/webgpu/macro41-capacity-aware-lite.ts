import {MACRO19_COHERENT_LOCAL_DITHER_PACK} from './macro19-coherent-dither'
import {mod257ByteFold,mod65792ByteFold} from './macro15-safe-integer-dither'
import {create as createCoherent} from './macro14-coherent-advection'
import {physicalDtSource} from './macro30-physical-dt'
import {initialIntegerDynamicFast} from './macro20-fast-initial'
import {integerOption,type Candidate} from './contract'
export const CARRIER_BILINEAR_DEN=65792,CARRIER_BILINEAR_MAX=16776960
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Capacity-aware Lite source drift');return s.replace(a,b)}
const oldQuant='b=(total+vec4u(mod65792ByteFold(randomCode(gid.x,gid.y,p.phase))))/65792u;'
const newQuant=`let literal=unpack(stationary[i]);
 if(total.a+literal.a*65792u<=16776960u){b=(total+vec4u(mod65792ByteFold(randomCode(gid.x,gid.y,p.phase))))/65792u+literal;}
 else{let xy=gid.xy*p.n/p.size;let c=src[xy.y*p.n+xy.x];b=(c.m+c.d+vec4u(mod257ByteFold(randomCode(gid.x,gid.y,p.phase))))/257u+literal;}`
export function capacityAwareLitePack(source=MACRO19_COHERENT_LOCAL_DITHER_PACK){return once(once(source,'if((p.pad&4u)!=0u||(stationary[i]>>24u)>0u)','if((p.pad&4u)!=0u)'),oldQuant,newQuant)}
export const MACRO41_CAPACITY_AWARE_PACK=capacityAwareLitePack()
/** Exact scalar selection/quantization oracle; valid nearest fallback required, no clipping. */
export function capacityAwareBytePack(total:readonly number[],nearest:readonly number[],literal:readonly number[],hash:number,forceNearest=false){
 for(const[v,max]of [[total,CARRIER_BILINEAR_MAX],[nearest,65535],[literal,255]] as const)if(v.length!==4||v.some(x=>!Number.isInteger(x)||x<0||x>max)||v.some(x=>x>v[3]))throw Error('Invalid premultiplied carrier')
 if(nearest[3]+literal[3]*257>65535)throw Error('Invalid nearest fallback')
 const smooth=!forceNearest&&total[3]+literal[3]*CARRIER_BILINEAR_DEN<=CARRIER_BILINEAR_MAX,den=smooth?CARRIER_BILINEAR_DEN:257,threshold=smooth?mod65792ByteFold(hash):mod257ByteFold(hash),values=smooth?total:nearest
 return{smooth,rgba:values.map((v,k)=>Math.floor((v+threshold)/den)+literal[k])}
}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={}):Promise<Candidate>{
 if(config.physicalDt!==undefined&&config.physicalDt!==4||config.steps!==undefined&&config.steps!==64)throw Error('Capacity-aware Lite requires dt4/64steps')
 const gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),eddy=integerOption(config.eddyCells??8,4,64,'eddyCells'),curl=integerOption(config.curlStrength??64,0,128,'curlStrength'),base=await createCoherent(device,size,{...config,steps:64,mobilityGain:gain,eddyCells:eddy,curlStrength:curl},{initializer:initialIntegerDynamicFast,pairSourceOverride:physicalDtSource(gain,4),packSourceOverride:MACRO41_CAPACITY_AWARE_PACK})
 return{get metadata(){return{...base.metadata,physicalDt:4,packingHashSeed:0,packingSeedPolicy:'existing phase0 uniform; field remains input.seed',reconstructionChange:true,reconstructionPolicy:'Exact unrounded BLR total accepted if total.a+literal.a*65792<=16776960, then old safe BLR quant+literal; otherwise original safe nearest quant+literal. Forced nearest flag4 retained.',reconstructionQualification:'NEW representation policy; no global mass fix/renormalization. Signed mass delta may increase or decrease. No-literal whole input equals old30; opaque literal exact under existing zero-nearest capacity invariant. Coarse evolution/PACK thresholds/seed0 unchanged, no fine buffers/dispatch.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const capacityAwareLiteDefinitions=[{id:'wgsl-macro-capacity-aware-lite',label:'Плавный носитель по ёмкости — без мелких проходов',create,configs:[{physicalDt:4,steps:64,mobilityGain:3,eddyCells:8,curlStrength:64}]}]
