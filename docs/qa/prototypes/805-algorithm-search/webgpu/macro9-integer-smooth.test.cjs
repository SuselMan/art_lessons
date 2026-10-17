'use strict';const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/esbuild');
function load(file){const module={exports:{}};vm.runInNewContext(esbuild.buildSync({entryPoints:[__dirname+'/'+file],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,{module,exports:module.exports,Uint8Array,Uint32Array,Float32Array,ArrayBuffer,Math,Object,Error});return module.exports;}
const{axisWeights,smoothCodes,exchange,mixedDynamicPair,adsorbMixed}=load('macro9-integer-smooth-core.ts');
test('exact integer halfpixel columns including clamped edges sum r, rows sum2r',()=>{
 for(const n of [1,2,3,128])for(const r of [1,2,3,8]){const sum=new Uint32Array(n);for(let x=0;x<n*r;x++){const a=axisWeights(x,n,r);assert.equal(a.left+a.right,2*r);sum[a.lo]+=a.left;sum[a.hi]+=a.right;}for(const s of sum)assert.equal(s,2*r*r);}
});
test('zero, constant, max range, common quantization threshold preserve premul',()=>{
 for(let r=0;r<20;r++){const c=new Uint32Array(3*5*4);for(let i=0;i<c.length;i+=4){const a=(i*191+r*997)%65536;c.set([Math.floor(a*.3),Math.floor(a*.6),a,a],i);}const out=smoothCodes(c,3,5);for(let i=0;i<out.length;i+=4)for(let k=0;k<3;k++)assert.ok(out[i+k]<=out[i+3]);}
 assert.ok(smoothCodes(new Uint32Array(16),2,2).every(v=>v===0));assert.ok(smoothCodes(new Uint32Array(4).fill(65535),1,1).every(v=>v===255));assert.ok(65535*256+32896<2**32);
});
let seed=17;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
function cell(){const cap=rnd(65536),ma=rnd(cap+1),da=rnd(cap-ma+1),paper=rnd(256),absCap=8192+paper*64;return{m:[rnd(ma+1),rnd(ma+1),rnd(ma+1),ma],d:[rnd(da+1),rnd(da+1),rnd(da+1),da],w:rnd(65536),s:rnd(absCap+1),cap,absCap,paper};}
test('100k mixing pairs preserve water/four pigment codes, premul, capacity',()=>{
 for(let i=0;i<100000;i++){const a=cell(),b=cell(),r=mixedDynamicPair(a,b);assert.equal(r.a.w+r.a.s+r.b.w+r.b.s,a.w+a.s+b.w+b.s);for(let k=0;k<4;k++)assert.equal(r.a.m[k]+r.a.d[k]+r.b.m[k]+r.b.d[k],a.m[k]+a.d[k]+b.m[k]+b.d[k]);for(const c of [r.a,r.b]){assert.ok(c.m[3]+c.d[3]<=c.cap);for(const v of [c.m,c.d])for(let k=0;k<4;k++)assert.ok(v[k]>=0&&v[k]<=v[3]);}}
});
test('equal-alpha different colors exchange BOTH directions; wet0 gates exchange',()=>{
 const base={d:[0,0,0,0],w:10000,s:0,cap:65535,absCap:16384,paper:128},a={...base,m:[30000,0,0,30000]},b={...base,m:[0,0,30000,30000]};const r=exchange(a,b);assert.ok(r.a[2]>0&&r.b[0]>0);assert.equal(r.a[3],30000);assert.equal(exchange({...a,w:0},b).k,0);
});
test('whole 2D uniform-water pool mixes separated colors across32px gap after256 actual phases',()=>{
 const w=32,h=8;let cells=Array.from({length:w*h},(_,i)=>{const x=i%w,a=x===8||x===9,b=x===14||x===15;return{m:[a?30000:0,0,b?30000:0,a||b?30000:0],d:[0,0,0,0],w:16000,s:0,cap:65535,absCap:16384,paper:128}});
 const totals=()=>[0,1,2,3].map(k=>cells.reduce((s,c)=>s+c.m[k]+c.d[k],0)),initial=totals(),water=cells.reduce((s,c)=>s+c.w+c.s,0);
 for(let step=0;step<256;step++){const phase=step%4,axis=phase%2,offset=Math.floor(phase/2),next=Array(cells.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=y*w+x;if(next[i])continue;const coord=axis?y:x,first=(coord+2-offset)%2===0,xx=x+(axis?0:first?1:-1),yy=y+(axis?first?1:-1:0);
 if(xx<0||yy<0||xx>=w||yy>=h){next[i]=adsorbMixed(cells[i]);continue;}const j=yy*w+xx,ia=Math.min(i,j),ib=Math.max(i,j),r=mixedDynamicPair(cells[ia],cells[ib]);next[ia]=r.a;next[ib]=r.b;
 }cells=next;}
 assert.deepEqual(totals(),initial);assert.equal(cells.reduce((s,c)=>s+c.w+c.s,0),water);assert.ok(cells.some(c=>c.m[0]+c.d[0]>500&&c.m[2]+c.d[2]>500));assert.ok(cells.reduce((s,c)=>s+c.m[3],0)>initial[3]/2);
});
test('actual adapter flags GLOBAL nearest fallback for any stationary pigment, clears fallback on fresh all-zero upload',async()=>{
 const{create}=load('macro9-integer-smooth.ts'),writes=[],buffers=[];const device={queue:{writeBuffer(b,o,a){if(o===12)writes.push(a[0])},async onSubmittedWorkDone(){},submit(){}},createShaderModule(){return{async getCompilationInfo(){return{messages:[]}}}},async createComputePipelineAsync(){return{getBindGroupLayout(){return{}}}},createBindGroup(){return{}},createBuffer({size}){const b={destroyed:0,destroy(){this.destroyed++},async mapAsync(){},getMappedRange(){return new ArrayBuffer(size)},unmap(){}};buffers.push(b);return b},createCommandEncoder(){return{beginComputePass(){return{setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}}},copyBufferToBuffer(){},finish(){return{}}}}};
 const c=await create(device,1024,{steps:4}),input={size:1024,seed:1,rgba:new Uint8Array(1024**2*4),water:new Uint8Array(1024**2),paper:new Uint8Array(1024**2)};
 input.rgba[3]=255;await c.upload(input);assert.equal(c.metadata.reconstruction,'nearest-global-fallback-stationary');assert.ok(c.metadata.reconstructionFallback);assert.ok(writes.slice(-4).every(v=>v===3));c.run();
 input.rgba.fill(0);await c.upload(input);assert.equal(c.metadata.reconstruction,'integer-halfpixel-bilinear');assert.equal(c.metadata.reconstructionFallback,null);assert.ok(writes.slice(-4).every(v=>v===2));c.run();c.destroy();c.destroy();assert.ok(buffers.every(b=>b.destroyed===1));
});
