import{test}from'node:test';import assert from'node:assert/strict';import crypto from'node:crypto';import{decodeSettleMaterial,assertPairedSettleInputs,assertSavedLiteral}from'./settle-packet.mjs'
const bytes=Buffer.alloc(4194304);bytes[3]=255
const fixture=()=>({variant:'A',patches:['actual source'],errors:[],material:{width:1024,height:1024,byteLength:bytes.length,base64:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),nonzeroAlpha:1}})
test('full material exact decode without numeric array',()=>assert.equal(decodeSettleMaterial(fixture(),'A').length,4194304))
test('missing actual patch/nonempty material/GPU failure reject',()=>{for(const change of [p=>p.patches=[],p=>p.material.nonzeroAlpha=0,p=>p.errors=['validation']]){const p=fixture();change(p);assert.throws(()=>decodeSettleMaterial(p,'A'))}})
test('wrong SHA and oversized payload reject',()=>{const p=fixture();p.material.sha256='invalid';assert.throws(()=>decodeSettleMaterial(p,'A'),/SHA/);const q=fixture();q.material.base64+='AAAA';assert.throws(()=>decodeSettleMaterial(q,'A'),/budget/)})
test('same-tape paper passport checks all metadata, not merely RGBAhash',()=>{const a={variant:'literal',tapeSha256:'same',paper:{RGBAsha256:'same',width:2048}},b={...a,variant:'A'};assert.doesNotThrow(()=>assertPairedSettleInputs([a,b]));assert.throws(()=>assertPairedSettleInputs([a,{...b,paper:{...b.paper,width:1024}}]),/identity/);assert.throws(()=>assertPairedSettleInputs([a,{...b,tapeSha256:'different'}]),/identity/)})

test('resume requires original single literal, same frozen JS/paper and exact saved bytes',()=>{
 const literal={...fixture(),variant:'literal'},saved={arms:[literal],http:{'run.js':{sha256:'source'}},paperPassport:{files:{fine:{sha256:'paper'}}}},current={http:saved.http,paperPassport:saved.paperPassport}
 assert.equal(assertSavedLiteral(saved,current,bytes),literal)
 assert.throws(()=>assertSavedLiteral(saved,{...current,http:{'run.js':{sha256:'other'}}},bytes),/source/)
 assert.throws(()=>assertSavedLiteral(saved,{...current,paperPassport:{files:{}}},bytes),/paper/)
 assert.throws(()=>assertSavedLiteral({...saved,arms:[{...literal,variant:'A'}]},current,bytes),/literal/)
 const mutated=Buffer.from(bytes);mutated[0]=1;assert.throws(()=>assertSavedLiteral(saved,current,mutated),/material/)
})
