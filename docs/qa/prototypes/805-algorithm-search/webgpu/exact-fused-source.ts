import {MACRO9_PAIR} from './macro9-integer-smooth'
/** Two ordered X/Y phases, redundant one-cell halo. Core8x8, tile10x10.
 * No global phase barrier removed without replacement: each workgroup loads
 * previous global state, computes X in shared A->B, barriers, computes Y.
 * Halo X values needed by core Y always have their X partner inside the tile.
 */
export function fusedPairSource(source=MACRO9_PAIR){
 const start='@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){'
 const marker='var a=src[ia];var b=src[ib];'
 const end='if(i==ia){dst[i]=adsorb(a,aux[ia]);}else{dst[i]=adsorb(b,aux[ib]);}'
 for(const a of[start,marker,end])if(source.split(a).length!==2)throw Error('Fused pair source anchor drift')
 const arithmetic=source.slice(source.indexOf(marker)+marker.length,source.indexOf(end))
 return source.slice(0,source.indexOf(start))+`
var<workgroup> tileA:array<Cell,100>;
var<workgroup> tileB:array<Cell,100>;
fn localRead(i:u32,sub:u32)->Cell{if(sub==0u){return tileA[i];}return tileB[i];}
fn advance(g:vec2i,l:vec2u,sub:u32)->Cell{
 let li=l.y*10u+l.x;let current=localRead(li,sub);
 if(any(g<vec2i(0))||any(g>=vec2i(i32(p.n)))){return current;}
 let i=u32(g.y)*p.n+u32(g.x);let phase=p.phase+sub;let axis=phase%2u;let offset=phase/2u;
 let coord=select(u32(g.x),u32(g.y),axis==1u);let first=(coord+2u-offset)%2u==0u;
 var partner=g;var lp=vec2i(l);let delta=select(-1,1,first);
 if(axis==0u){partner.x+=delta;lp.x+=delta;}else{partner.y+=delta;lp.y+=delta;}
 if(any(partner<vec2i(0))||any(partner>=vec2i(i32(p.n)))){return adsorb(current,aux[i]);}
 // Only discarded halo cells can need a partner outside this local tile.
 if(any(lp<vec2i(0))||any(lp>=vec2i(10))){return current;}
 let lj=u32(lp.y)*10u+u32(lp.x);let j=u32(partner.y)*p.n+u32(partner.x);let ia=min(i,j);let ib=max(i,j);
 var a=localRead(min(li,lj),sub);var b=localRead(max(li,lj),sub);
 `+arithmetic+`if(i==ia){return adsorb(a,aux[ia]);}return adsorb(b,aux[ib]);
}
@compute @workgroup_size(10,10) fn main(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_id) local:vec3u){
 let g=vec2i(group.xy*8u+local.xy)-vec2i(1);let clamped=vec2u(clamp(g,vec2i(0),vec2i(i32(p.n)-1)));let li=local.y*10u+local.x;
 tileA[li]=src[clamped.y*p.n+clamped.x];workgroupBarrier();
 tileB[li]=advance(g,local.xy,0u);workgroupBarrier();
 let result=advance(g,local.xy,1u);
 if(all(local.xy>=vec2u(1))&&all(local.xy<=vec2u(8))){dst[u32(g.y)*p.n+u32(g.x)]=result;}
}`
}
