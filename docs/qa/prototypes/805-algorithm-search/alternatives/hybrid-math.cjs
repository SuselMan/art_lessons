'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm');
const esbuild=require(require.resolve('esbuild',{paths:['/home/suselman/projects/pencil-agents/805-watercolor-search']}));
(async()=>{const b=await esbuild.build({entryPoints:[path.join(__dirname,'hybrid-support.ts')],bundle:true,platform:'node',format:'cjs',write:false});const module={exports:{}};vm.runInNewContext(b.outputFiles[0].text,{module,exports:module.exports,Uint8Array,Math,Error});const{reduceWet,safeFootprint}=module.exports;
const size=1024,water=new Uint8Array(size*size),rgba=new Uint8Array(size*size*4);let checks=0;
for(const kind of ['vertical','horizontal','diagonal','edge'])for(let phase=0;phase<4;phase++){
 water.fill(255);rgba.fill(80);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(kind==='vertical'?x===508+phase:kind==='horizontal'?y===508+phase:kind==='diagonal'?x===y+phase:x===phase)water[y*size+x]=0;
 const r=reduceWet({size,water,rgba});
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(water[y*size+x]===0){const j=(Math.floor(y/4)*256+Math.floor(x/4))*4;assert.equal(r.domain[j],0);assert.equal(r.rgba[j],0);assert(!safeFootprint(r.domain,x,y));checks++;}
 // Every accepted footprint contains no raw dry cell, including page-edge clamp.
 for(let y=0;y<size;y+=7)for(let x=0;x<size;x+=7)if(safeFootprint(r.domain,x,y)){
  const qx=Math.max(0,Math.min(255,(x+.5)/4-.5)),qy=Math.max(0,Math.min(255,(y+.5)/4-.5));for(const cy of [Math.floor(qy),Math.min(255,Math.floor(qy)+1)])for(const cx of [Math.floor(qx),Math.min(255,Math.floor(qx)+1)])for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)assert(water[(cy*4+dy)*size+cx*4+dx]>0);
 }
}
water.fill(0);const dry=reduceWet({size,water,rgba});assert(dry.rgba.every(x=>x===0));assert(!safeFootprint(dry.domain,512,512));
// Ideal four-face symmetric donor step: mass, positivity, disconnected barrier.
let seed=805;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);let maxError=0;
for(const stride of [1,2,4])for(let trial=0;trial<100;trial++){
 const n=24,a=Array.from({length:n*n},()=>rnd()),wet=a.map((_,i)=>i%n===12?0:1),out=a.slice();for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(const[dx,dy]of[[stride,0],[0,stride]]){if(x+dx>=n||y+dy>=n)continue;let gate=1;for(let k=0;k<=stride;k++)gate=Math.min(gate,wet[(y+dy/stride*k)*n+x+dx/stride*k]);const i=y*n+x,j=(y+dy)*n+x+dx,f=.85*.25*gate*(a[i]-a[j]);out[i]-=f;out[j]+=f;}const e=Math.abs(a.reduce((s,v)=>s+v,0)-out.reduce((s,v)=>s+v,0));maxError=Math.max(maxError,e);assert(e<1e-10);assert(out.every(v=>v>=0&&v<=1));for(let y=0;y<n;y++)assert.equal(out[y*n+12],a[y*n+12]);
}
console.log(JSON.stringify({scope:'CPU geometry/ideal float only; not GLSL execution',barrierKinds:4,gridPhases:4,dryPixelsChecked:checks,pairwiseCases:300,maxMassError:maxError,drySourceBlocked:true}));})().catch(e=>{console.error(e);process.exitCode=1});
