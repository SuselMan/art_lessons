import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {preservePairEvidence} from './pair-evidence.mjs'
test('extract reference packed/hash before cleanup and reject same/duplicate target',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pair-evidence-'))
 try{const source=path.join(root,'disposable'),target=path.join(root,'durable');fs.mkdirSync(path.join(source,'reference'),{recursive:true});fs.writeFileSync(path.join(source,'reference','report.json'),JSON.stringify({complete:true,packedTape:[{id:'fixed'}]}));fs.writeFileSync(path.join(source,'reference','native-material.png'),'boundedPNG');assert.throws(()=>preservePairEvidence(source,path.join(source,'bad')));const r=preservePairEvidence(source,target);fs.rmSync(source,{recursive:true});assert.equal(r.files.length,3);assert.equal(JSON.parse(fs.readFileSync(path.join(target,'packed-input.json')))[0].id,'fixed');assert.throws(()=>preservePairEvidence(source,target))}finally{fs.rmSync(root,{recursive:true,force:true})}
})
