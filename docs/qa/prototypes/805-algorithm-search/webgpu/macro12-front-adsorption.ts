import type {FixedWetBaseOptions} from './fixed-wet-coarse-hooks'
import {create as createSmooth} from './macro9-integer-smooth'
import {MACRO10_WET_PAIR,MACRO10_LOCAL_PACK} from './macro10-wetness'
import {integerOption,type Candidate} from './contract'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Front adsorption source drift');return s.replace(a,b)}
export function frontAdsorptionSource(edgeStain:number){
 integerOption(edgeStain,0,128,'edgeStain')
 const helper=`
const EDGE_STAIN:u32=${edgeStain}u;
fn frontDeposit(value:Cell,e:vec4u,index:u32)->Cell{
 var c=value;let old=src[index];if(c.w==0u||EDGE_STAIN==0u){return c;}
 let pos=vec2i(i32(index%p.n),i32(index/p.n));var highest=old.w;
 for(var axis=0u;axis<4u;axis++){var q=pos;if(axis==0u){q.x-=1;}if(axis==1u){q.x+=1;}if(axis==2u){q.y-=1;}if(axis==3u){q.y+=1;}if(all(q>=vec2i(0))&&all(q<vec2i(i32(p.n)))){highest=max(highest,src[u32(q.y)*p.n+u32(q.x)].w);}}
 if(highest<=old.w||old.w>=2048u){return c;}
 let front=(highest-old.w)*256u/max(highest,1u);let dry=(e.y-old.s)*256u/e.y;let affinity=128u+(255u-e.z)/2u;
 var strength=EDGE_STAIN*front/256u;strength=strength*(2048u-old.w)/2048u;strength=strength*dry/256u;strength=strength*affinity/256u;
 let alpha=(c.m.a*strength+128u)/256u;let den=max(c.m.a,1u);
 for(var k=0u;k<4u;k++){let amount=select((c.m[k]*alpha+den/2u)/den,alpha,k==3u);c.m[k]-=amount;c.d[k]+=amount;}
 return c;
}
`
 let s=once(MACRO10_WET_PAIR,'fn adsorb(value:Cell,e:vec4u)->Cell{',helper+'fn adsorb(value:Cell,e:vec4u,index:u32)->Cell{')
 s=once(s,'c.w-=absorbed;c.s+=absorbed;return c;','c.w-=absorbed;c.s+=absorbed;return frontDeposit(c,e,index);')
 s=once(s,'adsorb(src[i],aux[i])','adsorb(src[i],aux[i],i)');s=once(s,'adsorb(a,aux[ia])','adsorb(a,aux[ia],ia)');s=once(s,'adsorb(b,aux[ib])','adsorb(b,aux[ib],ib)');return s
}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={},options:FixedWetBaseOptions={}):Promise<Candidate>{
 const edgeStain=integerOption(config.edgeStain??16,0,128,'edgeStain'),base=await createSmooth(device,size,{...config,mixing:1,smooth:1},{...options,pairSourceOverride:frontAdsorptionSource(edgeStain),packSourceOverride:MACRO10_LOCAL_PACK})
 const descriptors=Object.getOwnPropertyDescriptors(base.metadata)
 descriptors.algorithm={enumerable:true,value:'u32-wetting-front-adsorption'};descriptors.edgeStain={enumerable:true,value:edgeStain}
 descriptors.reconstruction={enumerable:true,value:'integer-halfpixel; nearest ONLY at literal stationary pixels'}
 descriptors.reconstructionFallback={enumerable:true,get:()=>base.metadata.initial&&((base.metadata.initial as {initialStationaryAlpha:number}).initialStationaryAlpha>0)?'local stationary pixels; bilinear global mass certificate lost':null}
 descriptors.frontMechanism={enumerable:true,value:'M->D on fresh lower-water side of four-neighbour contrast, low-surface water deficit<2048codes, unsaturated paper and terrain affinity; no evaporation or added rim/color'}
 descriptors.wetnessConductance={enumerable:true,value:'V10 q=q0*meanW/65535; absolute-wet carrier exchange; no change to water equations'}
 descriptors.limitations={enumerable:true,value:'Phenomenological wetting-front adsorption, NOT coffee-ring evaporation or full CFD. Initial literal dry pigment cannot resuspend. Coarse8px front can create grid artifacts; local reconstruction mass delta separately qualified.'}
 return{...base,metadata:Object.freeze(Object.defineProperties({},descriptors))}
}
export const frontAdsorptionDefinitions=[{id:'wgsl-macro-wetting-front-deposition',label:'Осаждение на фронте смачивания',create,configs:[{steps:256,edgeStain:0},{steps:256,edgeStain:16},{steps:256,edgeStain:48}]}]
