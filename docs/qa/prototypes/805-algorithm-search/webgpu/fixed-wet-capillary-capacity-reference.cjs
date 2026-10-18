'use strict';
/** Independent f64 CPU oracle for fixed-only accepted flux; not a WGSL executor. */
function step(state,n,c,domain){const {M,D,W,S,P}=state,N=n*n,F=new Float64Array(N*4),A=new Float64Array(N),outM=new Float64Array(N*4),outD=new Float64Array(D),outW=new Float64Array(N),outS=new Float64Array(S),neighbor=(i,k)=>{const x=i%n+[-1,1,0,0][k],y=(i/n|0)+[0,0,-1,1][k];return x<0||y<0||x>=n||y>=n?-1:y*n+x},opp=[1,0,3,2],cap=i=>.05+c.capacity*(1-P[i]),head=i=>W[i]-c.suction*Math.max(0,1-S[i]/cap(i));
 for(let i=0;i<N;i++){if(!domain[i]||W[i]<=c.wetThreshold)continue;let sum=0;for(let k=0;k<4;k++){const j=neighbor(i,k);if(j<0||!domain[j])continue;const f=c.flow*(.15+.85*(1-Math.max(P[i],P[j])))*Math.max(0,head(i)-head(j));F[4*i+k]=f;sum+=f}if(sum>W[i])for(let k=0;k<4;k++)F[4*i+k]*=W[i]/sum}
 for(let i=0;i<N;i++)for(let k=0;k<4;k++){const j=neighbor(i,k);if(j>=0)A[j]+=F[4*i+k]*M[4*i+3]/Math.max(W[i],1e-7)}
 for(let i=0;i<N;i++)for(let k=0;k<4;k++){const j=neighbor(i,k);if(j>=0&&A[j]>0)F[4*i+k]*=Math.min(1,Math.max(0,1-M[4*j+3]-D[4*j+3])/A[j])}
 for(let i=0;i<N;i++){let outgoing=0;for(let k=0;k<4;k++)outgoing+=F[i*4+k];let w=Math.max(0,W[i]-outgoing);for(let ch=0;ch<4;ch++)outM[4*i+ch]=M[4*i+ch]*(1-outgoing/Math.max(W[i],1e-7));for(let k=0;k<4;k++){const j=neighbor(i,k);if(j<0)continue;const f=F[4*j+opp[k]];w+=f;for(let ch=0;ch<4;ch++)outM[4*i+ch]+=M[4*j+ch]*f/Math.max(W[j],1e-7)}const absorbed=domain[i]?Math.min(Math.max(0,cap(i)-S[i]),c.absorption*w):0,frac=Math.min(1,Math.max(0,c.staining*absorbed/Math.max(w,1e-7)));for(let ch=0;ch<4;ch++){const d=outM[4*i+ch]*frac;outM[4*i+ch]-=d;outD[4*i+ch]+=d}outW[i]=w-absorbed;outS[i]+=absorbed}
 const incoming=new Float64Array(N),rate=(i,j)=>c.mixing*Math.min(outW[i],outW[j]),active=(i,j)=>j>=0&&domain[i]&&domain[j]&&outW[i]>c.wetThreshold&&outW[j]>c.wetThreshold;
 for(let i=0;i<N;i++)for(let k=0;k<4;k++){const j=neighbor(i,k);if(active(i,j))incoming[i]+=Math.max(0,rate(i,j)*(outM[4*j+3]/outW[j]-outM[4*i+3]/outW[i]))}
 const mixed=new Float64Array(outM),accept=i=>incoming[i]>0?Math.min(1,Math.max(0,1-outM[4*i+3]-outD[4*i+3])/incoming[i]):1;
 for(let i=0;i<N;i++)for(let k=0;k<4;k++){const j=neighbor(i,k);if(!active(i,j))continue;const da=rate(i,j)*(outM[4*j+3]/outW[j]-outM[4*i+3]/outW[i]),a=da>0?accept(i):da<0?accept(j):1;for(let ch=0;ch<4;ch++)mixed[4*i+ch]+=a*rate(i,j)*(outM[4*j+ch]/outW[j]-outM[4*i+ch]/outW[i])}
 return{M:mixed,D:outD,W:outW,S:outS,P};}
function flatten(weights,alpha){let max=1;for(const w of weights)max=Math.max(max,w);const s=alpha>0&&max>1?Math.max(0,Math.min(1,(1/alpha-1)/(max-1))):1;return weights.map(w=>1+s*(w-1))}
module.exports={step,flatten};
