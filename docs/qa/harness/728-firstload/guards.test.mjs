import assert from 'node:assert/strict';import {original47,materialGuard} from './guards.mjs';import{readFileSync}from'node:fs';
const ops=JSON.parse(readFileSync('/home/suselman/projects/pencil-agents/680-device-qa-guards/temp/room-KJc0OoVo/ops.json'));
assert.equal(original47(ops),ops);assert.equal(original47({ops}),ops);
assert.throws(()=>original47(ops.slice(1)));assert.throws(()=>original47(ops.map((o,i)=>i===46?{...o,id:ops[0].id}:o)));
assert.throws(()=>materialGuard(Uint8Array.of(0,0,0,0)));assert.throws(()=>materialGuard(Uint8Array.of(255,255,255,255)));
assert.throws(()=>materialGuard(Uint8Array.of(100,100,100,80,0,0,0,0)));
assert.deepEqual(materialGuard(Uint8Array.of(0,20,200,80,0,0,0,0)),{nonempty:1,coloured:1,pixels:2});
console.log('8 full47/material-meaningfulness controls PASS');
