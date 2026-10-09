import crypto from 'node:crypto'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {preservePairEvidence,verifyPairEvidence} from './pair-evidence.mjs'
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'pair-evidence-')),source=path.join(root,'disposable'),target=path.join(root,'durable');fs.mkdirSync(path.join(source,'reference'),{recursive:true});const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(2,16);png.writeUInt32BE(3,20);fs.writeFileSync(path.join(source,'reference','report.json'),JSON.stringify({source:'a'.repeat(40),complete:true,ownedContextDisposed:true,export:{width:2,height:3,alpha:1,pngSha256:crypto.createHash('sha256').update(png).digest('hex')},packedTape:[{id:'fixed'}],env:{secret:'do-not-save'},failureCensus:{body:'do-not-save'}}));fs.writeFileSync(path.join(source,'reference','native-material.png'),png);return{root,source,target}}
test('atomic exact reference promotion excludes raw env/body and survives disposable deletion',()=>{
 const {root,source,target}=fixture();try{assert.throws(()=>preservePairEvidence(source,path.join(source,'bad')));const r=preservePairEvidence(source,target);assert.equal(r.referenceReusable,true);fs.rmSync(source,{recursive:true});assert.equal(verifyPairEvidence(target).files.length,3);assert.equal(JSON.parse(fs.readFileSync(path.join(target,'packed-input.json')))[0].id,'fixed');assert.ok(!fs.readFileSync(path.join(target,'reference-report.json'),'utf8').includes('do-not-save'));assert.throws(()=>preservePairEvidence(source,target))}finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('read/write/rename failures keep originals and no final promoted target',()=>{
 for(const api of ['readFileSync','writeFileSync','linkSync','renameSync']){const {root,source,target}=fixture();try{const io={...fs,[api]:()=>{throw Error(api+' injected failure')}};assert.throws(()=>preservePairEvidence(source,target,source,io));assert.equal(fs.existsSync(target),false);assert.ok(fs.existsSync(path.join(source,'reference','report.json')));assert.ok(fs.existsSync(path.join(source,'reference','native-material.png')))}finally{fs.rmSync(root,{recursive:true,force:true})}}
})
test('partial failed report promotes reviewable minimal evidence; absent evidence holds cleanup',()=>{
 const {root,source,target}=fixture();try{fs.writeFileSync(path.join(source,'reference','report.json'),JSON.stringify({source:'a'.repeat(40),error:'failure',stage:'preflight',ramStart:1200}));const r=preservePairEvidence(source,target);assert.equal(r.referenceReusable,false);assert.equal(r.files.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(target,'reference-report.json'))).failed,true);fs.rmSync(source,{recursive:true});assert.throws(()=>preservePairEvidence(source,path.join(root,'empty')))}finally{fs.rmSync(root,{recursive:true,force:true})}
})
