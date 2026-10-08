import {test} from 'node:test'
import assert from 'node:assert/strict'
import {assertRawWarmProof as check} from './warm-proof.mjs'
const proof={enabled:true,markers:[{stage:'raw-warm:completed',value:{scope:'raw canvas only',completedAt:10,wallMs:4,peakBytes:4194304,sourceWarmed:false,pressureWarmed:false,compositeWarmed:false}}],readyAt:11,firstDownAt:12}
test('requires completed real readiness chronology and exact bounded scope',()=>{assert.equal(check(proof).peakBytes,4194304);for(const p of [{...proof,markers:[]},{...proof,readyAt:9},{...proof,firstDownAt:10},{...proof,markers:[...proof.markers,...proof.markers]}])assert.throws(()=>check(p))})
test('OFF preserves no warm execution',()=>{assert.deepEqual(check({enabled:false,markers:[]}),{enabled:false});assert.throws(()=>check({...proof,enabled:false}))})
test('no source/pressure/composite compile proof inferred from raw completion',()=>{for(const key of ['sourceWarmed','pressureWarmed','compositeWarmed'])assert.throws(()=>check({...proof,markers:[{stage:'raw-warm:completed',value:{...proof.markers[0].value,[key]:true}}]}))})
