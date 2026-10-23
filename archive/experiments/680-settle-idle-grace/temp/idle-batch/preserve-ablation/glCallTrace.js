window.__installGlCallTrace = function(gl, context, emit) {
  const names=['drawArrays','drawElements','texImage2D','createFramebuffer','checkFramebufferStatus','copyTexSubImage2D','readPixels','finish','flush'];
  const originals=new Map(), errors=[], aggregates={}, top=[], details={thresholdMs:1,capacity:30,stackCaptures:0,metadataWallMs:0,calls:0};
  for(const name of names){
    if(typeof gl[name]!=='function')continue;
    const original=gl[name];originals.set(name,original);
    gl[name]=function(...args){
      const started=performance.now();
      try {return original.apply(this,args)}
      finally {
        const finished=performance.now(),ms=finished-started,metaStarted=finished;
        try {const c=context(),key=c.phase+':'+name;
        const a=aggregates[key]??={phase:c.phase,name,n:0,sumMs:0,maxMs:0,over1:0};
        a.n++;a.sumMs+=ms;a.maxMs=Math.max(a.maxMs,ms);a.over1+=ms>1;details.calls++;
        if(ms>details.thresholdMs&&(top.length<details.capacity||ms>top[top.length-1].ms)){
          const record={at:started,ms,name,...c,stack:new Error('ExistingGLcall '+name).stack};details.stackCaptures++;
          top.push(record);top.sort((x,y)=>y.ms-x.ms);if(top.length>details.capacity)top.pop();
          emit?.({kind:'gl-slow-call',...record});
        }
        }catch(error){if(errors.length<10)errors.push(String(error))}
        finally{details.metadataWallMs+=performance.now()-metaStarted}
      }
    };
  }
  return {report:()=>({details,aggregates,top,errors}),restore(){for(const [name,original]of originals)gl[name]=original},
    limitation:'Only existing calls are forwarded once. No added GL calls/barriers. JS API wall includes driver waits, not pure GPU duration. Two clocks/allocation accounting and capped stack capture add observer overhead.'};
};
