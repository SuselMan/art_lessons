import type {FixedWetBaseOptions} from './fixed-wet-coarse-hooks'
import {create as createSmooth,MACRO9_PAIR,MACRO9_PACK} from './macro9-integer-smooth'
import type {Candidate} from './contract'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Wetness source drift');return s.replace(a,b)}
export const MACRO10_LOCAL_PACK=once(MACRO9_PACK,'if((p.pad&5u)!=0u)','if((p.pad&4u)!=0u||(stationary[i]>>24u)>0u)')
export const MACRO10_WET_PAIR=once(once(once(MACRO9_PAIR,
 'var k=64u*min(a.w,b.w)/max(max(a.w,b.w),1u);','var k=64u*min(a.w,b.w)/max(max(a.w,b.w),1u);k=k*min(min(a.w,b.w),16384u)/16384u;'),
 'let q=min(min(','let q0=min(min('),
 'let cap=select(aux[ia].x,aux[ib].x,fromA);','let meanW=(a.w+b.w)/2u;let q=(q0*meanW+32767u)/65535u;let cap=select(aux[ia].x,aux[ib].x,fromA);')
export async function make(device:GPUDevice,size:number,config:Record<string,number>,wetness:boolean,options:FixedWetBaseOptions={}):Promise<Candidate>{
 const base=await createSmooth(device,size,{...config,mixing:1,smooth:1},{...options,pairSourceOverride:wetness?MACRO10_WET_PAIR:MACRO9_PAIR,packSourceOverride:MACRO10_LOCAL_PACK})
 const descriptors=Object.getOwnPropertyDescriptors(base.metadata)
 descriptors.algorithm={enumerable:true,value:wetness?'u32-saturation-dependent-conductance':'u32-local-reconstruction-control'}
 descriptors.reconstruction={enumerable:true,value:'integer-halfpixel; nearest ONLY at literal stationary pixels'}
 descriptors.reconstructionFallback={enumerable:true,get:()=>base.metadata.initial&&((base.metadata.initial as {initialStationaryAlpha:number}).initialStationaryAlpha>0)?'local stationary pixels; global bilinear mass certificate no longer exact':null}
 descriptors.localMassQualification={enumerable:true,value:'prequant difference versus full bilinear bounded by stationaryPixelCount*65535 code units/channel; measure actual delta separately. No clipping.'}
 descriptors.wetnessConductance={enumerable:true,value:wetness?'q=q0*meanW/65535; mixing absolute minW/16384 (input water1=16384 codes), both rounded integer':'V9 unchanged'}
 return{...base,metadata:Object.freeze(Object.defineProperties({},descriptors))}
}
export const wetnessDefinitions=[
 {id:'wgsl-macro-local-smooth-control',label:'Локальное восстановление — физика V9',create:(d:GPUDevice,s:number,c:Record<string,number>={})=>make(d,s,c,false),configs:[{steps:256}]},
 {id:'wgsl-macro-wetness-conductance',label:'Перенос зависит от насыщенности водой',create:(d:GPUDevice,s:number,c:Record<string,number>={})=>make(d,s,c,true),configs:[{steps:256},{steps:384}]}
]
