import assert from 'node:assert/strict';
import {PrewarmedPreviewPool} from '/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/PrewarmedPreviewPool.mjs';
import {SealedPreviewTransport,PREVIEW_BYTES} from '/home/suselman/projects/pencil-agents/728-solvent-init/docs/qa/harness/728-gl-queue-batch/SealedPreviewTransport.mjs';
const pool=new PrewarmedPreviewPool({create:(width,height)=>({width,height,texture:{}}),destroy(){}},{budgetBytes:3*PREVIEW_BYTES});
const source=Object.fromEntries(['original','coverage','pigmentLoad','pigmentBase','colourLoad','colourBase','solventLoad','solventBase'].map(k=>[k,{texture:{k}}]));
let serial=0,completed=0;const retired=[];
const owners=Array.from({length:3},(_,i)=>{const lease=pool.take(),transport=new SealedPreviewTransport({source,lease,token:{sequence:i+1}});transport.seal();return{lease,transport,lastRef:++serial,attached:true}});
assert.equal(pool.take(),null); // DOWN4 cannot force an idle boundary.
for(const owner of owners){owner.attached=false;retired.push({...owner,fence:owner.transport.retire()})}
const drain=()=>{for(const owner of retired)if(!owner.released&&!owner.attached&&owner.lastRef<=completed){owner.transport.releaseAfterFence(owner.fence);owner.released=true}};
drain();assert.equal(pool.take(),null); // land/retire alone is not GPU completion.
completed=2;drain();assert.equal(pool.available.length,2);assert.equal(pool.active.size,1);
const fourth=pool.take();assert(fourth);
assert.notEqual(fourth.pending.texture,owners[2].lease.pending.texture);
// Later preview commands require a later completion certificate; stale fence cannot recycle them.
const fourthTransport=new SealedPreviewTransport({source,lease:fourth,token:{sequence:4}});fourthTransport.seal();
const later={lease:fourth,transport:fourthTransport,lastRef:++serial,attached:false,fence:fourthTransport.retire()};retired.push(later);
drain();assert.equal(later.released,undefined);
completed=serial;drain();const available=pool.available.length;drain();assert.equal(pool.available.length,available);assert.equal(available,3);assert.equal(pool.active.size,0);
pool.disposeAfterFence();console.log(JSON.stringify({pass:true,cap4RejectedBeforeIdle:true,partialFenceReleasesOnly2:true,laterReferenceRejectsStaleFence:true,releasedExactlyOnce:true,scope:'candidate CPU ledger with actual pool/transport; no runtime patch'}));
