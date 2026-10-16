// Fixture-only completion gate. Engine idle/roomContentReady do not await history backfill.
// Wait for *presence*, then inspect states separately: waiting for correct states hides bugs.
async function historyReady(page,base,room){
 const known=new Map();let before=2147483647;
 for(;;){const response=await page.context().request.get(new URL('/api/rooms/'+encodeURIComponent(room)+'/operations?beforeSeq='+before+'&limit=500',base).href);if(!response.ok())throw Error('Fixture history HTTP '+response.status());const records=await response.json();if(!Array.isArray(records))throw Error('Fixture history JSON is not an array');for(const op of records)known.set(op.id,op);if(records.length<500)break;const next=Math.min(...records.map(o=>o.seq));if(!(next<before))throw Error('History pagination did not advance');before=next;}
 const operations=[...known.values()].sort((a,b)=>a.seq-b.seq);
 await page.waitForFunction(ids=>{const e=window.__engine;if(!e)return false;const have=new Set(e._log.entries.map(entry=>entry.op.id));return ids.every(id=>have.has(id))&&!e.pendingSnapshotHistoryRepairs().length&&!e._pendingRebuilds.size&&!e._rebuildJobs.size&&!e._opQueue.length&&!e._puddle?.state.pending},operations.map(o=>o.id),{timeout:60000});
 return{operations,journal:await journal(page)};
}
async function journal(page){return page.evaluate(()=>{const e=__engine,layers=[...new Set(e._log.entries.flatMap(entry=>entry.op.layerId?[entry.op.layerId]:[]))];return{entries:e._log.entries.map(entry=>({id:entry.op.id,type:entry.op.type,userId:entry.op.userId,layerId:entry.op.layerId,strokeId:entry.op.strokeId,timestamp:entry.op.timestamp,targetOpId:entry.op.targetOpId,state:entry.state,goneReason:entry.goneReason,pending:!!entry.pending,serverSeq:entry.serverSeq})),effective:layers.map(layerId=>({layerId,operations:e._log.layerPixelOps(layerId)})),pendingRepairs:e.pendingSnapshotHistoryRepairs()}})}
// ServerSeq may be unknown in old restored metadata; compare causal state and effective payloads.
function comparable(value){return{entries:value.entries.map(({id,state,goneReason})=>({id,state,goneReason})),effective:value.effective.map(({layerId,operations})=>({layerId,operations:operations.map(op=>{const copy={...op};delete copy.seq;return copy})}))}}
module.exports={historyReady,journal,comparable};
