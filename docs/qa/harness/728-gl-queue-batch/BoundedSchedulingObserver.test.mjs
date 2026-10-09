import test from 'node:test'
import assert from 'node:assert/strict'
import {createBoundedSchedulingObserver,observeAfterOriginal} from './BoundedSchedulingObserver.mjs'
const input={fifoEpoch:2,requestId:3,ownerEpoch:4,requestKind:'material'}
test('immutable provenance, late cancellation and idempotent release',()=>{
 let now=0;const o=createBoundedSchedulingObserver(3,()=>++now);const mutable={...input};const r=o.bindRequest(mutable);mutable.requestId=99
 r.resume(2);const release=r.bindRelease(7);r.cancel();release('fulfilled',2,1,true);release('rejected',1,0,false)
 assert.equal(o.snapshot().rows.length,2);assert.equal(o.snapshot().rows[1].requestId,3);assert.equal(o.snapshot().rows[1].cancelled,true);assert.equal(o.snapshot().rows[1].at,2)
})
test('bounded rows and closure, error outcome preserved',()=>{
 const o=createBoundedSchedulingObserver(1,()=>1);const r=o.bindRequest(input);r.bindRelease(0)('rejected',1,0,false);r.resume(0)
 assert.equal(o.snapshot().dropped,1);assert.equal(o.snapshot().rows[0].outcome,'rejected');o.close();r.resume(0);assert.equal(o.snapshot().dropped,1)
})
test('throwing diagnostic never alters cleanup, original exception preserved',()=>{
 let calls=0;const wrapped=observeAfterOriginal(()=>++calls,()=>{throw Error('diagnostic')});assert.equal(wrapped(),1);wrapped();assert.equal(calls,1)
 const originalError=Error('cleanup');assert.throws(observeAfterOriginal(()=>{throw originalError},()=>assert.fail()) ,e=>e===originalError)
 const o=createBoundedSchedulingObserver(1,()=>{throw Error('clock')});o.bindRequest(input).resume(0);assert.equal(o.snapshot().observerErrors,1)
})
