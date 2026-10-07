async function joinedDeferredClosure(input){
 const e=window.__engine,s=window.__roomStore?.getState();if(!e||!s?.room?.id)throw Error('Actual Room closure absent');
 const at=performance.now(),deadline=at+240000;
 while(e._settle||e._wcJoinedDeferred||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size||e._washReveals.size||e._log.entries.some(x=>x.pending)){
  if(e._contextLost||e.gl.isContextLost()||e._wcJoinedRecoveryLayers.size||e._wcJoinedDeferredError!==null)throw Error('Closure canonical failure');
  if(performance.now()>deadline)throw Error('Closure idle/ACK deadline');await new Promise(r=>setTimeout(r,30))
 }
 if(e._contextLost||e.gl.isContextLost()||e._wcJoinedRecoveryLayers.size||e._wcJoinedDeferredError!==null)throw Error('Closure failure after idle');
 const entries=e._log.entries.map(x=>({op:{...x.op},serverSeq:x.serverSeq,state:x.state,pending:x.pending}));
 if(input.type&&!entries.some(x=>x.op.type===input.type&&!input.previousIDs.includes(x.op.id)))throw Error('Expected actual '+input.type+' not accepted');
 const ids=entries.map(x=>x.op.id);if(input.expectedIDs&&!input.expectedIDs.every(id=>ids.includes(id)))throw Error('Fresh missing accepted IDs');
 if(input.expectedStates){const states=new Map(entries.map(x=>[x.op.id,x.state]));for(const [id,state] of input.expectedStates)if(states.get(id)!==state)throw Error('Fresh authoritative state changed '+id);}
 const {api}=await import('/src/lib/api/api.ts');const beforeSeq=Math.max(0,...entries.map(x=>x.serverSeq||0))+1;
 let stored;const storageDeadline=performance.now()+30000;
 do{stored=await api('GET /api/rooms/:roomId/operations',{params:{roomId:s.room.id},query:{beforeSeq,limit:500}});
 if(ids.every(id=>stored.some(x=>x.id===id)))break;if(performance.now()>storageDeadline)throw Error('Durable closure IDs missing');await new Promise(r=>setTimeout(r,250))}while(true);
 const stable=value=>JSON.stringify(value,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
 const noSeq=op=>{const copy={...op};delete copy.seq;return copy};
 for(const entry of entries)if(stable(noSeq(entry.op))!==stable(noSeq(stored.find(x=>x.id===entry.op.id))))throw Error('Durable closure payload changed '+entry.op.id);
 const blob=await e.exportPNG(true);if(!blob)throw Error('Closure PNG missing');const image=await createImageBitmap(blob),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);image.close();const rgba=ctx.getImageData(0,0,c.width,c.height).data;
 let alpha=0;for(let i=3;i<rgba.length;i+=4)alpha+=rgba[i]>0;if(input.nonempty&&!alpha)throw Error('Mandatory nonempty closure');
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba)),x=>x.toString(16).padStart(2,'0')).join('');
 const dimensions=[c.width,c.height];c.width=c.height=0;const png=await new Promise((r,j)=>{const f=new FileReader();f.onload=()=>r(f.result);f.onerror=j;f.readAsDataURL(blob)});
 const gl=e.gl.getError();if(gl||e.gl.isContextLost())throw Error('Closure GL/loss');
 return{png,sha,alpha,dimensions,entries,storedOperations:stored,ids,allPersisted:true,waitMs:performance.now()-at,gl,model:{joined:e._wcJoinedTouch,deferred:e._wcJoinedFinishDeferred,async:e._wcAsyncFinish,material:e._wcMaterialPresentation},snapshotAudit:e.takeSnapshotRestoreAudit?.()??[]};
}
