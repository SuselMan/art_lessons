import{srgbLab16,lab16Srgb,type Lab3}from'./cloneHealing152Math'
export type UnsharpPma159=readonly[number,number,number,number]
const clip=(x:number,n=255)=>Math.max(0,Math.min(n,x)),q=(x:number)=>Math.round(clip(x)),straight=(p:UnsharpPma159)=>p[3]>0?p.slice(0,3).map(c=>q(c/p[3]*255)):[0,0,0],lab=(p:UnsharpPma159)=>srgbLab16(straight(p).map(c=>c/255))
/** NativeLCMSdistance topology, functional D65conversion. NotRGBmax norICCidentity. */
export function unsharpDifference159(a:UnsharpPma159,b:UnsharpPma159,withAlpha:boolean):number{
 if(a[3]===0||b[3]===0)return withAlpha?Math.floor(Math.abs(a[3]-b[3])*100/255+.5):a[3]===b[3]?0:255
 const x=lab(a),y=lab(b),d=x.map((v,k)=>(v-y[k])*(k===0?100:255)/65535),alpha=withAlpha?(a[3]-b[3])*100/255:0
 return Math.floor(clip(Math.hypot(...d,alpha)))
}
/** Single-pixelnativebranch law afterquantizedGaussian. PMA8domain, hiddenRGBcanonical0. */
export function unsharpPixel159(a:UnsharpPma159,b:UnsharpPma159,amount:number,threshold:number,lightnessOnly:boolean):[number,number,number,number]{
 if(!Number.isFinite(amount)||amount<0||amount>5||!Number.isInteger(threshold)||threshold<0||threshold>255)throw new RangeError('Unsharp159 numeric scope')
 for(const p of[a,b])if(!p.every(v=>Number.isInteger(v)&&v>=0&&v<=255)||p.slice(0,3).some(c=>c>p[3]))throw new RangeError('Unsharp159 PMA8')
 const x=straight(a),y=straight(b),equal=a[3]===b[3]&&x.every((v,k)=>v===y[k]),diff=!lightnessOnly&&threshold===1?(equal?1:0):unsharpDifference159(a,b,lightnessOnly)
 if(diff<threshold)return[...a]
 if(lightnessOnly){const l=lab(a),bl=lab(b),L=Math.trunc(clip((1+amount)*l[0]-amount*bl[0],65535)),alpha16=Math.trunc(clip(((1+amount)*a[3]-amount*b[3])*257,65535)),alpha=alpha16/257,rgb=lab16Srgb([L,l[1],l[2]]as Lab3);return[rgb[0]*alpha,rgb[1]*alpha,rgb[2]*alpha,alpha].map(q)as[number,number,number,number]}
 const w=[1+amount,-amount],colors=[[...x,a[3]],[...y,b[3]]],sum=[0,0,0,0];let transparent=0
 for(let i=0;i<2;i++){if(w[i]===0)continue;if(colors[i][3]===0)transparent+=w[i];else for(let k=0;k<4;k++)sum[k]+=colors[i][k]*w[i]}
 if(transparent===1)return[...b] // Native no-write leaves the Gaussianpixel.
 const alpha=Math.trunc(clip(sum[3]));if(alpha===0)return[0,0,0,0] // Undefined native hiddenRGB canonicalized beforedivision.
 const denom=Math.trunc(128*(1-transparent));if(denom===0)throw Error('Unsharp159 visible denominator invariant');const rgb=sum.slice(0,3).map(v=>Math.trunc(clip(transparent===0?v:v*128/denom)))
 return[rgb[0]*alpha/255,rgb[1]*alpha/255,rgb[2]*alpha/255,alpha].map(q)as[number,number,number,number]
}
