import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizePlannerQuanta} from './planner-summary.mjs'
test('quantum queue ids align inside synchronous scope without summing waits',()=>{const x=summarizePlannerQuanta([{stage:'planner.quantum:start',id:7,ms:10},{stage:'queue.submit:start',id:8,ms:11},{stage:'queue.submit:start',id:9,ms:15},{stage:'planner.quantum:end',id:7,ms:12,wallCpuMs:2,passes:[{family:'fieldOp',mode:15}]}]);assert.deepEqual(x.quanta[0].queueSubmitIds,[8]);assert.equal(x.quanta[0].passes[0].mode,15)})
