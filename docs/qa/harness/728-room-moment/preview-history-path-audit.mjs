import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {bindOwnedPreviewRuntime} from '/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/OwnedPreviewRuntime.mjs';
import {PrewarmedPreviewPool} from '/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/PrewarmedPreviewPool.mjs';
import {PREVIEW_BYTES} from '/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/SealedPreviewTransport.mjs';
import {guardOwnedPreviewRelease} from '/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/OwnedPreviewReleaseGuard.mjs';
const wt='/home/suselman/projects/pencil-agents/728-solvent-init/';
const engine=await readFile(wt+'apps/web/src/engine/index.ts','utf8');
const header='  private _sweepReveals(now: number, goneLayerId: string | null = null): void {';
const start=engine.indexOf(header),end=engine.indexOf('\n  }',start)+4;assert(start>=0);
const sweep=Function('return '+engine.slice(start,end).replace(header,'function(now,goneLayerId=null){'))();
const oldRaf=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
let callback;globalThis.requestAnimationFrame=f=>{callback=f;return 1};globalThis.cancelAnimationFrame=()=>{callback=null};
const outcomes=[];
try{for(const scenario of ['Undo-rebuild','layer-delete','context-loss']){
 let lost=false,finish=0,destroyed=0,steps=0;const released=[];
 const pool=new PrewarmedPreviewPool({create:(width,height)=>({width,height,texture:{}}),destroy:()=>destroyed++},{budgetBytes:3*PREVIEW_BYTES});
 const fields=Object.fromEntries(['original','coverage','pigmentLoad','pigmentBase','colourLoad','colourBase','solventLoad','solventBase','presentation'].map(k=>[k,{texture:{k},copyTo(){}}]));
 const held={layerId:'L',before:{},progressive:true,startedAt:null},owner={token:{layerId:'L',sequence:1},lease:{fields},source:{epoch:0,chunks:[{composite:{profile:{}}}]}};
 const e={gl:{isContextLost:()=>lost,finish:()=>finish++},_washReveals:new Map([[fields.presentation,held]]),_ribbonPasses:{drawRibbonCompositeRect(){}},_scheduleDisplay(){},_advanceWashReveal(){},_revealHold:()=>1};
 const r=bindOwnedPreviewRuntime(e,{hold:()=>held},{pool,port:{stats:{},initialize(){},step(){steps++}},domain:{disposeAfterFence(){}}});
 e._revealPoolRelease=guardOwnedPreviewRelease(f=>released.push(f),()=>r);r.seal(owner);const pending=held.pending;
 if(scenario==='context-loss'){lost=true;r.handleContextLoss()}else{sweep.call(e,0,'L');r.retire(owner)}
 assert.equal(held.pending,undefined);assert(!released.includes(pending));assert.equal(pool.active.size,1);assert.equal(steps,0);
 r.disposeAfterFence();assert.equal(pool.active.size,0);assert.equal(destroyed,21);assert.equal(finish,lost?0:1);
 outcomes.push({scenario,leaseHeldUntilFence:true,enginePoolPending:false,canonicalInputWrites:false});
}
// Actual source-path anchors: local history cancels canonical jobs; rebuild/destroy sweep BEFORE destructive clear.
assert(engine.includes("op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke') this._cancelSettle()"));
assert(engine.includes('if (this._layers.get(layerId) === buf) this._sweepReveals(performance.now(), layerId)'));
assert(engine.includes('this._sweepReveals(performance.now(), id)\n      this._forgetWashesOf(buf)'));
console.log(JSON.stringify({pass:true,outcomes,scope:'actual sweep+current runtime; Node resource paths, no Room history/pixel proof'}));
}finally{globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel}
