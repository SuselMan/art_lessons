import type {Input} from './contract'
import {prepareFixedWetFloatInput} from './fixed-wet-float-tail'
import type {initialCapillary} from './macro4-capillary'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Fixed capillary source drift');return s.replace(a,b)}
export function fixedCapillaryFlux(source:string){return once(once(source,'if(water[i].x>p.threshold){','if(water[i].x>p.threshold&&environment[i].x>0.0){'),'let j=index(q,p.n);let permeability=','let j=index(q,p.n);if(environment[j].x<=0.0){continue;}let permeability=')}
export function fixedCapillaryMix(source:string){return once(once(once(source,'@compute ','@group(0) @binding(4) var<storage,read> environment:array<vec2f>;\n@compute '),'if(a>p.threshold){','if(a>p.threshold&&environment[i].x>0.0){'),'if(b>p.threshold){','if(b>p.threshold&&environment[j].x>0.0){')}
/** Negative capacity is a source-internal immutable wall marker; inactive local absorb becomes zero. Water is not erased. */
export function partitionFixedCapillary(initial:ReturnType<typeof initialCapillary>,input:Input,n:number){const partition=prepareFixedWetFloatInput(input,n);for(let i=0;i<n*n;i++)if(!partition.full[i]){initial.mobile.fill(0,i*4,i*4+4);initial.environment[i*2]=-Math.abs(initial.environment[i*2])}return partition}
/** Fixed-policy capacity: accepted WATER flux carries all RGBA; rejected flow stays donor.
 * Receiver budget uses OLD M+D, never speculative outgoing capacity credit. */
export function fixedCapillaryCapacityFlux(source:string){
 let s=fixedCapillaryFlux(source)
 s=once(s,'@compute ',`@group(0) @binding(4) var<storage,read> mobile:array<vec4f>;
@group(0) @binding(5) var<storage,read> deposited:array<vec4f>;
fn proposed(i:u32)->vec4f{var f=vec4f(0);let pos=vec2i(i32(i%p.n),i32(i/p.n));if(water[i].x>p.threshold&&environment[i].x>0.0){for(var k=0u;k<4u;k++){let q=pos+DIR[k];if(valid(q,p.n)){let j=index(q,p.n);if(environment[j].x<=0.0){continue;}let permeability=0.15+0.85*(1.0-max(environment[i].y,environment[j].y));f[k]=p.flow*permeability*max(0.0,head(i)-head(j));}}}let total=dot(f,vec4f(1));if(total>water[i].x&&total>0.0){f*=water[i].x/total;}return f;}
fn incomingAlpha(i:u32)->f32{let pos=vec2i(i32(i%p.n),i32(i/p.n));var sum=0.0;for(var k=0u;k<4u;k++){let q=pos+DIR[k];if(valid(q,p.n)){let j=index(q,p.n);sum+=proposed(j)[OPP[k]]*mobile[j].a/max(water[j].x,0.0000001);}}return sum;}
@compute `)
 return once(s,'flux[i]=f;','for(var k=0u;k<4u;k++){let q=pos+DIR[k];if(valid(q,p.n)&&f[k]>0.0){let j=index(q,p.n);let incoming=incomingAlpha(j);if(incoming>0.0){f[k]*=min(1.0,max(0.0,1.0-mobile[j].a-deposited[j].a)/incoming);}}}flux[i]=f;')
}
export function fixedCapillaryCapacityMix(source:string){
 let s=fixedCapillaryMix(source)
 s=once(s,'@compute ',`@group(0) @binding(5) var<storage,read> deposited:array<vec4f>;
fn incomingMixAlpha(i:u32)->f32{let a=water[i].x;if(a<=p.threshold||environment[i].x<=0.0){return 0.0;}let pos=vec2i(i32(i%p.n),i32(i/p.n));var incoming=0.0;for(var k=0u;k<4u;k++){let q=pos+DIR[k];if(valid(q,p.n)){let j=index(q,p.n);let b=water[j].x;if(b>p.threshold&&environment[j].x>0.0){incoming+=max(0.0,p.mixing*min(a,b)*(source[j].a/b-source[i].a/a));}}}return incoming;}
fn mixAccept(i:u32)->f32{let incoming=incomingMixAlpha(i);if(incoming<=0.0){return 1.0;}return min(1.0,max(0.0,1.0-source[i].a-deposited[i].a)/incoming);}
@compute `)
 return once(s,'m+=p.mixing*min(a,b)*(source[j]/b-source[i]/a);','let delta=p.mixing*min(a,b)*(source[j]/b-source[i]/a);var accept=1.0;if(delta.a>0.0){accept=mixAccept(i);}else if(delta.a<0.0){accept=mixAccept(j);}m+=accept*delta;')
}
