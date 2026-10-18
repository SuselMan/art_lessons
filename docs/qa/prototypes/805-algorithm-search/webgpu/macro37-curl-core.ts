import type {IntegerWetCell} from './macro14-coherent-core'
/** Frozen one-way curl component; t1 preserves historical two-stage rounding. */
export function relaxedCurl(w:number,rate:number,wet:number,t:number){
 if(!Number.isInteger(w)||w<0||w>65535||!Number.isInteger(rate)||rate<0||rate>256||!Number.isInteger(wet)||wet<0||wet>16384||![1,2,4].includes(t))throw Error('Invalid curl component')
 const round=(n:number,d:number)=>Math.floor((n+d/2)/d)
 if(t===1)return round(round(w*rate,512)*wet,16384)
 const l=Math.floor((rate*wet+128)/256),r=32768-l,r2=round(r*r,32768),rt=t===2?r2:round(r2*r2,32768)
 return round(w*(32768-rt),32768)
}
/** Component-only donor transfer with unchanged final water/capacity/pigment packet clamps. */
export function curlTransfer(a:IntegerWetCell,b:IntegerWetCell,rate:number,wet:number,t:number){
 if(!Number.isInteger(rate)||Math.abs(rate)>256)throw Error('Invalid signed rate')
 const A={...a,m:a.m.slice(),d:a.d.slice()},B={...b,m:b.m.slice(),d:b.d.slice()},D=rate>=0?A:B,R=rate>=0?B:A,q=Math.min(relaxedCurl(D.w,Math.abs(rate),wet,t),Math.floor(D.w*4/5),65535-R.w),den=Math.max(D.w,1),alpha=Math.min(Math.floor((D.m[3]*q+Math.floor(den/2))/den),R.cap-R.m[3]-R.d[3]),ma=Math.max(D.m[3],1)
 for(let k=0;k<4;k++){const packet=k===3?alpha:Math.floor((D.m[k]*alpha+Math.floor(ma/2))/ma);D.m[k]-=packet;R.m[k]+=packet}D.w-=q;R.w+=q
 return{a:A,b:B,q}
}
