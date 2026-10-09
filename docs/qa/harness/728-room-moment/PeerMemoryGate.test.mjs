import test from'node:test';import assert from'node:assert/strict';import{peerMemoryGate}from'./PeerMemoryGate.mjs';
test('first context needs2200, second1700; no third context',async()=>{await assert.rejects(()=>peerMemoryGate(async()=>2199,0,{now:()=>30000,sleep:async()=>{throw Error('held')}}),/held/);await peerMemoryGate(async()=>2200,0);await peerMemoryGate(async()=>1700,1);await assert.rejects(()=>peerMemoryGate(async()=>9999,2),/Maximum/);});
test('nonfinite RAM fails closed',async()=>{await assert.rejects(()=>peerMemoryGate(async()=>NaN,0),/unavailable/);});
