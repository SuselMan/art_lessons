/** OFF QA diagnostic. Captures rendered canvas AFTER UP only; readback perturbs cadence. */
export function installOwnedMorphFilmstrip(engine,canvas,{anchorSequence=null,anchorPhase='land',getTrace=()=>[],maxFrames=6,captureOffsets=null,maxBytes=12*1024*1024,clock=performance,raf=requestAnimationFrame,cancel=cancelAnimationFrame,makeCanvas=()=>document.createElement('canvas')}={}){
 const final=anchorPhase==='final',publication=anchorPhase==='publication'||final,handoff=anchorPhase==='handoff'||publication;
 if(captureOffsets!==null&&(!Array.isArray(captureOffsets)||JSON.stringify(captureOffsets)!==JSON.stringify([0,300,1000,2000])||handoff||maxFrames!==4))throw Error('Explicit bounded residual four-frame offsets required');
 if(maxFrames!==(final?1:handoff?3:captureOffsets?4:6)||!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw Error('Explicit bounded six-frame capture required');
 if(anchorSequence!==null&&!(publication?[2]:handoff?[1]:[2,3,4]).includes(anchorSequence))throw Error('Explicit final bounded owner sequence required');
 if(!['land','up','handoff','publication','final'].includes(anchorPhase)||anchorPhase==='up'&&anchorSequence===null)throw Error('Explicit owner UP anchor required');
 let resolveDone;const done=new Promise(resolve=>{resolveDone=resolve});
 const offsets=captureOffsets??(final?[2000]:handoff?[0,50,150]:[0,100,300,700,1200,2100]),frames=[];let id,stopped=false,start=null,bytes=0,lastGate=null,timedOut=false;
 const tick=()=>{if(stopped)return;const now=clock.now();
  const revealDetails=[...engine._washReveals.values()].map(r=>({startedAt:r.startedAt,durationMs:r.durationMs??null,progressive:!!r.progressive,hold:engine._revealHold(r,now)})),reveals=revealDetails.filter(r=>(final||r.startedAt!==null&&r.startedAt!==undefined)&&r.hold>0);if(final)lastGate={at:now,anchorAt:start,canonicalPending:!!engine._wcCanonical.pending,settle:!!engine._settle,rebuilds:engine._rebuildJobs?.size??0,activeStroke:!!engine._strokeId,revealDetails};
  if(start===null){const event=getTrace().find(event=>event.kind===(anchorPhase==='up'?'seal':'land')&&event.sequence===anchorSequence);if(anchorPhase==='up'&&event)start=event.at;else if(publication&&event&&!engine._wcCanonical.pending&&!engine._settle&&!(engine._rebuildJobs?.size))start=now;else if(!publication&&anchorPhase!=='up'&&reveals.length&&(anchorSequence===null||event))start=now;}
  // No screenshot/readback in DOWN/MOVE, including the new gesture during a reveal.
  if(start!==null&&!engine._strokeId&&(!final||(!reveals.length&&!engine._wcCanonical.pending&&!engine._settle&&!(engine._rebuildJobs?.size)))&&frames.length<maxFrames&&now-start>=offsets[frames.length]){
   // Redraw before capture: WebGL drawing buffer may be discarded between frames.
   engine._display();
   const out=makeCanvas(),scale=Math.min(1,640/canvas.width,640/canvas.height);out.width=Math.max(1,Math.round(canvas.width*scale));out.height=Math.max(1,Math.round(canvas.height*scale));out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);
   const png=out.toDataURL('image/png');bytes+=png.length;if(bytes>maxBytes){stopped=true;resolveDone();return;}
   frames.push({finalAfterReveal:final?true:null,...(final?{revealDetails}:{}),publicationConfirmed:publication?!!getTrace().find(event=>event.kind==='land'&&event.sequence===anchorSequence)&&!engine._wcCanonical.pending:null,requestedOffset:offsets[frames.length],at:now,elapsed:now-start,canonicalPending:!!engine._wcCanonical.pending,reveals:reveals.length,width:out.width,height:out.height,png});
  }
  if(frames.length<maxFrames)id=raf(tick);else resolveDone();
 };
 id=raf(tick);const stop=()=>{stopped=true;cancel(id);return{frames,bytes,...(final?{lastGate,finalGatePassed:frames.length===1,timedOut,failureReason:frames.length===1?null:timedOut?'deadline15s-before-reveal-complete':'stopped-before-ready'}:{}),truncated:bytes>maxBytes,limitations:(final?'One actual post-publication ≥2s/reveals0':handoff?'Three post-parent-land':captureOffsets?'Four post-UP residual':'Six post-UP')+' rendered canvas thumbnails; readback perturbs queue/cadence, diagnostic display/readback, not onset or quality oracle'};};return{stop,async finish(){let timer;try{await Promise.race([done,new Promise(resolve=>{timer=setTimeout(()=>{timedOut=true;resolve()},final?15000:3500)})]);return stop();}finally{clearTimeout(timer)}}};
}
