import {test} from 'node:test'
import assert from 'node:assert/strict'
import {nativeReplayStageCheckpoint,parseReplayStageCheckpoint} from './replay-stage-checkpoint.mjs'
test('bounded scalar stage parser rejects invalid ownership/phase/index without GPU work',()=>{
 const row={phase:'roleReadStart',operationIndex:0,operationId:'immutable-operation-1',role:'pressure',at:1,pending:false,centralIdle:true,scopePending:0,ownerEpoch:1};const event=r=>({params:{args:[{value:'[native-replay-stage]'},{value:JSON.stringify(r)}]}})
 assert.deepEqual(parseReplayStageCheckpoint(event(row)),row);for(const patch of [{phase:'other'},{operationIndex:2},{role:'other'},{ownerEpoch:0},{scopePending:-1}])assert.throws(()=>parseReplayStageCheckpoint(event({...row,...patch})))
 assert.equal(parseReplayStageCheckpoint({}),null)
})
test('missing/throwing diagnostic window does not alter caller work',()=>{const prior=globalThis.window;try{delete globalThis.window;assert.doesNotThrow(()=>nativeReplayStageCheckpoint('append',0));globalThis.window={get __engine(){throw Error('diagnostic only')}};assert.doesNotThrow(()=>nativeReplayStageCheckpoint('append',0))}finally{if(prior===undefined)delete globalThis.window;else globalThis.window=prior}})
