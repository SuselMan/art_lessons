import {BUFFER,buffer,integerOption,pipeline,validateInput,type Candidate,type Input} from './contract'
import {initialMacro,MACRO_PACK,macroGrid,makeMacroIO,scalar} from './macro-common'
export interface DarcyConfig {grid?:number;steps?:number;flow?:number;mixing?:number;paperHead?:number;solutalPressure?:number;mobile?:number}
const COMMON=/* wgsl */`
struct Params {n:u32,flow:f32,mixing:f32,paperHead:f32,solutal:f32,pad0:f32,pad1:f32,pad2:f32}
const DIR=array<vec2i,4>(vec2i(-1,0),vec2i(1,0),vec2i(0,-1),vec2i(0,1));
const OPP=array<u32,4>(1u,0u,3u,2u);
fn inside(q:vec2i,n:u32)->bool{return all(q>=vec2i(0))&&all(q<vec2i(i32(n)));}
fn index(q:vec2i,n:u32)->u32{return u32(q.y)*n+u32(q.x);}
`
export const MACRO_DARCY_FLUX=COMMON+/* wgsl */`
@group(0) @binding(0) var<storage,read> colors:array<vec4f>;
@group(0) @binding(1) var<storage,read> water:array<f32>;
@group(0) @binding(2) var<storage,read> environment:array<vec2f>;
@group(0) @binding(3) var<storage,read_write> flux:array<vec4f>;
@group(0) @binding(4) var<uniform> p:Params;
fn head(i:u32)->f32{return water[i]+p.paperHead*environment[i].y+p.solutal*colors[i].a;}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let pos=vec2i(gid.xy);let i=index(pos,p.n);var value=vec4f(0);
 if(environment[i].x>0.0&&water[i]>0.0){for(var k=0u;k<4u;k++){let q=pos+DIR[k];if(inside(q,p.n)){let j=index(q,p.n);if(environment[j].x>0.0){let permeability=1.0/(1.0+2.0*max(environment[i].y,environment[j].y));value[k]=p.flow*permeability*max(0.0,head(i)-head(j));}}}}
 let total=dot(value,vec4f(1));if(total>water[i]&&total>0.0){value*=water[i]/total;}flux[i]=value;
}`
export const MACRO_DARCY_ADVECT=COMMON+/* wgsl */`
@group(0) @binding(0) var<storage,read> colors:array<vec4f>;
@group(0) @binding(1) var<storage,read> water:array<f32>;
@group(0) @binding(2) var<storage,read> flux:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> nextColor:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> nextWater:array<f32>;
@group(0) @binding(5) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let pos=vec2i(gid.xy);let i=index(pos,p.n);let outAmount=dot(flux[i],vec4f(1));
 var w=water[i]-outAmount;var c=colors[i]*(1.0-outAmount/max(water[i],0.000001));
 for(var k=0u;k<4u;k++){let q=pos+DIR[k];if(inside(q,p.n)){let j=index(q,p.n);let amount=flux[j][OPP[k]];w+=amount;c+=colors[j]*(amount/max(water[j],0.000001));}}
 nextWater[i]=max(w,0.0);nextColor[i]=max(c,vec4f(0));
}`
/** Separate Fick mixing of concentrations, with W-weighted pair-symmetric flux. */
export const MACRO_DARCY_MIX=COMMON+/* wgsl */`
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read> water:array<f32>;
@group(0) @binding(2) var<storage,read> environment:array<vec2f>;
@group(0) @binding(3) var<storage,read_write> dest:array<vec4f>;
@group(0) @binding(4) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let pos=vec2i(gid.xy);let i=index(pos,p.n);var value=source[i];
 if(environment[i].x>0.0&&water[i]>0.000001){for(var k=0u;k<4u;k++){let q=pos+DIR[k];if(inside(q,p.n)){let j=index(q,p.n);if(environment[j].x>0.0&&water[j]>0.000001){let conductance=p.mixing*min(water[i],water[j]);value+=conductance*(source[j]/water[j]-source[i]/water[i]);}}}}
 dest[i]=max(value,vec4f(0));
}`
/** Scalar independent CPU pair ledger for water + pigment conservation/positivity. */
export function darcyReference(mass:Float64Array,water:Float64Array,paper:Float64Array,n:number,flow:number,mixing:number,paperHead:number,solutal:number,domain:Uint8Array){
 const count=n*n,flux=new Float64Array(count*4),nextW=new Float64Array(count),advected=new Float64Array(count),result=new Float64Array(count),dx=[-1,1,0,0],dy=[0,0,-1,1],opposite=[1,0,3,2]
 const neighbor=(i:number,k:number)=>{const x=i%n+dx[k],y=Math.floor(i/n)+dy[k];return x<0||x>=n||y<0||y>=n?-1:y*n+x}
 for(let i=0;i<count;i++){if(!domain[i]||water[i]<=0)continue;let total=0;for(let k=0;k<4;k++){const j=neighbor(i,k);if(j<0||!domain[j])continue;const delta=water[i]-water[j]+paperHead*(paper[i]-paper[j])+solutal*(mass[i]-mass[j]);const q=flow*Math.max(0,delta)/(1+2*Math.max(paper[i],paper[j]));flux[i*4+k]=q;total+=q}if(total>water[i])for(let k=0;k<4;k++)flux[i*4+k]*=water[i]/total}
 for(let i=0;i<count;i++){let outgoing=0;for(let k=0;k<4;k++)outgoing+=flux[i*4+k];nextW[i]=water[i]-outgoing;advected[i]=mass[i]*(1-outgoing/Math.max(water[i],1e-6));for(let k=0;k<4;k++){const j=neighbor(i,k);if(j<0)continue;const q=flux[j*4+opposite[k]];nextW[i]+=q;advected[i]+=mass[j]*q/Math.max(water[j],1e-6)}}
 for(let i=0;i<count;i++){let v=advected[i];if(domain[i]&&nextW[i]>1e-6)for(let k=0;k<4;k++){const j=neighbor(i,k);if(j>=0&&domain[j]&&nextW[j]>1e-6)v+=mixing*Math.min(nextW[i],nextW[j])*(advected[j]/nextW[j]-advected[i]/nextW[i])}result[i]=Math.max(0,v)}
 return{mass:result,water:nextW}
}
export async function create(device:GPUDevice,size:number,config:DarcyConfig={}):Promise<Candidate>{
 const n=config.grid??128;macroGrid(size,n);const steps=integerOption(config.steps??128,1,512,'steps'),flow=scalar(config.flow??.2,0,.24,'flow'),mixing=scalar(config.mixing??.2,0,.24,'mixing'),paperHead=scalar(config.paperHead??.2,0,2,'paperHead'),solutal=scalar(config.solutalPressure??.5,0,4,'solutalPressure'),mobile=scalar(config.mobile??1,0,1,'mobile')
 if(device.limits.maxStorageBuffersPerShaderStage<5||device.limits.maxStorageBufferBindingSize<Math.max(size*size*4,n*n*16))throw Error('Macro Darcy limits insufficient')
 const fluxPass=await pipeline(device,MACRO_DARCY_FLUX,'805-macro-darcy-flux'),advectPass=await pipeline(device,MACRO_DARCY_ADVECT,'805-macro-darcy-advect'),mixPass=await pipeline(device,MACRO_DARCY_MIX,'805-macro-darcy-mix'),pack=await pipeline(device,MACRO_PACK,'805-macro-darcy-pack'),usage=BUFFER.STORAGE|BUFFER.COPY_DST
 const colors=[buffer(device,n*n*16,usage,'darcy-color-a'),buffer(device,n*n*16,usage,'darcy-color-b')],water=[buffer(device,n*n*4,usage,'darcy-water-a'),buffer(device,n*n*4,usage,'darcy-water-b')],flux=buffer(device,n*n*16,BUFFER.STORAGE,'darcy-flux'),environment=buffer(device,n*n*8,usage,'darcy-domain-paper'),params=buffer(device,32,BUFFER.UNIFORM|BUFFER.COPY_DST,'darcy-params'),raw=new ArrayBuffer(32)
 new Uint32Array(raw)[0]=n;new Float32Array(raw).set([flow,mixing,paperHead,solutal],1);device.queue.writeBuffer(params,0,raw)
 const bind=(p:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))})
 const fluxGroups=[0,1].map(i=>bind(fluxPass,[colors[0],water[i],environment,flux,params])),advectGroups=[0,1].map(i=>bind(advectPass,[colors[0],water[i],flux,colors[1],water[1-i],params])),mixGroups=[0,1].map(i=>bind(mixPass,[colors[1],water[1-i],environment,colors[0],params])),io=makeMacroIO(device,size,n,mobile,pack),packGroup=io.group(colors[0],environment),all=[...colors,...water,flux,environment,params,...io.all]
 let uploaded=false,hasOutput=false,destroyed=false
 return{metadata:Object.freeze({algorithm:'macro-darcy-water-pigment',grid:n,steps,flow,mixing,paperHead,solutalPressure:solutal,mobile,dispatches:steps*3+1,precision:'f32 conserved coarse carriers; RGBA8 final',coupling:'donor-limited Darcy water flux transports pigment concentration; separate symmetric concentration diffusion',limitations:'Phenomenological solutal pressure, not calibrated Navier-Stokes/MoXi; coarse reconstruction may lose details or alter full-resolution mass; static initial wet domain',seedUsed:false,featuresRequired:[]}),async upload(input:Input){if(destroyed)throw Error('Destroyed');validateInput(input,size);const initial=initialMacro(input,n),w=new Float32Array(n*n);for(let i=0;i<w.length;i++)w[i]=initial.environment[i*2];device.queue.writeBuffer(colors[0],0,initial.color);device.queue.writeBuffer(water[0],0,w);device.queue.writeBuffer(environment,0,initial.environment);io.upload(input);await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false},run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();for(let s=0;s<steps;s++){const i=s%2;pass.setPipeline(fluxPass);pass.setBindGroup(0,fluxGroups[i]);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8));pass.setPipeline(advectPass);pass.setBindGroup(0,advectGroups[i]);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8));pass.setPipeline(mixPass);pass.setBindGroup(0,mixGroups[i]);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8))}pass.setPipeline(pack);pass.setBindGroup(0,packGroup);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));pass.end();device.queue.submit([encoder.finish()]);hasOutput=true;return{buffer:io.output,width:size,height:size,bytesPerRow:size*4}},readback(){if(destroyed||!hasOutput)throw Error('No output');return io.readback()},destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
}
