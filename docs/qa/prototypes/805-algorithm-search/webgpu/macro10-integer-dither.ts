import {create as createInteger,MACRO9_PACK,type IntegerSmoothOverrides} from './macro9-integer-smooth'
import type {Candidate} from './contract'
function replaceOnce(source:string,anchor:string,value:string){if(source.split(anchor).length!==2)throw Error('Integer dither source drift');return source.replace(anchor,value)}
export function integerDitherHash(x:number,y:number,seed:number){let v=(Math.imul(x,0x9e3779b9)^Math.imul(y,0x85ebca6b)^seed^805)>>>0;v=Math.imul(v^(v>>>16),0x7feb352d)>>>0;v=Math.imul(v^(v>>>15),0x846ca68b)>>>0;return(v^(v>>>16))>>>0}
export function integerStochasticRound(values:readonly number[],denominator:number,hash:number){if(!Number.isInteger(denominator)||denominator<1||!values.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff-denominator)||!Number.isInteger(hash)||hash<0||hash>0xffffffff)throw Error('Invalid integer rounding');const threshold=hash%denominator;return values.map(v=>Math.floor((v+threshold)/denominator))}
const HASH=`fn randomCode(x:u32,y:u32,seed:u32)->u32{var v=(x*0x9e3779b9u)^(y*0x85ebca6bu)^seed^805u;v=(v^(v>>16u))*0x7feb352du;v=(v^(v>>15u))*0x846ca68bu;return v^(v>>16u);}\n`
export const MACRO10_INTEGER_DITHER_PACK=replaceOnce(replaceOnce(replaceOnce(MACRO9_PACK,'@compute ',HASH+'@compute '),'b=((c.m+c.d)*255u+vec4u(32767u))/65535u+unpack(stationary[i]);','b=(c.m+c.d+vec4u(randomCode(gid.x,gid.y,p.phase)%257u))/257u+unpack(stationary[i]);'),'b=(total+vec4u(32896u))/65792u;','b=(total+vec4u(randomCode(gid.x,gid.y,p.phase)%65792u))/65792u;')
export function create(device:GPUDevice,size:number,config:Record<string,number>={},options:IntegerSmoothOverrides={}):Promise<Candidate>{
 if(options.packSourceOverride!==undefined||options.packSeed===false)throw Error('Integer dither owns pack source/seed')
 return createInteger(device,size,config,{...options,packSourceOverride:MACRO10_INTEGER_DITHER_PACK,packSeed:true})
}
export const integerDitherDefinitions=[{id:'wgsl-macro-integer-smooth-dither',label:'Целочисленная динамическая акварель: контроль округления',create,configs:[{steps:128,smooth:1},{steps:256,smooth:1},{steps:256,smooth:0}]}]
