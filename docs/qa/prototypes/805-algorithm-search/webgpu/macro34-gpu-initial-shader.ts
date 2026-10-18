export const GPU_INITIAL_SHADER=`
struct Cell{m:vec4u,d:vec4u,w:u32,s:u32,pad:vec2u}
@group(0) @binding(0) var<storage,read> rgba:array<u32>;
@group(0) @binding(1) var<storage,read> water:array<u32>;
@group(0) @binding(2) var<storage,read> sourceAux:array<vec4u>;
@group(0) @binding(3) var<storage,read_write> state:array<Cell>;
@group(0) @binding(4) var<storage,read_write> aux:array<vec4u>;
@group(0) @binding(5) var<storage,read_write> stationary:array<u32>;
@group(0) @binding(6) var<storage,read_write> summary:array<atomic<u32>>;
fn unpack(v:u32)->vec4u{return vec4u(v&255u,(v>>8u)&255u,(v>>16u)&255u,v>>24u);}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3u){
 let ci=gid.x;if(ci>=16384u){return;}let bx=(ci&127u)*8u;let by=(ci>>7u)*8u;
 var sums=vec4u(0);var sumW=0u;var dryAlpha=0u;var maxDry=0u;var maxWet=0u;
 for(var dy=0u;dy<8u;dy++){for(var dx=0u;dx<8u;dx++){
 let i=(by+dy)*1024u+bx+dx;let packed=rgba[i];let v=unpack(packed);let w=(water[i>>2u]>>((i&3u)*8u))&255u;sumW+=w;
 stationary[i]=select(0u,packed,w==0u);
 if(w==0u){dryAlpha+=v.a;maxDry=max(maxDry,v.a);}else{sums+=v;maxWet=max(maxWet,v.a);}
 }}
 var codes=(sums*257u+vec4u(32u))/64u;var cap=65535u-maxDry*257u;let frozen=codes.a>cap;
 if(frozen){atomicAdd(&summary[2],sums.a);atomicAdd(&summary[3],1u);cap=65535u-max(maxDry,maxWet)*257u;
 for(var dy=0u;dy<8u;dy++){for(var dx=0u;dx<8u;dx++){let i=(by+dy)*1024u+bx+dx;stationary[i]=rgba[i];}}codes=vec4u(0);
 }else{atomicAdd(&summary[1],sums.a);atomicAdd(&summary[5],codes.a);for(var c=0u;c<4u;c++){atomicAdd(&summary[6u+c],codes[c]);}}
 atomicAdd(&summary[0],dryAlpha+select(0u,sums.a,frozen));let W=(sumW*257u+128u)/256u;atomicAdd(&summary[4],W);
 state[ci]=Cell(codes,vec4u(0),W,0u,vec2u(0));let e=sourceAux[ci];aux[ci]=vec4u(cap,e.y,e.z,e.w);
}`
