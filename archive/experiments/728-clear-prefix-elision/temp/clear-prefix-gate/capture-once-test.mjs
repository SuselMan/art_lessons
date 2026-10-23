import fs from 'node:fs';import assert from 'node:assert/strict';
const source=fs.readFileSync('temp/clear-prefix-gate/page-function.js','utf8');
const snippet=source.split('// CAPTURE_ONCE_BEGIN')[1].split('// CAPTURE_ONCE_END')[0];
const factory=new Function(snippet+';return originalTargetCaptureOnce')();
const claim=factory(47);let captures=0,finishes=0;const decisions=[];
for(const seq of [47,47,48,49]){const job={finish(){finishes++}};decisions.push(claim(seq,job,()=>captures++));job.finish()}
assert.deepEqual(decisions,[true,false,false,false]);assert.equal(captures,1);assert.equal(finishes,4);
let alwaysFinishes=0;const throwing=factory(47),job={finish(){alwaysFinishes++}};throwing(47,job,()=>{throw Error('diagnostic failure')});assert.throws(()=>job.finish(),/diagnostic failure/);assert.equal(alwaysFinishes,1);
const late=factory(47),undo={finish(){}};assert.equal(late(48,undo,()=>{throw Error('not target')}),false);const original={finish(){}};assert.equal(late(47,original,()=>{}),true);
console.log(JSON.stringify({pass:true,decisions,captures,finishes,alwaysFinishes}));
