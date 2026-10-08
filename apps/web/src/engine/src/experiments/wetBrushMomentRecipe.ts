import type {Dab} from '@grafetto/shared'
/** DEV proposed seam only. No production caller/default currently imports this. */
export interface MomentContactState {lastX:number|null;lastY:number|null;directionX:number;directionY:number;nextOrdinal:number}
export interface MomentContactRecipe {ordinal:number;x256:number;y256:number;radius256:number;pressure256:number;directionX:number;directionY:number;mixRate:number;advectionRate:number}
export function momentContactState():MomentContactState{return{lastX:null,lastY:null,directionX:0,directionY:0,nextOrdinal:0}}
/** Caller passes production retained dabs ONCE, never once per tile. No live clock. */
export function prepareMomentContacts(state:MomentContactState,dabs:readonly Dab[],enabled=false):readonly MomentContactRecipe[] {
 if(!enabled)return[]
 const result:MomentContactRecipe[]=[]
 for(const d of dabs){if(![d.x,d.y,d.size,d.pressure].every(Number.isFinite)||d.size<0)throw Error('Finite prepared dab required');const x256=Math.round(d.x*256),y256=Math.round(d.y*256);if(Math.max(Math.abs(x256),Math.abs(y256))>2**30)throw Error('Bounded quantized world required')
  if(state.lastX!==null&&state.lastY!==null){const dx=x256-state.lastX,dy=y256-state.lastY,n=Math.max(Math.abs(dx),Math.abs(dy));if(n){state.directionX=Math.trunc(dx*256/n);state.directionY=Math.trunc(dy*256/n)}}
  const pressure256=Math.round(Math.max(0,Math.min(1,d.pressure))*256)
  result.push({ordinal:state.nextOrdinal++,x256,y256,radius256:Math.round(d.size*128),pressure256,directionX:state.directionX,directionY:state.directionY,mixRate:Math.floor(pressure256*48/256),advectionRate:Math.floor(pressure256*80/256)})
  state.lastX=x256;state.lastY=y256
 }
 return result
}
export interface MomentCarrier {mass:number;moments:readonly[number,number,number,number]}
export interface MomentPairResult {a:MomentCarrier;b:MomentCarrier;exchanged:number;advected:number}
/** Explicit subset guard: C moments must be premultiplied bounded by pigment mass.
 * Nonconforming actual records are unsupported; do NOT clamp their physics. */
export function assertMomentCarrier(p:MomentCarrier) {
 if(!Number.isInteger(p.mass)||p.mass<0||p.mass>255||p.moments.some(v=>!Number.isInteger(v)||v<0||v>p.mass))throw Error('Experimental moment carrier requires Q8 mass and C<=P.B; unsupported actual record')
}
function portion(source:MomentCarrier,mass:number):[number,number,number,number] {return source.moments.map(v=>source.mass?Math.floor(v*mass/source.mass):0) as [number,number,number,number]}
/** Exchange EQUAL pigment doses so different colours mix even when Pa==Pb.
 * Then advect a coupled pigment+moment dose. Every channel total EXACTLY preserved. */
export function exchangeMomentPair(a:MomentCarrier,b:MomentCarrier,wet255:number,mixRate:number,advectionRate:number,direction:number):MomentPairResult {
 assertMomentCarrier(a);assertMomentCarrier(b)
 if(![wet255,mixRate,advectionRate].every(v=>Number.isInteger(v)&&v>=0&&v<=255)||!Number.isInteger(direction)||Math.abs(direction)>256)throw Error('Bounded integer moment budget required')
 const q=Math.floor(Math.floor(Math.min(a.mass,b.mass)*wet255/255)*mixRate/255),outA=portion(a,q),outB=portion(b,q)
 const aa={mass:a.mass,moments:a.moments.map((v,i)=>v-outA[i]+outB[i]) as [number,number,number,number]},bb={mass:b.mass,moments:b.moments.map((v,i)=>v-outB[i]+outA[i]) as [number,number,number,number]}
 const forward=direction>=0,source=forward?aa:bb,target=forward?bb:aa
 const moved=Math.min(Math.floor(Math.floor(Math.floor(source.mass*wet255/255)*advectionRate/255)*Math.abs(direction)/256),255-target.mass),moments=portion(source,moved)
 source.mass-=moved;target.mass+=moved;for(let c=0;c<4;c++){source.moments[c]-=moments[c];target.moments[c]+=moments[c]}
 assertMomentCarrier(aa);assertMomentCarrier(bb);return{a:aa,b:bb,exchanged:q,advected:moved}
}
