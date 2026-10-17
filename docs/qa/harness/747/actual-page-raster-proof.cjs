// Full physical storage captured FIRST; crop only by independently known page
// geometry. Codec clips right/bottom edge tiles; physical storage remains1024².
async function actualPageRasterProof(page,layerId,source="physical",journalOps,oracleOptions){return page.evaluate(async({layerId,source,journalOps,oracleOptions})=>{
 const e=__engine,target=e._layers.get(layerId);if(!target)throw Error('Missing own layer');
 const {w:pageW,h:pageH}=e._paper.pageSize(),physical=(source==='canonical-goal'?[...e._puddle.layers.get(target).tiles.values()].map(s=>({...s.tile,buffer:s.goal})):target.allResident()).map(t=>({x:t.originX,y:t.originY,w:t.buffer.width,h:t.buffer.height,bytes:t.buffer.readPixels()}));
 // The actual bitmap is already captured above. A complete API journal may
 // replace ONLY the private oracle log synchronously; never hydrate the live
 // engine or consume its snapshot baseline/checkpoints. bakeByFullReplay
 // allocates isolated scratch and paints from blank without CP restore.
 const liveLog=e._log,liveEntries=liveLog.entries.slice(),liveJSON=JSON.stringify(liveLog.entries);let oracleLog=liveLog;
 if(journalOps!==undefined){if(!Array.isArray(journalOps)||!journalOps.length||journalOps.length>=500)throw Error('Complete bounded API journal required');const ids=new Set();let seq=-Infinity;oracleLog=new liveLog.constructor();for(const op of journalOps){if(!Number.isSafeInteger(op.seq)||op.seq<=seq||ids.has(op.id))throw Error('API journal must be sorted unique authoritative seq');seq=op.seq;ids.add(op.id);oracleLog.append(op,{serverSeq:op.seq},false);if(op.type==='operation_undo')oracleLog.applyUndo(op.targetOpId,op.userId);else if(op.type==='operation_redo')oracleLog.applyRedo(op.targetOpId,op.userId);else if(op.type==='operation_revoke')oracleLog.revoke(op.targetOpId)}if(oracleLog.entries.length!==journalOps.length)throw Error('API oracle lost entries')}
 const baselineKeys=['diagnosticM70TightSupport32','diagnosticM70CapturedBacking','diagnosticM70CooperativeCapture','diagnosticM70StepBudgetMs','diagnosticM70SkipEmptyPostphase','diagnosticM70SkipEmptyReference'],baselineSaved=Object.fromEntries(baselineKeys.map(k=>[k,e[k]])),old=e.diagnosticM70HiddenReplay,oldTight=e.diagnosticM70TightSupport32,liveController=e._puddle,puddleFor=e._puddleFor,oracleControllers=[],seen=new WeakSet();let oracle,oracleNativePrepare=0;
 try{e.diagnosticM70HiddenReplay=false;e._log=oracleLog;if(oracleOptions?.tightSupport32===false){if(source!=='canonical-goal'||oldTight!==true)throw Error('Controlled612 requires captured live R32 goal');for(const k of baselineKeys)e[k]=k==='diagnosticM70StepBudgetMs'?0:false;e._puddleFor=function(...args){const before=this._puddle,c=puddleFor.apply(this,args);if(c&&!seen.has(c)){seen.add(c);if(c===liveController||this.diagnosticM70TightSupport32!==false)throw Error('Replay controller is not isolated baseline612');const actualOptions=Object.fromEntries(baselineKeys.map(k=>[k,this[k]]));if(Object.values(actualOptions).some(Boolean))throw Error('Baseline replay optimization flag remained active');oracleControllers.push({type:c.constructor.name,tightFlagAtCreation:this.diagnosticM70TightSupport32,actualOptions,createdWhilePuddleNull:before===null});const plan=c.host?.settlePlan;if(plan){if(plan===liveController?.host?.settlePlan)throw Error('Replay shares live plan');const prepare=plan.prepare;plan.prepare=function(...xs){oracleNativePrepare++;return prepare.apply(this,xs)}}}return c}}
 oracle=e.bakeLayerByFullReplay(layerId);if(oracleOptions?.tightSupport32===false&&(!oracleControllers.length||oracleControllers.some(c=>c.type!=='PagedPuddleRoomController'||!c.createdWhilePuddleNull)))throw Error('Baseline612 controller creation not proven')
 }finally{e._log=liveLog;e.diagnosticM70HiddenReplay=old;e._puddleFor=puddleFor;for(const k of baselineKeys)e[k]=baselineSaved[k];if(baselineKeys.some(k=>e[k]!==baselineSaved[k]))throw Error('Oracle flag restore failed');if(e._puddle!==liveController||e._log!==liveLog||liveLog.entries.length!==liveEntries.length||liveLog.entries.some((v,i)=>v!==liveEntries[i])||JSON.stringify(liveLog.entries)!==liveJSON)throw Error('Oracle mutated live ownership/log')}if(!oracle)throw Error('Missing full replay oracle');
 const view=new DataView(oracle.buffer,oracle.byteOffset,oracle.byteLength),actual=oracle.slice();let offset=4,changed=0,max=0,alpha=0;const tiles=[];
 if(view.getUint32(0,true)!==physical.length)throw Error('Tile count mismatch');
 for(let n=0;n<physical.length;n++){
  const x=view.getInt32(offset,true),y=view.getInt32(offset+4,true),w=view.getUint32(offset+8,true),h=view.getUint32(offset+12,true);offset+=16;
  const t=physical.find(t=>t.x===x&&t.y===y);if(!t||w!==Math.min(t.w,pageW-x)||h!==Math.min(t.h,pageH-y))throw Error('Clipped page tile geometry mismatch');
  // Buffer bottom-up row0 may be below the finite sheet: surviving page rows
  // occupy the TOP h rows of a physical edge storage tile.
  const bottom=t.h-h;let tileChanged=0,tileAlpha=0;
  for(let row=0;row<h;row++)for(let col=0;col<w*4;col++){
   const a=t.bytes[((bottom+row)*t.w)*4+col],at=offset+row*w*4+col,d=Math.abs(a-oracle[at]);actual[at]=a;
   if(d){changed++;tileChanged++}max=Math.max(max,d);if(col%4===3&&a){alpha++;tileAlpha++}
  }
  tiles.push({x,y,w,h,storageW:t.w,storageH:t.h,changed:tileChanged,alpha:tileAlpha});offset+=w*h*4;
 }
 if(offset!==oracle.length)throw Error('Oracle trailing bytes');const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
 return{actualSource:source,actualCapturedBeforeOracle:true,oracleTightSupport32:oracleOptions?.tightSupport32===false?false:oldTight,oracleControllers,oracleNativePrepare,liveControllerRestored:true,liveTightFlagRestored:e.diagnosticM70TightSupport32===oldTight,oracleLog:journalOps?"complete-api":"live-complete",oracleOperationCount:oracleLog.entries.length,liveLogUnchanged:true,page:{width:pageW,height:pageH},physicalChanged:changed,max,alpha,tiles,actualHash:await hash(actual),oracleHash:await hash(oracle),glError:e.gl.getError()};
},{layerId,source,...journalOps?{journalOps}:{},...oracleOptions?{oracleOptions}:{}})}
module.exports={actualPageRasterProof};
