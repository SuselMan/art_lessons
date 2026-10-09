import test from 'node:test';import assert from 'node:assert/strict';import{costPathOracle}from'./PreviewCostPathOracle.mjs';
test('literal min-doubling equals all intervening cost cells for dyadic strides',()=>{
 for(const stride of[1,2,4,8,16])for(let gap=-1;gap<32;gap++){const cost=Float32Array.from({length:32},(_,i)=>i===gap?.9:.2);const a=costPathOracle(cost,32,1,.7,stride);for(let x=0;x<32;x++){const expected=x+stride<32&&Array.from(cost.slice(x,x+stride+1)).every(v=>v<=.7);assert.equal(a[x*4],Number(expected))}}
});
test('partial wet cost can be connected; pressure path alone is not dry topology proof',()=>{
 const cost=Float32Array.from([0,.2,.3,.4,.5,.6]);assert.equal(costPathOracle(cost,6,1,.7,4)[0],1);
 cost[2]=.8;assert.equal(costPathOracle(cost,6,1,.7,4)[0],0);
});
import{pairedDonorOracle}from'./PreviewCostPathOracle.mjs';
test('shared old-input donor fractions preserve paired mass and nonnegative values',()=>{
 const p=Float64Array.from([1,2,0,0,3]),c=Float64Array.from(p,v=>v*.37),edges=[[0,1,2],[0,2,1],[1,2,4],[1,3,.1],[4,3,3]];
 for(const rate of[0,.5,1]){const r=pairedDonorOracle(p,c,edges,rate);assert.ok(r.p.every(v=>v>=-1e-14));assert.ok(r.c.every(v=>v>=-1e-14));assert.ok(Math.abs(r.p.reduce((a,b)=>a+b,0)-6)<1e-14);assert.ok(Math.abs(r.c.reduce((a,b)=>a+b,0)-2.22)<1e-14);r.p.forEach((v,i)=>assert.ok(Math.abs(r.c[i]-.37*v)<1e-14))}
});
