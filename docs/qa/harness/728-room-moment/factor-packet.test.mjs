import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import{decodeFactorPacket}from './factor-packet.mjs'
const fixture=()=>{const bytes=Buffer.alloc(36864);return{roi:{x:384,yTop:352,w:96,h:96},errors:[],groups:['amount','contact','modulation','no-tip-counterfactual'].map(group=>({group,byteLength:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')}))}}
test('bounded four-group packet decodes exact bytes',()=>assert.equal(decodeFactorPacket(fixture()).reduce((s,x)=>s+x.bytes.length,0),147456))
test('SHA corruption rejects',()=>{const p=fixture();p.groups[0].sha256='00';assert.throws(()=>decodeFactorPacket(p),/SHA/)})
test('oversize and duplicate groups reject',()=>{const p=fixture();p.groups[0].base64+='AAAA';assert.throws(()=>decodeFactorPacket(p),/budget/);const q=fixture();q.groups[1].group='amount';assert.throws(()=>decodeFactorPacket(q),/group/)})
test('GPU errors and unexpected ROI reject',()=>{const p=fixture();p.errors=['validation'];assert.throws(()=>decodeFactorPacket(p),/GPU/);const q=fixture();q.roi.w=1024;assert.throws(()=>decodeFactorPacket(q),/ROI/)})
