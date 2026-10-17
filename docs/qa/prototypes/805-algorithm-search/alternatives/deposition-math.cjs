'use strict';
const assert=require('node:assert/strict');let checks=0;
for(let a=0;a<=255;a++)for(let r=0;r<=a;r++)for(const fraction of [0,.05,.12,.16,.4,.5,.7,.8,1]){
 const ma=Math.floor(a*fraction+.5),mr=Math.floor(r*fraction+.5),fa=a-ma,fr=r-mr;
 assert.equal(ma+fa,a);assert.equal(mr+fr,r);assert(mr<=ma&&fr<=fa);checks++;
 // Same integer partition is used for the local adsorption transaction.
 const da=Math.floor(ma*.16+.5),dr=Math.floor(mr*.16+.5);
 assert.equal((ma-da)+da,ma);assert.equal((mr-dr)+dr,mr);assert(dr<=da&&(mr-dr)<=(ma-da));
}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},wet=x=>smooth(.01,.15,x),receiver=x=>.12+.88*(1-smooth(.25,.75,x));
assert.equal(wet(0),0);assert.equal(wet(.6),1);assert.equal(wet(.95),1);assert(wet(.05)<.25);assert.equal(receiver(0),1);assert.equal(receiver(1),.12);
let seed=8057;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
for(let trial=0;trial<100;trial++){
 const n=8,source=[],water=[],paper=[];
 for(let i=0;i<n*n;i++){const a=random()*.2;source.push([a*random(),a*random(),a*random(),a]);water.push(i%n===0?0:random());paper.push(random())}
 for(const stride of [1,2,4]){
  const out=source.map(c=>c.slice());
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,wi=wet(water[i]),ai=.1+.9*receiver(paper[i]);for(const[dx,dy]of dirs){const xx=x+dx*stride,yy=y+dy*stride;if(xx<0||yy<0||xx>=n||yy>=n)continue;const j=yy*n+xx,aj=.1+.9*receiver(paper[j]);let pathWet=Math.min(wi,wet(water[j]));for(let t=1;t<stride;t++)pathWet=Math.min(pathWet,wet(water[(y+dy*t)*n+x+dx*t]));const g=pathWet*.65/8;for(let k=0;k<4;k++)out[i][k]+=g*(ai*source[j][k]-aj*source[i][k])}}
  for(let k=0;k<4;k++)assert(Math.abs(source.reduce((s,c)=>s+c[k],0)-out.reduce((s,c)=>s+c[k],0))<1e-10);
  for(let i=0;i<n*n;i++){assert(out[i].every(v=>v>=0));assert(out[i].slice(0,3).every(v=>v<=out[i][3]+1e-14));if(water[i]===0)assert.deepEqual(out[i],source[i])}
 }
}
// Raw zero stays zero through split, every linear donor, deposition and sum.
for(const water of [0,.05,.6,.95])for(const height of [0,.5,1]){const m=Math.floor(0*.4*wet(water)+.5),d=Math.floor(m*.16*(.2+.8*receiver(height))+.5);assert.equal((0-m)+d+(m-d),0)}
// Even one dry cell prevents a coarse endpoint-only hop between wet islands.
for(const stride of [2,4,6]){const path=Array(stride+1).fill(1);path[1]=0;assert.equal(Math.min(...path.map(wet)),0)}
for(let value=0;value<256;value++){const bytes=Math.floor((value/255)*255+.5);assert.equal(bytes,value)}
console.log(JSON.stringify({dryByteRoundtrip:256,dryPathBarrier:true,scope:'CPU arithmetic, NOT GLSL execution',bytePartitionChecks:checks,floatDonorCases:300,massTolerance:1e-10,dryBlocked:true,noArtificialPoolEdgeSignal:wet(.6)===wet(.95),thinVsWet:wet(.05)<wet(.95),zeroPigmentInvariant:true,qualification:'transport round/saturation still measured on GPU; no complete physical-watercolor claim'},null,2));
