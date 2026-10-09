import test from 'node:test'
import assert from 'node:assert/strict'
import {assertSelectedFrontQuantum} from './front-submit-proof.mjs'
const pass={family:'waterFrontStep',dryCost:24,max:75,climb:9,floor:1,stride:1,scale:2,sourceWidth:768,sourceHeight:768}
test('exactly four bounded identical front args required before GPU submit',()=>{const q={id:1,passes:Array.from({length:4},()=>({...pass}))};assert.equal(assertSelectedFrontQuantum(q).passes.length,4);assert.throws(()=>assertSelectedFrontQuantum({...q,passes:q.passes.slice(1)}));assert.throws(()=>assertSelectedFrontQuantum({...q,passes:[...q.passes.slice(1),{...pass,stride:2}]}));assert.throws(()=>assertSelectedFrontQuantum({...q,overflow:true}));assert.throws(()=>assertSelectedFrontQuantum({...q,passes:q.passes.map(p=>({...p,sourceWidth:undefined}))}))})
