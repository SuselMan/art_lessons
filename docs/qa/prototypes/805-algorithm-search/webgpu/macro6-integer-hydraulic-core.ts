/** Rational u32 model, NOT an assertion of byte equivalence with GL floating arithmetic. */
export function integerPair(a:number[],b:number[],wa:number,wb:number,pa:number,pb:number,cap=52428){
 const A=a.slice(),B=b.slice()
 for(let c=0;c<4;c++){const d=B[c]-A[c],t=Math.floor((Math.abs(d)*25+50)/100)*Math.sign(d);A[c]+=t;B[c]-=t}
 const ha=wa+6*pa,hb=wb+6*pb,fromA=ha>hb,dw=fromA?wa:wb,rw=fromA?wb:wa
 // Avoid overflow: |head difference|<=67065, rounded numerator<=2,992,839,375.
 const q=Math.min(Math.floor((Math.abs(ha-hb)*35*(1275-2*Math.max(pa,pb))+63750)/127500),Math.floor(dw*4/5),65535-rw)
 const D=fromA?A:B,R=fromA?B:A
 const alpha=Math.min(Math.floor((D[3]*q+Math.floor(Math.max(dw,1)/2))/Math.max(dw,1)),cap-R[3])
 for(let c=0;c<4;c++){const t=c===3?alpha:Math.floor((D[c]*alpha+Math.floor(Math.max(D[3],1)/2))/Math.max(D[3],1));D[c]-=t;R[c]+=t}
 return{a:A,b:B,wa:wa+(fromA?-q:q),wb:wb+(fromA?q:-q),q}
}
