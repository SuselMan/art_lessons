import{PreviewLeaseCoordinator}from'./PreviewLeaseCoordinator.mjs';
/** OFF adapter proposal for installOwnerFifo's lease.release wrapper.
 * Replaces immediate source.retire with deferred bundle retirement; no GL hooks.
 */
export class OwnedQaBundleRetirement{
 constructor({generation}){this.ledger=new PreviewLeaseCoordinator({generation});this.owners=new Map()}
 admit(owner,{detachPresentation,releasePreview,hasFutureCpuJobs}={}){
  if(!owner?.token||typeof owner.source?.retire!=='function'||typeof detachPresentation!=='function'||typeof releasePreview!=='function'||typeof hasFutureCpuJobs!=='function')throw Error('Actual source + explicit producer/preview callbacks required');
  const record={owner,detachPresentation,releasePreview,hasFutureCpuJobs,requested:false,retired:false};
  if(!this.ledger.admit(owner.token,()=>{releasePreview();owner.source.retire();this.owners.delete(owner.token)}))return false;
  this.owners.set(owner.token,record);return true;
 }
 noteConsumer(owner,generation=this.ledger.generation){return this.ledger.reference(owner.token,generation)}
 requestLandOrCancel(owner){const r=this.owners.get(owner.token);if(!r)return false;r.requested=true;return this.tryRetire(r)}
 tryRetire(r){if(r.retired)return true;if(r.hasFutureCpuJobs())return false;
  // Explicit callback stops preview/visibility refs and performs required handoff.
  const detached=r.detachPresentation();if(detached?.gpuWrites!==false)this.ledger.reference(r.owner.token); //conservative lastref covers handoff GPU writes
  this.ledger.retire(r.owner.token,{detached:true});r.retired=true;return true;
 }
 refreshAfterJobs(){for(const r of this.owners.values())if(r.requested&&!r.retired)this.tryRetire(r)}
 captureBeforeExistingSync(){return this.ledger.captureExistingIdleBoundary()}
 afterExistingSyncReturns(certificate,kind){return this.ledger.completeExistingIdle(certificate,kind)}
 contextLost(){this.ledger.contextLost()}
 snapshot(){return this.ledger.snapshot()}
}
