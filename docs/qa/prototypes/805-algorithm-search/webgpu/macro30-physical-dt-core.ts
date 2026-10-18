import type {IntegerWetCell} from './macro14-coherent-core'
const roundDiv=(a:number,b:number)=>Math.floor((a+Math.floor(b/2))/b)
export function effectiveExchange(k:number,t:number){if(!Number.isInteger(k)||k<0||k>64||![1,2,4].includes(t))throw Error('Invalid exchange timestep');if(t===1)return k;const r=256-2*k,r2=Math.floor((r*r+128)/256),rt=t===2?r2:Math.floor((r2*r2+128)/256);return Math.floor((256-rt)/2)}
/** CPU oracle variation; rates frozen over each local enlarged step, not a whole split-solver equivalence. */
export function physicalDtPair(a:IntegerWetCell,b:IntegerWetCell,rate:number,gain=3,t=1){
 if(![1,2,4].includes(t)||!Number.isInteger(rate)||Math.abs(rate)>256)throw Error('Invalid physical timestep/rate')
 const A={...a,m:a.m.slice(),d:a.d.slice()},B={...b,m:b.m.slice(),d:b.d.slice()}
 let k=Math.floor(64*Math.min(A.w,B.w)/Math.max(A.w,B.w,1));k=Math.floor(k*Math.min(16384,Math.min(A.w,B.w)*gain)/16384);k=effectiveExchange(k,t)
 const packet=(m:number[],coefficient:number)=>{const alpha=Math.floor(m[3]*coefficient/256);return m.map((v,j)=>j===3?alpha:roundDiv(v*alpha,Math.max(m[3],1)))}
 let outA=packet(A.m,k),outB=packet(B.m,k);while(A.m[3]-outA[3]+outB[3]+A.d[3]>A.cap||B.m[3]-outB[3]+outA[3]+B.d[3]>B.cap){k=Math.floor(k/2);outA=packet(A.m,k);outB=packet(B.m,k)}
 A.m=A.m.map((v,j)=>v-outA[j]+outB[j]);B.m=B.m.map((v,j)=>v-outB[j]+outA[j])
 const head=(c:IntegerWetCell)=>c.w+6*c.paper-Math.floor((c.absCap-c.s)/4),pressureFromA=head(A)>head(B),PD=pressureFromA?A:B,PR=pressureFromA?B:A
 const q0=Math.min(roundDiv(Math.abs(head(A)-head(B))*35*(1275-2*Math.max(A.paper,B.paper)),127500),Math.floor(PD.w*4/5),65535-PR.w),meanW=Math.min(Math.floor((A.w+B.w)/2)*gain,65535),pressureQ=roundDiv(q0*meanW,65535)*t
 const upwind=rate>=0?A.w:B.w,curl0=roundDiv(upwind*Math.abs(rate)*t,512),curlWet=Math.min(Math.floor((A.w+B.w)/2)*gain,16384),curlQ=roundDiv(curl0*curlWet,16384),combined=(pressureFromA?pressureQ:-pressureQ)+(rate>=0?curlQ:-curlQ)
 const fromA=combined>0,D=fromA?A:B,R=fromA?B:A,q=Math.min(Math.abs(combined),Math.floor(D.w*4/5),65535-R.w),alpha=Math.min(roundDiv(D.m[3]*q,Math.max(D.w,1)),R.cap-R.m[3]-R.d[3]),da=Math.max(D.m[3],1)
 for(let j=0;j<4;j++){const moved=j===3?alpha:roundDiv(D.m[j]*alpha,da);D.m[j]-=moved;R.m[j]+=moved}D.w-=q;R.w+=q
 for(const c of[A,B]){const absorbed=Math.min(Math.floor(c.w/(128/t)),c.absCap-c.s),pigment=Math.floor(roundDiv(c.m[3]*absorbed,Math.max(c.w,1))*20/100),ma=Math.max(c.m[3],1);for(let j=0;j<4;j++){const moved=j===3?pigment:roundDiv(c.m[j]*pigment,ma);c.m[j]-=moved;c.d[j]+=moved}c.w-=absorbed;c.s+=absorbed}
 return{a:A,b:B,q}
}
