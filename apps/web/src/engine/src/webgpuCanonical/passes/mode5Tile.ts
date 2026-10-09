import type {ExactPipelineRecipe} from '../exactPipelinePreparation'
import type {CanonicalGpuField} from '../types'
/** Enumerated f32 coordinate proof, not an assertion for every GPU extent. */
export const MODE5_TILE_DIMENSIONS=Object.freeze([1,2,3,5,7,13,31,63,127,511,1023,1536,1754,2480,4095,8191])
export function mode5TileGeometry(out:CanonicalGpuField,a:CanonicalGpuField,dir:readonly[number,number]|undefined,linearMask:number){
 return MODE5_TILE_DIMENSIONS.includes(out.width)&&MODE5_TILE_DIMENSIONS.includes(out.height)&&a.width===out.width&&a.height===out.height&&a.format==='rgba8unorm'&&out.format==='rgba8unorm'&&a.filter==='nearest'&&(linearMask&1)===0&&!!dir&&(dir[0]===1||dir[0]===2)&&dir[1]===dir[0]
}
/** Preserve the actual baseline uniform struct instead of duplicating its layout. */
export function canonicalMode5TileRecipe(baseline:string):ExactPipelineRecipe{
 const params=baseline.match(/struct Params \{[^\n]+\}/)?.[0]
 if(!params||!params.includes('dimsDir:vec4f')||!params.includes('dispatch:vec4u'))throw Error('Mode5 tile baseline uniform contract missing')
 const code=params+`
@group(0) @binding(0) var aTex:texture_2d<f32>;
@group(0) @binding(7) var outTex:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(8) var<uniform> u:Params;
var<workgroup> tile:array<vec4f,144>;
@compute @workgroup_size(8,8) fn main(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_id) local:vec3u,@builtin(local_invocation_index) lane:u32){
 let dims=vec2u(u.dimsDir.xy);let stride=u32(round(u.dimsDir.z*u.dimsDir.x));
 let base=u.dispatch.xy+group.xy*8u;let side=8u+2u*stride;
 for(var t=lane;t<side*side;t+=64u){
  let p=vec2i(base)+vec2i(i32(t%side),i32(t/side))-vec2i(i32(stride));
  tile[t]=textureLoad(aTex,clamp(p,vec2i(0),vec2i(dims)-vec2i(1)),0);
 }
 workgroupBarrier();
 let q=base+local.xy;
 if(any(q>=dims)||any(q>=u.dispatch.xy+u.dispatch.zw)){return;}
 let px=vec2f(f32(q.x)+.5,u.dimsDir.y-f32(q.y)-.5);
 if(any(px<u.scissor.xy)||any(px>=u.scissor.xy+u.scissor.zw)){return;}
 var s=vec4f(0);
 for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){
  var wx=1.0;var wy=1.0;if(i==0){wx=2;}if(j==0){wy=2;}
  let index=u32(i32(local.y+stride)-j*i32(stride))*side+u32(i32(local.x+stride)+i*i32(stride));
  s+=wx*wy*tile[index];
 }}
 textureStore(outTex,vec2i(q),s/16.0);
}
`
 return{key:'diagnosticMode5SharedTile',kind:'compute',code,descriptor(module){return{label:'Diagnostic canonical mode5 shared tile',layout:'auto',compute:{module,entryPoint:'main'}}}}
}
