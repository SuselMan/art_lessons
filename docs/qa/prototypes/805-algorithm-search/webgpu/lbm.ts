import {BUFFER,buffer,integerOption,pipeline,readPacked,validateInput,validateSize,type Candidate,type Input} from './contract'
export type LBMConfig={grid?:number;steps?:number;omega?:number;drag?:number;diffusion?:number;evaporation?:number}
const CONSTANTS=/* wgsl */`
struct Params {n:u32,outSize:u32,omega:f32,drag:f32,diffusion:f32,evaporation:f32,pad0:u32,pad1:u32}
const CX=array<i32,9>(0,1,0,-1,0,1,-1,-1,1);
const CY=array<i32,9>(0,0,1,0,-1,1,1,-1,-1);
const OPP=array<u32,9>(0u,3u,4u,1u,2u,7u,8u,5u,6u);
const W=array<f32,9>(4.0/9.0,1.0/9.0,1.0/9.0,1.0/9.0,1.0/9.0,1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0);
`
export const WGSL_COLLIDE=CONSTANTS+/* wgsl */`
@group(0) @binding(0) var<storage,read> f:array<f32>;
@group(0) @binding(1) var<storage,read_write> post:array<f32>;
@group(0) @binding(2) var<storage,read_write> fluidMacro:array<vec4f>;
@group(0) @binding(3) var<storage,read> wet:array<f32>;
@group(0) @binding(4) var<storage,read> paper:array<f32>;
@group(0) @binding(5) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let i=gid.y*p.n+gid.x;var rho=0.0;var momentum=vec2f(0);
 for(var q=0u;q<9u;q++){let v=f[i*9u+q];rho+=v;momentum+=v*vec2f(f32(CX[q]),f32(CY[q]));}
 rho=max(rho,0.0001);let damping=clamp(1.0-p.drag*(1.0-0.85*wet[i])*(0.5+0.5*paper[i]),0.0,1.0);
 let u=clamp(momentum/rho,vec2f(-0.15),vec2f(0.15))*damping;let uu=dot(u,u);
 fluidMacro[i]=vec4f(rho,u,wet[i]);
 for(var q=0u;q<9u;q++){let cu=dot(vec2f(f32(CX[q]),f32(CY[q])),u);let equilibrium=W[q]*rho*(1.0+3.0*cu+4.5*cu*cu-1.5*uu);post[i*9u+q]=max(0.0,f[i*9u+q]+p.omega*(equilibrium-f[i*9u+q]));}
}`
export const WGSL_STREAM=CONSTANTS+/* wgsl */`
@group(0) @binding(0) var<storage,read> post:array<f32>;
@group(0) @binding(1) var<storage,read_write> next:array<f32>;
@group(0) @binding(2) var<storage,read> fluidMacro:array<vec4f>;
@group(0) @binding(3) var<storage,read> colors:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> colorsNext:array<vec4f>;
@group(0) @binding(5) var<storage,read> wet:array<f32>;
@group(0) @binding(6) var<storage,read_write> wetNext:array<f32>;
@group(0) @binding(7) var<storage,read> paper:array<f32>;
@group(0) @binding(8) var<uniform> p:Params;
fn idx(pos:vec2i)->u32{let c=clamp(pos,vec2i(0),vec2i(i32(p.n)-1));return u32(c.y)*p.n+u32(c.x);}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.n))){return;}let pos=vec2i(gid.xy);let i=gid.y*p.n+gid.x;
 // Pull streaming, on-link bounce-back at the four domain edges.
 for(var q=0u;q<9u;q++){let sourcePos=pos-vec2i(CX[q],CY[q]);if(any(sourcePos<vec2i(0))||any(sourcePos>=vec2i(i32(p.n)))){next[i*9u+q]=post[i*9u+OPP[q]];}else{next[i*9u+q]=post[(u32(sourcePos.y)*p.n+u32(sourcePos.x))*9u+q];}}
 // Fluid velocity advects independent water/pigment tracers; convex local mixing.
 let back=clamp(vec2f(gid.xy)-fluidMacro[i].yz,vec2f(0),vec2f(f32(p.n)-1.0));let base=vec2i(floor(back));let t=fract(back);
 let a=idx(base);let b=idx(base+vec2i(1,0));let c=idx(base+vec2i(0,1));let d=idx(base+vec2i(1,1));
 let adv=mix(mix(colors[a],colors[b],t.x),mix(colors[c],colors[d],t.x),t.y);
 let advWet=mix(mix(wet[a],wet[b],t.x),mix(wet[c],wet[d],t.x),t.y);
 let l=idx(pos+vec2i(-1,0));let r=idx(pos+vec2i(1,0));let u=idx(pos+vec2i(0,-1));let v=idx(pos+vec2i(0,1));
 let k=clamp(p.diffusion*wet[i]*(0.25+0.75*(1.0-paper[i])),0.0,0.24);
 var color=clamp(adv*(1.0-k)+(colors[l]+colors[r]+colors[u]+colors[v])*(0.25*k),vec4f(0),vec4f(1));
 color=vec4f(min(color.rgb,vec3f(color.a)),color.a);colorsNext[i]=color;
 wetNext[i]=clamp((advWet*(1.0-k)+(wet[l]+wet[r]+wet[u]+wet[v])*(0.25*k))*(1.0-p.evaporation),0.0,1.0);
}`
export const WGSL_PACK=CONSTANTS+/* wgsl */`
@group(0) @binding(0) var<storage,read> colors:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
@group(0) @binding(2) var<uniform> p:Params;
fn idx(pos:vec2i)->u32{let c=clamp(pos,vec2i(0),vec2i(i32(p.n)-1));return u32(c.y)*p.n+u32(c.x);}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.outSize))){return;}
 let pos=clamp((vec2f(gid.xy)+vec2f(0.5))*f32(p.n)/f32(p.outSize)-vec2f(0.5),vec2f(0),vec2f(f32(p.n)-1.0));let b=vec2i(floor(pos));let t=fract(pos);
 let color=mix(mix(colors[idx(b)],colors[idx(b+vec2i(1,0))],t.x),mix(colors[idx(b+vec2i(0,1))],colors[idx(b+vec2i(1,1))],t.x),t.y);
 let bytes=vec4u(floor(clamp(color,vec4f(0),vec4f(1))*255.0+vec4f(0.5)));output[gid.y*p.outSize+gid.x]=bytes.r|(bytes.g<<8u)|(bytes.b<<16u)|(bytes.a<<24u);
}`
export function downsample(input:Input,n:number){
 const ratio=input.size/n;if(!Number.isInteger(ratio))throw Error('Grid must divide input size')
 const color=new Float32Array(n*n*4),wet=new Float32Array(n*n),paper=new Float32Array(n*n),f=new Float32Array(n*n*9),weights=[4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36]
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;for(let dy=0;dy<ratio;dy++)for(let dx=0;dx<ratio;dx++){const j=(y*ratio+dy)*input.size+x*ratio+dx;wet[i]+=input.water[j]/(255*ratio*ratio);paper[i]+=input.paper[j]/(255*ratio*ratio);for(let k=0;k<4;k++)color[i*4+k]+=input.rgba[j*4+k]/(255*ratio*ratio)}const rho=1+0.12*wet[i];for(let q=0;q<9;q++)f[i*9+q]=weights[q]*rho}
 return {color,wet,paper,f}
}
export async function create(device:GPUDevice,size:number,config:LBMConfig={}):Promise<Candidate>{
 validateSize(size);const n=integerOption(config.grid??256,64,512,'grid'),steps=integerOption(config.steps??48,1,256,'steps');if(size%n)throw Error('Grid must divide size')
 const omega=config.omega??1,drag=config.drag??0.08,diffusion=config.diffusion??0.12,evaporation=config.evaporation??0.001
 for(const [name,v,lo,hi] of [['omega',omega,0.6,1.4],['drag',drag,0,1],['diffusion',diffusion,0,0.24],['evaporation',evaporation,0,0.02]] as const)if(!Number.isFinite(v)||v<lo||v>hi)throw Error('Invalid '+name)
 const fBytes=n*n*9*4,cBytes=n*n*16,wBytes=n*n*4,outBytes=size*size*4
 if(device.limits.maxStorageBuffersPerShaderStage<8||device.limits.maxStorageBufferBindingSize<fBytes||device.limits.maxBufferSize<fBytes||device.limits.maxComputeInvocationsPerWorkgroup<64)throw Error('D2Q9 device limits insufficient')
 const collide=await pipeline(device,WGSL_COLLIDE,'805-d2q9-collide'),stream=await pipeline(device,WGSL_STREAM,'805-d2q9-pull-stream'),pack=await pipeline(device,WGSL_PACK,'805-d2q9-pack')
 const use=BUFFER.STORAGE|BUFFER.COPY_DST
 const populations=[buffer(device,fBytes,use,'f-a'),buffer(device,fBytes,use,'f-b')],post=buffer(device,fBytes,use,'post-collision'),fluidMacro=buffer(device,cBytes,use,'rho-velocity'),colors=[buffer(device,cBytes,use,'color-a'),buffer(device,cBytes,use,'color-b')],wet=[buffer(device,wBytes,use,'wet-a'),buffer(device,wBytes,use,'wet-b')],paper=buffer(device,wBytes,use,'paper'),params=buffer(device,32,BUFFER.UNIFORM|BUFFER.COPY_DST,'lbm-params'),output=buffer(device,outBytes,BUFFER.STORAGE|BUFFER.COPY_SRC,'rgba-output'),staging=buffer(device,outBytes,BUFFER.COPY_DST|BUFFER.MAP_READ,'rgba-readback')
 const bind=(pl:GPUComputePipeline,list:GPUBuffer[])=>device.createBindGroup({layout:pl.getBindGroupLayout(0),entries:list.map((b,binding)=>({binding,resource:{buffer:b}}))})
 const collisionGroups=[0,1].map(i=>bind(collide,[populations[i],post,fluidMacro,wet[i],paper,params])),streamGroups=[0,1].map(i=>bind(stream,[post,populations[1-i],fluidMacro,colors[i],colors[1-i],wet[i],wet[1-i],paper,params])),packGroups=[0,1].map(i=>bind(pack,[colors[i],output,params]));let uploaded=false,hasOutput=false,destroyed=false
 const all=[...populations,post,fluidMacro,...colors,...wet,paper,params,output,staging]
 return {metadata:Object.freeze({algorithm:'D2Q9-BGK-pull-stream',size,grid:n,steps,omega,drag,diffusion,evaporation,seedUsed:false,fluid:'weakly-compressible density1+0.12water; bounceback edges; no pressure projection',pigment:'semi-Lagrangian+convex local diffusion; coarse bilinear reconstruction',allocatedGPUBytes:3*fBytes+3*cBytes+3*wBytes+2*outBytes+32,featuresRequired:[]}),async upload(input:Input){if(destroyed)throw Error('Candidate destroyed');validateInput(input,size);const initial=downsample(input,n),bytes=new ArrayBuffer(32),u=new Uint32Array(bytes),f=new Float32Array(bytes);u[0]=n;u[1]=size;f[2]=omega;f[3]=drag;f[4]=diffusion;f[5]=evaporation;device.queue.writeBuffer(populations[0],0,initial.f);device.queue.writeBuffer(colors[0],0,initial.color);device.queue.writeBuffer(wet[0],0,initial.wet);device.queue.writeBuffer(paper,0,initial.paper);device.queue.writeBuffer(params,0,bytes);await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false},run(){if(destroyed||!uploaded)throw Error('Fresh upload required before every run');uploaded=false;const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();let i=0;for(let step=0;step<steps;step++){pass.setPipeline(collide);pass.setBindGroup(0,collisionGroups[i]);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8));pass.setPipeline(stream);pass.setBindGroup(0,streamGroups[i]);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8));i=1-i}pass.setPipeline(pack);pass.setBindGroup(0,packGroups[i]);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));pass.end();device.queue.submit([encoder.finish()]);hasOutput=true;return{buffer:output,width:size,height:size,bytesPerRow:size*4}},async readback(){if(destroyed||!hasOutput)throw Error('No output');return readPacked(device,output,size,staging)},destroy(){if(destroyed)return;destroyed=true;for(const b of all)b.destroy()}}
}
