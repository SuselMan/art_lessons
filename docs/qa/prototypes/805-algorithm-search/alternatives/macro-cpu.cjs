'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');const esbuild=require(require.resolve('esbuild',{paths:['/home/suselman/projects/pencil-agents/805-watercolor-search']}));
async function load(name){const r=await esbuild.build({entryPoints:[path.join(__dirname,name)],bundle:true,platform:'node',format:'cjs',write:false});const module={exports:{}};vm.runInNewContext(r.outputFiles[0].text,{module,exports:module.exports,Uint8Array,Uint16Array,Int32Array,Float32Array,Math,Number,Object,Error});return module.exports}
function stats(src,n,scale=1){let mass=0,r2=0,far=0,mixed=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=src[y*n+x],d=Math.hypot(x-n/2,y-n/2)*scale;mass+=v;r2+=v*d*d;if(d>=50)far+=v;if(v>1e-5)mixed++}return{mass,rmsPx:Math.sqrt(r2/mass),fractionAtLeast50px:far/mass,positivePixels:mixed}}
(async()=>{
 const {macroSchedule}=await load('macro-multiscale.ts'),{geodesicPairs}=await load('macro-geodesic-map.ts');const results=[];
 for(const program of [0,1]){
  const n=256,initial=new Float64Array(n*n);initial[(n/2)*n+n/2]=1;let a=initial;
  for(const stride of macroSchedule(program)){const b=new Float64Array(a);for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(const[dx,dy]of[[stride,0],[0,stride]]){if(x+dx>=n||y+dy>=n)continue;const i=y*n+x,j=(y+dy)*n+x+dx,f=.75*.25*(a[i]-a[j]);b[i]-=f;b[j]+=f}a=b}
  const s=stats(a,n,4);assert(Math.abs(s.mass-1)<1e-10);assert(s.rmsPx>=50);assert(s.fractionAtLeast50px>.3);results.push({method:'multiscale',program,...s});
 }
 let mapChecks=0;for(let phase=0;phase<4;phase++){
  const n=128,w=new Uint8Array(n*n).fill(255);for(let y=0;y<n;y++)w[y*n+60+phase]=0;
  for(let variant=0;variant<3;variant++){const m=geodesicPairs(w,n,24,96,variant);assert(m.maxWalkDistance<=96);for(let i=0;i<w.length;i++){assert.equal(m.pairs[m.pairs[i]],i);if(!w[i])assert.equal(m.pairs[i],i);else assert.equal(i%n<60+phase,m.pairs[i]%n<60+phase);mapChecks++}}
 }
 const n=256,w=new Uint8Array(n*n).fill(255),maps=[0,1,2].map(i=>geodesicPairs(w,n,62,96,i));let red=new Float64Array(n*n),blue=new Float64Array(n*n);for(let y=100;y<156;y++)for(let x=70;x<95;x++)red[y*n+x]=.3;for(let y=100;y<156;y++)for(let x=145;x<170;x++)blue[y*n+x]=.3;const beforeR=red.reduce((s,v)=>s+v,0),beforeB=blue.reduce((s,v)=>s+v,0);for(let cycle=0;cycle<3;cycle++)for(const map of maps){red=red.map((v,i)=>v*.6+red[map.pairs[i]]*.4);blue=blue.map((v,i)=>v*.6+blue[map.pairs[i]]*.4)}let mixed=0;for(let i=0;i<w.length;i++)if(red[i]>.001&&blue[i]>.001)mixed++;assert(mixed>0);assert(Math.abs(red.reduce((s,v)=>s+v,0)-beforeR)<1e-8);assert(Math.abs(blue.reduce((s,v)=>s+v,0)-beforeB)<1e-8);results.push({method:'geodesic',mixedTwoColorPixels:mixed,meanWalkDistances:maps.map(m=>m.meanMatchedWalkDistance),matchedFractions:maps.map(m=>m.matchedPixels/w.length)});

 // Quantized involutive transfer: every pair conserves each channel, no dry changes.
 let byteCases=0;for(const share of [.35,.4,.5])for(let a=0;a<256;a++)for(let b=0;b<256;b++){
  const delta=b-a,d=Math.sign(delta)*Math.floor(Math.abs(delta)*share+.5),aa=a+d,bb=b-d;
  assert.equal(aa+bb,a+b);assert(aa>=0&&aa<=255&&bb>=0&&bb<=255);byteCases++;
 }
 // Obstacle requires actual walk around it; disconnected islands cannot pair.
 {const n=64,w=new Uint8Array(n*n).fill(255);for(let y=0;y<48;y++)w[y*n+32]=0;const m=geodesicPairs(w,n,24,80,2);for(let i=0;i<w.length;i++){assert.equal(m.pairs[m.pairs[i]],i);if(!w[i])assert.equal(m.pairs[i],i)}assert(m.maxWalkDistance<=80);const empty=geodesicPairs(new Uint8Array(n*n),n,24,80);assert.equal(empty.matchedPixels,0)}
 console.log(JSON.stringify({integerPairCases:byteCases,pairedChannelMassExact:true,dryZeroSelfMaps:true}));
 {const n=64,w=new Uint8Array(n*n).fill(255);for(let i=0;i<n;i++)w[i*n+i]=0;const map=geodesicPairs(w,n,20,80,1);for(let i=0;i<w.length;i++){const j=map.pairs[i];assert.equal(Math.sign(i%n-Math.floor(i/n)),Math.sign(j%n-Math.floor(j/n)))}}
 // Reuse existing actual registry FakeGL lifecycle test without editing it or registry.
 let smoke=fs.readFileSync(path.join(__dirname,'cpu-sanity.cjs'),'utf8').replace("const {definitions}=await load('index.ts')","const definitions=[...(await load('macro-multiscale.ts')).definitions,...(await load('macro-geodesic.ts')).definitions]");vm.runInNewContext(smoke,{require,module:{exports:{}},__dirname,console,process,Uint8Array,Float32Array,Int32Array,Uint16Array,Map,Set,Math,Number,Object,Error});
 console.log(JSON.stringify({scope:'CPU ideal transport geometry and FakeGL lifecycle; no GLSL/GPU timing',mapChecks,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
