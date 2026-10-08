/** QA comparison only. Original engine path, supplied actual packed tape, no snapshots. */
export async function runOwnerOriginalReplay(input){
 const expectedStrokes=input.expectedStrokes??3;if(![3,4].includes(expectedStrokes)||!Array.isArray(input.tape)||input.tape.filter(o=>o.type==='stroke').length!==expectedStrokes)throw Error('Exact bounded packed tape required');
 for(const [index,op]of input.tape.filter(o=>o.type==='stroke').entries())if(!op.dabsPacked||!(op.preset==='normal:100:100:PB29:round'||input.allowWaterFirst===true&&index===0&&op.preset==='normal:100:0:PB29:round'))throw Error('Captured packed material required');
 const {PencilEngine}=await import(input.engineUrl),canvas=document.createElement('canvas');canvas.width=canvas.height=1024;document.getElementById('surface').replaceChildren(canvas);
 const actor=input.tape.find(o=>o.type==='stroke').userId,layerId=input.tape.find(o=>o.type==='stroke').layerId;
 const e=new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:actor,gradientFibres:true});window.__ownerOriginalReplayEngine=e;
 const hash=async()=>{const tiles=[...e._layers.get(layerId).allResident()];if(tiles.length!==1)throw Error('One actual tile required');const b=tiles[0].buffer,bytes=b.readPixels();return{width:b.width,height:b.height,nonzero:bytes.reduce((n,v)=>n+(v!==0),0),sha:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')}};
 const idle=async()=>{const until=performance.now()+90000;while(e._settle||e._wcCanonical.pending||e._rebuildJobs.size||e._unsettledLayers.size){if(performance.now()>until)throw Error('Original replay timeout');await new Promise(requestAnimationFrame)}};
 const stages=[];
 try{
  await e.paperReady();e._settleQueue.diagnosticSolverBatchEnabled=true;
  e.appendOperation({id:'owner-replay-layer',type:'layer_add',userId:actor,timestamp:input.tape[0].timestamp-1,layerId,name:'QA'},'remote');e.setActiveLayer(layerId);e.setCompositeOrder([{id:layerId,opacity:1}]);e.setLocked(false);
  let strokes=0;for(const operation of input.tape){e.appendOperation(structuredClone(operation),'remote');await idle();if(operation.type==='stroke')strokes++;if(strokes===expectedStrokes){e.watercolorDryAll();await idle()}stages.push({type:operation.type,id:operation.id,target:await hash()})}
  return{stages,flags:{gradientFibres:e._wcGradientFibres,joinedTouch:e._wcJoinedTouch,deferred:e._wcJoinedFinishDeferred,async:e._wcAsyncFinish,solver:e._settleQueue.diagnosticSolverBatchEnabled},glError:e.gl.getError(),lost:e.gl.isContextLost(),scope:'Same packed input original load/rebuild paths; per-operation readback perturbs cadence; not live replay proof'};
 }finally{e.destroy();window.__ownerOriginalReplayEngine=null}
}
