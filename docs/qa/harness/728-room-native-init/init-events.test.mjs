import test from 'node:test'
import assert from 'node:assert/strict'
import {parseInitConsoleEvent} from './init-events.mjs'
test('persists complete explicit marker without requiring page census',()=>{
 const event={method:'Runtime.consoleAPICalled',params:{args:[{value:'QA_NATIVE_INIT {"stage":"backend.create:start","ms":17,"bytes":16777216}'}]}}
 const disk=[];const parsed=parseInitConsoleEvent(event);disk.push(JSON.stringify(parsed));assert.deepEqual(JSON.parse(disk[0]),{stage:'backend.create:start',ms:17,bytes:16777216})
 // Closing the page cannot change the already serialized observation.
 event.params.args.length=0;assert.equal(JSON.parse(disk[0]).stage,'backend.create:start')
})
test('filters unrelated, malformed and incomplete events',()=>{
 for(const text of ['hello','QA_NATIVE_INIT broken','QA_NATIVE_INIT {"stage":"x"}','QA_NATIVE_INIT {"stage":"x","ms":null}'])assert.equal(parseInitConsoleEvent({method:'Runtime.consoleAPICalled',params:{args:[{value:text}]}}),null)
 assert.equal(parseInitConsoleEvent({method:'Runtime.exceptionThrown'}),null)
})
test('captures actual backend console prefix immediately',()=>{
 assert.deepEqual(parseInitConsoleEvent({method:'Runtime.consoleAPICalled',params:{timestamp:1000,args:[{value:'[native-room-init]'},{value:'paper:expand-done'},{value:16777216}]}}),{stage:'paper:expand-done',ms:1000,source:'native-room-init',values:[16777216]})
})
