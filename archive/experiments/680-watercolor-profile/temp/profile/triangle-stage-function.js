(async ({ops,swapped=false,wrapper}) => {
  const e=__timelineEngine,q=e._settleQueue,gl=e.gl;
  const idle=()=>!e._settle&&!e._opQueue.length&&!e._rebuildJobs.size&&!e._pendingRebuilds.size&&!e._washReveals.size;
  const until=async predicate=>{const t=performance.now();while(!predicate()){if(performance.now()-t>40000)throw Error('Diagnostic phase timeout');await new Promise(r=>setTimeout(r,25))}};
  if(ops.length!==2||ops.some(x=>x.type!=='stroke'))throw Error('Exact two-stroke facet fixture required');
  e.appendOperation(ops[0],'remote');await until(idle);
  const advance=q.advance,depth=e._displaySuspendDepth,prepare=e._settlePlan.prepare;let captured=false,held=null;
  window.__restoreTriangleStage=()=>{q.advance=advance;e._settlePlan.prepare=prepare;e._displaySuspendDepth=depth;window.__restoreSwappedBands?.()};
  try{
    if(swapped){window.__engine=e;(0,eval)(wrapper);}
    e._settlePlan.prepare=function(...args){const plan=prepare.apply(this,args);if(!plan)return plan;if(held)throw Error('Multiple diagnostic plans');plan.ops[0]?.();held={plan,next:1,total:plan.ops.length};return {...plan,ops:[()=>{}],finish:()=>{}}};e._displaySuspendDepth++;
    e.appendOperation(ops[1],'remote');await until(()=>!!held);
    if(held.next!==1)throw Error('Expected frozen first stitch, not progressed solver');
    if(swapped&&(!window.__swappedBandProbe||window.__swappedBandProbe.quads===0))throw Error('Swapped band guard did not execute');
    const freeze={at:performance.now(),next:held.next,total:held.total};
    const buffers=[],planes=[],tileIds=new Map(),old=gl.getParameter(gl.FRAMEBUFFER_BINDING);
    try{
      for(const scratch of new Set([e._wash?.scratch,...Array.from(e._replayRibbonChunks.values(),x=>x.scratch)].filter(Boolean)))for(const [tile,entry]of scratch.tileEntries())for(const key of ['inkLoad','inkColor','solventLoad','solventBase','strokeSolvent','coverage']){
        const b=entry[key];if(!b)continue;
        const raw=new Uint8Array(b.width*b.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(0,0,b.width,b.height,gl.RGBA,gl.UNSIGNED_BYTE,raw);
        const digest=await crypto.subtle.digest('SHA-256',raw);let sum=0;const channel=key==='inkLoad'?2:3;for(let i=channel;i<raw.length;i+=4)sum+=raw[i];
        if(!tileIds.has(tile))tileIds.set(tile,tileIds.size);const cv=document.createElement('canvas');cv.width=b.width;cv.height=b.height;const ctx=cv.getContext('2d'),pixels=new Uint8ClampedArray(raw.length);for(let i=0;i<raw.length;i+=4){const value=255-raw[i+channel];pixels.set([value,value,value,255],i)}ctx.putImageData(new ImageData(pixels,b.width,b.height),0,0);planes.push({tile:tileIds.get(tile),key,png:cv.toDataURL('image/png').split(',')[1]});
        buffers.push({tile:tileIds.get(tile),key,w:b.width,h:b.height,sum,sha:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')});
      }
    }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,old)}
    const descriptor=Object.getOwnPropertyDescriptor(performance,'now');try{Object.defineProperty(performance,'now',{configurable:true,value:()=>freeze.at});e._display();}finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
    captured=true;return {freeze,buffers,planes,probe:window.__swappedBandProbe??null,journal:structuredClone(e.getOperations()),gl:gl.getError(),lost:gl.isContextLost(),canvas:[e.canvas?.width,e.canvas?.height]};
  }finally{if(!captured)window.__restoreTriangleStage();}
})
