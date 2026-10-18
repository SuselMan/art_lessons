'use strict'
const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),esbuild=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/esbuild')
const m={exports:{}};vm.runInNewContext(esbuild.buildSync({entryPoints:[__dirname+'/stress-flow-fixtures.ts'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,{module:m,exports:m.exports,Uint8Array})
const{stressFlowIds,createStressFlowFixture}=m.exports
test('stationary grid covers all64 fine offsets with literal dry material and wet neighbours',()=>{
 for(const alpha of[1,2,128,254,255]){
  const input=createStressFlowFixture('stress-stationary-phase-a'+alpha),offsets=new Set();let dryMaterial=0
  for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
   const i=y*1024+x,p=i*4
   if(!input.water[i]&&input.rgba[p+3]){offsets.add((x%8)+','+(y%8));dryMaterial++;assert.equal(input.rgba[p+3],alpha);assert.equal(input.rgba[p+2],alpha);assert.equal(input.water[i-1],180);assert.equal(input.water[i+1],180)}
  }
  assert.equal(offsets.size,64);assert.equal(dryMaterial,64)
 }
})
test('low-water controls have identical pigment/paper/support and only change water amplitude',()=>{
 const inputs=[1,4,61,255].map(w=>createStressFlowFixture('stress-low-water-'+w))
 for(let j=0;j<inputs.length;j++){
  assert.deepEqual(inputs[j].rgba,inputs[0].rgba);assert.deepEqual(inputs[j].paper,inputs[0].paper)
  assert.equal(inputs[j].water.filter(v=>v>0).length,512*512)
  assert.ok(inputs[j].water.every(v=>v===0||v===[1,4,61,255][j]))
 }
})
test('all diagnostic inputs are bounded premultiplied and explicit sizes/IDs reject',()=>{
 for(const id of stressFlowIds){const i=createStressFlowFixture(id);assert.equal(i.encoding,'optical-density');for(let p=0;p<i.rgba.length;p+=4)for(let c=0;c<3;c++)assert.ok(i.rgba[p+c]<=i.rgba[p+3])}
 assert.throws(()=>createStressFlowFixture('other'));assert.throws(()=>createStressFlowFixture(stressFlowIds[0],512))
})
