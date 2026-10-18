'use strict';const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),esbuild=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/esbuild');
function load(file){const m={exports:{}};vm.runInNewContext(esbuild.buildSync({entryPoints:[__dirname+'/'+file],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,{module:m,exports:m.exports,Uint8Array,Uint32Array,Int32Array,ArrayBuffer,Math,Object,Error,crypto:crypto.webcrypto});return m.exports;}
const{buildStream,faceRate}=load('macro14-stream-field.ts'),{coherentPair}=load('macro14-coherent-core.ts'),{calibratedPair}=load('macro13-mobility-core.ts');
test('integer vertex field exact zero divergence, sealed boundary, rate<=256, deterministic seed and nullstrength',()=>{
 for(const n of[16,32,128])for(const strength of[0,64,128]){const aux=new Uint32Array(n*n*4);for(let i=0;i<n*n;i++)aux[i*4+2]=(i*131)%256;const a=buildStream(aux,n,805,16,strength),b=buildStream(aux.slice(),n,805,16,strength);assert.deepEqual(a.psi,b.psi);const row=n+1;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*row+x,UR=a.psi[i+row+1]-a.psi[i+1],UL=a.psi[i+row]-a.psi[i],VB=a.psi[i+row]-a.psi[i+row+1],VT=a.psi[i]-a.psi[i+1];assert.equal(UR-UL+VB-VT,0);assert.ok(Math.abs(UR)<=256&&Math.abs(VB)<=256);}
 for(let i=0;i<=n;i++){assert.equal(a.psi[i],0);assert.equal(a.psi[n*row+i],0);assert.equal(a.psi[i*row],0);assert.equal(a.psi[i*row+n],0);}if(strength===0)assert.ok(a.psi.every(v=>v===0));else assert.ok(a.psi.some(v=>v!==0));
 }
});
let seed=313;const rnd=n=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n;
const cell=()=>{const cap=rnd(65536),ma=rnd(cap+1),da=rnd(cap-ma+1),paper=rnd(256),absCap=8192+paper*64;return{m:[rnd(ma+1),rnd(ma+1),rnd(ma+1),ma],d:[rnd(da+1),rnd(da+1),rnd(da+1),da],w:rnd(65536),s:rnd(absCap+1),cap,absCap,paper};};
test('100k signed flux pairs exact4C/W/S, capacity/positive/premul; zero stream EXACT calibrated model',()=>{
for(let i=0;i<100000;i++){const a=cell(),b=cell(),g=i%8+1,rate=i%10===0?0:rnd(513)-256,r=coherentPair(a,b,rate,g);if(rate===0)assert.equal(JSON.stringify(r),JSON.stringify(calibratedPair(a,b,g)));assert.equal(r.a.w+r.a.s+r.b.w+r.b.s,a.w+a.s+b.w+b.s);for(let c=0;c<4;c++)assert.equal(r.a.m[c]+r.a.d[c]+r.b.m[c]+r.b.d[c],a.m[c]+a.d[c]+b.m[c]+b.d[c]);for(const x of[r.a,r.b]){assert.ok(x.w>=0&&x.w<=65535&&x.m[3]+x.d[3]<=x.cap);for(const v of[x.m,x.d])for(let c=0;c<4;c++)assert.ok(v[c]>=0&&v[c]<=v[3]);}}
});
test('coherent face moves pigment under UNIFORM water with signed direction, no pressure required',()=>{
const a={m:[20000,0,0,30000],d:[0,0,0,0],w:16000,s:0,cap:65535,absCap:16384,paper:128},b={...a,m:[0,0,0,0]},plus=coherentPair(a,b,256,3),zero=coherentPair(a,b,0,3),minus=coherentPair(a,b,-256,3);
assert.ok(plus.b.m[3]+plus.b.d[3]>zero.b.m[3]+zero.b.d[3]);assert.ok(minus.b.m[3]+minus.b.d[3]<zero.b.m[3]+zero.b.d[3]);assert.ok(plus.q>0&&minus.q>0);assert.ok(65535*256+256<2**32);assert.ok(32768*16384+8192<2**32);
});
test('actual host computes fieldSHA outside run, deterministic reupload, no growth and exact resource disposal: MOCK',async()=>{
const{create}=load('macro14-coherent-advection.ts'),buffers=[],sources=[],dispatches=[];const device={queue:{writeBuffer(){},async onSubmittedWorkDone(){},submit(){}},createShaderModule({code}){sources.push(code);return{async getCompilationInfo(){return{messages:[]}}}},async createComputePipelineAsync(){return{getBindGroupLayout(){return{}}}},createBindGroup(){return{}},createBuffer({size}){const b={size,dead:0,destroy(){this.dead++},async mapAsync(){},getMappedRange(){return new ArrayBuffer(size)},unmap(){}};buffers.push(b);return b},createCommandEncoder(){return{beginComputePass(){return{setPipeline(){},setBindGroup(){},dispatchWorkgroups(...v){dispatches.push(v)},end(){}}},copyBufferToBuffer(){},finish(){return{}}}}};
const c=await create(device,1024,{steps:4}),input={size:1024,seed:805,rgba:new Uint8Array(1024**2*4),water:new Uint8Array(1024**2),paper:new Uint8Array(1024**2)},count=buffers.length;let sha;
for(let i=0;i<2;i++){await c.upload(input);assert.match(c.metadata.field.sha256,/^[0-9a-f]{64}$/);if(sha)assert.equal(c.metadata.field.sha256,sha);sha=c.metadata.field.sha256;c.run();await c.readback();assert.equal(buffers.length,count);}assert.equal(dispatches.length,10);assert.ok(sources.some(s=>s.includes('fn streamFace')));c.destroy();c.destroy();assert.ok(buffers.every(b=>b.dead===1));
});
