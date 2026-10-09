/** Actual Room PointerInput, five bounded strokes; no additional GPU fences. */
export async function runPhysicalBatchLive({enabled,deadlineMs=90000}={}){
 const e=window.__engine,store=window.__roomStore?.getState();if(!window.__physicalBatchRoomReady||!store||e._locked)throw Error('Actual ready Room required');
 const flags=window.__physicalBatchRoomFlags;if(flags.physicalBatchTwo!==enabled||Object.entries(flags).some(([k,v])=>k!=='physicalBatchTwo'&&v))throw Error('Isolated effective flags required');
 const canvas=[...document.querySelectorAll('canvas')].find(c=>c.className.includes('canvas')&&c.width>500);if(!canvas)throw Error('Actual drawing canvas missing');const rafTimeline=[];const frame=()=>new Promise(resolve=>requestAnimationFrame(t=>{if(rafTimeline.length<1024)rafTimeline.push({at:t,phase});resolve(t)})),deadline=performance.now()+deadlineMs,rows=[],display=[];let phase='idle',down=null,syncs=0,downFinish=0;
 const originalDisplay=e._display,originalSync=e._syncContinuationGpu,originalFinish=e.gl.finish,cap=canvas.setPointerCapture,release=canvas.releasePointerCapture;
 const now=()=>performance.now(),check=()=>{if(now()>deadline||e.gl.isContextLost())throw Error('Bounded deadline/loss')};
 const event=(x,y,buttons)=>{const r=canvas.getBoundingClientRect();const ev={clientX:r.left+r.width*x,clientY:r.top+r.height*y,pressure:.8,tiltX:0,tiltY:0,twist:0,width:1,height:1,pointerType:'pen',pointerId:728,isPrimary:true,button:0,buttons,timeStamp:now(),target:canvas,currentTarget:canvas,preventDefault(){},stopPropagation(){},getCoalescedEvents(){return[ev]},getPredictedEvents(){return[]}};return ev};
 e._display=function(...args){const t=now();try{return originalDisplay.apply(this,args)}finally{if(display.length<256)display.push({start:t,end:now(),phase,downOrdinal:down?.ordinal??null})}};
 e._syncContinuationGpu=function(...args){const t=now();try{return originalSync.apply(this,args)}finally{syncs++;if(rows.length<6)window.__physicalLiveSync={at:t,end:now(),phase}}};
 e.gl.finish=function(...args){if(phase==='down')downFinish++;return originalFinish.apply(this,args)};canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
 const partial=()=>window.__physicalLivePartial={rows:structuredClone(rows),display:structuredClone(display),syncs,downFinish,tape:e.getOperations().filter(o=>o.type==='stroke').map(o=>structuredClone(o))};
 try{
  store.setTool('watercolor');for(const [key,value]of Object.entries({size:400,nib:'round',pressureResponse:'normal',water:1,pigment:0,color:[.3,.15,.55]}))store.setToolSetting('watercolor',key,value);await frame();await frame();
  e.setTool('watercolor');e.setSize(400);
  for(let i=0;i<5;i++){
   const pigment=i===0?0:1,color=i===4?[.85,.55,.1]:[.3,.15,.55];store.setToolSetting('watercolor','pigment',pigment);store.setToolSetting('watercolor','color',color);await frame();e.setPencil('normal:100:'+pigment*100+':PB29:round');e.setColor(color);
   check();if(e._opts.size!==400||e._opts.tool!=='watercolor')throw Error('Actual settings mismatch');const x=.34+i*.025,y=.42+i*.015;down={ordinal:i,start:now()};phase='down';e._pointer._handleDown(event(x,y,1));const downEnd=now();if(!e._strokeId)throw Error('DOWN rejected '+i);phase='move';const raf=[];
   for(let k=1;k<=3;k++){const t=now();await frame();raf.push(now()-t);check();e._pointer._handleMove(event(x+.018*k,y+.009*k,1))}
   phase='up';const up=now();e._pointer._handleUp(event(x+.054,y+.027,0));rows.push({ordinal:i,pigment,color,down:down.start,downEnd,up,upEnd:now(),raf,settings:{size:e._opts.size,preset:e._opts.pencilType}});phase='qa-idle';partial();
   while(e._settle||e._wcCanonical.pending||e._rebuildJobs.size){check();await frame()}down=null;phase='idle';partial();
  }
  const tape=e.getOperations().filter(o=>o.type==='stroke');for(const row of rows){row.firstDisplayReturnAfterDown=display.find(d=>d.start>=row.down)?.end-row.down;row.downCpuMs=row.downEnd-row.down}if(tape.length!==5)throw Error('Actual five packed strokes required');return{rows,display,rafTimeline,syncs,downFinish,tape,flags,glError:e.gl.getError(),lost:e.gl.isContextLost(),scope:'Synthetic live Room; display returns are submissions, not physical visible latency; explicit QA idle between strokes'};
 }finally{partial();e._display=originalDisplay;e._syncContinuationGpu=originalSync;e.gl.finish=originalFinish;canvas.setPointerCapture=cap;canvas.releasePointerCapture=release}
}
