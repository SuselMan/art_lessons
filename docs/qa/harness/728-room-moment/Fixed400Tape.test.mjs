import test from 'node:test';import assert from 'node:assert/strict';
import {fixed400Tape,deliverFixedFrames} from './Fixed400Tape.mjs';
test('two arms receive identical immutable authored material recipe',()=>{
 const a=fixed400Tape(),b=fixed400Tape();assert.deepEqual(a,b);
 assert.deepEqual(a.map(s=>s.strokeId),['QAwater001','QApigmt002']);
 for(const s of a){assert.equal(s.frames.length,108);assert.equal(s.frames.flat().length,216);assert.equal(s.size,400);assert.equal(s.preset,'normal:100:100:PB29:round');assert.ok(s.frames.flat().every(p=>p.pressure===.8));assert.ok(Object.isFrozen(s.frames[0][0]));assert.equal(s.frames.at(-1).at(-1).elapsedMs,1800);}
});
test('slow scheduler preserves every indexed point without clock replacement',async()=>{
 const s=fixed400Tape()[0],seen=[];let clock=0;
 await deliverFixedFrames(s,{raf:async()=>clock+=1000,now:()=>clock,deadline:200000,deliver:(points,m)=>seen.push({points,m})});
 assert.equal(seen.length,108);assert.deepEqual(seen.flatMap(x=>x.points),s.frames.flat());assert.equal(clock,108000);assert.equal(seen.at(-1).m.index,107);
});
test('deadline fails closed before delivering later samples',async()=>{
 let clock=0,n=0;await assert.rejects(deliverFixedFrames(fixed400Tape()[0],{raf:async()=>clock+=1000,now:()=>clock,deadline:1500,deliver:()=>n++}),/deadline/);assert.equal(n,1);
});
