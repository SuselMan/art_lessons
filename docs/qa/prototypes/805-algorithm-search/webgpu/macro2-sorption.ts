import {BUFFER,buffer,integerOption,pipeline,validateInput,type Candidate,type Input} from './contract'
import {initialMacro,MACRO_PACK,macroGrid,makeMacroIO,scalar} from './macro-common'
import {MACRO_IMPLICIT} from './macro-implicit'
export interface SorptionConfig {grid?:number;cycles?:number;sigma?:number;paperDrag?:number;capacityGain?:number;deposition?:number;desorption?:number;edgeGain?:number;mobile?:number}
function once(source:string,anchor:string,replacement:string){if(source.split(anchor).length!==2)throw Error('Macro2 frozen implicit anchor mismatch');return source.replace(anchor,replacement)}
/** Same positive Thomas solve, new physical capacity; strict frozen-source dependency. */
export const MACRO2_IMPLICIT=once(once(MACRO_IMPLICIT,
 'concentration:u32,pad0:u32,pad1:u32,pad2:u32','capacityGain:f32,deposition:f32,desorption:f32,edgeGain:f32'),
 'fn capacity(i:u32)->f32{if(p.concentration==0u){return 1.0;}return max(environment[i].x,0.0001);}',
 'fn capacity(i:u32)->f32{return max(environment[i].x,0.0001)*(1.0+p.capacityGain*(1.0-environment[i].y));}')
export const MACRO2_REACTION=/* wgsl */`
struct Params {n:u32,axis:u32,lambda:f32,paperDrag:f32,capacityGain:f32,deposition:f32,desorption:f32,edgeGain:f32}
@group(0) @binding(0) var<storage,read_write> mobile:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> fixedPigment:array<vec4f>;
@group(0) @binding(2) var<storage,read> environment:array<vec2f>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let i=gid.y*p.n+gid.x;let e=environment[i];if(e.x<=0.0){return;}
 let depositRate=clamp(p.deposition*(0.15+0.85*(1.0-e.y))*(1.0+p.edgeGain*(1.0-e.x)),0.0,0.95);
 let liftRate=clamp(p.desorption*e.x,0.0,1.0);let m=mobile[i];let f=fixedPigment[i];
 let moved=depositRate*m-liftRate*f;mobile[i]=m-moved;fixedPigment[i]=f+moved;
}`
export const MACRO2_SUM=/* wgsl */`
struct Params {n:u32,axis:u32,lambda:f32,paperDrag:f32,capacityGain:f32,deposition:f32,desorption:f32,edgeGain:f32}
@group(0) @binding(0) var<storage,read> mobile:array<vec4f>;
@group(0) @binding(1) var<storage,read> fixedPigment:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> total:array<vec4f>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){if(any(gid.xy>=vec2u(p.n))){return;}let i=gid.y*p.n+gid.x;total[i]=mobile[i]+fixedPigment[i];}`
export function sorptionExchange(mobile:number,fixed:number,wet:number,paper:number,deposition:number,desorption:number,edgeGain:number){
 if(wet<=0)return{mobile,fixed};const a=Math.max(0,Math.min(.95,deposition*(.15+.85*(1-paper))*(1+edgeGain*(1-wet)))),b=Math.max(0,Math.min(1,desorption*wet)),moved=a*mobile-b*fixed;return{mobile:mobile-moved,fixed:fixed+moved}
}
export async function create(device:GPUDevice,size:number,config:SorptionConfig={}):Promise<Candidate>{
 const n=config.grid??256;macroGrid(size,n);const cycles=integerOption(config.cycles??6,1,12,'cycles'),sigma=scalar(config.sigma??112,0,240,'sigma'),paperDrag=scalar(config.paperDrag??.5,0,8,'paperDrag'),capacityGain=scalar(config.capacityGain??2,0,8,'capacityGain'),deposition=scalar(config.deposition??.08,0,.8,'deposition'),desorption=scalar(config.desorption??.01,0,.8,'desorption'),edgeGain=scalar(config.edgeGain??2,0,8,'edgeGain'),mobile=scalar(config.mobile??.9,0,1,'mobile'),lambda=(sigma*n/size)**2/(2*cycles),vecBytes=n*n*16
 if(device.limits.maxStorageBuffersPerShaderStage<5||device.limits.maxStorageBufferBindingSize<Math.max(vecBytes,size*size*4))throw Error('Macro sorption limits insufficient')
 const solve=await pipeline(device,MACRO2_IMPLICIT,'805-macro2-sorption-solve'),reaction=await pipeline(device,MACRO2_REACTION,'805-macro2-sorption-exchange'),sum=await pipeline(device,MACRO2_SUM,'805-macro2-sorption-sum'),pack=await pipeline(device,MACRO_PACK,'805-macro2-sorption-pack'),usage=BUFFER.STORAGE|BUFFER.COPY_DST
 const colors=[buffer(device,vecBytes,usage,'sorption-mobile-a'),buffer(device,vecBytes,usage,'sorption-mobile-b')],fixed=buffer(device,vecBytes,usage,'sorption-fixed'),environment=buffer(device,n*n*8,usage,'sorption-environment'),cp=buffer(device,n*n*4,BUFFER.STORAGE,'sorption-cprime'),dp=buffer(device,vecBytes,BUFFER.STORAGE,'sorption-dprime'),parameters=[0,1].map(axis=>{const b=buffer(device,32,BUFFER.UNIFORM|BUFFER.COPY_DST,'sorption-params'),raw=new ArrayBuffer(32);new Uint32Array(raw).set([n,axis]);new Float32Array(raw).set([lambda,paperDrag,capacityGain,deposition,desorption,edgeGain],2);device.queue.writeBuffer(b,0,raw);return b})
 const bind=(p:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))}),solveGroups=parameters.map((p,axis)=>bind(solve,[colors[axis],colors[1-axis],environment,cp,dp,p])),reactionGroup=bind(reaction,[colors[0],fixed,environment,parameters[0]]),sumGroup=bind(sum,[colors[0],fixed,colors[1],parameters[0]]),io=makeMacroIO(device,size,n,mobile,pack),packGroup=io.group(colors[1],environment),all=[...colors,fixed,environment,cp,dp,...parameters,...io.all]
 let uploaded=false,hasOutput=false,destroyed=false
 return{metadata:Object.freeze({algorithm:'macro-implicit-capacity-sorption',grid:n,cycles,sigmaFinePixels:sigma,lambda,paperDrag,capacityGain,deposition,desorption,edgeGain,mobile,dispatches:3*cycles+2,transport:'positive implicit concentration diffusion with paper-dependent capacity',depositionModel:'conservative reversible mobile/fixed exchange; paper valleys and lower-water cells increase fixation',limitations:'Phenomenological material settings; no universal pigment calibration; coarse reconstruction and RGBA8 saturation still require mass checks',seedUsed:false,featuresRequired:[]}),async upload(input:Input){if(destroyed)throw Error('Destroyed');validateInput(input,size);const initial=initialMacro(input,n);device.queue.writeBuffer(colors[0],0,initial.color);device.queue.writeBuffer(fixed,0,new Float32Array(n*n*4));device.queue.writeBuffer(environment,0,initial.environment);io.upload(input);await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false},run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();for(let c=0;c<cycles;c++){for(let axis=0;axis<2;axis++){pass.setPipeline(solve);pass.setBindGroup(0,solveGroups[axis]);pass.dispatchWorkgroups(Math.ceil(n/32))}pass.setPipeline(reaction);pass.setBindGroup(0,reactionGroup);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8))}pass.setPipeline(sum);pass.setBindGroup(0,sumGroup);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8));pass.setPipeline(pack);pass.setBindGroup(0,packGroup);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));pass.end();device.queue.submit([encoder.finish()]);hasOutput=true;return{buffer:io.output,width:size,height:size,bytesPerRow:size*4}},readback(){if(destroyed||!hasOutput)throw Error('No output');return io.readback()},destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
}
export const macro2Definitions=[{id:'wgsl-macro-implicit-sorption',label:'Перенос с бумажной ёмкостью и осаждением',create,configs:[
 {grid:256,cycles:6,sigma:112,paperDrag:.5,capacityGain:2,deposition:.08,desorption:.01,edgeGain:2,mobile:.9},
 {grid:128,cycles:8,sigma:160,paperDrag:.25,capacityGain:1,deposition:.04,desorption:.01,edgeGain:2,mobile:.95},
 {grid:256,cycles:4,sigma:96,paperDrag:.5,capacityGain:0,deposition:0,desorption:0,edgeGain:0,mobile:1}
]}]
