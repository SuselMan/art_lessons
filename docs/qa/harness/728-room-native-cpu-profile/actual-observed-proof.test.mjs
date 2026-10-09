import test from 'node:test'
import assert from 'node:assert/strict'
import {assertObservedReady,assertObservedConsumed} from './actual-observed-proof.mjs'
const kinds=['waterFront','diffuse'],hashes=['a'.repeat(64),'b'.repeat(64)],rows=kinds.map(kind=>({kind,completed:true,hits:0})),census={actualObservedEnabled:true,observedFields:rows},proof={proofs:kinds.map(kind=>({kind,compilerWallMs:2})),shaderSHAs:hashes,dispatches:0,fieldBytes:0},marker={stage:'observed-fields-async:completed',values:[JSON.stringify(proof)]}
test('beforeREADY exact descriptor/order/no dispatch and actual factory one-hit evidence',()=>{
 assertObservedReady([marker],census,hashes)
 assert.throws(()=>assertObservedConsumed(census))
 assertObservedConsumed({...census,observedFields:rows.map(x=>({...x,hits:1}))})
 for(const bad of [[],[marker,marker]])assert.throws(()=>assertObservedReady(bad,census,hashes))
 for(const bad of [{...proof,dispatches:1},{...proof,shaderSHAs:[hashes[1],hashes[0]]},{...proof,proofs:[proof.proofs[0]]}])assert.throws(()=>assertObservedReady([{...marker,values:[JSON.stringify(bad)]}],census,hashes))
})
