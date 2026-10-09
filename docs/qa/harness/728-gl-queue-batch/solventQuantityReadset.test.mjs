import{test}from'node:test';import assert from'node:assert/strict';import{PREVIEW_WATER_DOMAIN_FRAG}from'./PreviewWaterDomain.mjs';
test('whole wet film cannot identify or conserve solvent amount; capped source differs from dose',()=>{
 assert.match(PREVIEW_WATER_DOMAIN_FRAG,/v\.r\/max\(v\.a/);
 const wet=([r,a])=>a>.002?Math.min(1,Math.max(0,r/Math.max(a,.002))):0;
 const a=Array.from({length:16384},()=>[.05,.1]),b=Array.from({length:16384},()=>[.1,.2]);assert.ok(a.every((v,i)=>wet(v)===wet(b[i])));const va=a.reduce((s,v)=>s+4*v[0],0),vb=b.reduce((s,v)=>s+4*v[0],0);assert.equal(vb,2*va);
 const maxSameGesture=Math.max(1,1),addDifferentGestures=Math.min(4,1+1),capped=Math.min(4,3+3);assert.equal(maxSameGesture,1);assert.equal(addDifferentGestures,2);assert.equal(capped,4);assert.notEqual(capped,6);
 // Existing 4-centre downsampling reads four cells of8×8; off-tap water is invisible.
 const block=new Float64Array(64);block[0]=1;const average4=(block[27]+block[28]+block[35]+block[36])/4;assert.equal(average4,0);assert.equal(block.reduce((s,v)=>s+v,0)/64,1/64);
});
