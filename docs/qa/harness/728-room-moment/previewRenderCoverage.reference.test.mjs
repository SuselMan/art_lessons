import {test} from 'node:test';import assert from 'node:assert/strict';import {previewRenderCoverageReference as f,RENDER_COVERAGE_MAX_BYTES} from './previewRenderCoverage.reference.mjs';
test('dry/clear/white rejects are literal no-op, no foreign C<=P bound',()=>{
 const old=[0,0,0,0];assert.deepEqual(f(old,[0,0,20,255],[60,0,0,80]),old);
 assert.deepEqual(f(old,[255,0,0,255],[0,0,0,0]),old);
 assert.deepEqual(f(old,[255,0,1,255],[0,0,0,180]),old);
 assert.deepEqual(f(old,[255,0,1,255],[180,0,0,200]),[128,0,0,255]);
});
test('standing B unchanged; full coverage RGBA unchanged; source arrays readonly',()=>{
 const old=[60,30,220,120],copy=[...old],result=f(old,[0,0,10,255],[50,5,0,80]);
 assert.deepEqual(old,copy);assert.equal(result[2],220);assert.equal(result[3],255);
 assert.deepEqual(f([130,60,220,255],[255,0,10,255],[60,0,0,80]),[130,60,220,255]);
 assert.equal(RENDER_COVERAGE_MAX_BYTES,12582912);
});
test('partial across/pool ratios bounded by one half output code, invalid bytes rejected',()=>{
 for(let a=2;a<255;a++)for(const r of[0,Math.floor(a/2),a]){
  const o=[r,r,255,a],n=f(o,[255,0,1,255],[180,0,0,200]);assert(Math.abs(n[0]/255-r/a)<=.5/255+1e-15);
 }
 assert.throws(()=>f([0,0,0,256],[0,0,0,0],[0,0,0,0]),/u8/);
});
