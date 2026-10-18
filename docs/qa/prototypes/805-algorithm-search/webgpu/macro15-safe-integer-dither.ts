import {MACRO10_INTEGER_DITHER_PACK} from './macro10-integer-dither'
import {create as createBase,type IntegerSmoothOverrides} from './macro9-integer-smooth'
import type {Candidate} from './contract'
export function mod257ByteFold(n:number){if(!Number.isInteger(n)||n<0||n>0xffffffff)throw Error('Expected u32');let r=(n&255)+((n>>>16)&255)+514-((n>>>8)&255)-(n>>>24);if(r>=257)r-=257;if(r>=257)r-=257;if(r>=257)r-=257;return r}
export function mod65792ByteFold(n:number){if(!Number.isInteger(n)||n<0||n>0xffffffff)throw Error('Expected u32');return mod257ByteFold(n>>>8)*256+(n&255)}
/** Exact arithmetic: 256 == -1 (mod257); intermediate range4..1024. No division/remainder instructions. */
export const SAFE_REMAINDER_WGSL=`
fn mod257ByteFold(n:u32)->u32{
 var r=(n&255u)+((n>>16u)&255u)+514u-((n>>8u)&255u)-(n>>24u);
 if(r>=257u){r-=257u;}if(r>=257u){r-=257u;}if(r>=257u){r-=257u;}return r;
}
fn mod65792ByteFold(n:u32)->u32{return (mod257ByteFold(n>>8u)<<8u)+(n&255u);}
`
function once(source:string,anchor:string,value:string){if(source.split(anchor).length!==2)throw Error('Safe dither source drift');return source.replace(anchor,value)}
export const MACRO15_SAFE_INTEGER_DITHER_PACK=once(once(once(MACRO10_INTEGER_DITHER_PACK,'@compute ',SAFE_REMAINDER_WGSL+'@compute '),'randomCode(gid.x,gid.y,p.phase)%257u','mod257ByteFold(randomCode(gid.x,gid.y,p.phase))'),'randomCode(gid.x,gid.y,p.phase)%65792u','mod65792ByteFold(randomCode(gid.x,gid.y,p.phase))')
export function create(device:GPUDevice,size:number,config:Record<string,number>={},options:IntegerSmoothOverrides={}):Promise<Candidate>{
 if(options.packSourceOverride!==undefined||options.packSeed===false)throw Error('Safe dither owns pack source andseed')
 return createBase(device,size,config,{...options,packSourceOverride:MACRO15_SAFE_INTEGER_DITHER_PACK,packSeed:true})
}
export const safeIntegerDitherDefinitions=[{id:'wgsl-macro-integer-smooth-safe-dither',label:'Целочисленная динамика: точное безопасное округление',create,configs:[{steps:128,smooth:1},{steps:256,smooth:1},{steps:256,smooth:0}]}]
