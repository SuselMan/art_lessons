import test from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSettleBoundaries} from './settle-boundary-analysis.mjs'
test('causal epochs isolate settle change and preserve missing/absent distinction',()=>{
 const roi=[402,352,78,96],files=new Map([['source1',Buffer.from([5,5,5,5])],['before',Buffer.from([5,5,5,5])],['after',Buffer.from([3,3,3,3])],['base2',Buffer.from([3,3,3,3])]])
 const source=[{sourceMetadata:{gesture:1,worldROI:roi},stages:[{stage:'post-P',file:'source1'}]},{sourceMetadata:{gesture:2,worldROI:roi},stages:[{stage:'source-inkBase',file:'base2'}]}]
 const job={ordinal:0,published:true,stages:[{phase:'before-prepare',gesture:1,materialGesture:1,worldROI:roi,roles:[{role:'inkLoad',file:'before'}]},{phase:'after-finish',gesture:1,materialGesture:1,worldROI:roi,roles:[{role:'inkLoad',file:'after'}]}]}
 const report=analyzeSettleBoundaries(source,[job],f=>files.get(f));assert.equal(report.valid,true);const p=report.links[0].roles.P;assert.equal(p.previousPostToBefore.exact,true);assert.equal(p.beforeToAfter.changedBytes,4);assert.deepEqual(p.beforeToAfter.channelDelta,[-2,-2,-2,-2]);assert.equal(p.afterToNextBase.exact,true);assert.equal(report.links[0].roles.C.beforeToAfter.observed,false)
 job.stages[1].worldROI=[403,352,78,96];assert.equal(analyzeSettleBoundaries(source,[job],f=>files.get(f)).valid,false);job.stages[1].worldROI=roi;job.stages[1].gesture=2;assert.equal(analyzeSettleBoundaries(source,[job],f=>files.get(f)).valid,false)
})
