import type {AlgorithmConfig} from '../protocol'
import type {Candidate} from './contract'
import {create as diffusion} from './diffusion'
import {create as lbm} from './lbm'
import {create as glDiffusion} from './gl-diffusion'
export interface Definition {id:string;label:string;configs:AlgorithmConfig[];create(device:GPUDevice,size:number,config:AlgorithmConfig):Promise<Candidate>}
export const definitions:Definition[]=[
 {id:'wgsl-integer-diffusion-direct',label:'WebGPU: local integer diffusion',configs:[{iterations:32,rate:24}],create:(d,s,c)=>diffusion(d,s,{...c,tiled:false})},
 {id:'wgsl-integer-diffusion-tiled4',label:'WebGPU: same local diffusion, four shared-memory steps',configs:[{iterations:32,rate:24}],create:(d,s,c)=>diffusion(d,s,{...c,tiled:true})},
 {id:'wgsl-d2q9-bgk',label:'WebGPU: D2Q9 fluid with pigment/water tracers',configs:[{grid:256,steps:48},{grid:512,steps:48}],create:lbm},
]
export const glDefinitions=[{id:'gl-integer-diffusion-match',label:'GL1: matched local integer diffusion',configs:[{iterations:32,rate:24}],create:glDiffusion}]
