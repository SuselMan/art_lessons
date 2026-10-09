import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {preservePairEvidence} from './pair-evidence.mjs'
import {assertPairCanFinish} from './pair-cleanup-guard.mjs'
test('cleanup denied until verified promoted partial evidence; tamper denied',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pair-cleanup-')),source=path.join(root,'dispose'),target=path.join(root,'durable'),head='a'.repeat(40)
 try{fs.mkdirSync(path.join(source,'off'),{recursive:true});fs.writeFileSync(path.join(source,'off','report.json'),JSON.stringify({source:head,error:'RAM',ramStart:1200}));const progress={source:head,evidencePromoted:false,evidenceExtracted:false,durableEvidencePath:target};const save=()=>fs.writeFileSync(path.join(source,'pair-progress.json'),JSON.stringify(progress));save();assert.throws(()=>assertPairCanFinish(source,target));preservePairEvidence(source,target);progress.evidencePromoted=true;progress.evidenceExtracted=true;save();assert.equal(assertPairCanFinish(source,target).canFinish,true);fs.appendFileSync(path.join(target,'off-report.json'),'tamper');assert.throws(()=>assertPairCanFinish(source,target))}finally{fs.rmSync(root,{recursive:true,force:true})}
})
