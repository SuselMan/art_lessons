import{continuous400Points,continuousPenSamples,validateContinuous400Bounds}from'./ContinuousPenRecipe.mjs';
/** Same PointerInput pen loop as scripts/devices/pageLib.js; CPU-only observations. */
export async function continuousPenStroke(e,canvas,{deadline,ordinal=0,observe=()=>{},tape=null}={}){
 validateContinuous400Bounds();if(e._locked||!e._paper.loaded||e.gl.isContextLost())throw Error('Drawable actual Room required');
 const transform=e._pointer._transform;if(typeof transform!=='function')throw Error('Actual pointer world transform required');
 const a=transform(0,0),b=transform(1,0),c=transform(0,1),xx=b.x-a.x,xy=c.x-a.x,yx=b.y-a.y,yy=c.y-a.y,det=xx*yy-xy*yx;
 if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('Invertible pointer transform required');
 const client=(x,y)=>[(yy*(x-a.x)-xy*(y-a.y))/det,(-yx*(x-a.x)+xx*(y-a.y))/det];
 const mk=(sample,buttons)=>{const[x,y]=client(sample.worldX,sample.worldY);const ev={clientX:x,clientY:y,pressure:.8,tiltX:0,tiltY:0,twist:0,width:1,height:1,pointerType:'pen',pointerId:728,isPrimary:true,button:0,buttons,timeStamp:sample.at,target:canvas,currentTarget:canvas,preventDefault(){},stopPropagation(){},getCoalescedEvents(){return[ev]},getPredictedEvents(){return[]}};return ev};
 const idDescriptor=Object.getOwnPropertyDescriptor(e,'_strokeId');let assignedId=e._strokeId;
 if(tape){if(!idDescriptor||!('value'in idDescriptor)||!idDescriptor.configurable||!idDescriptor.writable)throw Error('Owned strokeId descriptor required');Object.defineProperty(e,'_strokeId',{configurable:true,get:()=>assignedId,set:value=>{assignedId=value==null?value:tape.strokeId}})}
 const cap=canvas.setPointerCapture,release=canvas.releasePointerCapture;canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
 const start=performance.now(),frames=[],handlers=[];let last=start,strokeId;
 const call=(phase,event)=>{const at=performance.now();e._pointer[phase==='down'?'_handleDown':phase==='up'?'_handleUp':'_handleMove'](event);const end=performance.now();handlers.push({phase,at,end});observe({ordinal,phase,at,end,pending:!!e._wcCanonical.pending,rebuildJobs:e._rebuildJobs.size,settle:!!e._settle})};
 try{
  call('down',mk({worldX:300,worldY:300,at:start},1));strokeId=e._strokeId;if(!strokeId)throw Error('Actual DOWN rejected');
  if(tape){for(const frame of tape.frames){let now=await new Promise(requestAnimationFrame);while(now-start<frame.at(-1).elapsedMs)now=await new Promise(requestAnimationFrame);if(now>deadline||e.gl.isContextLost())throw Error('Deadline/context loss');frames.push(now);const samples=frame.map(s=>mk({...s,at:start+s.elapsedMs},1)),ev=samples.at(-1);ev.getCoalescedEvents=()=>samples;call('move',ev);last=now;}}
  else while(last-start<1800){const now=await new Promise(requestAnimationFrame);if(now>deadline||e.gl.isContextLost())throw Error('Deadline/context loss');frames.push(now);const samples=continuousPenSamples(continuous400Points,now-start,now-last).map(s=>mk({...s,at:start+s.elapsedMs},1)),ev=samples.at(-1);ev.getCoalescedEvents=()=>samples;call('move',ev);last=now;}
  call('up',mk({worldX:600,worldY:500,at:tape?start+1800:performance.now()},0));
  return{ordinal,strokeId,start,up:performance.now(),frames,handlers,coalescedPerFrame:2,nominalMs:1800,worldPoints:continuous400Points,scope:'Synthetic PointerInput dispatch; handler/display return is CPU submission, not physical pen latency'};
 }finally{try{if(e._strokeId&&(e._strokeId===strokeId||(tape&&e._strokeId===tape.strokeId)))e._pointer._handleUp(mk({worldX:600,worldY:500,at:performance.now()},0));}finally{canvas.setPointerCapture=cap;canvas.releasePointerCapture=release;if(tape)Object.defineProperty(e,'_strokeId',{...idDescriptor,value:assignedId})}}
}
