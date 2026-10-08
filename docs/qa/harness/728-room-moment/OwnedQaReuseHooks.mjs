import{OwnedQaBundleRetirement}from'./OwnedQaBundleRetirement.mjs';
/** OFF integration proposal. Explicit instance hooks only, never GL prototype. */
export function installOwnedQaReuseHooks({engine,generation,mainFree,previewFree,syncSites=[],consumerSites=[],conservativeGl=false}){
 if(!engine||typeof mainFree!=='function'||typeof previewFree!=='function'||!syncSites.length||(!consumerSites.length&&!conservativeGl))throw Error('Explicit main/preview capacity, existing sync and ALL consumer sites required');
 const bundles=new OwnedQaBundleRetirement({generation}),tracked=new Map(),restore=[];
 const wrap=(target,name,make)=>{const original=target?.[name];if(typeof original!=='function')throw Error('Missing hook '+name);const wrapped=make(original);target[name]=wrapped;restore.push(()=>{if(target[name]===wrapped)target[name]=original})};
 try{
  if(conservativeGl){for(const name of ['drawArrays','copyTexSubImage2D','copyTexImage2D','clear','readPixels'])wrap(engine.gl,name,original=>function(...args){bundles.ledger.conservativeSubmission();return original.apply(this,args)})}
  for(const {target,name}of syncSites)wrap(target,name,original=>function(...args){
   const certificate=bundles.captureBeforeExistingSync();const result=original.apply(this,args);
   if(result?.then)throw Error('Async sync is not a completed GPU certificate');
   if(!engine.gl.isContextLost())bundles.afterExistingSyncReturns(certificate,'GpuBudgetFence.sync');
   return result;
  });
  for(const{target,name,ownersForArgs}of consumerSites){if(typeof ownersForArgs!=='function')throw Error('Explicit consumer identity mapper required');wrap(target,name,original=>function(...args){for(const owner of ownersForArgs(args))bundles.noteConsumer(owner);return original.apply(this,args)})}
 }catch(error){for(const r of restore.reverse())r();throw error}
 return{
  bundles,
  canAdmit(){return !engine.gl.isContextLost()&&!bundles.snapshot().lost&&bundles.snapshot().admitted<3&&mainFree()>0&&previewFree()>0},
  track(owner,{detachPresentation,releasePreview,hasFutureCpuJobs}){
   const original=owner.source.retire,source=owner.source;
   if(tracked.has(owner.token))throw Error('Owner tracked twice');
   const captured={token:owner.token,source:{retire:()=>{source.retire=original;original.call(source);tracked.delete(owner.token)}}};
   if(!bundles.admit(captured,{detachPresentation,releasePreview,hasFutureCpuJobs}))return false;
   const deferred=()=>bundles.requestLandOrCancel(captured);source.retire=deferred;tracked.set(owner.token,{source,original,deferred});return true;
  },
  refreshAfterJobs(){bundles.refreshAfterJobs()},
  handleContextLoss(){bundles.contextLost()},
  uninstallAfterKnownIdle(){if(bundles.snapshot().admitted||tracked.size)throw Error('Live bundle hooks cannot be uninstalled');for(const r of restore.reverse())r()}
 }
}
