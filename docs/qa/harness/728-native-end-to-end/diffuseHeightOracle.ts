import type {Stage} from './stages'
import {lazyFrontOracle} from './lazyFrontOracle'
import {WET_DIFFUSE_D,WET_DIFFUSE_B} from '../../../../apps/web/src/engine/src/watercolor/wetDiffusion'
export async function diffuseHeightOracle(stages:Stage[],metadata:unknown,paper:Uint8Array,side:number){
 const m=metadata as {x0:number;y0:number;scale:number;preparedRadius:number;knight:boolean;paper:[number,number]};if(!m)throw new Error('Actual diffusion metadata absent')
 const get=(key:string)=>{const s=stages.find(s=>s.key===key);if(!s)throw new Error('Missing actual diffusion snapshot '+key);return s}
 return lazyFrontOracle(get('first:diffuseInput'),get('first:diffuseGate'),paper,side,{x0:m.x0,y0:m.y0,scale:m.scale,dryCost:1,max:64,climb:0,floor:0,stride:m.preparedRadius},171,'diffuseHeight',{radius:m.preparedRadius,knight:m.knight,d:WET_DIFFUSE_D,b:WET_DIFFUSE_B,paperWidth:m.paper[0],paperHeight:m.paper[1]})
}
