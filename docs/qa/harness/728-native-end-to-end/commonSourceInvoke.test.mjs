import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {invokeCommonSurface} from './commonSourceInvoke.mjs'
const invoke=(window,arg)=>vm.runInNewContext('('+invokeCommonSurface.toString()+')('+JSON.stringify(arg)+')',{window,Uint8Array,atob,Error})
test('serialized producer persists only after exact returned code',async()=>{
 let stored=0;const window={prepareCommonSourceCheckpoint:async()=>({code:'a'.repeat(40),glOwnerRetired:true}),persistCommonSourceCheckpoint:async()=>{stored++;return{durable:true}}}
 assert.equal((await invoke(window,{mode:'producer',code:'a'.repeat(40),operation:{}})).durable,true);assert.equal(stored,1)
 await assert.rejects(invoke(window,{mode:'producer',code:'b'.repeat(40),operation:{}}),/code guard/);assert.equal(stored,1)
})
for(const mode of ['baseline','common'])test('serialized '+mode+' restores supplied gzip map and preserves producer identity',async()=>{
 const packed={code:'c'.repeat(40)},window={restoreCommonSourceCheckpoint:async(p,read)=>{assert.equal(p.code,packed.code);assert.deepEqual(Array.from(await read('source-0.rgba.gz')),[1,2,3]);return{restored:true}},runCommonSourceSolver:async p=>p}
 const r=await invoke(window,{mode,operation:{id:'original'},packed,chunks:{'source-0.rgba.gz':'AQID'},code:'a'.repeat(40)});assert.equal(r.producerCode,packed.code);assert.equal(r.commonSource,mode==='common');assert.equal(r.checkpoint.restored,true)
})

test('serialized common carry pressure-only control stays explicit and preserves immutable producer',async()=>{
 const window={restoreCommonSourceCheckpoint:async()=>({restored:true}),runCommonSourceSolver:async p=>p}
 const r=await invoke(window,{mode:'common',operation:{id:'original'},packed:{code:'c'.repeat(40)},chunks:{},code:'a'.repeat(40),diagnosticCarryHardwarePressure:true})
 assert.equal(r.diagnosticCarryHardwarePressure,true);assert.equal(r.commonSource,true);assert.equal(r.producerCode,'c'.repeat(40))
})
