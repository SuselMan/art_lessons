/** OFF QA diagnostic. Captures rendered canvas AFTER UP only; readback perturbs cadence. */
export function installOwnedMorphFilmstrip(engine,canvas,{anchorSequence=null,getTrace=()=>[],maxFrames=6,maxBytes=12*1024*1024,clock=performance,raf=requestAnimationFrame,cancel=cancelAnimationFrame,makeCanvas=()=>document.createElement('canvas')}={}){
 if(maxFrames!==6||!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw Error('Explicit bounded six-frame capture required');
 if(anchorSequence!==null&&![3,4].includes(anchorSequence))throw Error('Explicit final bounded owner sequence required');
 let resolveDone;const done=new Promise(resolve=>{resolveDone=resolve});
 const offsets=[0,100,300,700,1200,2100],frames=[];let id,stopped=false,start=null,bytes=0;
 const tick=()=>{if(stopped)return;const now=clock.now();
  const reveals=[...engine._washReveals.values()].filter(r=>r.startedAt!==null&&r.startedAt!==undefined&&engine._revealHold(r,now)>0);
  if(start===null&&reveals.length&&(anchorSequence===null||getTrace().some(event=>event.kind==='land'&&event.sequence===anchorSequence)))start=now;
  // No screenshot/readback in DOWN/MOVE, including the new gesture during a reveal.
  if(start!==null&&!engine._strokeId&&frames.length<maxFrames&&now-start>=offsets[frames.length]){
   // Redraw before capture: WebGL drawing buffer may be discarded between frames.
   engine._display();
   const out=makeCanvas(),scale=Math.min(1,640/canvas.width,640/canvas.height);out.width=Math.max(1,Math.round(canvas.width*scale));out.height=Math.max(1,Math.round(canvas.height*scale));out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);
   const png=out.toDataURL('image/png');bytes+=png.length;if(bytes>maxBytes){stopped=true;resolveDone();return;}
   frames.push({at:now,elapsed:now-start,canonicalPending:!!engine._wcCanonical.pending,reveals:reveals.length,width:out.width,height:out.height,png});
  }
  if(frames.length<maxFrames)id=raf(tick);else resolveDone();
 };
 id=raf(tick);const stop=()=>{stopped=true;cancel(id);return{frames,bytes,truncated:bytes>maxBytes,limitations:'Six post-UP rendered canvas thumbnails; readback perturbs queue/cadence, diagnostic display/readback, not onset or quality oracle'};};return{stop,async finish(){let timer;try{await Promise.race([done,new Promise(resolve=>{timer=setTimeout(resolve,3500)})]);return stop();}finally{clearTimeout(timer)}}};
}
