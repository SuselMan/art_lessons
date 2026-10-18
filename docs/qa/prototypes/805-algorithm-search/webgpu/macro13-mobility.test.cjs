'use strict';const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/esbuild');
function load(file){const m={exports:{}};vm.runInNewContext(esbuild.buildSync({entryPoints:[__dirname+'/'+file],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,{module:m,exports:m.exports,Uint8Array,Uint32Array,ArrayBuffer,Math,Object,Error});return m.exports;}
const{calibratedPair,exchangeWet}=load('macro13-mobility-core.ts'),{wetnessPair}=load('macro10-wetness-core.ts');let seed=101;const rnd=n=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n;
const cell=()=>{const cap=rnd(65536),ma=rnd(cap+1),da=rnd(cap-ma+1),paper=rnd(256),absCap=8192+paper*64;return{m:[rnd(ma+1),rnd(ma+1),rnd(ma+1),ma],d:[rnd(da+1),rnd(da+1),rnd(da+1),da],w:rnd(65536),s:rnd(absCap+1),cap,absCap,paper};};
test('gain1 is EXACT CPU V10; all gains bounded integer exact mass/water/premul',()=>{
 for(let i=0;i<80000;i++){const a=cell(),b=cell(),g=i%8+1,r=calibratedPair(a,b,g);if(g===1)assert.equal(JSON.stringify(r),JSON.stringify(wetnessPair(a,b)));assert.equal(r.a.w+r.a.s+r.b.w+r.b.s,a.w+a.s+b.w+b.s);for(let c=0;c<4;c++)assert.equal(r.a.m[c]+r.a.d[c]+r.b.m[c]+r.b.d[c],a.m[c]+a.d[c]+b.m[c]+b.d[c]);for(const x of[r.a,r.b]){assert.ok(x.m[3]+x.d[3]<=x.cap);for(const v of[x.m,x.d])for(let c=0;c<4;c++)assert.ok(v[c]>=0&&v[c]<=v[3]);}}
});
test('absolute mixing calibrates COMMON raw water4/16/35/61/128/200 without changing inputs',()=>{
 const rows=[];for(const raw of[4,16,35,61,128,200]){const W=Math.floor(raw*257/4),a={m:[20000,0,0,30000],d:[0,0,0,0],w:W,s:0,cap:65535,absCap:16384,paper:128},b={...a,m:[0,0,20000,30000]},ks=[1,3,6].map(g=>exchangeWet(a,b,g).k);assert.ok(ks[0]<=ks[1]&&ks[1]<=ks[2]&&ks[2]<=64);rows.push({rawWater:raw,k1:ks[0],k3:ks[1],k6:ks[2]});}console.log('GLOBAL mobility calibration',JSON.stringify(rows));
 assert.ok(65535*8<2**32);assert.ok(65535**2+32767<2**32);
});
test('actual source gain1/3/6 compiles as string with exact anchors; invalid rejected',()=>{const{mobilitySource}=load('macro13-mobility-calibration.ts');for(const g of[1,3,6]){const s=mobilitySource(g);assert.ok(s.includes(`(a.w+b.w)/2u)*${g}u`));assert.ok(s.includes(`min(a.w,b.w)*${g}u`));}assert.throws(()=>mobilitySource(0));assert.throws(()=>mobilitySource(9));});
