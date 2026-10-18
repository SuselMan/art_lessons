import {create as createFine,MACRO11_FINE_INIT,MACRO11_FINE_PACK,type FineConfig,type FineOverrides} from './macro11-fine-paper'
import {SAFE_REMAINDER_WGSL} from './macro15-safe-integer-dither'
import {mobilitySource} from './macro13-mobility-calibration'
import {integerOption,type Candidate} from './contract'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Smoothfine source drift');return s.replace(a,b)}
const coarseSample=`
fn floor16(v:i32)->i32{if(v<0){return -((-v+15)/16);}return v/16;}
fn pick(q:vec2i,fixed:bool)->vec4u{let xy=vec2u(clamp(q,vec2i(0),vec2i(i32(p.n)-1)));let c=coarse[xy.y*p.n+xy.x];return select(c.m,c.d,fixed);}
fn interpolateCarrier(gid:vec2u,fixed:bool)->vec4u{
 let numer=vec2i(gid)*2+vec2i(-7);let base=vec2i(floor16(numer.x),floor16(numer.y));let t=vec2u(numer-base*16);
 return (pick(base,fixed)*(16u-t.x)*(16u-t.y)+pick(base+vec2i(1,0),fixed)*t.x*(16u-t.y)+pick(base+vec2i(0,1),fixed)*(16u-t.x)*t.y+pick(base+vec2i(1,1),fixed)*t.x*t.y)/256u;
}
`
export const MACRO17_SMOOTH_FINE_INIT=once(once(once(once(MACRO11_FINE_INIT,'@compute ',coarseSample+'@compute '),'@group(0) @binding(6) var<storage,read_write> guard:array<atomic<u32>>;','@group(0) @binding(6) var<storage,read_write> guard:array<atomic<u32>>;\n@group(0) @binding(7) var<storage,read_write> fineDeposit:array<vec4u>;'),'let fixedAlpha=(stationary[i]>>24u)*257u+c.d.a;','var m=c.m;var d=c.d;if((stationary[i]>>24u)==0u){m=interpolateCarrier(gid.xy,false);d=interpolateCarrier(gid.xy,true);}fineDeposit[i]=d;let fixedAlpha=(stationary[i]>>24u)*257u+d.a;'),'c.m.a>65535u-min(fixedAlpha,65535u)','m.a>65535u-min(fixedAlpha,65535u)').replace('mobile[i]=c.m;','mobile[i]=m;')
const initialPack=once(once(once(once(MACRO11_FINE_PACK,'@compute ',SAFE_REMAINDER_WGSL+'@compute '),'randomCode(gid.x,gid.y,p.seed)%257u','mod257ByteFold(randomCode(gid.x,gid.y,p.seed))'),'@group(0) @binding(5) var<storage,read_write> guard:array<atomic<u32>>;','@group(0) @binding(5) var<storage,read_write> guard:array<atomic<u32>>;\n@group(0) @binding(6) var<storage,read> fineDeposit:array<vec4u>;'),'let value=fine[i]+c.d;','let value=fine[i]+fineDeposit[i];')
// Keep coarse binding used, independent of the new fine-deposit plane, to preserve base layouts and validate phase selection.
export const MACRO17_SMOOTH_FINE_PACK=once(initialPack,'let literal=unpack(stationary[i]);','if(c.m.a+c.d.a>65535u){atomicAdd(&guard[1],1u);}let literal=unpack(stationary[i]);')
export async function create(device:GPUDevice,size:number,config:FineConfig&{mobilityGain?:number}={},options:FineOverrides={}):Promise<Candidate>{
 if(options.initSourceOverride!==undefined||options.packSourceOverride!==undefined||options.fineDepositPlane===false)throw Error('Smooth fine owns reconstruction')
 const gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),affinityBase=integerOption(options.affinityBase??1,1,256,'affinityBase'),paperGain=integerOption(config.paperGain??3,0,4,'paperGain')
 if(affinityBase+Math.floor(255*paperGain/4)>256)throw Error('Affinity maximum exceeds256')
 const initSource=options.affinityBase===undefined?MACRO17_SMOOTH_FINE_INIT:once(MACRO17_SMOOTH_FINE_INIT,'1u+(255u-paper[i])*p.gain/4u',affinityBase+'u+(255u-paper[i])*p.gain/4u')
 const base=await createFine(device,size,config,{...options,basePairSourceOverride:options.basePairSourceOverride??mobilitySource(gain),initSourceOverride:initSource,packSourceOverride:MACRO17_SMOOTH_FINE_PACK,fineDepositPlane:true,smoothInitialization:true})
 return{get metadata(){return{...base.metadata,basePhysicalModel:'macro13 mobility',mobilityGain:gain,...(options.affinityBase===undefined?{}:{paperAffinityBase:affinityBase,paperAffinityGlobalMax:affinityBase+Math.floor(255*paperGain/4)}),fineDepositBasis:'NEW continuous proxy from independent floor bilinear coarse D; not historical native D',fineQuantization:'safe exact bytefold shared threshold',limitations:'NEW independent floor-bilinear M/D initialization changes totals; local nearest only at literal stationary pixels. Compare fine0/fine12 same initialization. Fine deposited proxy fixed, mobile pair flow conservative; extra16MiB deposit plane. Not historical native equivalence.'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const smoothFineDefinitions=[{id:'wgsl-macro-mobility-smooth-fine-paper',label:'Гладкий пигмент и локальная консервативная бумага',create,configs:[{steps:256,fineSteps:12,paperGain:3,dither:1,mobilityGain:3},{steps:256,fineSteps:0,paperGain:0,dither:1,mobilityGain:3},{steps:256,fineSteps:12,paperGain:0,dither:1,mobilityGain:3}]}]
