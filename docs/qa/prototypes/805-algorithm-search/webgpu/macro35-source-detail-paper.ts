import {integerOption,type Input} from './contract'
export interface SourceDetailStats {gain:number;corePixels:number;changedPixels:number;clippedPixels:number;maxAbsBandpass:number;maxAbsAppliedBandpass:number}
/** Integer separable box with clamped boundaries; rounded after each axis. */
function blur(a:Uint8Array,n:number,r:number){const k=2*r+1,tmp=new Uint8Array(a.length),out=new Uint8Array(a.length),half=Math.floor(k/2)
 for(let y=0;y<n;y++){const row=y*n;let sum=0;for(let d=-r;d<=r;d++)sum+=a[row+(d<0?0:d>=n?n-1:d)];for(let x=0;x<n;x++){tmp[row+x]=((sum+half)/k)|0;sum+=a[row+(x+r+1<n?x+r+1:n-1)]-a[row+(x-r>0?x-r:0)]}}
 for(let x=0;x<n;x++){let sum=0;for(let d=-r;d<=r;d++)sum+=tmp[(d<0?0:d>=n?n-1:d)*n+x];for(let y=0;y<n;y++){out[y*n+x]=((sum+half)/k)|0;sum+=tmp[(y+r+1<n?y+r+1:n-1)*n+x]-tmp[(y-r>0?y-r:0)*n+x]}}
 return out
}
/** New geometric affinity cue only. Original rgba/water/paper arrays are never modified. */
export function sourceDetailPaper(input:Input,gain:number):{paper:Uint8Array;stats:SourceDetailStats}{
 integerOption(gain,0,4,'sourceDetailGain');const n=input.size,N=n*n;if(!Number.isInteger(n)||n<3||input.rgba.length!==N*4||input.water.length!==N||input.paper.length!==N)throw Error('Invalid source detail input')
 const stats:SourceDetailStats={gain,corePixels:0,changedPixels:0,clippedPixels:0,maxAbsBandpass:0,maxAbsAppliedBandpass:0};if(gain===0)return{paper:input.paper,stats}
 const alpha=new Uint8Array(N);for(let i=0;i<N;i++)if(input.water[i]>0)alpha[i]=input.rgba[i*4+3]
 const fine=blur(alpha,n,1),coarse=blur(alpha,n,4),paper=Uint8Array.from(input.paper)
 for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){const i=y*n+x;let core=true;for(let dy=-1;dy<=1&&core;dy++)for(let dx=-1;dx<=1;dx++){const j=i+dy*n+dx;if(input.water[j]===0||input.rgba[j*4+3]<=8){core=false;break}}if(!core)continue;stats.corePixels++;const raw=fine[i]-coarse[i],h=raw<-32?-32:raw>32?32:raw,value=input.paper[i]-gain*h,result=value<0?0:value>255?255:value;const absRaw=raw<0?-raw:raw,absH=h<0?-h:h;if(absRaw>stats.maxAbsBandpass)stats.maxAbsBandpass=absRaw;if(absH>stats.maxAbsAppliedBandpass)stats.maxAbsAppliedBandpass=absH;if(value!==result)stats.clippedPixels++;if(result!==paper[i])stats.changedPixels++;paper[i]=result}
 return{paper,stats}
}
