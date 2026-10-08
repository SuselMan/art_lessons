import {exchangeMomentVector,type MomentVector} from './wetBrushMomentVector'
/** OFF-only new contract A, exact integer ordering of the CPU oracle. */
export const MOMENT_VECTOR_GPU_WGSL=`
struct Params { width:u32,height:u32,axis:u32,parity:u32,mixRate:u32,advRate:u32,direction:i32,pad:u32 };
@group(0) @binding(0)var<storage,read> src:array<u32>;
@group(0) @binding(1)var<storage,read_write> dst:array<u32>;
@group(0) @binding(2)var<uniform> u:Params;
@group(0) @binding(3)var<storage,read_write> invalid:atomic<u32>;
fn component(j:u32)->u32 {if(j==0u){return 2u;}return j+3u;}
@compute @workgroup_size(64)fn main(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=u.width*u.height){return;}let x=i%u.width;let y=i/u.width;
 let v=select(y,x,u.axis==0u);let limit=select(u.height,u.width,u.axis==0u);
 if(v%2u!=u.parity){if(v>0u){return;}}
 let matched=v%2u==u.parity&&v+1u<limit;let a=i*10u;var b=a;if(matched){b=(i+select(u.width,1u,u.axis==0u))*10u;}
 for(var k=0u;k<10u;k++){dst[a+k]=src[a+k];if(matched){dst[b+k]=src[b+k];}}
 if(!matched||atomicLoad(&invalid)>0u){return;}
 var aa:array<u32,5>;var bb:array<u32,5>;var bad=false;
 for(var j=0u;j<5u;j++){let k=component(j);aa[j]=src[a+k];bb[j]=src[b+k];bad=bad||aa[j]>255u||bb[j]>255u;}
 if(bad){atomicAdd(&invalid,1u);return;}
 let wet=min(min(src[a+8u],src[b+8u]),min(src[a+9u],src[b+9u]));let mix=wet*u.mixRate/255u;
 for(var j=0u;j<5u;j++){let sum=aa[j]+bb[j];aa[j]=((255u-mix)*aa[j]+mix*bb[j])/255u;bb[j]=sum-aa[j];}
 let forward=u.direction>=0;var fraction=((wet*u.advRate/255u)*u32(abs(u.direction)))/256u;
 for(var j=0u;j<5u;j++){let s=select(bb[j],aa[j],forward);let t=select(aa[j],bb[j],forward);if(s>0u){fraction=min(fraction,(255u*(256u-t)-1u)/s);}}
 for(var j=0u;j<5u;j++){let s=select(bb[j],aa[j],forward);let moved=s*fraction/255u;if(forward){aa[j]-=moved;bb[j]+=moved;}else{bb[j]-=moved;aa[j]+=moved;}let k=component(j);dst[a+k]=aa[j];dst[b+k]=bb[j];}
}`
export function momentVectorGpuOracle(source:Uint32Array,p:{width:number;height:number;axis:0|1;parity:0|1;mixRate:number;advectionRate:number;direction:number}):Uint32Array{
 if(source.length!==p.width*p.height*10)throw Error('Matching vector record dimensions required')
 const out=source.slice(),limit=p.axis===0?p.width:p.height,indices=[2,4,5,6,7]
 for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
  const v=p.axis===0?x:y;if(v%2!==p.parity||v+1>=limit)continue
  const a=(y*p.width+x)*10,b=a+(p.axis===0?10:p.width*10)
  const flow={wet:Math.min(source[a+8],source[b+8],source[a+9],source[b+9]),mixRate:p.mixRate,advectionRate:p.advectionRate,direction:p.direction}
  const pair=exchangeMomentVector(indices.map(k=>source[a+k]) as unknown as MomentVector,indices.map(k=>source[b+k]) as unknown as MomentVector,flow)
  indices.forEach((k,j)=>{out[a+k]=pair.a[j];out[b+k]=pair.b[j]})
 }
 return out
}
