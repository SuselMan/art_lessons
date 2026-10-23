'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const esbuild=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/esbuild');
function load(){const code=esbuild.buildSync({entryPoints:[__dirname+'/macro6-integer-hydraulic-core.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports});return module.exports;}
const {integerPair}=load();
let seed=1;function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
test('100000 integer pairs preserve all four code sums, water and premultiplication',()=>{
for(let j=0;j<100000;j++){
 const aa=random(65536),ba=random(65536),a=[random(aa+1),random(aa+1),random(aa+1),aa],b=[random(ba+1),random(ba+1),random(ba+1),ba],wa=random(65536),wb=random(65536);
 const r=integerPair(a,b,wa,wb,random(256),random(256),65535);
 assert.equal(r.wa+r.wb,wa+wb);assert.ok(r.wa>=0&&r.wa<=65535&&r.wb>=0&&r.wb<=65535);
 for(let c=0;c<4;c++){assert.equal(r.a[c]+r.b[c],a[c]+b[c]);for(const p of [r.a,r.b])assert.ok(Number.isInteger(p[c])&&p[c]>=0&&p[c]<=p[3]);}
}});
test('all u32 products stay bounded including division rounding terms',()=>{
 assert.ok(67065*35*1275+63750<2**32);
 assert.ok(65535*65535+32767<2**32);
 assert.ok(65535*255+32767<2**32);
});
test('zero pigment remains zero; equal water flat paper no hydraulic transfer',()=>{
 const r=integerPair([0,0,0,0],[0,0,0,0],1000,1000,12,12,65535);
 assert.equal(r.q,0);assert.deepEqual(Array.from(r.a),[0,0,0,0]);
});
test('actual adapter repeat upload/run/read and idempotent destroy: CPU mock only, no WGSL compile claim',async()=>{
 const code=esbuild.buildSync({entryPoints:[__dirname+'/macro6-integer-hydraulic.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,Uint8Array,Uint32Array,Float32Array,ArrayBuffer,Math,Object,Error});
 const buffers=[],dispatches=[];const device={queue:{writeBuffer(){},async onSubmittedWorkDone(){},submit(){}},
 createShaderModule(){return{async getCompilationInfo(){return{messages:[]}}}},async createComputePipelineAsync(){return{getBindGroupLayout(){return{}}}},createBindGroup(){return{}},
 createBuffer({size}){const b={size,dead:0,destroy(){this.dead++},async mapAsync(){},getMappedRange(){return new ArrayBuffer(size)},unmap(){}};buffers.push(b);return b},
 createCommandEncoder(){return{beginComputePass(){return{setPipeline(){},setBindGroup(){},dispatchWorkgroups(...v){dispatches.push(v)},end(){}}},copyBufferToBuffer(){},finish(){return{}}}}};
 const c=await module.exports.create(device,1024,{steps:4});const input={size:1024,seed:1,rgba:new Uint8Array(1024**2*4),water:new Uint8Array(1024**2),paper:new Uint8Array(1024**2)};
 assert.throws(()=>c.run());for(let repeat=0;repeat<2;repeat++){await c.upload(input);c.run();assert.equal((await c.readback()).length,1024**2*4);assert.throws(()=>c.run());}
 assert.equal(dispatches.length,10);c.destroy();c.destroy();assert.ok(buffers.every(b=>b.dead===1));await assert.rejects(()=>c.upload(input));
});
test('Number CPU reference matches independent BigInt integer divisions and bounded u32 numerators',()=>{
 for(let j=0;j<5000;j++){
 const aa=random(65536),ba=random(65536),a=[random(aa+1),random(aa+1),random(aa+1),aa],b=[random(ba+1),random(ba+1),random(ba+1),ba],wa=random(65536),wb=random(65536),pa=random(256),pb=random(256);
 const r=integerPair(a,b,wa,wb,pa,pb,65535),A=a.map(BigInt),B=b.map(BigInt);
 for(let c=0;c<4;c++){const d=B[c]-A[c],t=((d<0n?-d:d)*25n+50n)/100n*(d<0n?-1n:1n);A[c]+=t;B[c]-=t;}
 const fromA=wa+6*pa>wb+6*pb,dw=BigInt(fromA?wa:wb),rw=BigInt(fromA?wb:wa),dh=BigInt(Math.abs(wa+6*pa-wb-6*pb));
 const min=(...v)=>v.reduce((x,y)=>x<y?x:y),den=dw||1n,q=min((dh*35n*BigInt(1275-2*Math.max(pa,pb))+63750n)/127500n,dw*4n/5n,65535n-rw);
 const D=fromA?A:B,R=fromA?B:A,alpha=min((D[3]*q+den/2n)/den,65535n-R[3]),da=D[3]||1n;
 for(let c=0;c<4;c++){const t=c===3?alpha:(D[c]*alpha+da/2n)/da;D[c]-=t;R[c]+=t;}
 assert.deepEqual(Array.from(r.a),A.map(Number));assert.deepEqual(Array.from(r.b),B.map(Number));assert.equal(r.q,Number(q));
 }
});
