import test from'node:test';import assert from'node:assert/strict';import{fixed400MaterialGate}from'./Fixed400MaterialGate.mjs';
const row=()=>({authored:[{strokeId:'QAwater001',pressure:.8}],sourceSeeds:[{strokeId:'QAwater001',seed:[1,2]}],tape:[{strokeId:'QAwater001',preset:'normal:100:100:PB29:round',color:[.3,.15,.55],dabsPacked:'raw',wet:'wet'}]});
test('equal raw inputs pass while room operation identity stays outside material scope',()=>{const a=row(),b=row();a.tape[0].id='opA';b.tape[0].id='opB';assert.equal(fixed400MaterialGate([a,b]).equal,true);});
test('missing arm fails closed',()=>assert.deepEqual(fixed400MaterialGate([row()]).mismatches,['missing-arm']));
for(const key of['strokeId','preset','color','dabsPacked','wet'])test('reject raw '+key+' mismatch',()=>{const a=row(),b=row();b.tape[0][key]='different';assert.equal(fixed400MaterialGate([a,b]).equal,false);});
test('reject seed mismatch before any normalization',()=>{const a=row(),b=row();b.sourceSeeds[0].seed=[2,1];assert.equal(fixed400MaterialGate([a,b]).equal,false)});
