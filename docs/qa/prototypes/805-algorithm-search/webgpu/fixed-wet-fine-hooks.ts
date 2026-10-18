import {initialFixedWet} from './fixed-wet-b-lite'
import {guardFixedWetPair} from './fixed-wet-coarse-hooks'
import type {Input} from './contract'
import type {FixedWetCoarseHooks} from './fixed-wet-coarse-hooks'
export interface FixedWetFineHooks extends FixedWetCoarseHooks {
 readonly prepareFine:(input:Input,finePaper:Uint8Array)=>{data:Uint32Array;boundaryCodesRGBA:number[]}
}
/** Raw mask and boundary carriers; never alter base input or derived affinity paper. */
export function prepareFixedWetFine(input:Input,finePaper:Uint8Array){
 const size=input.size,N=size*size;if(size!==1024||finePaper.length!==N)throw Error('Fixed fine input dimensions')
 const full=new Uint8Array(16384).fill(1),data=new Uint32Array(N*4),boundaryCodesRGBA=[0,0,0,0]
 for(let i=0;i<N;i++)if(input.water[i]===0)full[(Math.floor(i/size)>>3)*128+((i%size)>>3)]=0
 for(let i=0;i<N;i++){const kind=input.water[i]===0?0:full[(Math.floor(i/size)>>3)*128+((i%size)>>3)]?1:2;data[i*4]=finePaper[i];data[i*4+1]=(input.rgba[i*4]|input.rgba[i*4+1]<<8|input.rgba[i*4+2]<<16|input.rgba[i*4+3]<<24)>>>0;data[i*4+2]=kind;if(kind===2)for(let k=0;k<4;k++)boundaryCodesRGBA[k]+=input.rgba[i*4+k]*257}
 return{data,boundaryCodesRGBA}
}

/** Independent explicit options per factory call. Original CPU initializer is still executed (old/fast distinction). */
export function createFixedWetFineHooks():Readonly<FixedWetFineHooks>{return Object.freeze({initialize:initialFixedWet,transformPair:guardFixedWetPair,observePacking:()=>{},prepareFine:prepareFixedWetFine})}

export interface FixedWetFineOptions {readonly fixedWet?:FixedWetFineHooks}
