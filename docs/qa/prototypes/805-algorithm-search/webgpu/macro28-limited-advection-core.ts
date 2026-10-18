/** Limited concentration reconstruction inspired by MUSCL/minmod, NOT a TVD proof of the coupled split solver. */
export function minmod(a:number,b:number){return a*b<=0?0:(a>0?Math.min(a,b):Math.max(a,b))}
export function limitedAlpha(m:number,w:number,receiverM:number,receiverW:number,upstreamM:number,upstreamW:number,q:number,free:number,limited=true){
 const baseFlux=Math.floor((m*q+Math.floor(Math.max(w,1)/2))/Math.max(w,1)),ordinary=Math.min(baseFlux,free)
 if(!limited||q===0||w===0||receiverW===0||upstreamW===0)return{alpha:ordinary,ordinary,slope:0,correctionProduct:0}
 const c=Math.floor(m*256/w),cu=Math.floor(upstreamM*256/upstreamW),cr=Math.floor(receiverM*256/receiverW),slope=minmod(c-cu,cr-c)
 const factor=Math.floor((w-q)*256/w),correctionProduct=q*Math.abs(slope)*factor,correction=Math.floor((correctionProduct+65536)/131072)
 const adjusted=slope>=0?baseFlux+correction:Math.max(0,baseFlux-correction)
 return{alpha:Math.min(m,free,adjusted),ordinary,slope,correctionProduct}
}
