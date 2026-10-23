'use strict';const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/esbuild');
function load(file){const module={exports:{}};vm.runInNewContext(esbuild.buildSync({entryPoints:[__dirname+'/'+file],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,{module,exports:module.exports,Uint8Array,Uint32Array,Float32Array,ArrayBuffer,Math,Object,Error});return module.exports;}
const{dynamicPair}=load('macro8-integer-dynamic-core.ts');let seed=7;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
function cell(){const cap=rnd(65536),alpha=rnd(cap+1),da=rnd(cap-alpha+1),m=[rnd(alpha+1),rnd(alpha+1),rnd(alpha+1),alpha],d=[rnd(da+1),rnd(da+1),rnd(da+1),da],paper=rnd(256),absCap=8192+paper*64;return{m,d,w:rnd(65536),s:rnd(absCap+1),cap,absCap,paper};}
test('100k pairs exact global water+absorbed and all four pigment channels, positive premul capacity',()=>{
for(let t=0;t<100000;t++){const a=cell(),b=cell(),r=dynamicPair(a,b);assert.equal(r.a.w+r.a.s+r.b.w+r.b.s,a.w+a.s+b.w+b.s);
for(let k=0;k<4;k++)assert.equal(r.a.m[k]+r.a.d[k]+r.b.m[k]+r.b.d[k],a.m[k]+a.d[k]+b.m[k]+b.d[k]);
for(const c of [r.a,r.b]){assert.ok(c.w>=0&&c.w<=65535&&c.s>=0&&c.s<=c.absCap);assert.ok(c.m[3]+c.d[3]<=c.cap);for(const v of [c.m,c.d])for(let k=0;k<4;k++)assert.ok(Number.isInteger(v[k])&&v[k]>=0&&v[k]<=v[3]);}}
});
test('constant-paper drop expands into initially dry neighbours without water generation',()=>{
let cells=Array.from({length:32},()=>({m:[0,0,0,0],d:[0,0,0,0],w:0,s:0,cap:65535,absCap:16384,paper:128}));cells[16].w=50000;cells[16].m=[20000,10000,0,30000];
for(let step=0;step<128;step++)for(let x=step%2;x<31;x+=2){const r=dynamicPair(cells[x],cells[x+1]);cells[x]=r.a;cells[x+1]=r.b;}
assert.equal(cells.reduce((s,c)=>s+c.w+c.s,0),50000);assert.ok(cells.filter(c=>c.w+c.s>0).length>8);assert.equal(cells.reduce((s,c)=>s+c.m[3]+c.d[3],0),30000);
});
test('u32 numerator bounds include rounding',()=>{assert.ok(73193*35*1275+63750<2**32);assert.ok(65535**2+32767<2**32);assert.ok(65535*2047+32767<2**32);});
module.exports={load};
test('initial dry pigment literal, mixed opaque capacity freezes wet material explicitly, free cells mobilize',()=>{
 const{initialIntegerDynamic}=load('macro8-integer-dynamic.ts'),size=1024,rgba=new Uint8Array(size*size*4),water=new Uint8Array(size*size),paper=new Uint8Array(size*size);
 // First cell: opaque dry pixel and wet pigment => no legal uniform incoming capacity.
 rgba.set([10,20,30,255],0);rgba.set([20,30,40,100],4);water[1]=255;
 // Second cell: pure wet source => mobile.
 rgba.set([20,30,40,100],8*4);water[8]=255;
 const input={size,seed:1,rgba,water,paper},r=initialIntegerDynamic(input);
 assert.equal(r.summary.frozenCellCount,1);assert.equal(r.summary.frozenWetAlpha,100);assert.equal(r.summary.initialStationaryAlpha,355);assert.equal(r.summary.initialMobileAlpha,100);
 assert.equal(r.state[3],0);assert.equal(r.aux[0],0);assert.equal(r.stationary[0],(10|20<<8|30<<16|255<<24)>>>0);assert.ok(r.state[12+3]>0);
 for(let j=0;j<128**2;j++)assert.ok(r.state[j*12+3]<=r.aux[j*4]);
 water.fill(0);const d=initialIntegerDynamic(input);assert.deepEqual(Array.from(d.stationary.slice(0,10)),Array.from(new Uint32Array(rgba.buffer).slice(0,10)));assert.equal(d.summary.initialMobileCodes,0);
});
test('actual adapter fixed dispatches, ledger readback, repeated reset, cleanup on bind failure: MOCK not WGSL compilation',async()=>{
 const{create}=load('macro8-integer-dynamic.ts');let fail=false;const buffers=[],dispatches=[];const device={queue:{writeBuffer(){},async onSubmittedWorkDone(){},submit(){}},createShaderModule(){return{async getCompilationInfo(){return{messages:[]}}}},async createComputePipelineAsync(){return{getBindGroupLayout(){return{}}}},createBindGroup(){if(fail)throw Error('bind fail');return{}},createBuffer({size}){const b={dead:0,destroy(){this.dead++},async mapAsync(){},getMappedRange(){return new ArrayBuffer(size)},unmap(){}};buffers.push(b);return b},createCommandEncoder(){return{beginComputePass(){return{setPipeline(){},setBindGroup(){},dispatchWorkgroups(...v){dispatches.push(v)},end(){}}},copyBufferToBuffer(){},finish(){return{}}}}};
 const c=await create(device,1024,{steps:4}),input={size:1024,seed:1,rgba:new Uint8Array(1024**2*4),water:new Uint8Array(1024**2),paper:new Uint8Array(1024**2)};
 for(let i=0;i<2;i++){await c.upload(input);c.run();assert.equal((await c.readback()).length,input.rgba.length);}assert.equal(dispatches.length,10);c.destroy();c.destroy();assert.ok(buffers.every(b=>b.dead===1));
 fail=true;await assert.rejects(()=>create(device,1024),/bind fail/);assert.ok(buffers.every(b=>b.dead===1));
});
