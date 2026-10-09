import{continuousPenStroke}from'./ContinuousPenStroke.mjs';
/** Ordinary Room, real clocks. CPU submissions and synthetic cadence, never physical pen latency. */
export async function runMixedLeaseNatural400({enabled,deadlineMs=90000,scenario='water-pigment'}={}){
 if(!['water-pigment','pigment-pigment'].includes(scenario))throw Error('Explicit known natural scenario required');
 const e=window.__engine,s=window.__roomStore?.getState();if(typeof enabled!=='boolean'||!e||!s||e._locked||!e._paper.loaded)throw Error('Drawable Room and explicit arm required');
 if(e._settle||e._wcCanonical.pending||e._wcNative||e._wcAsyncFinish||e._wcMaterialPresentation||e._wcJoinedTouchMixed||e._wcJoinedFinishDeferred)throw Error('Fresh product model required');
 const canvas=[...document.querySelectorAll('canvas')].find(c=>c.className.includes('canvas')&&c.width>500);if(!canvas)throw Error('Actual Room canvas missing');
 const deadline=performance.now()+deadlineMs,markers=[],queue=[],rows=[],originals=new Map();let ordinal=-1,phase='',old=null,pending=false,lease=false,downDrains=0;
 const add=(kind,at,end,extra={})=>{if(markers.length<2048)markers.push({kind,at,end,ordinal,...extra})};
 const wrap=(name,fn)=>{const original=e[name];if(typeof original!=='function')throw Error('Missing actual method '+name);originals.set(name,original);e[name]=fn(original)};
 const saved={joined:e._wcJoinedTouch,lease:e._wcJoinedTouchSnapshotLease};
 const partial=()=>window.__mixedNatural400Partial={enabled,pending,lease,downDrains,markers,queue,rows};
 try{
  e._wcJoinedTouch=true;e._wcJoinedTouchSnapshotLease=enabled;
  wrap('_onStart',original=>function(...args){const at=performance.now();phase='down';if(ordinal===1){old=this._settle;pending=!!old}try{return original.apply(this,args)}finally{if(ordinal===1)lease=!!old&&this._wcJoinedTouchLease===old;add('down',at,performance.now(),{pending,lease});phase=''}});
  wrap('_onEnd',original=>function(...args){const at=performance.now();phase='up';try{return original.apply(this,args)}finally{add('up',at,performance.now());phase=''}});
  wrap('_completeSettle',original=>function(...args){const at=performance.now();if(ordinal===1&&phase==='down')downDrains++;try{return original.apply(this,args)}finally{add('completeSettle',at,performance.now(),{phase})}});
  wrap('_paintDabs',original=>function(...args){const at=performance.now(),pigment=ordinal===1&&args[2]==='watercolor';try{return original.apply(this,args)}finally{if(pigment)add('pigment-source',at,performance.now())}});
  wrap('_display',original=>function(...args){const at=performance.now();try{return original.apply(this,args)}finally{add('display-submission',at,performance.now())}});
  s.setTool('watercolor');for(const[k,v]of Object.entries({size:400,nib:'round',pressureResponse:'normal',water:1,pigment:0,color:[.3,.15,.55]}))s.setToolSetting('watercolor',k,v);
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  e.setTool('watercolor');e.setSize(400);e.setColor([.3,.15,.55]);
  for(ordinal=0;ordinal<2;ordinal++){
   const pigment=scenario==='pigment-pigment'?1:ordinal,color=scenario==='pigment-pigment'&&ordinal===1?[.15,.5,.3]:[.3,.15,.55];s.setToolSetting('watercolor','color',color);e.setColor(color); s.setToolSetting('watercolor','pigment',pigment);e.setPencil(`normal:100:${pigment*100}:PB29:round`);
   const ui=window.__roomStore.getState().toolSettings.watercolor;if(e._opts.size!==400||e._opts.tool!=='watercolor'||e._opts.pencilType!==`normal:100:${pigment*100}:PB29:round`||JSON.stringify(e._opts.graphiteColor)!==JSON.stringify(color)||ui.size!==400||ui.water!==1||ui.pigment!==pigment||ui.nib!=='round'||JSON.stringify(ui.color)!==JSON.stringify(color))throw Error('Actual UI/preset/color/400 engine mismatch');
   rows.push(await continuousPenStroke(e,canvas,{deadline,ordinal,observe:q=>{if(queue.length<1024)queue.push(q)}}));partial();
   // No RAF/idle between water UP and pigment DOWN.
  }
  ordinal=2;const afterUp=performance.now();for(let i=0;i<3;i++){const frameTimestamp=await new Promise(requestAnimationFrame),at=performance.now();add('post-up-raf',at,at,{afterUp,frameTimestamp})}
  // The next harmless actual PointerInput sample measures handler availability after UP.
  const nextBegin=performance.now();e._pointer._handleMove({pointerType:'pen',pointerId:728,buttons:0,clientX:0,clientY:0,pressure:0,timeStamp:nextBegin,preventDefault(){},getCoalescedEvents(){return[]}});add('next-hover',nextBegin,performance.now());partial();
  const timedEnd=performance.now();while(e._settle||e._wcCanonical.pending||e._rebuildJobs.size){if(performance.now()>deadline||e.gl.isContextLost())throw Error('Bounded canonical drain');await new Promise(requestAnimationFrame)}
  const exportBegin=performance.now(),blob=await e.exportPNG(true);if(!blob||blob.size===0)throw Error('Final export missing');
  const tape=e.getOperations().filter(o=>o.type==='stroke');if(tape.length!==2||tape.some(o=>!o.dabsPacked))throw Error('Two genuine packed strokes required');
  const glError=e.gl.getError(),lost=e.gl.isContextLost();if(!pending||(enabled?(!lease||downDrains!==0):(lease||downDrains<1))||glError||lost)throw Error('Actual pending/admission/GL guard');
  return{enabled,scenario,pending,lease,downDrains,rows,markers,queue,tape,glError,lost,timedEnd,export:{begin:exportBegin,end:performance.now(),bytes:blob.size},scope:'Natural clock synthetic actual Room PointerInput; CPU source/display submissions and rAF availability, not physical pen latency or exact authored OFF/ON parity'};
 }finally{partial();for(const[name,original]of originals)e[name]=original;e._wcJoinedTouch=saved.joined;e._wcJoinedTouchSnapshotLease=saved.lease}
}
