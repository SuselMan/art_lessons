import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseSeedCostConsole} from './seed-cost-console.mjs'
const event=c=>({params:{args:[{value:'[native-room-seed]'},{value:JSON.stringify(c)}]}})
test('exact scalar seed phase and unrelated console',()=>{
 const c={phase:'queueAck',wallMs:23,ok:false,bytes:0,generation:1,layerId:'layer'}
 assert.deepEqual(parseSeedCostConsole(event(c)),c);assert.equal(parseSeedCostConsole({params:{args:[]}}),null)
})
test('reject wrong phase and invalid duration',()=>{
 const c={phase:'GPU duration',wallMs:23,ok:true,bytes:0,generation:1,layerId:'layer'}
 assert.throws(()=>parseSeedCostConsole(event(c)));assert.throws(()=>parseSeedCostConsole(event({...c,phase:'readPixels',wallMs:-1})))
})
