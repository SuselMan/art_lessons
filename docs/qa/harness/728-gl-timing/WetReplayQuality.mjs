export function wetReplayVerdict(rows){return rows?.length===2&&rows[0].replay===false&&rows[1].replay===true&&rows.every(r=>r.errors===0&&r.dropped===0&&r.glError===0&&!r.lost&&r.whole.alphaNonzero>0&&r.accepted&&r.idle&&r.defaultsOff)&&['initialWetSHA','operationSHA','wetSHA'].every(k=>rows[0][k]===rows[1][k])&&JSON.stringify(rows[0].whole)===JSON.stringify(rows[1].whole)}
export function rawWetModel(w){return {layers:[...w._layers].map(([id,cells])=>[id,[...cells].map(([k,c])=>[k,c.w,c.at,c.cx,c.cy,Object.hasOwn(c,'p'),c.p??null])]),pending:[...w._pending].map(([id,cells])=>[id,[...cells].map(([k,c])=>[k,c.w,c.at,c.cx,c.cy,Object.hasOwn(c,'p'),c.p??null])]),drained:[...w._drained],peak:w._peak,peakAt:w._peakAt,box:w._box?{...w._box}:null}}
const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');
const jsonHash=value=>hash(new TextEncoder().encode(JSON.stringify(value)));
/** Own isolated page only. CPU acceptance and actual GL endpoint quality, never latency. */
export async function wetReplayQuality({engineUrl,transcriptUrl,onPartial=()=>{},onBeforeArm=async()=>{}}){
 if(window.__engine)throw Error('Room/user engine forbidden');
 const [{PencilEngine},{WetTranscript}]=await Promise.all([import(engineUrl),import(transcriptUrl)]);
 const rows=[];let baseline=null,e=null,canvas=null;const deadline=performance.now()+90000;
 const idle=async()=>{while(e._settle||e._wcCanonical.pending||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size||e._unsettledLayers.size){if(performance.now()>deadline||e.gl.isContextLost())throw Error('Natural idle deadline/loss');await new Promise(requestAnimationFrame)}};
 const destroy=()=>{e?.destroy();e=null;canvas?.remove();canvas=null};
 try{for(const replay of [false,true]){
  await onBeforeArm(replay);if(performance.now()>deadline)throw Error('Cohort deadline');
  const tape=new WetTranscript(4096),samples=[];canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.style.cssText='width:256px;height:256px';document.body.append(canvas);
  e=new PencilEngine(canvas,{paper:'fine',pageWidth:256,pageHeight:256,userId:'isolated-wet-qa',diagnosticPointerAdmission:true,diagnosticWetReplay:replay,...(!replay?{diagnosticWetTranscript:tape.observe}:{})});
  await e.paperReady();e.appendOperation({id:'isolated-layer',type:'layer_add',userId:'isolated-wet-qa',layerId:'L',timestamp:1,name:'QA'},'remote');e.setActiveLayer('L');e.setCompositeOrder([{id:'L',opacity:1}]);e.setLocked(false);e.setTool('watercolor');e.setPencil('normal:20:100:PB29:round');e.setSize(8);await idle();
  if(e._diagnosticWetReplay!==replay||!e._diagnosticPointerAdmission)throw Error('Constructor consumption');
  const defaultsOff=!e._wcNativeEnabled&&!e._wcAsyncFinish&&!e._wcMaterialPresentation&&!e._wcJoinedTouchMixed&&!e._wcJoinedTouch&&!e._wcJoinedFinishDeferred&&!e._wcJoinedTouchSnapshotLease;
  if(!defaultsOff)throw Error('Unexpected runtime variant');
  const initial=rawWetModel(e._paperWet),initialWetSHA=await jsonHash(initial);
  if(initial.layers.length||initial.pending.length||initial.drained.length||initial.peak!==0||initial.peakAt!==0||initial.box!==null)throw Error('Fresh empty initial wet model required');
  if(replay&&initialWetSHA!==rows[0].initialWetSHA)throw Error('Initial model mismatch');
  await onPartial({replay,initialWetSHA,initialEmpty:true});
  if(!replay){
   // Real PointerInput normalization; synthetic QA events are NOT physical pen latency.
   for(const kind of ['start','move','end'])e._pointer.on(kind,s=>{if(samples.length>=32)throw Error('Sample cap');samples.push({kind,sample:{...s}});if(kind==='start')e._onStart(s);else if(kind==='move')e._onMove(s);else e._onEnd(s)});
   const rect=canvas.getBoundingClientRect(),start=performance.now(),event=(x,t)=>{const p=new PointerEvent('pointermove',{button:0,pointerId:71,pointerType:'pen',buttons:1,isPrimary:true,pressure:.7,clientX:rect.left+x,clientY:rect.top+128,tiltX:8,tiltY:-4});Object.defineProperty(p,'timeStamp',{value:start+t});return p};
   const nominal=async offset=>{while(performance.now()<start+offset){if(performance.now()>deadline)throw Error('Input deadline');await new Promise(requestAnimationFrame)}};
   e._pointer._handleDown(event(100,0));await nominal(24);const move=event(124,24);Object.defineProperty(move,'getCoalescedEvents',{value:()=>[event(112,12),event(124,24)]});e._pointer._handleMove(move);await nominal(28);e._pointer._handleUp(event(124,28));
   const operations=e._log.doneOperations().filter(op=>op.type==='stroke');if(operations.length!==1)throw Error('One actual accepted source required');
   baseline={operation:structuredClone(operations[0]),samples,events:tape.events.slice()};
   if(!baseline.operation.strokeId||!baseline.operation.washId||tape.dropped||e._wetTranscriptErrors)throw Error('Incomplete source witness');
  }else{
   const authority=e._paperWet.captureDiagnosticAuthority(),op=baseline.operation,packet=e.diagnosticCaptureWetReplayAuthority(op.strokeId,op.washId,op.id,authority,baseline.events,{dropped:0,errors:0});
   for(const item of baseline.samples)e.diagnosticDispatchPointerAdmission(packet,item.kind,item.sample,op.timestamp);
   await idle();e.diagnosticPromoteCompletedWetReplay(packet);
  }
  await idle();const op=e._log.doneOperations().find(op=>op.type==='stroke');if(!op)throw Error('Accepted operation absent');
  const partial={replay,initialWetSHA,operationSHA:await jsonHash(op),wetSHA:await jsonHash(rawWetModel(e._paperWet)),errors:e._wetTranscriptErrors,dropped:replay?0:tape.dropped,accepted:true,idle:true,defaultsOff,strokeId:op.strokeId,washId:op.washId,dabsPackedLength:op.dabsPacked.length};await onPartial(partial);
  const blob=await e.exportPNG(true);if(!blob)throw Error('Missing endpoint export');const image=await createImageBitmap(blob),out=document.createElement('canvas');out.width=image.width;out.height=image.height;const ctx=out.getContext('2d');ctx.drawImage(image,0,0);image.close();const bytes=ctx.getImageData(0,0,out.width,out.height).data;
  const pngDataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('PNG read'));reader.readAsDataURL(blob)});await onPartial({image:{replay,dataURL:pngDataURL}});
  const whole={width:out.width,height:out.height,sha:await hash(bytes),alphaNonzero:bytes.reduce((n,v,i)=>n+Number(i%4===3&&v>0),0)};rows.push({...partial,whole,glError:e.gl.getError(),lost:e.gl.isContextLost()});await onPartial({rows:rows.slice()});destroy();
 }}finally{destroy()}
 return {valid:wetReplayVerdict(rows),rows,scope:'Fresh single normal20/100 CPU fork promotion + actual GL endpoint; fresh empty baseline; exported PNG-decoded RGBA, not rawGL hiddenRGB parity; no foreign wash/server ACK/latency/live merge'};
}
