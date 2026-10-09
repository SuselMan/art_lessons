import test from'node:test';import assert from'node:assert/strict';import{recordWholeBeforeCompare}from'./ResumeWholeEvidence.mjs';
const whole={sha:'a',width:1024,height:1024,glError:0,lost:false};
test('RGBA mismatch preserves actual and expected before assertion',()=>{let saved;const actual={...whole,sha:'b'};assert.throws(()=>recordWholeBeforeCompare(whole,actual,x=>saved=x),/RGBA mismatch/);assert.deepEqual(saved,{whole:actual,expectedWhole:whole});});
test('failed persistence never reports material pass',()=>{assert.throws(()=>recordWholeBeforeCompare(whole,whole,()=>{throw Error('disk failed')}),/disk failed/);});
