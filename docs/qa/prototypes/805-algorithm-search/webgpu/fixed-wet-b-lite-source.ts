import {physicalDtSource} from './macro30-physical-dt'
export function fixedWetPairSource(){const s=physicalDtSource(3,4),a='let j=u32(partner.y)*p.n+u32(partner.x);';if(s.split(a).length!==2)throw Error('Fixed wet pair anchor drift');return s.replace(a,a+'if(aux[i].x==0u||aux[j].x==0u){dst[i]=adsorb(src[i],aux[i]);return;}')}
const common=`struct Cell{m:vec4u,d:vec4u,w:u32,s:u32,pad:vec2u} struct Params{n:u32,size:u32,phase:u32,pad:u32}
fn unpack(v:vec2u)->vec4u{return vec4u(v.x&65535u,v.x>>16u,v.y&65535u,v.y>>16u);}
fn pack(v:vec4u)->vec2u{return vec2u(v.r|(v.g<<16u),v.b|(v.a<<16u));}
fn bytes(v:u32)->vec4u{return vec4u(v&255u,(v>>8u)&255u,(v>>16u)&255u,v>>24u);}
`;
export const FIXED_INIT=common+`
@group(0) @binding(0) var<storage,read> coarse:array<Cell>;
@group(0) @binding(1) var<storage,read> kind:array<u32>;
@group(0) @binding(2) var<storage,read> raw:array<u32>;
@group(0) @binding(3) var<storage,read_write> m:array<vec2u>;
@group(0) @binding(4) var<storage,read_write> d:array<vec2u>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) g:vec3u){if(any(g.xy>=vec2u(1024u))){return;}let i=g.y*1024u+g.x;let j=(g.y/8u)*128u+g.x/8u;var a=vec4u(0);var b=vec4u(0);if(kind[i]==1u){a=coarse[j].m;b=coarse[j].d;}else if(kind[i]==2u){a=bytes(raw[i])*257u;}m[i]=pack(a);d[i]=pack(b);}`;
export const FIXED_FINE=common+`
@group(0) @binding(0) var<storage,read> src:array<vec2u>;
@group(0) @binding(1) var<storage,read> d:array<vec2u>;
@group(0) @binding(2) var<storage,read> kind:array<u32>;
@group(0) @binding(3) var<storage,read_write> dst:array<vec2u>;
@group(0) @binding(4) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) g:vec3u){if(any(g.xy>=vec2u(1024u))){return;}let i=g.y*1024u+g.x;let axis=p.phase/2u;let offset=p.phase%2u;let coord=select(g.x,g.y,axis==1u);var other=vec2i(g.xy);let first=(coord+2u-offset)%2u==0u;if(axis==0u){other.x+=select(-1,1,first);}else{other.y+=select(-1,1,first);}if(any(other<vec2i(0))||any(other>=vec2i(1024))){dst[i]=src[i];return;}let j=u32(other.y)*1024u+u32(other.x);if(kind[i]==0u||kind[j]==0u){dst[i]=src[i];return;}let ia=min(i,j);let ib=max(i,j);let a=unpack(src[ia]);let b=unpack(src[ib]);let da=i32(b.a)-i32(a.a);let receiver=select(ib,ia,da>=0);let free=65535u-unpack(d[receiver]).a-unpack(src[receiver]).a;var rate=64u;if(da!=0){rate=min(64u,free*256u/u32(abs(da)));}var out=vec4u(0);for(var k=0u;k<4u;k++){let delta=i32(b[k])-i32(a[k]);let mag=(u32(abs(delta))*rate+128u)/256u;let q=select(-i32(mag),i32(mag),delta>=0);out[k]=u32(select(i32(b[k])-q,i32(a[k])+q,i==ia));}dst[i]=pack(out);}`;
export const FIXED_PACK=common+`
@group(0) @binding(0) var<storage,read> m:array<vec2u>;
@group(0) @binding(1) var<storage,read> d:array<vec2u>;
@group(0) @binding(2) var<storage,read> literal:array<u32>;
@group(0) @binding(3) var<storage,read_write> output:array<u32>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) g:vec3u){if(any(g.xy>=vec2u(1024u))){return;}let i=g.y*1024u+g.x;let v=(unpack(m[i])+unpack(d[i])+128u)/257u+bytes(literal[i]);output[i]=v.r|(v.g<<8u)|(v.b<<16u)|(v.a<<24u);}`;
