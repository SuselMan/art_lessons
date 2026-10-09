import {test} from 'node:test'
import assert from 'node:assert/strict'
import {replayNativePackedControl} from './native-replay.mjs'
const tape=()=>Array.from({length:4},(_,i)=>({type:'stroke',id:'op'+i,layerId:'old',color:[i/4,0,.5],seed:i,dabsPacked:'fixed'+i,preset:'normal:100:70:PB29:round',wet:[.5]}))
function fixture(){const appended=[];globalThis.window={__engine:{_wcNativeEnabled:true,_wcNative:{},_layers:new Map([['new',{}]]),_log:{entries:[]},_pageSize:()=>({w:1754,h:2480}),appendOperation:(op,source)=>appended.push({op,source})}};return appended}
const args=t=>({tape:t,targetLayerId:'new',expectedBoard:{width:1754,height:2480},expectedPaperSha:'same',actualPaperSha:'same'})
test('ordinary native replay preserves every packed property and calls existing executor once',async()=>{const seen=fixture(),t=tape(),original=structuredClone(t);await replayNativePackedControl(args(t));assert.deepEqual(t,original);assert.deepEqual(seen,t.map(op=>({op:{...op,layerId:'new'},source:'remote'})))})
test('wrong backend and paper fail before first append',async()=>{const seen=fixture();window.__engine._wcNativeEnabled=false;await assert.rejects(replayNativePackedControl(args(tape())),/native/);assert.equal(seen.length,0);fixture();await assert.rejects(replayNativePackedControl({...args(tape()),actualPaperSha:'different'}),/paper/)})
