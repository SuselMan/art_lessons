import {BUFFER,buffer,integerOption,pipeline,validateInput,type Candidate,type Input} from './contract'
import {initialMacro,MACRO_PACK,macroGrid,makeMacroIO,scalar} from './macro-common'
export interface ImplicitConfig {grid?:number;cycles?:number;sigma?:number;mobile?:number;paperDrag?:number;concentration?:number}
/** Lie-split backward Euler, not second-order Peaceman-Rachford: positivity takes priority. */
export const MACRO_IMPLICIT=/* wgsl */`
struct Params {n:u32,axis:u32,lambda:f32,paperDrag:f32,concentration:u32,pad0:u32,pad1:u32,pad2:u32}
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dest:array<vec4f>;
@group(0) @binding(2) var<storage,read> environment:array<vec2f>;
@group(0) @binding(3) var<storage,read_write> cprime:array<f32>;
@group(0) @binding(4) var<storage,read_write> dprime:array<vec4f>;
@group(0) @binding(5) var<uniform> p:Params;
fn index(line:u32,q:u32)->u32{if(p.axis==0u){return line*p.n+q;}return q*p.n+line;}
fn capacity(i:u32)->f32{if(p.concentration==0u){return 1.0;}return max(environment[i].x,0.0001);}
fn face(i:u32,j:u32)->f32{let a=environment[i];let b=environment[j];if(a.x<=0.0||b.x<=0.0){return 0.0;}return min(a.x,b.x)/(1.0+p.paperDrag*0.5*(a.y+b.y));}
@compute @workgroup_size(32) fn main(@builtin(global_invocation_id) gid:vec3u){
 let line=gid.x;if(line>=p.n){return;}var previousC=0.0;var previousD=vec4f(0);
 for(var q=0u;q<p.n;q++){let i=index(line,q);var left=0.0;var right=0.0;
  if(q>0u){left=p.lambda*face(i,index(line,q-1u));}if(q+1u<p.n){right=p.lambda*face(i,index(line,q+1u));}
  let a=-left;let c=-right;let diagonal=capacity(i)+left+right;let denom=diagonal-a*previousC;
  let cp=c/denom;let dp=(source[i]-a*previousD)/denom;cprime[i]=cp;dprime[i]=dp;previousC=cp;previousD=dp;
 }
 var nextValue=vec4f(0);for(var k=0u;k<p.n;k++){let q=p.n-1u-k;let i=index(line,q);let value=dprime[i]-cprime[i]*nextValue;dest[i]=value*capacity(i);nextValue=value;}
}`
/** CPU independent Thomas reference, scalar mass, including concentration/capacity mode. */
export function implicitLine(source:readonly number[],water:readonly number[],paper:readonly number[],lambda:number,drag=0,concentration=false){
 const n=source.length;if(!n||water.length!==n||paper.length!==n||!Number.isFinite(lambda)||lambda<0)throw Error('Invalid line')
 const c=new Float64Array(n),d=new Float64Array(n),out=new Float64Array(n),cap=(i:number)=>concentration?Math.max(water[i],.0001):1
 const face=(i:number,j:number)=>water[i]<=0||water[j]<=0?0:Math.min(water[i],water[j])/(1+drag*.5*(paper[i]+paper[j]))
 for(let i=0;i<n;i++){const l=i?lambda*face(i,i-1):0,r=i+1<n?lambda*face(i,i+1):0,a=-l,denom=cap(i)+l+r-a*(i?c[i-1]:0);c[i]=-r/denom;d[i]=(source[i]-a*(i?d[i-1]:0))/denom}
 let next=0;for(let i=n-1;i>=0;i--){next=d[i]-c[i]*next;out[i]=next*cap(i)}return out
}
export async function create(device:GPUDevice,size:number,config:ImplicitConfig={}):Promise<Candidate>{
 const n=config.grid??256;macroGrid(size,n);const cycles=integerOption(config.cycles??2,1,8,'cycles'),sigma=scalar(config.sigma??96,0,240,'sigma'),mobile=scalar(config.mobile??1,0,1,'mobile'),paperDrag=scalar(config.paperDrag??.5,0,8,'paperDrag'),concentration=integerOption(config.concentration??0,0,1,'concentration')
 const lambda=(sigma*n/size)**2/(2*cycles),vecBytes=n*n*16
 if(device.limits.maxStorageBuffersPerShaderStage<5||device.limits.maxStorageBufferBindingSize<Math.max(vecBytes,size*size*4)||device.limits.maxComputeInvocationsPerWorkgroup<64)throw Error('Macro implicit device limits insufficient')
 const solve=await pipeline(device,MACRO_IMPLICIT,'805-macro-implicit'),pack=await pipeline(device,MACRO_PACK,'805-macro-pack')
 const usage=BUFFER.STORAGE|BUFFER.COPY_DST,colors=[buffer(device,vecBytes,usage,'macro-color-a'),buffer(device,vecBytes,usage,'macro-color-b')],environment=buffer(device,n*n*8,usage,'macro-environment'),cp=buffer(device,n*n*4,BUFFER.STORAGE,'macro-cprime'),dp=buffer(device,vecBytes,BUFFER.STORAGE,'macro-dprime'),parameters=[0,1].map(axis=>{const b=buffer(device,32,BUFFER.UNIFORM|BUFFER.COPY_DST,'macro-axis-'+axis),raw=new ArrayBuffer(32);new Uint32Array(raw).set([n,axis]);new Float32Array(raw).set([lambda,paperDrag],2);new Uint32Array(raw)[4]=concentration;device.queue.writeBuffer(b,0,raw);return b})
 const bind=(list:GPUBuffer[])=>device.createBindGroup({layout:solve.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))})
 const groups=parameters.map((p,axis)=>bind([colors[axis],colors[1-axis],environment,cp,dp,p])),io=makeMacroIO(device,size,n,mobile,pack),outputGroup=io.group(colors[0],environment),all=[...colors,environment,cp,dp,...parameters,...io.all]
 let uploaded=false,hasOutput=false,destroyed=false
 return{metadata:Object.freeze({algorithm:'macro-implicit-diffusion',grid:n,cycles,sigmaFinePixels:sigma,lambda,mobile,paperDrag,concentration:!!concentration,precision:'f32 carriers; RGBA8 only final',steps:2*cycles+1,solver:'per-row/column Thomas; Lie-split backward Euler; static wet-domain no-flux faces',limitations:'Coarse-grid loss; bilinear final reconstruction not an exact mass certificate; implicit tails not finite-speed advection',seedUsed:false,featuresRequired:[]}),async upload(input:Input){if(destroyed)throw Error('Destroyed');validateInput(input,size);const data=initialMacro(input,n);device.queue.writeBuffer(colors[0],0,data.color);device.queue.writeBuffer(environment,0,data.environment);io.upload(input);await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false},run(){if(destroyed||!uploaded)throw Error('Fresh upload required');uploaded=false;const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();for(let c=0;c<cycles;c++)for(let axis=0;axis<2;axis++){pass.setPipeline(solve);pass.setBindGroup(0,groups[axis]);pass.dispatchWorkgroups(Math.ceil(n/32))}pass.setPipeline(pack);pass.setBindGroup(0,outputGroup);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));pass.end();device.queue.submit([encoder.finish()]);hasOutput=true;return{buffer:io.output,width:size,height:size,bytesPerRow:size*4}},readback(){if(destroyed||!hasOutput)throw Error('No output');return io.readback()},destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
}
