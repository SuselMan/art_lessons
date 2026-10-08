import test from 'node:test'
import assert from 'node:assert/strict'
import {assertLiveVectorGate} from './live-vector-guard.mjs'
test('actual visibility and bounded count required',()=>{for(const count of [12,20])assert.doesNotThrow(()=>assertLiveVectorGate({live:{meaningfulPigmentVisible:true}},count));for(const count of [11,21,NaN])assert.throws(()=>assertLiveVectorGate({live:{meaningfulPigmentVisible:true}},count));assert.throws(()=>assertLiveVectorGate({live:{meaningfulPigmentVisible:false}},12));assert.throws(()=>assertLiveVectorGate({},12))})
