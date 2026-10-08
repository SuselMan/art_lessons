import test from 'node:test'
import assert from 'node:assert/strict'
import {installRoomPhaseProbe} from './room-phaseProbe.mjs'
test('nested drain/source order, return values and detach preserve caller semantics',()=>{
 const calls=[];const e={_opts:{pencilType:'normal:100:100'},_completeSettle(){calls.push('drain')},_paintDabs(){calls.push('source');return 7},_onStart(){this._completeSettle();return this._paintDabs()}}
 const original=e._onStart,p=installRoomPhaseProbe(e);p.setPhase('wet-down')
 assert.equal(e._onStart(),7);assert.deepEqual(calls,['drain','source'])
 const rows=p.snapshot().rows;assert.deepEqual(rows.map(r=>r.name),['_completeSettle','_paintDabs','_onStart'])
 assert.equal(rows[0].parent,'_onStart');assert.equal(rows[1].phase,'wet-down');assert.equal(rows[1].before.preset,'normal:100:100')
 p.detach();assert.equal(e._onStart,original)
})
test('bounded recorder propagates exception and restores method',()=>{
 const fail=new Error('expected'),e={_onMove(){throw fail}},original=e._onMove,p=installRoomPhaseProbe(e,{maxRows:1})
 assert.throws(()=>e._onMove(),e=>e===fail);assert.throws(()=>e._onMove(),e=>e===fail)
 assert.equal(p.snapshot().rows.length,1);assert.equal(p.snapshot().dropped,1);p.detach();assert.equal(e._onMove,original)
})
