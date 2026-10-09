const f=Math.fround;export const offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
export function frontCoordinate(q,n,o,stride,flip=false){const px=flip?f(f(n-q)-.5):f(q+.5),uv=f(px/n),uvj=f(uv+f(f(o*stride)/n));const admitted=uvj>=0&&uvj<=1,index=Math.max(0,Math.min(n-1,Math.floor(f(uvj*n))));return{admitted,index:flip?n-1-index:index}}
export function frontCoordinateProof(n,stride){let mismatches=0,ignored=0,witness=null;for(let q=0;q<n;q++)for(const o of [-1,0,1])for(const flip of [false,true]){const c=frontCoordinate(q,n,o,stride,flip);if(!c.admitted){ignored++;continue}const expected=q+(flip?-1:1)*o*stride;if(c.index!==expected){mismatches++;witness??={q,o,flip,c,expected}}}return{n,stride,mismatches,ignored,witness}}
export function frontPixel({source,height,factor,neighbor,climb=15,floor=1,costMax=100,stride=1,dryCost=2,film=.7}){let best=f(source[0]*costMax),c=f(climb*factor);for(let k=0;k<8;k++){const v=neighbor(k);if(!v.admitted||v.ci>=f(.999))continue;const len=k<4?1:f(1.41421356),relief=Math.max(f(floor*stride),f(stride+f(c*f(height-v.height)))),mix=f(f(dryCost*f(1-film))+f(film)),edge=f(f(len*relief)*mix);best=Math.min(best,f(f(v.ci*costMax)+edge))}return[f(Math.min(best,costMax)/costMax),height,source[2],1].map(v=>Math.round(Math.min(1,Math.max(0,v))*255))}
export function frontTileShader(code){const anchor='@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u) {\n let q=tid.xy;if(any(q>=vec2u(u.resolution))){return;}';if(!code.includes(anchor))throw Error('Front main anchor absent');let result=code.replace(anchor,`var<workgroup> sourceTile:array<vec4f,144>;
var<workgroup> cacheTile:array<vec2f,144>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) tid:vec3u,@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_id) local:vec3u,@builtin(local_invocation_index) lane:u32) {
 let side=8u+2u*u32(u.coefficients.w);let base=group.xy*8u;
 for(var t=lane;t<side*side;t+=64u){let p=clamp(vec2i(base)+vec2i(i32(t%side),i32(t/side))-vec2i(i32(u.coefficients.w)),vec2i(0),vec2i(u.resolution)-vec2i(1));sourceTile[t]=textureLoad(input,p,0);cacheTile[t]=textureLoad(staticFrontCache,p,0).rg;}
 workgroupBarrier();
 let q=tid.xy;if(any(q>=vec2u(u.resolution))){return;}
 let center=(local.y+u32(u.coefficients.w))*side+local.x+u32(u.coefficients.w);`)
.replace('let source=fieldAt(input,uv);','let source=sourceTile[center];')
.replaceAll('textureLoad(staticFrontCache,vec2i(q),0).r','cacheTile[center].r')
.replaceAll('textureLoad(staticFrontCache,vec2i(q),0).g','cacheTile[center].g')
.replace('let ci=fieldAt(input,uvj).r;','let neighborIndex=u32(i32(local.y)+i32(stride)-i32(o.y*stride))*side+u32(i32(local.x)+i32(stride)+i32(o.x*stride));let ci=sourceTile[neighborIndex].r;')
.replace('textureLoad(staticFrontCache,vec2i(q)+vec2i(vec2f(o.x*stride,-o.y*stride)),0).r','cacheTile[neighborIndex].r');return result}
