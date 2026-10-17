import {BUFFER,buffer,integerOption,packedRGBA,pipeline,readPacked,validateInput,validateSize,type Candidate,type Input} from './contract'
export type DiffusionConfig={iterations?:number;rate?:number;tiled?:boolean}
/** Exact integer four-neighbour pigment mixing. Water/paper stay static; no fluid claim. */
const COMMON=/* wgsl */`
struct Params {size:u32,rate:u32,pad0:u32,pad1:u32}
@group(0) @binding(0) var<storage,read> src:array<u32>;
@group(0) @binding(1) var<storage,read_write> dst:array<u32>;
@group(0) @binding(2) var<storage,read> water:array<u32>;
@group(0) @binding(3) var<storage,read> paper:array<u32>;
@group(0) @binding(4) var<uniform> params:Params;
fn weight(a:u32,b:u32,pa:u32,pb:u32)->u32{return (min(a,b)*min(pa,pb)*params.rate+32512u)/65025u;}
fn mixPixel(c:u32,l:u32,r:u32,u:u32,d:u32,kl:u32,kr:u32,ku:u32,kd:u32)->u32{
 let kc=256u-kl-kr-ku-kd;var out=0u;
 for(var k=0u;k<4u;k++){let sh=k*8u;let value=(((c>>sh)&255u)*kc+((l>>sh)&255u)*kl+((r>>sh)&255u)*kr+((u>>sh)&255u)*ku+((d>>sh)&255u)*kd+128u)/256u;out|=value<<sh;}
 return out;
}
`
export const WGSL_DIRECT=COMMON+/* wgsl */`
@compute @workgroup_size(16,16) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(params.size))){return;}let x=gid.x;let y=gid.y;let i=y*params.size+x;
 let l=y*params.size+select(x-1u,x,x==0u);let r=y*params.size+min(x+1u,params.size-1u);
 let u=select(y-1u,y,y==0u)*params.size+x;let d=min(y+1u,params.size-1u)*params.size+x;
 dst[i]=mixPixel(src[i],src[l],src[r],src[u],src[d],weight(water[i],water[l],paper[i],paper[l]),weight(water[i],water[r],paper[i],paper[r]),weight(water[i],water[u],paper[i],paper[u]),weight(water[i],water[d],paper[i],paper[d]));
}`
export const WGSL_TILED4=COMMON+/* wgsl */`
var<workgroup> a:array<u32,256>;var<workgroup> b:array<u32,256>;
var<workgroup> w:array<u32,256>;var<workgroup> p:array<u32,256>;
@compute @workgroup_size(16,16) fn main(@builtin(local_invocation_id) lid:vec3u,@builtin(workgroup_id) group:vec3u){
 let local=lid.y*16u+lid.x;let world=vec2i(group.xy*8u)+vec2i(lid.xy)-vec2i(4);
 let clamped=clamp(world,vec2i(0),vec2i(i32(params.size)-1));let index=u32(clamped.y)*params.size+u32(clamped.x);
 a[local]=src[index];w[local]=water[index];p[local]=paper[index];workgroupBarrier();
 for(var step=0u;step<4u;step++){
  let valid=lid.x>step&&lid.y>step&&lid.x<15u-step&&lid.y<15u-step&&all(world>=vec2i(0))&&all(world<vec2i(i32(params.size)));
  if(valid){
   let l=select(local-1u,local,world.x==0);let r=select(local+1u,local,world.x==i32(params.size)-1);
   let u=select(local-16u,local,world.y==0);let d=select(local+16u,local,world.y==i32(params.size)-1);
   let kl=weight(w[local],w[l],p[local],p[l]);let kr=weight(w[local],w[r],p[local],p[r]);let ku=weight(w[local],w[u],p[local],p[u]);let kd=weight(w[local],w[d],p[local],p[d]);
   if(step%2u==0u){b[local]=mixPixel(a[local],a[l],a[r],a[u],a[d],kl,kr,ku,kd);}else{a[local]=mixPixel(b[local],b[l],b[r],b[u],b[d],kl,kr,ku,kd);}
  }
  workgroupBarrier();
 }
 if(all(lid.xy>=vec2u(4))&&all(lid.xy<vec2u(12))&&all(world>=vec2i(0))&&all(world<vec2i(i32(params.size)))){dst[u32(world.y)*params.size+u32(world.x)]=a[local];}
}`
export async function create(device:GPUDevice,size:number,config:DiffusionConfig={}):Promise<Candidate>{
 validateSize(size);const iterations=integerOption(config.iterations??32,1,256,'iterations'),rate=integerOption(config.rate??24,0,32,'rate'),tiled=config.tiled===true
 if(device.limits.maxComputeInvocationsPerWorkgroup<256||device.limits.maxComputeWorkgroupSizeX<16||device.limits.maxComputeWorkgroupSizeY<16||tiled&&device.limits.maxComputeWorkgroupStorageSize<4096)throw Error('Required16x16 workgroup/shared storage unsupported')
 const direct=await pipeline(device,WGSL_DIRECT,'805-integer-diffusion'),tile=tiled?await pipeline(device,WGSL_TILED4,'805-integer-diffusion-tiled4'):undefined
 const bytes=size*size*4,usage=BUFFER.STORAGE|BUFFER.COPY_DST|BUFFER.COPY_SRC
 const states=[buffer(device,bytes,usage,'pigment-a'),buffer(device,bytes,usage,'pigment-b')],water=buffer(device,bytes,BUFFER.STORAGE|BUFFER.COPY_DST,'water'),paper=buffer(device,bytes,BUFFER.STORAGE|BUFFER.COPY_DST,'paper'),params=buffer(device,16,BUFFER.UNIFORM|BUFFER.COPY_DST,'params'),staging=buffer(device,bytes,BUFFER.MAP_READ|BUFFER.COPY_DST,'readback')
 const make=(pl:GPUComputePipeline)=>states.map((_,i)=>device.createBindGroup({layout:pl.getBindGroupLayout(0),entries:[states[i],states[1-i],water,paper,params].map((b,binding)=>({binding,resource:{buffer:b}}))}))
 const groups=make(direct),tileGroups=tile?make(tile):undefined;let uploaded=false,hasOutput=false,destroyed=false,last=0
 function check(){if(destroyed)throw Error('Candidate destroyed');if(!uploaded)throw Error('Fresh upload required before every run')}
 return {metadata:Object.freeze({algorithm:'integer-local-diffusion',variant:tiled?'shared16/core8/4steps':'direct',size,iterations,rate,stateBytes:bytes*4,stagingBytes:bytes,staticWater:true,seedUsed:false}),async upload(input:Input){if(destroyed)throw Error('Candidate destroyed');validateInput(input,size);device.queue.writeBuffer(states[0],0,packedRGBA(input.rgba));device.queue.writeBuffer(water,0,Uint32Array.from(input.water));device.queue.writeBuffer(paper,0,Uint32Array.from(input.paper));device.queue.writeBuffer(params,0,new Uint32Array([size,rate,0,0]));await device.queue.onSubmittedWorkDone();uploaded=true;hasOutput=false;last=0},run(){check();uploaded=false;hasOutput=true;const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();let i=0;last=0;while(i<iterations){const batch=tile&&iterations-i>=4;if(batch){pass.setPipeline(tile!);pass.setBindGroup(0,tileGroups![last]);pass.dispatchWorkgroups(Math.ceil(size/8),Math.ceil(size/8));i+=4}else{pass.setPipeline(direct);pass.setBindGroup(0,groups[last]);pass.dispatchWorkgroups(Math.ceil(size/16),Math.ceil(size/16));i++}last=1-last}pass.end();device.queue.submit([encoder.finish()]);return{buffer:states[last],width:size,height:size,bytesPerRow:size*4}},async readback(){if(destroyed||!hasOutput)throw Error('No output');return readPacked(device,states[last],size,staging)},destroy(){if(destroyed)return;destroyed=true;for(const b of [...states,water,paper,params,staging])b.destroy()}}
}

/** CPU byte oracle for the deliberately simple local model, not D2Q9/M70. */
export function referenceStep(source:Uint32Array,water:Uint8Array,paper:Uint8Array,size:number,rate:number){
 const out=new Uint32Array(source.length),weight=(a:number,b:number)=>Math.floor((Math.min(water[a],water[b])*Math.min(paper[a],paper[b])*rate+32512)/65025)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,neighbours=[y*size+Math.max(0,x-1),y*size+Math.min(size-1,x+1),Math.max(0,y-1)*size+x,Math.min(size-1,y+1)*size+x],ks=neighbours.map(j=>weight(i,j)),kc=256-ks.reduce((a,b)=>a+b,0)
  let value=0;for(let c=0;c<4;c++){const shift=c*8;let sum=((source[i]>>>shift)&255)*kc;for(let j=0;j<4;j++)sum+=((source[neighbours[j]]>>>shift)&255)*ks[j];value|=Math.floor((sum+128)/256)<<shift}out[i]=value>>>0
 }return out
}
