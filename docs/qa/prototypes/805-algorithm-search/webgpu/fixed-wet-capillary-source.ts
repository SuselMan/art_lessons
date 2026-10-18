import type {Input} from './contract'
import {prepareFixedWetFloatInput} from './fixed-wet-float-tail'
import type {initialCapillary} from './macro4-capillary'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Fixed capillary source drift');return s.replace(a,b)}
export function fixedCapillaryFlux(source:string){return once(once(source,'if(water[i].x>p.threshold){','if(water[i].x>p.threshold&&environment[i].x>0.0){'),'let j=index(q,p.n);let permeability=','let j=index(q,p.n);if(environment[j].x<=0.0){continue;}let permeability=')}
export function fixedCapillaryMix(source:string){return once(once(once(source,'@compute ','@group(0) @binding(4) var<storage,read> environment:array<vec2f>;\n@compute '),'if(a>p.threshold){','if(a>p.threshold&&environment[i].x>0.0){'),'if(b>p.threshold){','if(b>p.threshold&&environment[j].x>0.0){')}
/** Negative capacity is a source-internal immutable wall marker; inactive local absorb becomes zero. Water is not erased. */
export function partitionFixedCapillary(initial:ReturnType<typeof initialCapillary>,input:Input,n:number){const partition=prepareFixedWetFloatInput(input,n);for(let i=0;i<n*n;i++)if(!partition.full[i]){initial.mobile.fill(0,i*4,i*4+4);initial.environment[i*2]=-Math.abs(initial.environment[i*2])}return partition}
