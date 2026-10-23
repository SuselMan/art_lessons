'use strict';const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('/home/suselman/projects/pencil-agents/805-watercolor-search/node_modules/esbuild');
function load(file){const module={exports:{}};vm.runInNewContext(esbuild.buildSync({entryPoints:[__dirname+'/'+file],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,{module,exports:module.exports,Uint8Array,Uint32Array,Float32Array,ArrayBuffer,Math,Object,Error});return module.exports;}
const{frontDeposit,highWater}=load('macro12-front-adsorption-core.ts'),{wetnessPair,adsorbMixed}=load('macro10-wetness-core.ts');let seed=31;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
function cell(){const cap=rnd(65536),ma=rnd(cap+1),da=rnd(cap-ma+1),paper=rnd(256),absCap=8192+paper*64;return{m:[rnd(ma+1),rnd(ma+1),rnd(ma+1),ma],d:[rnd(da+1),rnd(da+1),rnd(da+1),da],w:rnd(65536),s:rnd(absCap+1),cap,absCap,paper};}
test('100k front transfers exact4C, W/S unchanged, positive premul capacity',()=>{
for(let i=0;i<100000;i++){const old={...cell(),w:rnd(4096)},c={...old,w:rnd(65536)},r=frontDeposit(c,old,Math.max(old.w,rnd(65536)),[0,16,48,128][i%4]);assert.equal(r.w,c.w);assert.equal(r.s,c.s);for(let k=0;k<4;k++)assert.equal(r.m[k]+r.d[k],c.m[k]+c.d[k]);for(const v of[r.m,r.d])for(let k=0;k<4;k++)assert.ok(v[k]>=0&&v[k]<=v[3]);assert.equal(r.m[3]+r.d[3],c.m[3]+c.d[3]);}
});
test('uniformpool and W100 line inside W200 pool do NOT get fake edge; water-only no color; strength monotone',()=>{
 const base={m:[20000,10000,30000,40000],d:[0,0,0,0],w:1000,s:0,cap:65535,absCap:16384,paper:128};
 assert.deepEqual(frontDeposit(base,base,1000,48).m,base.m);const line={...base,w:6425};assert.deepEqual(frontDeposit(line,line,12850,48).m,line.m);
 let last=0;for(const e of[0,16,48,128]){const r=frontDeposit({...base,w:1000},{...base,w:0},16000,e);assert.ok(r.d[3]>=last);last=r.d[3];}assert.ok(last>0);
 const z={...base,m:[0,0,0,0]};assert.deepEqual(frontDeposit(z,{...z,w:0},16000,128).m,z.m);
});
test('four-neighbour front detector invariant under choice of wet neighbour direction',()=>{
 const base={m:[0,0,0,0],d:[0,0,0,0],w:0,s:0,cap:65535,absCap:16384,paper:128};for(const index of[1,3,5,7]){const a=Array.from({length:9},()=>({...base}));a[index].w=16000;assert.equal(highWater(a,3,4),16000);}
});
function frame(state,n,phase,strength){const out=Array(state.length);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;if(out[i])continue;const axis=phase%2,offset=Math.floor(phase/2),coord=axis?y:x,first=(coord+2-offset)%2===0,X=x+(axis?0:first?1:-1),Y=y+(axis?first?1:-1:0);if(X<0||Y<0||X>=n||Y>=n){out[i]=frontDeposit(adsorbMixed(state[i]),state[i],highWater(state,n,i),strength);continue;}const j=Y*n+X,lo=Math.min(i,j),hi=Math.max(i,j),r=wetnessPair(state[lo],state[hi]);out[lo]=frontDeposit(r.a,state[lo],highWater(state,n,lo),strength);out[hi]=frontDeposit(r.b,state[hi],highWater(state,n,hi),strength);}return out;}
test('whole dynamic colored water drop: same water trajectory at all stains, exact mass, edgeD redistributes not adds',()=>{
 const n=12,initial=Array.from({length:n*n},(_,i)=>{const x=i%n,y=Math.floor(i/n),ink=Math.abs(x-5.5)<1.1&&Math.abs(y-5.5)<1.1;return{m:[ink?20000:0,0,0,ink?30000:0],d:[0,0,0,0],w:ink?16000:0,s:0,cap:65535,absCap:16384,paper:128}}),outputs=[];
 for(const strength of[0,16,48]){let a=initial;for(let step=0;step<128;step++)a=frame(a,n,step%4,strength);assert.equal(a.reduce((s,c)=>s+c.m[3]+c.d[3],0),120000);assert.equal(a.reduce((s,c)=>s+c.w+c.s,0),64000);outputs.push(a);}
 for(let i=0;i<n*n;i++)for(const a of outputs){assert.equal(a[i].w,outputs[0][i].w);assert.equal(a[i].s,outputs[0][i].s);}
 assert.ok(outputs[2].reduce((s,c)=>s+c.d[3],0)>outputs[0].reduce((s,c)=>s+c.d[3],0));
});
test('factory uses real source transforms, bounded integer products, mock lifecycle',async()=>{
 const{create,frontAdsorptionSource}=load('macro12-front-adsorption.ts');assert.throws(()=>frontAdsorptionSource(129));assert.match(frontAdsorptionSource(48),/EDGE_STAIN:u32=48u/);assert.ok(65535*256<2**32);assert.ok(65535**2+32767<2**32);
 const buffers=[],sources=[];const device={queue:{writeBuffer(){},async onSubmittedWorkDone(){},submit(){}},createShaderModule({code}){sources.push(code);return{async getCompilationInfo(){return{messages:[]}}}},async createComputePipelineAsync(){return{getBindGroupLayout(){return{}}}},createBindGroup(){return{}},createBuffer({size}){const b={dead:0,destroy(){this.dead++},async mapAsync(){},getMappedRange(){return new ArrayBuffer(size)},unmap(){}};buffers.push(b);return b},createCommandEncoder(){return{beginComputePass(){return{setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}}},copyBufferToBuffer(){},finish(){return{}}}}};
 const c=await create(device,1024,{steps:4,edgeStain:16});await c.upload({size:1024,seed:805,rgba:new Uint8Array(1024**2*4),water:new Uint8Array(1024**2),paper:new Uint8Array(1024**2)});c.run();assert.equal(c.metadata.edgeStain,16);assert.ok(sources.includes(frontAdsorptionSource(16)));c.destroy();c.destroy();assert.ok(buffers.every(b=>b.dead===1));
});
