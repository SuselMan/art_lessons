/** NEW fine regularization operator, not merely a different PACK. All channels are integer carrier codes0..65535. */
export interface FineCarrier {m:number[];freeAlpha:number;affinity:number;wet:boolean}
export function finePair(a:FineCarrier,b:FineCarrier){
 for(const c of [a,b]){if(c.m.length!==4||!c.m.every(v=>Number.isInteger(v)&&v>=0&&v<=65535)||!Number.isInteger(c.freeAlpha)||c.freeAlpha<0||c.freeAlpha>65535||c.m[3]>c.freeAlpha||c.m.some(v=>v>c.m[3])||!Number.isInteger(c.affinity)||c.affinity<1||c.affinity>256)throw Error('Invalid fine carrier')}
 let A=a.m.slice(),B=b.m.slice();if(!a.wet||!b.wet)return{a:A,b:B}
 const drive=a.m[3]*b.affinity-b.m[3]*a.affinity
 if(!drive)return{a:A,b:B}
 const donor=drive>0?a:b,receiver=drive>0?b:a,amount=Math.min(donor.m[3],receiver.freeAlpha-receiver.m[3],Math.floor(Math.abs(drive)/(4*(a.affinity+b.affinity))))
 if(!amount)return{a:A,b:B}
 const packet=donor.m.map((v,k)=>k===3?amount:Math.floor((v*amount+Math.floor(donor.m[3]/2))/donor.m[3]))
 if(drive>0){A=A.map((v,k)=>v-packet[k]);B=B.map((v,k)=>v+packet[k])}else{A=A.map((v,k)=>v+packet[k]);B=B.map((v,k)=>v-packet[k])}
 return{a:A,b:B}
}
/** Four disjoint parity phases, exactly conservative pair exchange; capacity includes stationary literal alpha. */
export const MACRO11_FINE_PAIR=`
struct Params{size:u32,phase:u32,pad:vec2u}
@group(0) @binding(0) var<storage,read> source:array<vec4u>;
@group(0) @binding(1) var<storage,read> aux:array<vec4u>;
@group(0) @binding(2) var<storage,read_write> dest:array<vec4u>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let horizontal=p.phase<2u;let parity=p.phase&1u;
 let axis=select(gid.y,gid.x,horizontal);if((axis&1u)!=parity){return;}
 let ia=gid.y*p.size+gid.x;let q=gid.xy+select(vec2u(0,1),vec2u(1,0),horizontal);
 if(any(q>=vec2u(p.size))){dest[ia]=source[ia];return;}let ib=q.y*p.size+q.x;
 var a=source[ia];var b=source[ib];let qa=aux[ia];let qb=aux[ib];
 if(qa.z>0u&&qb.z>0u){let left=a.a*qb.y;let right=b.a*qa.y;
 let forward=left>right;let delta=max(left,right)-min(left,right);
 let donor=select(b,a,forward);let receiver=select(a,b,forward);let capacity=select(qa.x,qb.x,forward);
 let amount=min(min(donor.a,capacity-receiver.a),delta/(4u*(qa.y+qb.y)));
 if(amount>0u){var packet=vec4u(0);for(var k=0u;k<3u;k++){packet[k]=(donor[k]*amount+donor.a/2u)/donor.a;}packet.a=amount;
 if(forward){a-=packet;b+=packet;}else{a+=packet;b-=packet;}}}
 dest[ia]=a;dest[ib]=b;
 // Odd-parity phases leave the leading boundary outside any pair.
 if(axis==1u){let edge=gid.xy-select(vec2u(0,1),vec2u(1,0),horizontal);let e=edge.y*p.size+edge.x;dest[e]=source[e];}
}`
