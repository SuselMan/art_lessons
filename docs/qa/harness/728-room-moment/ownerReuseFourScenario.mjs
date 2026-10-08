/** OFF QA real PointerInput; four equal settings, no GPU sync issued by this probe. */
export async function runOwnerReuseFour({deadlineMs=90000}={}){
 const E=window.__engine,O=window.__ownerFifo,S=window.__roomStore.getState();
 if(!O?.qaReuseOwners||!O.reuseDiagnostics||E._locked||E._contextLost||E.gl.isContextLost())throw Error('Drawable enabled reuse owner required');
 const canvas=[...document.querySelectorAll('canvas')].find(c=>c.className.includes('canvas')&&c.width>500);if(!canvas)throw Error('Drawing canvas absent');
 const end=performance.now()+deadlineMs,frame=()=>new Promise(requestAnimationFrame),rows=[];let phase='between',finishes=0,syncs=0;
 const finish=E.gl.finish,sync=E._syncContinuationGpu,capture=canvas.setPointerCapture,release=canvas.releasePointerCapture;
 E.gl.finish=function(...args){if(phase==='down')finishes++;return finish.apply(this,args)};
 E._syncContinuationGpu=function(...args){const result=sync.apply(this,args);syncs++;return result};
 canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
 const check=()=>{if(performance.now()>end)throw Error('Four-stroke bounded deadline');if(E._contextLost||E.gl.isContextLost()||O.reuseDiagnostics.lost)throw Error('Stale/lost generation')};
 const event=(x,y,buttons)=>{const r=canvas.getBoundingClientRect(),ev={clientX:r.left+r.width*x,clientY:r.top+r.height*y,pressure:.8,tiltX:0,tiltY:0,twist:0,width:1,height:1,pointerType:'pen',pointerId:728,isPrimary:true,button:0,buttons,timeStamp:performance.now(),target:canvas,currentTarget:canvas,preventDefault(){},stopPropagation(){},getCoalescedEvents(){return[ev]},getPredictedEvents(){return[]}};return ev};
 try{
  S.setToolSetting('watercolor','size',400);S.setToolSetting('watercolor','water',1);S.setToolSetting('watercolor','pigment',1);await frame();await frame();
  E.setTool('watercolor');E.setSize(400);E.setPencil('normal:100:100:PB29:round');E.setColor([.3,.15,.55]);
  for(let i=0;i<4;i++){
   check();if(i===3){while(!O.reuseDiagnostics.canAdmit){check();await frame()}if(syncs===0)throw Error('No existing idle return before fourth');}
   const before=structuredClone(O.reuseDiagnostics),finishBefore=finishes,syncBefore=syncs;phase='down';E._pointer._handleDown(event(.46+i*.018,.47,1));phase='move';
   const started=!!E._strokeId;if(!started)throw Error('Actual DOWN rejected at '+i);
   for(let k=1;k<=3;k++){await frame();check();E._pointer._handleMove(event(.46+i*.018+.012*k,.47+.008*k,1));}
   E._pointer._handleUp(event(.46+i*.018+.036,.494,0));phase='between';
   rows.push({ordinal:i,before,afterUp:structuredClone(O.reuseDiagnostics),started,downFinish:finishes-finishBefore,existingSyncReturns:syncs-syncBefore,settings:{size:E._opts.size,preset:E._opts.pencilType,color:E._opts.graphiteColor,layerId:E._activeId}});
  }
  while(E._wcCanonical.pending||E._settle||E._rebuildJobs.size){check();await frame()}
  const tape=E.getOperations().filter(o=>o.type==='stroke').map(o=>structuredClone(o));if(tape.length!==4||JSON.stringify(tape).length>65536)throw Error('Bounded four original strokes required');
  return{rows,tape,final:structuredClone(O.reuseDiagnostics),existingSyncReturns:syncs,downFinishes:finishes,glError:E.gl.getError(),lost:E.gl.isContextLost(),limitations:['Diagnostic PointerInput, not physical pen latency','Same settings/layer; actual wash identity must be read from tape','Endpoint/replay exactness is a later separate gate']};
 }finally{E.gl.finish=finish;E._syncContinuationGpu=sync;canvas.setPointerCapture=capture;canvas.releasePointerCapture=release}
}
