'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');const esbuild=require(require.resolve('esbuild',{paths:['/home/suselman/projects/pencil-agents/798-wave-buffer']}));
async function load(name){const r=await esbuild.build({entryPoints:[path.join(__dirname,name)],bundle:true,platform:'node',format:'cjs',write:false});const module={exports:{}};vm.runInNewContext(r.outputFiles[0].text,{module,exports:module.exports,Uint8Array,Uint16Array,Int32Array,Float32Array,Math,Number,Object,Error});return module.exports}
(async()=>{
 const{pathDistances,directions,denseKernel}=await load('macro2-paths.ts');
 // Negative results: row-normalized mask filtering is neither conservative nor connected-domain safe.
 const normalized=(a,m,r)=>a.map((_,i)=>{let s=0,n=0;for(let j=Math.max(0,i-r);j<=Math.min(a.length-1,i+r);j++)if(m[j]){s+=a[j];n++}return m[i]?s/n:0});const lost=normalized([1,0,0],[1,1,1],1),leak=normalized([1,0,0],[1,0,1],2);assert(Math.abs(lost.reduce((s,x)=>s+x,0)-5/6)<1e-12);assert.equal(leak[2],.5);
 let pathChecks=0;
 for(const kind of ['vertical','horizontal','diagonal','edge'])for(let phase=0;phase<4;phase++){
 const n=48,w=new Uint8Array(n*n).fill(255);for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(kind==='vertical'?x===20+phase:kind==='horizontal'?y===20+phase:kind==='diagonal'?x===y+phase:x===phase)w[y*n+x]=0;const dist=pathDistances(w,n);
 for(let i=0;i<w.length;i++)for(let d=0;d<8;d++){
  const[dx,dy]=directions[d],map=d<4?dist.axial:dist.diagonal,count=map[i*4+d%4],x=i%n,y=Math.floor(i/n);if(!w[i])assert.equal(count,0);
  for(let step=1;step<=count;step++){const xx=x+dx*step,yy=y+dy*step;assert(xx>=0&&yy>=0&&xx<n&&yy<n);assert(w[yy*n+xx]);if(dx&&dy){assert(w[(yy-dy)*n+xx]);assert(w[yy*n+xx-dx])}pathChecks++}
 }
 }
 const kernels=[];for(const[radius,sigma]of[[24,12],[32,16]]){const k=denseKernel(radius,sigma);assert(Math.abs(k.reduce((s,t)=>s+t.weight,0)-.75)<1e-12);let xx=0,yy=0,xy=0,r2=0;for(const t of k){const x=t.dx*t.r*4,y=t.dy*t.r*4;xx+=t.weight*x*x;yy+=t.weight*y*y;xy+=t.weight*x*y;r2+=t.weight*(x*x+y*y)}assert(Math.abs(xx-yy)<1e-9);assert(Math.abs(xy)<1e-9);kernels.push({radius,sigma,ideal3RoundRmsPx:Math.sqrt(r2*3),secondMomentAnisotropy:Math.abs(xx-yy),xy})}
 // Whole ideal finite-volume exchange + uniform detail split + adsorption. Variable conductivity and barriers.
 let massError=0;for(let trial=0;trial<24;trial++){const n=24,cell=4,fn=n*cell,initial=new Float64Array(fn*fn),wet=new Uint8Array(n*n).fill(255);for(let y=0;y<n;y++)wet[y*n+10+trial%4]=0;for(let i=0;i<initial.length;i++)initial[i]=((i*31+trial*7)%113)/500;let mobile=initial.map(v=>v*.8),fixed=initial.map(v=>v*.2);const dist=pathDistances(wet,n),k=denseKernel(7,3.5);
 for(let step=0;step<3;step++){const avg=new Float64Array(n*n),incoming=new Float64Array(n*n),outgoing=new Float64Array(n*n);for(let y=0;y<fn;y++)for(let x=0;x<fn;x++)avg[Math.floor(y/cell)*n+Math.floor(x/cell)]+=mobile[y*fn+x]/16;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let d=0;d<8;d++){const[dx,dy]=directions[d],map=d<4?dist.axial:dist.diagonal,available=map[(y*n+x)*4+d%4];for(const t of k){if(t.dx!==dx||t.dy!==dy||t.r>available)continue;const w=t.weight;outgoing[y*n+x]+=w;incoming[y*n+x]+=w*avg[(y+dy*t.r)*n+x+dx*t.r]}}
 mobile=mobile.map((v,i)=>{const ci=Math.floor(Math.floor(i/fn)/4)*n+Math.floor(i%fn/4);return v*(1-outgoing[ci])+incoming[ci]});for(let i=0;i<mobile.length;i++){const d=mobile[i]*.025;fixed[i]+=d;mobile[i]-=d;assert(mobile[i]>=0)}
 }
 const result=mobile.map((v,i)=>v+fixed[i]),before=initial.reduce((s,v)=>s+v,0),after=result.reduce((s,v)=>s+v,0);massError=Math.max(massError,Math.abs(after-before));assert(Math.abs(after-before)<1e-8);
 }
 let premulCases=0;for(let i=0;i<20000;i++){const a=(i%251)/251,b=((i*17)%251)/251,c=[a*((i%7)/7),a*.3,a*.8,a],d=[b*.9,b*((i%13)/13),b*.1,b],own=.25,incoming=.75,receiver=1.04;const out=c.map((v,j)=>v*own+d[j]*incoming*receiver);for(let j=0;j<3;j++)assert(out[j]<=out[3]+1e-14);premulCases++;}
 console.log(JSON.stringify({scope:'CPU ideal geometry/mass; no GPU timing or image quality',negativeNormalizedBlur:{mass:lost.reduce((s,x)=>s+x,0),dryBarrierLeaked:leak[2]},pathChecks,kernels,wholePipelineMassCases:24,maxMassError:massError,premulCases},null,2));
 let smoke=fs.readFileSync(path.join(__dirname,'cpu-sanity.cjs'),'utf8').replace("load('index.ts')","load('macro2-index.ts')");vm.runInNewContext(smoke,{require,module:{exports:{}},__dirname,console,process,Uint8Array,Float32Array,Int32Array,Uint16Array,Map,Set,Math,Number,Object,Error});
})().catch(e=>{console.error(e);process.exitCode=1});
