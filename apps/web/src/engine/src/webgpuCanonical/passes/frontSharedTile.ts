import {MODE5_TILE_DIMENSIONS} from './mode5Tile'
import type {CanonicalGpuField} from '../types'
export function frontSharedTileGeometry(source:CanonicalGpuField,out:CanonicalGpuField,stride:number){return MODE5_TILE_DIMENSIONS.includes(out.width)&&MODE5_TILE_DIMENSIONS.includes(out.height)&&source.width===out.width&&source.height===out.height&&source.filter==='nearest'&&source.format==='rgba8unorm'&&out.format==='rgba8unorm'&&(stride===1||stride===2)}
/** Port of CPU-reviewed06b8955f; strict anchors fail closed on source drift. */
export function frontSharedTileShader(code:string){
 if(!code.includes('@group(0) @binding(7) var staticFrontCache:texture_2d<f32>;')||!code.includes('climb=u.coefficients.x*textureLoad(staticFrontCache,vec2i(q),0).g;'))throw Error('Front shared tile requires exact factor-cache source')
 const replace=(from:string,to:string)=>{if(code.split(from).length!==2)throw Error('Front shared tile anchor changed');code=code.replace(from,to)}
 replace('@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u) {\n let q=tid.xy;if(any(q>=vec2u(u.resolution))){return;}',`var<workgroup> sourceTile:array<vec4f,144>;
var<workgroup> cacheTile:array<vec2f,144>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u,@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_id) local:vec3u,@builtin(local_invocation_index) lane:u32) {
 let side=8u+2u*u32(u.coefficients.w);let base=group.xy*8u;
 for(var t=lane;t<side*side;t+=64u){let p=clamp(vec2i(base)+vec2i(i32(t%side),i32(t/side))-vec2i(i32(u.coefficients.w)),vec2i(0),vec2i(u.resolution)-vec2i(1));sourceTile[t]=textureLoad(input,p,0);cacheTile[t]=textureLoad(staticFrontCache,p,0).rg;}
 workgroupBarrier();
 let q=tid.xy;if(any(q>=vec2u(u.resolution))){return;}
 let center=(local.y+u32(u.coefficients.w))*side+local.x+u32(u.coefficients.w);`)
 replace('let source=fieldAt(input,uv);','let source=sourceTile[center];')
 replace('textureLoad(staticFrontCache,vec2i(q),0).r','cacheTile[center].r')
 replace('textureLoad(staticFrontCache,vec2i(q),0).g','cacheTile[center].g')
 replace('let ci=fieldAt(input,uvj).r;','let neighborIndex=u32(i32(local.y)+i32(stride)-i32(o.y*stride))*side+u32(i32(local.x)+i32(stride)+i32(o.x*stride));let ci=sourceTile[neighborIndex].r;')
 replace('textureLoad(staticFrontCache,vec2i(q)+vec2i(vec2f(o.x*stride,-o.y*stride)),0).r','cacheTile[neighborIndex].r')
 return code
}
