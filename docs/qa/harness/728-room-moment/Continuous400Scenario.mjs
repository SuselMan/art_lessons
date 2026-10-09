import{assertProductMatchedModel}from'./ProductMatchedModel.mjs';
import{continuousPenStroke}from'./ContinuousPenStroke.mjs';
export async function runContinuous400({enabled,deadlineMs=90000}={}){
 const e=window.__engine,s=window.__roomStore?.getState();if(!s||!window.__physicalBatchRoomReady)throw Error('Ready ordinary Room required');const model=assertProductMatchedModel(e);
 if(window.__physicalBatchRoomFlags?.physicalBatchTwo!==enabled)throw Error('Effective batch flag mismatch');
 const canvas=[...document.querySelectorAll('canvas')].find(c=>c.className.includes('canvas')&&c.width>500);if(!canvas)throw Error('Actual canvas missing');
 const deadline=performance.now()+deadlineMs,rows=[],display=[],queue=[],original=e._display;let current=null;
 const partial=()=>window.__continuous400Partial={rows,display,queue,tape:e.getOperations().filter(o=>o.type==='stroke')};
 e._display=function(...args){const at=performance.now();try{return original.apply(this,args)}finally{if(display.length<1024)display.push({at,end:performance.now(),ordinal:current})}};
 try{
  s.setTool('watercolor');for(const[k,v]of Object.entries({size:400,nib:'round',pressureResponse:'normal',water:1,pigment:1,color:[.3,.15,.55]}))s.setToolSetting('watercolor',k,v);
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);e.setTool('watercolor');e.setSize(400);e.setPencil('normal:100:100:PB29:round');e.setColor([.3,.15,.55]);
  if(e._opts.size!==400||e._opts.tool!=='watercolor')throw Error('Actual 400 UI/engine mismatch');
  for(current=0;current<2;current++){
   const row=await continuousPenStroke(e,canvas,{deadline,ordinal:current,observe:x=>{if(queue.length<1024)queue.push(x)}});rows.push(row);partial();
   // Deliberately start the second stroke while previous paper remains wet.
   await new Promise(requestAnimationFrame);
  }
  current=null;while(e._settle||e._wcCanonical.pending||e._rebuildJobs.size){if(performance.now()>deadline||e.gl.isContextLost())throw Error('Bounded drain failed');await new Promise(requestAnimationFrame)}
  const tape=e.getOperations().filter(o=>o.type==='stroke');if(tape.length!==2)throw Error('Two actual packed strokes required');partial();
  return{rows,display,queue,tape,model,enabled,glError:e.gl.getError(),lost:e.gl.isContextLost(),scope:'Synthetic long PointerInput; second stroke starts without canonical idle; ON/OFF separate authored tapes, not exact packed parity'};
 }finally{partial();e._display=original}
}
