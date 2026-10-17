import {create as createCapillary,type CapillaryConfig} from './macro4-capillary'
import {MACRO5_CAPILLARY_SMOOTH_PACK} from './macro5-capillary-smooth'
import type {Candidate} from './contract'
/** Stable integer hash is DISPLAY quantization, not a force, paper model or transport change. */
export function quantizationThreshold(x:number,y:number,seed:number){let v=(Math.imul(x,0x9e3779b9)^Math.imul(y,0x85ebca6b)^seed^805)>>>0;v=Math.imul(v^(v>>>16),0x7feb352d)>>>0;v=Math.imul(v^(v>>>15),0x846ca68b)>>>0;v=(v^(v>>>16))>>>0;return(v>>>8)/16777216}
export function stochasticPixel(value:readonly number[],threshold:number){if(value.length!==4||!value.every(Number.isFinite)||!(threshold>=0&&threshold<1))throw Error('Invalid quantization input');return value.map(v=>Math.floor(Math.max(0,Math.min(1,v))*255+threshold))}
const anchor='let b=vec4u(floor(clamp(value,vec4f(0),vec4f(1))*255.0+vec4f(.5)));'
if(MACRO5_CAPILLARY_SMOOTH_PACK.split(anchor).length!==2)throw Error('Nonunique smooth quantization anchor')
const hash=/* wgsl */`
fn threshold(x:u32,y:u32,seed:u32)->f32{
 var v=(x*0x9e3779b9u)^(y*0x85ebca6bu)^seed^805u;
 v=(v^(v>>16u))*0x7feb352du;v=(v^(v>>15u))*0x846ca68bu;v=v^(v>>16u);
 return f32(v>>8u)/16777216.0;
}
`
export const MACRO6_CAPILLARY_DITHER_PACK=MACRO5_CAPILLARY_SMOOTH_PACK.replace('@compute ',hash+'@compute ').replace('let value=moved+unpack(dryOriginal[i]);','if(all(moved==vec4f(0))){output[i]=dryOriginal[i];return;}let value=moved+unpack(dryOriginal[i]);').replace(anchor,'let randomThreshold=threshold(gid.x,gid.y,bitcast<u32>(weights[p.size*p.size]));let b=vec4u(floor(clamp(value,vec4f(0),vec4f(1))*255.0+vec4f(randomThreshold)));')
export function create(device:GPUDevice,size:number,config:CapillaryConfig={}):Promise<Candidate>{
 if(config.finePaperGain!==undefined&&config.finePaperGain!==0)throw Error('Smooth dither requires finePaperGain0')
 return createCapillary(device,size,{...config,finePaperGain:0},{source:MACRO6_CAPILLARY_DITHER_PACK,seedTail:true,reconstruction:'half-pixel bilinear + literal dryFixed; shared per-pixel deterministic stochastic rounding DISPLAY DITHER, physics unchanged'})
}
export const ditherCapillaryDefinitions=[{id:'wgsl-macro-dynamic-wetness-smooth-dither',label:'Динамическая акварель: контроль округления без колец',create,configs:[{grid:128,steps:96,finePaperGain:0},{grid:256,steps:96,finePaperGain:0}]}]
