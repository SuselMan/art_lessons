'use strict';
const assert=require('node:assert/strict');let seed=805;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);let cases=0,maxMassError=0,maxPigment=0;
for(let trial=0;trial<300;trial++){
 const n=12,beta=.25,dt=.2,w=Array.from({length:n*n},()=>rnd()),paper=w.map(()=>rnd()),pig=w.map(()=>rnd()*.3),raw=w.map(x=>x>.15?1:0);for(let i=0;i<w.length;i++)if(!raw[i])w[i]=0;
 for(const stride of [4,2,1]){
 const out=w.slice(),p=pig.slice(),maxH=Math.max(...w.map((v,i)=>v+beta*paper[i]));
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(const [dx,dy] of [[stride,0],[0,stride]]){
 const xx=x+dx,yy=y+dy;if(xx>=n||yy>=n)continue;const i=y*n+x,j=yy*n+xx;let gate=1;for(let k=0;k<=stride;k++)gate=Math.min(gate,raw[(y+dy/stride*k)*n+x+dx/stride*k]);
 const delta=w[i]-w[j]+beta*(paper[i]-paper[j]),coef=dt*gate*Math.min(1,w[i]/(5*dt*Math.max(delta,0)+1e-7),w[j]/(5*dt*Math.max(-delta,0)+1e-7)),f=coef*delta;
 out[i]-=f;out[j]+=f;const cp=Math.max(f,0)/Math.max(w[i],1e-7)*pig[i]-Math.max(-f,0)/Math.max(w[j],1e-7)*pig[j]+.01*gate*(pig[i]-pig[j]);p[i]-=cp;p[j]+=cp;
 }
 const err=Math.abs(out.reduce((a,b)=>a+b,0)-w.reduce((a,b)=>a+b,0));maxMassError=Math.max(maxMassError,err);assert(err<1e-10);assert(Math.abs(p.reduce((a,b)=>a+b,0)-pig.reduce((a,b)=>a+b,0))<1e-10);
 for(let i=0;i<w.length;i++){assert(out[i]>=-1e-14);assert(p[i]>=-1e-14);assert(out[i]+beta*paper[i]<=maxH+1e-14);if(!raw[i])assert.equal(out[i],0);maxPigment=Math.max(maxPigment,p[i]);}cases++;
 }
}
console.log(JSON.stringify({scope:'ideal float paired-face oracle, not GPU/UNORM result',cases,maxMassError,maxPigment,waterCapacity:4,idealBound:1.25,rgba8OverflowNotExcluded:true},null,2));
