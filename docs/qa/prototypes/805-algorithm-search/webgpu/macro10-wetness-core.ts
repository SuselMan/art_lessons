export interface IntegerWetCell{m:number[];d:number[];w:number;s:number;cap:number;absCap:number;paper:number}
const roundDiv=(a:number,b:number)=>Math.floor((a+Math.floor(b/2))/b)
export function adsorbMixed(cell:IntegerWetCell):IntegerWetCell{
 const c={...cell,m:cell.m.slice(),d:cell.d.slice()},absorbed=Math.min(Math.floor(c.w/128),c.absCap-c.s)
 // Deliberately two rounded stages, before multiply70: no hidden >u32 product.
 const alpha=Math.floor(roundDiv(c.m[3]*absorbed,Math.max(c.w,1))*20/100),ma=Math.max(c.m[3],1)
 for(let k=0;k<4;k++){const t=k===3?alpha:roundDiv(c.m[k]*alpha,ma);c.m[k]-=t;c.d[k]+=t}
 c.w-=absorbed;c.s+=absorbed;return c
}
export function wetnessPair(a:IntegerWetCell,b:IntegerWetCell){
 const A={...a,m:a.m.slice(),d:a.d.slice()},B={...b,m:b.m.slice(),d:b.d.slice()}
 const mixed=exchangeWet(A,B);A.m=mixed.a;B.m=mixed.b
 const head=(c:IntegerWetCell)=>c.w+6*c.paper-Math.floor((c.absCap-c.s)/4)
 const fromA=head(A)>head(B),D=fromA?A:B,R=fromA?B:A
 const q0=Math.min(roundDiv(Math.abs(head(A)-head(B))*35*(1275-2*Math.max(A.paper,B.paper)),127500),Math.floor(D.w*4/5),65535-R.w)
 const meanW=Math.floor((A.w+B.w)/2),q=roundDiv(q0*meanW,65535)
 const alpha=Math.min(roundDiv(D.m[3]*q,Math.max(D.w,1)),R.cap-R.m[3]-R.d[3]),da=Math.max(D.m[3],1)
 for(let k=0;k<4;k++){const t=k===3?alpha:roundDiv(D.m[k]*alpha,da);D.m[k]-=t;R.m[k]+=t}
 D.w-=q;R.w+=q;return{a:adsorbMixed(A),b:adsorbMixed(B),q}
}

/** Bidirectional carrier exchange, including equal-alpha different colors. */
export function exchangeWet(a:IntegerWetCell,b:IntegerWetCell){
 let k=Math.floor(64*Math.min(a.w,b.w)/Math.max(a.w,b.w,1));k=Math.floor(k*Math.min(16384,a.w,b.w)/16384)
 const out=(m:number[],k:number)=>{const alpha=Math.floor(m[3]*k/256),den=Math.max(m[3],1);return m.map((v,c)=>c===3?alpha:roundDiv(v*alpha,den))}
 let A=out(a.m,k),B=out(b.m,k)
 while(a.m[3]-A[3]+B[3]+a.d[3]>a.cap||b.m[3]-B[3]+A[3]+b.d[3]>b.cap){k=Math.floor(k/2);A=out(a.m,k);B=out(b.m,k)}
 return{a:a.m.map((v,c)=>v-A[c]+B[c]),b:b.m.map((v,c)=>v-B[c]+A[c]),k}
}
