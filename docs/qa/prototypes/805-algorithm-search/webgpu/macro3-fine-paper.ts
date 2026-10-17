import {BUFFER,buffer,integerOption,packedRGBA,pipeline,readPacked,validateInput,type Candidate,type Input} from './contract'
import {initialMacro,macroGrid,scalar} from './macro-common'
import {MACRO_IMPLICIT} from './macro-implicit'
export interface FinePaperConfig {grid?:number;cycles?:number;sigma?:number;paperDrag?:number;paperGain?:number;fineSteps?:number;fineRate?:number}
/** data.xy = positive fine capacity, normalized cell weight. Sum weights=cellarea before f32 rounding. */
export function finePaperWeights(input:Input,n:number,paperGain:number,environment:Float32Array){
 const ratio=input.size/n,area=ratio*ratio,data=new Float32Array(input.size*input.size*2)
 if(!Number.isInteger(ratio)||!Number.isFinite(paperGain)||paperGain<0||paperGain>8)throw Error('Invalid fine capacity')
 for(let cy=0;cy<n;cy++)for(let cx=0;cx<n;cx++){
  if(environment[(cy*n+cx)*2]<=0)continue;let total=0
  for(let dy=0;dy<ratio;dy++)for(let dx=0;dx<ratio;dx++){const i=(cy*ratio+dy)*input.size+cx*ratio+dx;const capacity=input.water[i]/255*(.5+paperGain*(1-input.paper[i]/255));data[i*2]=capacity;total+=capacity}
  if(!(total>0))throw Error('Admitted cell has no fine capacity')
  // Use exact same stored f32 capacities for normalization, not a second differently-rounded evaluation.
  let storedSum=0;for(let dy=0;dy<ratio;dy++)for(let dx=0;dx<ratio;dx++)storedSum+=data[((cy*ratio+dy)*input.size+cx*ratio+dx)*2]
  for(let dy=0;dy<ratio;dy++)for(let dx=0;dx<ratio;dx++){const i=(cy*ratio+dy)*input.size+cx*ratio+dx;data[i*2+1]=data[i*2]*area/storedSum}
 }return data
}
const PARAMS=/* wgsl */`struct Params {n:u32,size:u32,rate:f32,pad:f32}`
export const MACRO3_FINE_INIT=PARAMS+/* wgsl */`
@group(0) @binding(0) var<storage,read> coarse:array<vec4f>;
@group(0) @binding(1) var<storage,read> capacity:array<vec2f>;
@group(0) @binding(2) var<storage,read> original:array<u32>;
@group(0) @binding(3) var<storage,read_write> dest:array<vec4f>;
@group(0) @binding(4) var<uniform> p:Params;
fn unpack(v:u32)->vec4f{return vec4f(f32(v&255u),f32((v>>8u)&255u),f32((v>>16u)&255u),f32(v>>24u))/255.0;}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;let cell=gid.xy*p.n/p.size;if(capacity[i].x<=0.0){dest[i]=unpack(original[i]);return;}dest[i]=coarse[cell.y*p.n+cell.x]*capacity[i].y;}`
export const MACRO3_FINE_FLOW=PARAMS+/* wgsl */`
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dest:array<vec4f>;
@group(0) @binding(2) var<storage,read> capacity:array<vec2f>;
@group(0) @binding(3) var<uniform> p:Params;
const DIR=array<vec2i,4>(vec2i(-1,0),vec2i(1,0),vec2i(0,-1),vec2i(0,1));
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;let a=capacity[i].x;var value=source[i];if(a>0.0){for(var k=0u;k<4u;k++){let q=vec2i(gid.xy)+DIR[k];if(all(q>=vec2i(0))&&all(q<vec2i(i32(p.size)))){let j=u32(q.y)*p.size+u32(q.x);let b=capacity[j].x;if(b>0.0){value+=p.rate*min(a,b)*(source[j]/b-source[i]/a);}}}}dest[i]=value;
}`
export const MACRO3_FINE_PACK=PARAMS+/* wgsl */`
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read> original:array<u32>;
@group(0) @binding(2) var<storage,read> capacity:array<vec2f>;
@group(0) @binding(3) var<storage,read_write> output:array<u32>;
@group(0) @binding(4) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;if(capacity[i].x<=0.0){output[i]=original[i];return;}let b=vec4u(floor(clamp(source[i],vec4f(0),vec4f(1))*255.0+vec4f(.5)));output[i]=b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u);}`
export function fineCapacityStep(source:Float64Array,capacity:Float64Array,size:number,rate:number){
 if(!(rate>=0&&rate<=.24)||source.length!==size*size||capacity.length!==source.length)throw Error('Invalid fine step')
 const dest=source.slice(),dirs=[[-1,0],[1,0],[0,-1],[0,1]]
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x,a=capacity[i];if(a<=0)continue;for(const [dx,dy]of dirs){const xx=x+dx,yy=y+dy;if(xx<0||xx>=size||yy<0||yy>=size)continue;const j=yy*size+xx,b=capacity[j];if(b>0)dest[i]+=rate*Math.min(a,b)*(source[j]/b-source[i]/a)}}return dest
}
export async function create(device:GPUDevice,size:number,config:FinePaperConfig={}):Promise<Candidate>{
 const n=config.grid??256;macroGrid(size,n);const cycles=integerOption(config.cycles??3,1,8,'cycles'),sigma=scalar(config.sigma??96,0,240,'sigma'),paperDrag=scalar(config.paperDrag??.5,0,8,'paperDrag'),paperGain=scalar(config.paperGain??2,0,8,'paperGain'),fineSteps=integerOption(config.fineSteps??8,0,16,'fineSteps'),fineRate=scalar(config.fineRate??.2,0,.24,'fineRate'),lambda=(sigma*n/size)**2/(2*cycles)
 if(device.limits.maxStorageBuffersPerShaderStage<5||device.limits.maxStorageBufferBindingSize<size*size*16)throw Error('Fine paper device limits insufficient')
 const solve=await pipeline(device,MACRO_IMPLICIT,'805-macro3-fine-coarse-solve'),init=await pipeline(device,MACRO3_FINE_INIT,'805-macro3-fine-reconstruct'),flow=await pipeline(device,MACRO3_FINE_FLOW,'805-macro3-fine-capacity-flow'),pack=await pipeline(device,MACRO3_FINE_PACK,'805-macro3-fine-pack'),usage=BUFFER.STORAGE|BUFFER.COPY_DST
 const coarse=[buffer(device,n*n*16,usage,'fine-coarse-a'),buffer(device,n*n*16,usage,'fine-coarse-b')],environment=buffer(device,n*n*8,usage,'fine-coarse-domain'),cp=buffer(device,n*n*4,BUFFER.STORAGE,'fine-cprime'),dp=buffer(device,n*n*16,BUFFER.STORAGE,'fine-dprime'),coarseParams=[0,1].map(axis=>{const b=buffer(device,32,BUFFER.UNIFORM|BUFFER.COPY_DST,'fine-coarse-params'),raw=new ArrayBuffer(32),u=new Uint32Array(raw),f=new Float32Array(raw);u.set([n,axis]);f.set([lambda,paperDrag],2);u[4]=1;device.queue.writeBuffer(b,0,raw);return b})
 const fine=[buffer(device,size*size*16,BUFFER.STORAGE,'fine-mobile-a'),buffer(device,size*size*16,BUFFER.STORAGE,'fine-mobile-b')],capacity=buffer(device,size*size*8,usage,'fine-paper-capacity'),original=buffer(device,size*size*4,usage,'fine-original'),output=buffer(device,size*size*4,BUFFER.STORAGE|BUFFER.COPY_SRC,'fine-output'),staging=buffer(device,size*size*4,BUFFER.COPY_DST|BUFFER.MAP_READ,'fine-readback'),params=buffer(device,16,BUFFER.UNIFORM|BUFFER.COPY_DST,'fine-params'),raw=new ArrayBuffer(16);new Uint32Array(raw).set([n,size]);new Float32Array(raw)[2]=fineRate;device.queue.writeBuffer(params,0,raw)
 const bind=(p:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))}),solveGroups=coarseParams.map((p,axis)=>bind(solve,[coarse[axis],coarse[1-axis],environment,cp,dp,p])),initGroup=bind(init,[coarse[0],capacity,original,fine[0],params]),flowGroups=[0,1].map(i=>bind(flow,[fine[i],fine[1-i],capacity,params])),packGroup=bind(pack,[fine[fineSteps%2],original,capacity,output,params]),all=[...coarse,environment,cp,dp,...coarseParams,...fine,capacity,original,output,staging,params]
 let uploaded=false,hasOutput=false,destroyed=false
 return{metadata:Object.freeze({algorithm:'implicit-plus-conservative-fine-paper',grid:n,cycles,sigmaFinePixels:sigma,paperDrag,paperGain,fineSteps,fineRate,dispatches:2*cycles+fineSteps+2,coarse:'concentration implicit Wcapacity mode',reconstruction:'positive actual fine-paper/water weights normalized per coarse cell; no raw hard-disk fraction',fine:'pair-symmetric positive capacity concentration flux; zero at excluded/dry faces',allocatedGPUBytes:all.reduce((s,b)=>s+b.size,0),limitations:'Coarse admitted cells conservatively shrink wet edges; final clipping/rounding not an exact mass certificate; paper height is affinity proxy not calibrated absorption',seedUsed:false,featuresRequired:[]}),async upload(input:Input){if(destroyed)throw Error('Destroyed');validateInput(input,size);const initial=initialMacro(input,n),weights=finePaperWeights(input,n,paperGain,initial.environment);device.queue.writeBuffer(coarse[0],0,initial.color);device.queue.writeBuffer(environment,0,initial.environment);device.queue.writeBuffer(capacity,0,weights);device.queue.writeBuffer(original,0,packedRGBA(input.rgba));await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false},run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();for(let c=0;c<cycles;c++)for(let axis=0;axis<2;axis++){pass.setPipeline(solve);pass.setBindGroup(0,solveGroups[axis]);pass.dispatchWorkgroups(Math.ceil(n/32))}pass.setPipeline(init);pass.setBindGroup(0,initGroup);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));for(let s=0;s<fineSteps;s++){pass.setPipeline(flow);pass.setBindGroup(0,flowGroups[s%2]);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8))}pass.setPipeline(pack);pass.setBindGroup(0,packGroup);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));pass.end();device.queue.submit([encoder.finish()]);hasOutput=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},readback(){if(destroyed||!hasOutput)throw Error('No output');return readPacked(device,output,size,staging)},destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
}
export const finePaperDefinitions=[{id:'wgsl-macro-implicit-fine-paper',label:'Дальний перенос и консервативная мелкая бумага',create,configs:[
 {grid:256,cycles:3,sigma:96,paperDrag:.5,paperGain:2,fineSteps:8,fineRate:.2},
 {grid:256,cycles:3,sigma:64,paperDrag:.5,paperGain:4,fineSteps:12,fineRate:.2},
 {grid:256,cycles:3,sigma:96,paperDrag:.5,paperGain:0,fineSteps:8,fineRate:.2}
]}]
