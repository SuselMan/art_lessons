/** DEV research only: new fixed-point wet-brush transport, NOT canonical watercolor. */
export const TRANSPORT_MAX = 65535
export interface WetBrushState {width:number;height:number;water:Uint32Array;contact:Uint32Array;mass:Uint32Array}
export interface TransportPass {axis:0|1;parity:0|1;mixRate:number;advectionRate:number;direction:number}
export function makeWetBrushState(width:number,height:number):WetBrushState {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2)throw Error('Bounded integer grid required')
 return{width,height,water:new Uint32Array(width*height),contact:new Uint32Array(width*height),mass:new Uint32Array(width*height*2)}
}
/** SAME source deposition for own brush water and prior/foreign water. No provenance flag. */
export function depositWetBrush(s:WetBrushState,x:number,y:number,radius:number,water:number,pigment:readonly[number,number]) {
 if(radius<=0||[water,...pigment].some(v=>!Number.isInteger(v)||v<0||v>TRANSPORT_MAX))throw Error('Bounded fixed-point dose required')
 s.contact.fill(0);const added=[0,0]
 for(let j=0;j<s.height;j++)for(let i=0;i<s.width;i++){
  const distance=Math.hypot(i+.5-x,j+.5-y),coverage=Math.max(0,Math.min(1,(radius-distance)/1.5));if(!coverage)continue
  const n=j*s.width+i;s.contact[n]=Math.floor(coverage*TRANSPORT_MAX);s.water[n]=Math.max(s.water[n],Math.floor(coverage*water))
  for(let c=0;c<2;c++){const k=n*2+c,dose=Math.min(TRANSPORT_MAX-s.mass[k],Math.floor(coverage*pigment[c]));s.mass[k]+=dose;added[c]+=dose}
 }
 return added
}
/** One checkerboard pass: disjoint pairs; output sum per tracer EXACTLY unchanged. */
export function exchangeWetBrush(s:WetBrushState,p:TransportPass) {
 if(![p.mixRate,p.advectionRate].every(v=>Number.isInteger(v)&&v>=0&&v<=256)||!Number.isInteger(p.direction)||Math.abs(p.direction)>256)throw Error('Bounded rates/direction required')
 const out=s.mass.slice(),w=s.width,h=s.height
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const coordinate=p.axis===0?x:y;if(coordinate%2!==p.parity)continue
  const bx=x+(p.axis===0?1:0),by=y+(p.axis===1?1:0);if(bx>=w||by>=h)continue
  const a=y*w+x,b=by*w+bx,wet=Math.min(s.water[a],s.water[b],s.contact[a],s.contact[b]);if(!wet)continue
  for(let c=0;c<2;c++){
   let va=s.mass[a*2+c],vb=s.mass[b*2+c]
   const diff=va-vb,mix=Math.floor(Math.floor(Math.abs(diff)*wet/TRANSPORT_MAX)*p.mixRate/256)
   if(diff>0){const t=Math.min(mix,TRANSPORT_MAX-vb);va-=t;vb+=t}else{const t=Math.min(mix,TRANSPORT_MAX-va);va+=t;vb-=t}
   const forward=p.direction>=0,src=forward?va:vb,dst=forward?vb:va
   const t=Math.min(Math.floor(Math.floor(Math.floor(src*wet/TRANSPORT_MAX)*p.advectionRate/256)*Math.abs(p.direction)/256),TRANSPORT_MAX-dst)
   if(forward){va-=t;vb+=t}else{va+=t;vb-=t}out[a*2+c]=va;out[b*2+c]=vb
  }
 }
 s.mass=out
}
export function wetBrushMass(s:WetBrushState) {const result=[0,0];for(let i=0;i<s.mass.length;i++)result[i%2]+=s.mass[i];return result}
export const WET_BRUSH_TRANSPORT_WGSL=/* wgsl */`
struct Params {w:u32,h:u32,axis:u32,parity:u32,mixRate:u32,advectionRate:u32,direction:i32,pad:u32}
@group(0) @binding(0) var<storage,read> src:array<vec2u>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec2u>;
@group(0) @binding(2) var<storage,read> wetContact:array<vec2u>;
@group(0) @binding(3) var<uniform> p:Params;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let a=id.x;if(a>=p.w*p.h){return;}let x=a%p.w;let y=a/p.w;let coord=select(y,x,p.axis==0u);let extent=select(p.h,p.w,p.axis==0u);
 if(coord%2u!=p.parity){if(coord==0u){dst[a]=src[a];}return;}
 if(coord+1u>=extent){dst[a]=src[a];return;}let b=a+select(p.w,1u,p.axis==0u);
 let wet=min(min(wetContact[a].x,wetContact[b].x),min(wetContact[a].y,wetContact[b].y));
 var va=src[a];var vb=src[b];for(var c=0u;c<2u;c++){
  let difference=i32(va[c])-i32(vb[c]);let mixAmount=((u32(abs(difference))*wet/65535u)*p.mixRate)/256u;
  if(difference>0){let t=min(mixAmount,65535u-vb[c]);va[c]-=t;vb[c]+=t;}else{let t=min(mixAmount,65535u-va[c]);va[c]+=t;vb[c]-=t;}
  let forward=p.direction>=0;let source=select(vb[c],va[c],forward);let target=select(va[c],vb[c],forward);
  let t=min((((source*wet/65535u)*p.advectionRate)/256u)*u32(abs(p.direction))/256u,65535u-target);
  if(forward){va[c]-=t;vb[c]+=t;}else{va[c]+=t;vb[c]-=t;}
 }dst[a]=va;dst[b]=vb;
}`
/** Diagnostics, not artistic scoring. Checkerboard contrast is parity mean difference. */
export function wetBrushMetrics(s:WetBrushState) {
 const sums=[0,0],counts=[0,0];let imbalance=0,total=0
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const n=y*s.width+x,a=s.mass[n*2],b=s.mass[n*2+1];imbalance+=Math.abs(a-b);total+=a+b;if(s.water[n]){const p=(x+y)%2;sums[p]+=a+b;counts[p]++}}
 const means=sums.map((v,i)=>v/Math.max(1,counts[i]));return{mixing:total?1-imbalance/total:0,checkerboardContrast:Math.abs(means[0]-means[1])/Math.max(1,(means[0]+means[1])/2)}
}
