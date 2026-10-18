import {create as createSmooth} from './macro9-integer-smooth'
import {MACRO10_WET_PAIR,MACRO10_LOCAL_PACK} from './macro10-wetness'
import {integerOption,type Candidate} from './contract'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Mobility source drift');return s.replace(a,b)}
export function mobilitySource(gain:number){integerOption(gain,1,8,'mobilityGain');return once(once(MACRO10_WET_PAIR,
 'let meanW=(a.w+b.w)/2u;',`let meanW=min(((a.w+b.w)/2u)*${gain}u,65535u);`),
 'k=k*min(min(a.w,b.w),16384u)/16384u;',`k=k*min(min(a.w,b.w)*${gain}u,16384u)/16384u;`)}
export async function create(device:GPUDevice,size:number,config:Record<string,number>={}):Promise<Candidate>{
 const gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain'),base=await createSmooth(device,size,{...config,mixing:1,smooth:1},{pairSourceOverride:mobilitySource(gain),packSourceOverride:MACRO10_LOCAL_PACK})
 const descriptors=Object.getOwnPropertyDescriptors(base.metadata)
 descriptors.algorithm={enumerable:true,value:'u32-absolute-wetness-mobility-calibration'};descriptors.mobilityGain={enumerable:true,value:gain}
 descriptors.reconstruction={enumerable:true,value:'integer-halfpixel; nearest ONLY at literal stationary pixels'}
 descriptors.reconstructionFallback={enumerable:true,get:()=>base.metadata.initial&&((base.metadata.initial as {initialStationaryAlpha:number}).initialStationaryAlpha>0)?'local stationary pixels; global interpolation mass not exact':null}
 descriptors.calibration={enumerable:true,value:'GLOBAL coefficient, same for every scene: K=min(meanW*gain,65535)/65535; exchange absoluteWet=min(minW*gain,16384)/16384'}
 descriptors.limitations={enumerable:true,value:'Phenomenological saturation-dependent mobility, no empirical physical calibration or artistic win claimed. V10 capacity/adsorption and local-reconstruction caveats apply.'}
 return{...base,metadata:Object.freeze(Object.defineProperties({},descriptors))}
}
export const mobilityDefinitions=[{id:'wgsl-macro-mobility-calibration',label:'Калибровка подвижности по количеству воды',create,configs:[{steps:256,mobilityGain:1},{steps:256,mobilityGain:3},{steps:256,mobilityGain:6}]}]
