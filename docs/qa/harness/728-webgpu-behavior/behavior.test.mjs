import test from 'node:test';import assert from 'node:assert/strict';import { runBehaviorGate } from './behavior.mjs';
test('stationary weak solver fails dynamic floors and original state/tick restored',async()=>{
 const original=new Float32Array(512*384*16);original[8]=.7;let state=original.slice(),paused=false,resumed=false;
 const pause={textContent:'Pause',click(){paused=true}},resume={textContent:'Resume',click(){resumed=true}};
 globalThis.document={querySelectorAll:()=>paused?[resume]:[pause]};
 globalThis.window={__watercolorGpuPoc:{solverTick:17,async whenIdle(){},async readState(){return state.slice()},writeState(s,t){state=s.slice();this.solverTick=t},step(){assert.ok(paused);this.solverTick++}}};
 const result=await runBehaviorGate({steps:[0,1]});assert.equal(result.pass,false);assert.equal(result.results[0].gates.dynamic,false);assert.equal(result.results[2].gates.dynamic,false);assert.ok(result.results.every(r=>r.gates.safety&&r.gates.disconnected));assert.deepEqual(state,original);assert.equal(window.__watercolorGpuPoc.solverTick,17);assert.ok(resumed);
});
