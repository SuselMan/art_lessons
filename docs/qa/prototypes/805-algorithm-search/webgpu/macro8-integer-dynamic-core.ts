export interface IntegerWetCell{m:number[];d:number[];w:number;s:number;cap:number;absCap:number;paper:number}
const roundDiv=(a:number,b:number)=>Math.floor((a+Math.floor(b/2))/b)
export function adsorb(cell:IntegerWetCell):IntegerWetCell{
 const c={...cell,m:cell.m.slice(),d:cell.d.slice()},absorbed=Math.min(Math.floor(c.w/32),c.absCap-c.s)
 // Deliberately two rounded stages, before multiply70: no hidden >u32 product.
 const alpha=Math.floor(roundDiv(c.m[3]*absorbed,Math.max(c.w,1))*70/100),ma=Math.max(c.m[3],1)
 for(let k=0;k<4;k++){const t=k===3?alpha:roundDiv(c.m[k]*alpha,ma);c.m[k]-=t;c.d[k]+=t}
 c.w-=absorbed;c.s+=absorbed;return c
}
export function dynamicPair(a:IntegerWetCell,b:IntegerWetCell){
 const A={...a,m:a.m.slice(),d:a.d.slice()},B={...b,m:b.m.slice(),d:b.d.slice()}
 const head=(c:IntegerWetCell)=>c.w+6*c.paper-Math.floor((c.absCap-c.s)/4)
 const fromA=head(A)>head(B),D=fromA?A:B,R=fromA?B:A
 const q=Math.min(roundDiv(Math.abs(head(A)-head(B))*35*(1275-2*Math.max(A.paper,B.paper)),127500),Math.floor(D.w*4/5),65535-R.w)
 const alpha=Math.min(roundDiv(D.m[3]*q,Math.max(D.w,1)),R.cap-R.m[3]-R.d[3]),da=Math.max(D.m[3],1)
 for(let k=0;k<4;k++){const t=k===3?alpha:roundDiv(D.m[k]*alpha,da);D.m[k]-=t;R.m[k]+=t}
 D.w-=q;R.w+=q;return{a:adsorb(A),b:adsorb(B),q}
}
