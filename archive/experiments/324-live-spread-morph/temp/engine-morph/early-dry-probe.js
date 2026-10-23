(async()=>{
 const scene='puddle';const drawn=await review.run(scene);const engine=review.engine,gl=engine.gl;
 const gain=()=>[...engine._washReveals.values()].map(r=>({gain:engine._revealMotionGain(r,performance.now()),pending:!!r.pending,mask:!!r.wetMask,duration:r.durationMs,started:r.startedAt}));
 const penUp=drawn.penUp,requestAt=performance.now(),before=gain();const pendingAtRequest=!!engine._settle;engine.watercolorDryAll();const after=gain();
 let settleEnd=null,revealEnd=null;const samples=[];const t0=performance.now();
 while(performance.now()-t0<45000){const now=performance.now();if(!engine._settle&&!engine._opQueue.length&&!engine._rebuildJobs.size&&!engine._pendingRebuilds.size&&settleEnd===null)settleEnd=now;
  samples.push({at:now,settle:!!engine._settle,reveals:engine._washReveals.size,gain:gain().map(v=>v.gain),gl:gl.getError(),lost:gl.isContextLost()});
  if(settleEnd!==null&&!engine._washReveals.size){revealEnd=now;break}if(gl.isContextLost())break;await review.sleep(50);
 }
 const result={scene,penUp,requestAt,pendingAtRequest,before,after,settleEnd,revealEnd,requestToEnd:revealEnd===null?null:revealEnd-requestAt,settleToEnd:revealEnd===null||settleEnd===null?null:revealEnd-settleEnd,samples};window.earlyDryResult=result;return result;
})()
