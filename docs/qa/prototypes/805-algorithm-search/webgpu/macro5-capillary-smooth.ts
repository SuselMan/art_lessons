import {create as createCapillary,MACRO4_CAPILLARY_PACK,type CapillaryConfig} from './macro4-capillary'
import type {Candidate} from './contract'
const oldMain=MACRO4_CAPILLARY_PACK.indexOf('@compute ')
if(oldMain<0)throw Error('Missing dynamic pack main')
/** Half-pixel bilinear coarse means, clamp at sheet edge; all seven baseline bindings remain actually used. */
export const MACRO5_CAPILLARY_SMOOTH_PACK=MACRO4_CAPILLARY_PACK.slice(0,oldMain)+/* wgsl */`
fn coarse(q:vec2i)->vec4f{let c=clamp(q,vec2i(0),vec2i(i32(p.n)-1));let j=u32(c.y)*p.n+u32(c.x);return mobile[j]+deposited[j];}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;
 // CPU upload's finePaperGain=0 must give exact unit weights. Preserve binding and fail the existing guard if violated.
 if(weights[i]!=1.0){atomicAdd(&guard[0],1u);output[i]=dryOriginal[i];return;}
 let pos=(vec2f(gid.xy)+vec2f(.5))*f32(p.n)/f32(p.size)-vec2f(.5);
 let base=vec2i(floor(pos));let t=pos-floor(pos);
 let moved=mix(mix(coarse(base),coarse(base+vec2i(1,0)),t.x),mix(coarse(base+vec2i(0,1)),coarse(base+vec2i(1,1)),t.x),t.y);
 let value=moved+unpack(dryOriginal[i]);
 if(any(value>vec4f(1))){atomicAdd(&guard[0],1u);}if(any(value<vec4f(0))){atomicAdd(&guard[1],1u);}
 let b=vec4u(floor(clamp(value,vec4f(0),vec4f(1))*255.0+vec4f(.5)));
 output[i]=b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u);
}`
export function create(device:GPUDevice,size:number,config:CapillaryConfig={},policy:{readonly fixedInitialWet?:boolean}={}):Promise<Candidate>{
 if(config.finePaperGain!==undefined&&config.finePaperGain!==0)throw Error('Smooth reconstruction requires finePaperGain0')
 return createCapillary(device,size,{...config,finePaperGain:0},{source:MACRO5_CAPILLARY_SMOOTH_PACK,reconstruction:'half-pixel bilinear clamp coarse means + separate literal initial-dry pigment; no fine paper weights'},policy)
}
export const smoothCapillaryDefinitions=[{id:'wgsl-macro-dynamic-wetness-smooth',label:'Динамическое смачивание без блочной реконструкции',create,configs:[
 {grid:128,steps:96,finePaperGain:0},
 {grid:256,steps:96,finePaperGain:0},
 {grid:128,steps:256,finePaperGain:0}
]}]
