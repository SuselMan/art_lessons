import test from 'node:test'
import assert from 'node:assert/strict'
import {installSolverCheckpointOps} from './solverCheckpointOps.mjs'
test('QA copies follow actual ops inside the same synchronous quantum, preserving inputs/order',()=>{
 const events=[],field={w:1536,h:1536,a:{value:0},ca:{value:0}},job={ops:[()=>{field.a.value=1;field.ca.value=2;events.push(0)},()=>{field.a.value=3;field.ca.value=4;events.push(1)}]};const planner={prepare(){return job}}
 const original=planner.prepare,c=installSolverCheckpointOps(planner,{indices:[0,1],getField:()=>field,clone:b=>{events.push('copy'+b.value);return{...b}}});planner.prepare();job.ops.forEach(op=>op());assert.deepEqual(events,[0,'copy1','copy2',1,'copy3','copy4']);assert.deepEqual(c.captures.map(x=>[x.a.value,x.ca.value]),[[1,2],[3,4]]);assert.equal(field.a.value,3);assert.throws(()=>planner.prepare(),/Single/);c.detach();assert.equal(planner.prepare,original)
})
test('invalid or missing boundaries fail before any substituted operation',()=>{
 assert.throws(()=>installSolverCheckpointOps({}, {indices:[0,0]}),/unique/);const p={prepare:()=>({ops:[]})};installSolverCheckpointOps(p,{indices:[0],getField:()=>null,clone:()=>null});assert.throws(()=>p.prepare(),/outside/)
})
