import assert from 'node:assert/strict';import {original47,materialGuard,mapped47} from './guards.mjs';import{readFileSync}from'node:fs';
const ops=JSON.parse(readFileSync(process.env.QA_INPUT ?? '/home/suselman/projects/pencil-agents/680-device-qa-guards/temp/room-KJc0OoVo/ops.json'));
assert.equal(original47(ops),ops);assert.equal(original47({ops}),ops);
assert.throws(()=>original47(ops.slice(1)));assert.throws(()=>original47(ops.map((o,i)=>i===46?{...o,id:ops[0].id}:o)));
assert.throws(()=>materialGuard(Uint8Array.of(0,0,0,0)));assert.throws(()=>materialGuard(Uint8Array.of(255,255,255,255)));
assert.throws(()=>materialGuard(Uint8Array.of(100,100,100,80,0,0,0,0)));
assert.deepEqual(materialGuard(Uint8Array.of(0,20,200,80,0,0,0,0)),{nonempty:1,coloured:1,pixels:2});
console.log('8 full47/material-meaningfulness controls PASS');

const author='actual-room-user',namespace='unique-fixture-UUID';const ids=new Map(ops.map(o=>[o.id,namespace+'-'+o.id]));const mapped=ops.map(o=>({...o,id:ids.get(o.id),userId:author,...(o.targetOpId?{targetOpId:ids.get(o.targetOpId)}:{})}));
assert.equal(mapped47(mapped,author,namespace),mapped);
assert.throws(()=>mapped47(mapped,'local',namespace));
assert.throws(()=>mapped47(mapped.map((o,i)=>i===0?{...o,userId:'wrong-author'}:o),author,namespace));
assert.throws(()=>mapped47(mapped.map((o,i)=>i===1?{...o,id:mapped[0].id}:o),author,namespace));
assert.throws(()=>mapped47(mapped,author,'another-room'));
assert.throws(()=>mapped47(mapped.map(o=>o.targetOpId?{...o,targetOpId:'other-room-target'}:o),author,namespace));
console.log('6 real mapped47 author/namespace/history controls PASS');
