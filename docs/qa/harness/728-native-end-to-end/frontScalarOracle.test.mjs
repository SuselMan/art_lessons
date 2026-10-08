import{test}from'node:test';import assert from'node:assert/strict';import{scalarFrontStep,scalarFrontStats}from'./frontScalarOracle.mjs'
test('141 steps preserve monotonicity, one-cell support bound and reach fixed point on bounded constant-paper fixture',()=>{
 const w=17,h=17,cx=8,cy=8;let old=new Uint8Array(w*h).fill(255);old[cy*w+cx]=0
 for(let step=1;step<=141;step++){const next=scalarFrontStep(old,w,h),s=scalarFrontStats(old,next);assert.equal(s.rose,0);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(next[y*w+x]<255)assert.ok(Math.max(Math.abs(x-cx),Math.abs(y-cy))<=step);if(step>=17)assert.equal(s.changed,0);old=next}
 assert.equal(old[0],24);assert.equal(old[cy*w],16)
})
test('film seed243 reaches cutoff245 one cell away; next cell247 remains outside mode12',()=>{
 let a=Uint8Array.of(243,255,255,255);a=scalarFrontStep(a,4,1);assert.deepEqual([...a],[243,245,255,255]);a=scalarFrontStep(a,4,1);assert.deepEqual([...a],[243,245,247,255]);assert.ok(a[1]/255<=.9617441184796373);assert.ok(a[2]/255>.9617441184796373)
})
