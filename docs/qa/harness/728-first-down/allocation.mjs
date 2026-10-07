/** QA passive submission trace. No added GL query/readback/wait; JS spans are not GPU duration. */
export function installFirstDownAllocation(engine, {cap=2048, now=()=>performance.now()}={}) {
  const rows=[], restore=[], stack=[], wrappedScratch=new WeakSet();
  let active=false, start=null, dropped=0, framebuffer='unknown', textures=0, rgba8Bytes=0;
  const record=(name,extra={})=>{if(!active)return;if(rows.length===cap){dropped++;return}rows.push({name,at:now()-start,path:[...stack],...extra})};
  const wrap=(object,key,before,after)=>{
    if(!object||typeof object[key]!=='function')return;
    const original=object[key];const replacement=function(...args){
      if(key==='_onStart'&&!active&&start===null){active=true;start=now()}
      if(!active)return original.apply(this,args);
      before?.(args);record(key+'-enter',key==='_onStart'?{sampleTimestamp:args[0]?.timeStamp}:{});stack.push(key);
      try{const result=original.apply(this,args);after?.(args,result);record(key+'-exit');return result}
      catch(error){record(key+'-throw',{error:String(error)});throw error}
      finally{stack.pop()}
    };object[key]=replacement;restore.push(()=>{if(object[key]===replacement)object[key]=original});
  };
  const scratch=s=>{if(!s||wrappedScratch.has(s))return;wrappedScratch.add(s);for(const key of ['getOrCreate','filmBuffers','solventFilm','runningCoverage'])wrap(s,key)};
  for(const key of ['_onStart','_paintStrokeDabs','_paintDabs','_display','_flushLiveComposite','_composeToFBO','_composePaperToScreen','_checkpointBeforeWash','_completeSettle'])wrap(engine,key);
  wrap(engine,'_paintRibbonDabs',args=>scratch(args[5]));
  wrap(engine._ribbonScratchPool,'acquire',args=>record('pool-request',{size:args.slice(0,2)}));
  const ctx=engine._ribbonPainter?.ctx;
  for(const key of ['drawRibbonBands','drawRibbonNibPass','drawRibbonCompositeRect','fieldOp'])wrap(ctx,key,args=>record('ribbon-command',{kind:key,mode:key==='drawRibbonBands'?args[3]:key==='fieldOp'?args[3]:undefined}));
  const gl=engine.gl;
  wrap(gl,'createTexture',null,()=>{textures++;record('texture-created')});
  wrap(gl,'texImage2D',args=>{const [target,level,internal,w,h,border,format,type]=args;
    if(args.length===9&&format===gl.RGBA&&type===gl.UNSIGNED_BYTE){const bytes=w*h*4;rgba8Bytes+=bytes;record('rgba8-storage',{size:[w,h],bytes,target,level,internal,border})}
    else record('texture-storage-other',{argCount:args.length});
  });
  wrap(gl,'bindFramebuffer',args=>{framebuffer=args[1]===null?'screen':'offscreen'});
  for(const key of ['createFramebuffer','checkFramebufferStatus','createProgram','compileShader','linkProgram','getProgramParameter','getShaderParameter'])wrap(gl,key);
  for(const key of ['drawArrays','drawElements'])wrap(gl,key,args=>record('draw-submitted',{framebuffer,mode:args[0],count:key==='drawArrays'?args[2]:args[1]}));
  return {rows,stop(){active=false},summary(){return{rows:rows.length,dropped,textures,rgba8Bytes,scope:'submission/CPU clocks only; offscreen draw is not pigment proof, screen draw is not visible-present timestamp'}},dispose(){active=false;for(const undo of restore.reverse())undo()}};
}
