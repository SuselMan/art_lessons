import {test} from 'node:test'
import assert from 'node:assert/strict'
import {replayNativePackedControl} from './native-replay.mjs'
function mock(){const appended=[];globalThis.window={__engine:{_wcNativeEnabled:true,_wcNative:{},_layers:new Map([['target',{}]]),_log:{entries:[]},_pageSize:()=>({w:100,h:200}),appendOperation:(op,role)=>appended.push({op,role})}};return appended}
const config=tape=>({tape,targetLayerId:'target',expectedBoard:{width:100,height:200},actualPaperSha:'exact',expectedPaperSha:'exact',expectedOperationCount:2})
test('two packed source roles immutable and only logical layer remapped',async()=>{
 try{const appended=mock(),tape=[{type:'stroke',layerId:'original',dabsPacked:'water'},{type:'stroke',layerId:'original',dabsPacked:'pigment'}],before=structuredClone(tape)
 const result=await replayNativePackedControl(config(tape));assert.deepEqual(tape,before);assert.deepEqual(result.mapped,tape.map(o=>({...o,layerId:'target'})));assert.deepEqual(appended.map(x=>x.role),['remote','remote'])}finally{delete globalThis.window}
})
test('wrong count/seed paper/board and nonfresh material reject',async()=>{
 for(const change of [c=>c.expectedOperationCount=3,c=>c.tape.push(c.tape[0]),c=>c.actualPaperSha='different',c=>c.expectedBoard.width=101,c=>window.__engine._log.entries.push({op:{type:'stroke'}})]){
  try{const appended=mock(),c=config([{type:'stroke',layerId:'original'},{type:'stroke',layerId:'original'}]);change(c);await assert.rejects(replayNativePackedControl(c));assert.equal(appended.length,0)}finally{delete globalThis.window}
 }
})
