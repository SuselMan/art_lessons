/** Owned-page readonly diagnostics. Copies precede prepare and follow finish;
 * timestamps include observation overhead, not GPU duration or pen latency. */
export async function installSettleBoundaryProbe(worldROI=[402,352,78,96]) {
 if(!Array.isArray(worldROI)||worldROI.length!==4||worldROI.some(v=>!Number.isSafeInteger(v))||worldROI[2]<=0||worldROI[3]<=0||worldROI[2]>96||worldROI[3]>96)throw Error('Bounded settle world ROI required')
 const {CanonicalRoomWatercolorExecutor}=await import('/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts')
 const proto=CanonicalRoomWatercolorExecutor.prototype,original=proto.prepareSettle,leases=new Set(),records=window.__settleBoundaryRecords=[],payloads=window.__settleBoundaryPayloads=new Map()
 let ordinal=0,id=0,retained=0
 const roles=['inkLoad','inkColor','inkBase','colorBase','strokeInk','strokeColor','inkSettled','colorSettled','solventLoad','foreignSolventLoad']
 const snapshot=(owner,phase,input)=>{
  const [x,y,w,h]=worldROI,tile=owner.target.buffer
  if(x<0||y<0||x+w>tile.width||y+h>tile.height)throw Error('Settle ROI outside actual tile')
  const record={phase,worldROI:[...worldROI],observedAtMs:performance.now(),gesture:owner.scratch.gesture,materialGesture:owner.scratch.materialGesture,bounds:{...input.bounds},roles:[]}
  try{owner.adapter.runQuantum(ctx=>{const fields=owner.scratch.tiles.peek(tile);record.filmGesture=fields?.filmGesture??null;record.solventGesture=fields?.solventGesture??null;record.foreignGestures=owner.scratch.foreignSources?.map(s=>s.gesture)??null
   for(const role of roles){const field=fields?.[role];if(!field){record.roles.push({role,absent:true});continue}const stride=Math.ceil(w*4/256)*256,buffer=owner.backend.device.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});leases.add(buffer);record.roles.push({role,buffer,stride});ctx.encoder.copyTextureToBuffer({texture:field.texture,origin:[x,y]},{buffer,bytesPerRow:stride,rowsPerImage:h},[w,h])}
  });return record}catch(error){for(const s of record.roles){s.buffer?.destroy();leases.delete(s.buffer)}throw error}
 }
 const read=async record=>{
  const [, ,w,h]=record.worldROI
  try{for(const s of record.roles){if(s.absent){s.byteLength=0;continue}await s.buffer.mapAsync(GPUMapMode.READ);const padded=new Uint8Array(s.buffer.getMappedRange()),tight=new Uint8Array(w*h*4);for(let row=0;row<h;row++)tight.set(padded.subarray(row*s.stride,row*s.stride+w*4),row*w*4);s.buffer.unmap();s.sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',tight)),x=>x.toString(16).padStart(2,'0')).join('');let text='';for(let i=0;i<tight.length;i+=8192)text+=String.fromCharCode(...tight.subarray(i,i+8192));const encoded=btoa(text);retained+=encoded.length;if(retained*2>8*1024*1024)throw Error('Settle observer string budget exceeded');s.payloadId=id++;s.encodedLength=encoded.length;s.byteLength=tight.length;payloads.set(s.payloadId,encoded)}}finally{for(const s of record.roles){s.buffer?.destroy();leases.delete(s.buffer);delete s.buffer;delete s.stride}}
 }
 proto.prepareSettle=function(input){
  if(ordinal>=3)throw Error('Bounded settle observer exceeds three jobs')
  const before=snapshot(this,'before-prepare',input);let task
  try{task=original.call(this,input)}catch(error){for(const s of before.roles){s.buffer?.destroy();leases.delete(s.buffer)}throw error}
  const record={ordinal:ordinal++,skipped:!task,published:false,stages:[before]};records.push(record)
  if(!task){for(const s of before.roles){s.buffer?.destroy();leases.delete(s.buffer);delete s.buffer;delete s.stride}record.stages=[];return task}
  const finish=task.finish,publish=task.publish,dispose=task.dispose,owner=this
  task.finish=function(...args){const result=finish.apply(this,args);record.stages.push(snapshot(owner,'after-finish',input));return result}
  task.publish=async function(...args){try{for(const stage of record.stages)await read(stage);const result=await publish.apply(this,args);record.published=true;return result}catch(error){record.error=String(error);throw error}}
  task.dispose=function(...args){try{return dispose.apply(this,args)}finally{for(const stage of record.stages)for(const s of stage.roles){s.buffer?.destroy();leases.delete(s.buffer);delete s.buffer;delete s.stride}}}
  return task
 }
 window.__restoreSettleBoundaryProbe=()=>{proto.prepareSettle=original;for(const b of leases)b.destroy();leases.clear();payloads.clear()}
}
