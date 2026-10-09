import {test} from 'node:test';import assert from 'node:assert/strict';import {assertSelectedFieldQuantum} from './field-submit-proof.mjs'
const q=()=>({id:1,passes:[11,1,6,5,5,5,5,5,5].map(mode=>({family:'fieldOp',mode})),overflow:false})
test('exact field62 order required before submit',()=>{assert.equal(assertSelectedFieldQuantum(q()).passes.length,9);let x=q();x.passes[2].mode=15;assert.throws(()=>assertSelectedFieldQuantum(x),/op62/);x=q();x.overflow=true;assert.throws(()=>assertSelectedFieldQuantum(x),/op62/);x=q();x.passes.pop();assert.throws(()=>assertSelectedFieldQuantum(x),/op62/)})
