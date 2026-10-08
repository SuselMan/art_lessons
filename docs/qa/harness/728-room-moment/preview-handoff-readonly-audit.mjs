import assert from 'node:assert/strict';
import {OwnedPresentationMorphBridge} from '/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/OwnedPresentationMorphBridge.mjs';
const field=value=>({value,copyTo(dst){dst.value=this.value}});
const presentation=field(10),before=field(37),pending=field(91),coverage=field(230);
const held={before,pending,progressive:true,startedAt:null};
const e={_washReveals:new Map([[presentation,held]]),_layers:new Map([['L',{}]]),_revealHold:r=>r.startedAt===null||performance.now()-r.startedAt<2000?1:0};
const owner={token:{layerId:'L',sequence:2},lease:{fields:{presentation,coverage}}};
const morph=new OwnedPresentationMorphBridge(e);
assert.equal(morph.visibleField(owner),before);
// Exact runtime detach: it removes pending, not currently displayed held.before.
held.pending=undefined;
assert.equal(morph.visibleField(owner).value,37);
// Existing source rebase writes retained presentation/coverage identities, not before.
presentation.value=120;coverage.value=240;
morph.rebaseStarted(owner);
assert.equal(morph.visibleField(owner).value,37);
assert.equal(owner.lease.fields.coverage,coverage);
assert.equal(coverage.value,240);
// Negative control: a caller that exposes raw source immediately jumps37→120.
assert.notEqual(presentation.value,morph.visibleField(owner).value);
// Pending91 was a target, not the last actually displayed frame37.
assert.notEqual(pending.value,before.value);
console.log(JSON.stringify({pass:true,visibleBefore:37,visibleAfterRebase:37,pendingTarget:91,newSource:120,scope:'actual morph class; CPU identities, no GL animation proof'}));
