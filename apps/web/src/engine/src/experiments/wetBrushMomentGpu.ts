import {MOMENT_VECTOR_GPU_WGSL} from './wetBrushMomentVectorGpu'
import {exchangeMomentPair} from './wetBrushMomentRecipe'
/** DEV new physics only. Q8 integer storage keeps every P.B / C sum exact.
 * Input layout per pixel: P.rgba, C.rgba, commonWetQ8, actualContactQ8.
 * This kernel does not encode production textures or choose their roles. */
export const MOMENT_GPU_WGSL = `
struct Params { width:u32,height:u32,axis:u32,parity:u32,mixRate:u32,advRate:u32,direction:i32,pad:u32 };
@group(0) @binding(0) var<storage,read> src:array<u32>;
@group(0) @binding(1) var<storage,read_write> dst:array<u32>;
@group(0) @binding(2) var<uniform> u:Params;
@group(0) @binding(3) var<storage,read_write> invalid:atomic<u32>;
fn portion(c:u32,q:u32,m:u32)->u32 { if(m==0u){return 0u;}return c*q/m; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u.width*u.height){return;}
 let x=i%u.width;let y=i/u.width;let v=select(y,x,u.axis==0u);let limit=select(u.height,u.width,u.axis==0u);
 // Every output pixel has exactly one writer: matched pairs or unmatched edge.
 if(v%2u!=u.parity){if(v>0u){return;}}
 let matched=v%2u==u.parity && v+1u<limit;
 let a=i*10u;var b=a;if(matched){b=(i+select(u.width,1u,u.axis==0u))*10u;}
 for(var k=0u;k<10u;k++){dst[a+k]=src[a+k];if(matched){dst[b+k]=src[b+k];}}
 if(!matched||atomicLoad(&invalid)>0u){return;}
 var ma=src[a+2u];var mb=src[b+2u];var ca:array<u32,4>;var cb:array<u32,4>;
 var bad=ma>255u||mb>255u;
 for(var c=0u;c<4u;c++){ca[c]=src[a+4u+c];cb[c]=src[b+4u+c];bad=bad||ca[c]>ma||cb[c]>mb;}
 if(bad){atomicAdd(&invalid,1u);return;}
 let wet=min(min(src[a+8u],src[b+8u]),min(src[a+9u],src[b+9u]));
 let q=(min(ma,mb)*wet/255u)*u.mixRate/255u;
 for(var c=0u;c<4u;c++){let pa=portion(ca[c],q,ma);let pb=portion(cb[c],q,mb);ca[c]=ca[c]-pa+pb;cb[c]=cb[c]-pb+pa;}
 let forward=u.direction>=0;let sm=select(mb,ma,forward);let tm=select(ma,mb,forward);
 let t=min(((sm*wet/255u)*u.advRate/255u)*u32(abs(u.direction))/256u,255u-tm);
 for(var c=0u;c<4u;c++){let moved=portion(select(cb[c],ca[c],forward),t,sm);if(forward){ca[c]-=moved;cb[c]+=moved;}else{cb[c]-=moved;ca[c]+=moved;}}
 if(forward){ma-=t;mb+=t;}else{mb-=t;ma+=t;}
 dst[a+2u]=ma;dst[b+2u]=mb;for(var c=0u;c<4u;c++){dst[a+4u+c]=ca[c];dst[b+4u+c]=cb[c];}
}`
export interface MomentGpuPass {width:number;height:number;axis:0|1;parity:0|1;mixRate:number;advectionRate:number;direction:number}
/** Audit actual canonical records; aggregate maxima do not establish C<=P.B. */
export function auditMomentRecords(p:Uint8Array,c:Uint8Array){
 if(p.length!==c.length||p.length%4)throw Error('Matching RGBA records required')
 let violations=0,maxExcess=0;const examples:{pixel:number;channel:number;mass:number;moment:number}[]=[]
 for(let i=0;i<p.length;i+=4)for(let k=0;k<4;k++){const excess=c[i+k]-p[i+2];if(excess>0){violations++;maxExcess=Math.max(maxExcess,excess);if(examples.length<8)examples.push({pixel:i/4,channel:k,mass:p[i+2],moment:c[i+k]})}}
 return{supported:violations===0,violations,maxExcess,examples,pixels:p.length/4}
}
export function packMomentRecords(p:Uint8Array,c:Uint8Array,wet:Uint8Array,contact:Uint8Array){
 const audit=auditMomentRecords(p,c);if(!audit.supported)throw Error(`Unsupported actual moment carrier: ${audit.violations} channels`)
 if(wet.length!==p.length/4||contact.length!==wet.length)throw Error('Per-pixel physical wet/contact maps required')
 const out=new Uint32Array(wet.length*10);for(let i=0;i<wet.length;i++){out.set(p.subarray(i*4,i*4+4),i*10);out.set(c.subarray(i*4,i*4+4),i*10+4);out[i*10+8]=wet[i];out[i*10+9]=contact[i]}return out
}
/** Encoding seam: caller owns all resources/lifetimes. OFF performs no GPU calls.
 * Dispatches preserve pair order; no fusion, implicit readback, or fences. */
export class WetBrushMomentGpu {
 private pipeline:GPUComputePipeline|null=null
 constructor(privateDevice:GPUDevice,diagnosticVector=false){this.device=privateDevice;this.diagnosticVector=diagnosticVector}
 private readonly diagnosticVector:boolean
 private readonly device:GPUDevice
 encode(encoder:GPUCommandEncoder,source:GPUBuffer,target:GPUBuffer,invalid:GPUBuffer,pass:MomentGpuPass,enabled=false):GPUBuffer[] {
  if(!enabled)return[]
  if(source===target)throw Error('Moment pair requires ping-pong buffers')
  const {width,height,axis,parity,mixRate,advectionRate,direction}=pass
  if(![width,height,mixRate,advectionRate,direction].every(Number.isInteger)||width<1||height<1||width*height>1024*1024||mixRate<0||mixRate>255||advectionRate<0||advectionRate>255||Math.abs(direction)>256)throw Error('Bounded moment dispatch required')
  this.pipeline??=this.device.createComputePipeline({layout:'auto',compute:{module:this.device.createShaderModule({code:this.diagnosticVector?MOMENT_VECTOR_GPU_WGSL:MOMENT_GPU_WGSL}),entryPoint:'main'}})
  const uniform=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});const values=new Uint32Array([width,height,axis,parity,mixRate,advectionRate,0,0]);new Int32Array(values.buffer)[6]=direction;this.device.queue.writeBuffer(uniform,0,values)
  const bind=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:target}},{binding:2,resource:{buffer:uniform}},{binding:3,resource:{buffer:invalid}}]})
  const cp=encoder.beginComputePass();cp.setPipeline(this.pipeline);cp.setBindGroup(0,bind);cp.dispatchWorkgroups(Math.ceil(width*height/64));cp.end();return[uniform]
 }
}

/** Frozen Q8 oracle for same-input GPU gates (not a production solver). */
export function momentGpuOracle(source:Uint32Array,pass:MomentGpuPass):Uint32Array {
 const {width,height,axis,parity,mixRate,advectionRate,direction}=pass
 if(source.length!==width*height*10)throw Error('Exact packed moment dimensions required')
 const out=source.slice()
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const v=axis===0?x:y,limit=axis===0?width:height;if(v%2!==parity||v+1>=limit)continue
  const a=(y*width+x)*10,b=a+(axis===0?1:width)*10
  const carrier=(i:number)=>({mass:source[i+2],moments:[source[i+4],source[i+5],source[i+6],source[i+7]] as const})
  const wet=Math.min(source[a+8],source[b+8],source[a+9],source[b+9])
  const result=exchangeMomentPair(carrier(a),carrier(b),wet,mixRate,advectionRate,direction)
  for(const [i,c] of [[a,result.a],[b,result.b]] as const){out[i+2]=c.mass;out.set(c.moments,i+4)}
 }
 return out
}
