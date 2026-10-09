import {test,afterEach} from 'node:test'
afterEach(()=>{delete globalThis.window})
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

const tape=()=>Array.from({length:4},(_,i)=>({type:'stroke',id:'op'+i,layerId:'old',color:[i/4,0,.5],seed:i,dabsPacked:'fixed'+i,preset:'normal:100:70:PB29:round',wet:[.5]}))
function fixture(){const appended=[];globalThis.window={__engine:{_wcNativeEnabled:true,_wcNative:{},_layers:new Map([['new',{}]]),_log:{entries:[]},_pageSize:()=>({w:1754,h:2480}),appendOperation:(op,source)=>appended.push({op,source})}};return appended}
const args=t=>({tape:t,targetLayerId:'new',expectedBoard:{width:1754,height:2480},expectedPaperSha:'same',actualPaperSha:'same'})
test('ordinary native replay preserves every packed property and calls existing executor once',async()=>{const seen=fixture(),t=tape(),original=structuredClone(t);await replayNativePackedControl(args(t));assert.deepEqual(t,original);assert.deepEqual(seen,t.map(op=>({op:{...op,layerId:'new'},source:'remote'})))})
test('wrong backend and paper fail before first append',async()=>{const seen=fixture();window.__engine._wcNativeEnabled=false;await assert.rejects(replayNativePackedControl(args(tape())),/native/);assert.equal(seen.length,0);fixture();await assert.rejects(replayNativePackedControl({...args(tape()),actualPaperSha:'different'}),/paper/)})

test('idle role callbacks occur between exact operation admissions and abort the next on failure',async()=>{const appended=mock(),t=[{type:'stroke',layerId:'old'},{type:'stroke',layerId:'old'}],seen=[];window.__nativeFrontAfterOperation=async i=>{seen.push([i,appended.length])};await replayNativePackedControl({...config(t),diagnosticFrontRoles:true});assert.deepEqual(seen,[[0,1],[1,2]]);const again=mock();window.__nativeFrontAfterOperation=async()=>{throw Error('capture failed')};await assert.rejects(()=>replayNativePackedControl({...config(t),diagnosticFrontRoles:true}),/capture failed/);assert.equal(again.length,1)})
