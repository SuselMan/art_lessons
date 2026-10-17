export interface IntegerWetCell{m:number[];d:number[];w:number;s:number;cap:number;absCap:number;paper:number}
const roundDiv=(a:number,b:number)=>Math.floor((a+Math.floor(b/2))/b)
export function adsorbMixed(cell:IntegerWetCell):IntegerWetCell{
 const c={...cell,m:cell.m.slice(),d:cell.d.slice()},absorbed=Math.min(Math.floor(c.w/128),c.absCap-c.s)
 // Deliberately two rounded stages, before multiply70: no hidden >u32 product.
 const alpha=Math.floor(roundDiv(c.m[3]*absorbed,Math.max(c.w,1))*20/100),ma=Math.max(c.m[3],1)
 for(let k=0;k<4;k++){const t=k===3?alpha:roundDiv(c.m[k]*alpha,ma);c.m[k]-=t;c.d[k]+=t}
 c.w-=absorbed;c.s+=absorbed;return c
}
export function mixedDynamicPair(a:IntegerWetCell,b:IntegerWetCell){
 const A={...a,m:a.m.slice(),d:a.d.slice()},B={...b,m:b.m.slice(),d:b.d.slice()}
 const mixed=exchange(A,B);A.m=mixed.a;B.m=mixed.b
 const head=(c:IntegerWetCell)=>c.w+6*c.paper-Math.floor((c.absCap-c.s)/4)
 const fromA=head(A)>head(B),D=fromA?A:B,R=fromA?B:A
 const q=Math.min(roundDiv(Math.abs(head(A)-head(B))*35*(1275-2*Math.max(A.paper,B.paper)),127500),Math.floor(D.w*4/5),65535-R.w)
 const alpha=Math.min(roundDiv(D.m[3]*q,Math.max(D.w,1)),R.cap-R.m[3]-R.d[3]),da=Math.max(D.m[3],1)
 for(let k=0;k<4;k++){const t=k===3?alpha:roundDiv(D.m[k]*alpha,da);D.m[k]-=t;R.m[k]+=t}
 D.w-=q;R.w+=q;return{a:adsorbMixed(A),b:adsorbMixed(B),q}
}

/** Bidirectional carrier exchange, including equal-alpha different colors. */
export function exchange(a:IntegerWetCell,b:IntegerWetCell){
 let k=Math.floor(64*Math.min(a.w,b.w)/Math.max(a.w,b.w,1))
 const out=(m:number[],k:number)=>{const alpha=Math.floor(m[3]*k/256),den=Math.max(m[3],1);return m.map((v,c)=>c===3?alpha:roundDiv(v*alpha,den))}
 let A=out(a.m,k),B=out(b.m,k)
 while(a.m[3]-A[3]+B[3]+a.d[3]>a.cap||b.m[3]-B[3]+A[3]+b.d[3]>b.cap){k=Math.floor(k/2);A=out(a.m,k);B=out(b.m,k)}
 return{a:a.m.map((v,c)=>v-A[c]+B[c]),b:b.m.map((v,c)=>v-B[c]+A[c]),k}
}
/** Half-pixel integer weights, including duplicate clamped indices. */
export function axisWeights(x:number,n:number,r=8){const den=2*r,q=2*x+1-r,b=Math.floor(q/den),t=q-b*den;return{lo:Math.max(0,Math.min(n-1,b)),hi:Math.max(0,Math.min(n-1,b+1)),left:den-t,right:t,den}}
export function smoothCodes(codes:Uint32Array,w:number,h:number,r=8){
 const out=new Uint8Array(w*h*r*r*4),D=4*r*r*257
 for(let y=0;y<h*r;y++)for(let x=0;x<w*r;x++){const X=axisWeights(x,w,r),Y=axisWeights(y,h,r)
 for(let c=0;c<4;c++){let v=0;for(const [cx,wx]of [[X.lo,X.left],[X.hi,X.right]])for(const[cy,wy]of [[Y.lo,Y.left],[Y.hi,Y.right]])v+=codes[(cy*w+cx)*4+c]*wx*wy;out[(y*w*r+x)*4+c]=Math.floor((v+D/2)/D)}}return out
}
