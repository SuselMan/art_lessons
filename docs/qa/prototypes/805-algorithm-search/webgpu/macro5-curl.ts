import {BUFFER,buffer,integerOption,packedRGBA,pipeline,readPacked,validateInput,type Candidate,type Input} from './contract'
import {initialMacro,macroGrid} from './macro-common'
import {buildCurlField,type CurlFieldConfig} from './macro4-curl-field'
export interface CurlConfig extends CurlFieldConfig {grid?:number;steps?:number}
const PARAMS=/* wgsl */`struct Params{n:u32,size:u32,mixing:f32,pad:f32}`
export const MACRO5_CURL=PARAMS+/* wgsl */`
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dest:array<vec4f>;
@group(0) @binding(2) var<storage,read> velocity:array<vec4f>;
@group(0) @binding(3) var<storage,read> environment:array<vec2f>;
@group(0) @binding(4) var<uniform> p:Params;
const DIR=array<vec2i,4>(vec2i(-1,0),vec2i(1,0),vec2i(0,-1),vec2i(0,1));
const OPP=array<u32,4>(1u,0u,3u,2u);
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let i=gid.y*p.n+gid.x;
 if(environment[i].x<=0.0){dest[i]=source[i];return;}
 var outgoing=0.0;var incoming=vec4f(0);
 for(var k=0u;k<4u;k++){outgoing+=velocity[i][k];let q=vec2i(gid.xy)+DIR[k];
 if(all(q>=vec2i(0))&&all(q<vec2i(i32(p.n)))){let j=u32(q.y)*p.n+u32(q.x);incoming+=source[j]*velocity[j][OPP[k]];
 if(environment[j].x>0.0){let diffusion=p.mixing*min(environment[i].x,environment[j].x);outgoing+=diffusion;incoming+=source[j]*diffusion;}}}
 dest[i]=source[i]*(1.0-outgoing)+incoming;
}`
/** Nearest-cell conservative reconstruction: no fine amplification or hidden clamp correction. */
export const MACRO5_PACK=PARAMS+/* wgsl */`
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read> environment:array<vec2f>;
@group(0) @binding(2) var<storage,read> original:array<u32>;
@group(0) @binding(3) var<storage,read_write> output:array<u32>;
@group(0) @binding(4) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;let q=gid.xy*p.n/p.size;let j=q.y*p.n+q.x;
 if(environment[j].x<=0.0){output[i]=original[i];return;}
 let value=vec4u(floor(clamp(source[j],vec4f(0),vec4f(1))*255.0+vec4f(.5)));
 output[i]=value.r|(value.g<<8u)|(value.b<<16u)|(value.a<<24u);
}`
export async function create(device:GPUDevice,size:number,config:CurlConfig={}):Promise<Candidate>{
 const n=config.grid??256;macroGrid(size,n);const steps=integerOption(config.steps??64,1,128,'steps'),mixing=config.mixing??.02
 // Validate all scalar settings before GPU allocations, including CFL sum.
 buildCurlField(new Float32Array(n*n*2),n,size,0,config)
 if(device.limits.maxStorageBuffersPerShaderStage<4||device.limits.maxStorageBufferBindingSize<size*size*4)throw Error('Curl device limits insufficient')
 const flow=await pipeline(device,MACRO5_CURL,'805-macro5-discrete-curl'),pack=await pipeline(device,MACRO5_PACK,'805-macro5-nearest-pack'),usage=BUFFER.STORAGE|BUFFER.COPY_DST
 const states=[buffer(device,n*n*16,usage,'curl-a'),buffer(device,n*n*16,usage,'curl-b')],environment=buffer(device,n*n*8,usage,'curl-domain'),velocity=buffer(device,n*n*16,usage,'curl-outgoing'),original=buffer(device,size*size*4,usage,'curl-original'),output=buffer(device,size*size*4,BUFFER.STORAGE|BUFFER.COPY_SRC,'curl-output'),staging=buffer(device,size*size*4,BUFFER.MAP_READ|BUFFER.COPY_DST,'curl-readback'),params=buffer(device,16,BUFFER.UNIFORM|BUFFER.COPY_DST,'curl-params')
 const raw=new ArrayBuffer(16);new Uint32Array(raw).set([n,size]);new Float32Array(raw)[2]=mixing;device.queue.writeBuffer(params,0,raw)
 const bind=(program:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:program.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))}),groups=[0,1].map(i=>bind(flow,[states[i],states[1-i],velocity,environment,params])),packGroup=bind(pack,[states[steps%2],environment,original,output,params]),all=[...states,environment,velocity,original,output,staging,params]
 let uploaded=false,hasOutput=false,destroyed=false,fieldMetadata:Record<string,unknown>|null=null
 return{get metadata(){return{algorithm:'discrete-divergence-free-artistic-curl',wetDomain:'static',grid:n,steps,mixing,dispatches:steps+1,field:fieldMetadata,seedUsed:(config.noiseStrength??1)>0,reconstruction:'nearest coarse cell; exact per-cell mass before f32/byte rounding; no amplified paper weights',allocatedGPUBytes:all.reduce((s,b)=>s+b.size,0),limitations:'Artistic streamfunction, NOT Navier-Stokes. Initial dry domain is fixed. Coarse blocks and numerical donor-cell diffusion remain. Paper-only flat null control has zero advection; mixing is separately configured.',featuresRequired:[]}},async upload(input:Input){
 if(destroyed)throw Error('Destroyed');validateInput(input,size);const initial=initialMacro(input,n),field=buildCurlField(initial.environment,n,size,input.seed,config);fieldMetadata=field.diagnostics
 device.queue.writeBuffer(states[0],0,initial.color);device.queue.writeBuffer(environment,0,initial.environment);device.queue.writeBuffer(velocity,0,field.outgoing);device.queue.writeBuffer(original,0,packedRGBA(input.rgba));await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false
 },run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(flow);for(let s=0;s<steps;s++){pass.setBindGroup(0,groups[s%2]);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8))}pass.setPipeline(pack);pass.setBindGroup(0,packGroup);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));pass.end();device.queue.submit([encoder.finish()]);hasOutput=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},readback(){if(destroyed||!hasOutput)throw Error('No output');return readPacked(device,output,size,staging)},destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
}
export const curlDefinitions=[{id:'wgsl-macro-artistic-curl',label:'Консервативный бумажный вихревой перенос',create,configs:[
 {grid:256,steps:64,paperStrength:8,noiseStrength:1,scalePixels:128,cfl:.65,mixing:.02},
 {grid:256,steps:96,paperStrength:8,noiseStrength:0,scalePixels:96,cfl:.65,mixing:.02},
 {grid:128,steps:64,paperStrength:8,noiseStrength:1,scalePixels:160,cfl:.65,mixing:.02},
 {grid:256,steps:64,paperStrength:8,noiseStrength:0,scalePixels:128,cfl:.65,mixing:0}
]}]
