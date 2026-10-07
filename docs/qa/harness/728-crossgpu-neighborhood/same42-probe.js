(async function(input) {
  const {PencilEngine}=await import(input.moduleURL);
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=900;document.body.append(canvas);
  const out={revision:input.revision,policy:input.policy,events:[],errors:[],scope:'fresh packed full curated42; reference image explicitly excluded; no Room/snapshot/native/ACK/performance claim'};
  let e,neighborhood;
  const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const busy=()=>!!(e._settle||e._opQueue?.length||e._rebuildJobs?.size||e._pendingRebuilds?.size||e._wcCanonical?.pending);
  const event=(phase,details={})=>{window.__regressionProgress={phase,revision:input.revision,policy:input.policy,at:performance.now(),...details};out.events.push(window.__regressionProgress)};
  const idle=async()=>{const end=performance.now()+input.operationTimeout;while(busy()){if(performance.now()>end)throw Error('operation idle deadline '+JSON.stringify(window.__regressionProgress));await raf()}};
  const bytes64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
  const encode=async blob=>{if(!blob)throw Error('empty export blob');return bytes64(new Uint8Array(await blob.arrayBuffer()))};
  try {
    event('construct');e=new PencilEngine(canvas,{pageWidth:3508,pageHeight:2480,paper:'medium',gradientFibres:input.gradientFibres});
    window.__regressionEngine=e;e.setBaseLayers(['layer-1']);e.setActiveLayer('layer-1');e.setCompositeOrder([{id:'layer-1',opacity:1}]);
    await e.paperReady();e.setLocked(false);
    const p=e._ribbonPainter;
    const flagKeys=['diagnosticSegmentDelivery','diagnosticPigmentRecord','diagnosticSharedFluid','diagnosticLandingReservoir','diagnosticSolventField','diagnosticCanonicalSettleRadius','diagnosticLandingPolicy','diagnosticWaterPolicy','diagnosticForeignSolvent'];
    out.initialFlags=Object.fromEntries(flagKeys.map(k=>[k,p?.[k]??null]));
    if(input.policy==='REVIEW'){
      if(!p)throw Error('review painter unavailable');
      Object.assign(p,{diagnosticSegmentDelivery:'combined',diagnosticPigmentRecord:true,diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticSolventField:true,diagnosticCanonicalSettleRadius:true,diagnosticLandingPolicy:'fluid',diagnosticWaterPolicy:'bottomless',diagnosticForeignSolvent:true});
    }
    if(!!e._wcGradientFibres!==input.gradientFibres||!!e._watercolorPasses._gradientField?.program!==input.gradientFibres)throw Error("typed warm boot mismatch");
    const installer=new Function('return '+input.installer)();
    const {getPaperBytes}=await import(input.paperLoaderURL);const paperBytes=await getPaperBytes('medium');
    if(paperBytes.length!==2048*2048*2)throw Error('actual LA paper shape');
    out.paperBytesSHA=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',paperBytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    neighborhood=installer(e,{paperBytes});
    out.baked=e._wcGradientFibres;
    out.bakedCalls=0;
    const originalFieldOp=e._watercolorPasses.fieldOp.bind(e._watercolorPasses);
    e._watercolorPasses.fieldOp=(...args)=>{const opts=args[5];if(args[3]===1&&opts?.gradientFibres&&opts.world?.[2])out.bakedCalls++;return originalFieldOp(...args)};
    out.flags=Object.fromEntries(flagKeys.map(k=>[k,p?.[k]??null]));
    out.model={page:e._pageSize?.()??null,paper:e._paper?._type??null,canvas:[canvas.width,canvas.height],ab:e._wcAb?{...e._wcAb}:null,phase:e._settlePlan?.diagnosticPlateauPhase??false,ADD:e._settlePlan?.diagnosticAdditiveZeroFaces??false};
    if(out.model.phase||out.model.ADD)throw Error('diagnostic physics enabled');
    function captureMaterial(){out.material=[];
    const roi={minX:910,minY:455,maxX:1264,maxY:721};
    for(const [key,chunk]of e._replayRibbonChunks??[]){
      for(const t of chunk.target.allResident()){
        const entry=chunk.scratch.peek?chunk.scratch.peek(t.buffer):chunk.scratch._tiles.get(t.buffer);
        if(!entry)continue;
        const x=Math.max(roi.minX,t.originX),y=Math.max(roi.minY,t.originY),right=Math.min(roi.maxX,t.originX+t.buffer.width),bottom=Math.min(roi.maxY,t.originY+t.buffer.height);
        if(right<=x||bottom<=y)continue;
        for(const name of ['inkLoad','inkColor','inkDry','colorDry','coverage','solventLoad']){
          const b=entry[name];if(!b)continue;const w=right-x,h=bottom-y,bytes=new Uint8Array(w*h*4),gl=e.gl;
          const px=x-t.originX,py=b.height-(bottom-t.originY);
          if(px<0||py<0||px+w>b.width||py+h>b.height)throw Error('material ROI outside');
          gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(px,py,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
          const sum=[0,0,0,0];let nonzero=0;for(let i=0;i<bytes.length;i+=4){for(let c=0;c<4;c++)sum[c]+=bytes[i+c];if(bytes[i+3])nonzero++}
          out.material.push({key,name,origin:[t.originX,t.originY],read:[px,py,w,h],sum,nonzero});
        }
      }
    }
    }
    out.worstMaterial=[];
    function captureWorst(label){const gl=e.gl,previous=gl.getParameter(gl.FRAMEBUFFER_BINDING);try{for(const [key,chunk]of e._replayRibbonChunks??[]){for(const t of chunk.target.allResident()){
      const cx=994-t.originX,cy=1231-t.originY;if(cx<0||cy<0||cx>=t.buffer.width||cy>=t.buffer.height)continue;
      const entry=chunk.scratch.peek?chunk.scratch.peek(t.buffer):chunk.scratch._tiles.get(t.buffer);const fields={compositeTile:t.buffer};if(entry)for(const name of ['inkLoad','inkColor','inkDry','colorDry','coverage','solventLoad'])fields[name]=entry[name];
      for(const[name,b]of Object.entries(fields)){if(!b?.fbo)continue;const x=Math.max(0,cx-2),top=Math.max(0,cy-2),w=Math.min(b.width-x,cx+3-x),h=Math.min(b.height-top,cy+3-top),y=b.height-(top+h);if(w<=0||h<=0||x+w>b.width||y<0)throw Error('worst tile map');const bytes=new Uint8Array(w*h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);out.worstMaterial.push({label,key,name,origin:[t.originX,t.originY],read:[x,y,w,h],bytes:Array.from(bytes)})}
    }}}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous)}}
    event('paper-ready',{flags:out.flags});
    for(let i=0;i<input.ops.length;i++){
      const op=input.ops[i];event('append',{i,id:op.id,type:op.type,originalSeq:op.seq});
      neighborhood.begin(op);e.appendOperation(structuredClone(op),'remote');await idle();if(['Gq9CPrzxWh','ytlRBmw3Tg'].includes(op.id))captureWorst('post-'+op.id);neighborhood.end();if(op.id==='GEiXT33N5K'){captureMaterial();out.materialAt={id:op.id,seq:op.seq,at:performance.now()};}
    }
    await idle();const strokeLayers=[...new Set(input.ops.filter(o=>o.type==='stroke').map(o=>o.layerId))];e.setCompositeOrder(strokeLayers.filter(id=>e._layers.has(id)).map(id=>({id,opacity:1})));out.compositeLayers=strokeLayers;event('pre-dry');
    out.preDryPNG=await encode(await e.exportPNG(false));
    // Exactly the historical gallery's explicit dry API, never a forged wet/pixel op.
    event('dry-all');e.watercolorDryAll();await idle();
    for(let i=0;i<2;i++)await raf();
    captureWorst('post-final-Dry');out.journal=(e._log?.entries??[]).map(x=>({id:x.op.id,type:x.op.type,state:x.state}));
    event('export');out.finalPNG=await encode(await e.exportPNG(false));out.transparentPNG=await encode(await e.exportPNG(true));
    const gl=e.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');out.gpu={gl:gl.getError(),lost:gl.isContextLost(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
    out.neighborhood={summary:neighborhood.summary(),rows:neighborhood.rows};out.completed=true;event('done');
  } catch(error){out.error=String(error);out.pending=e?{settle:e._settle?.next,length:e._settle?.ops?.length,queue:e._opQueue?.length,rebuild:e._rebuildJobs?.size,pendingRebuild:e._pendingRebuilds?.size}:null}
  finally {if(neighborhood){out.neighborhood??={summary:neighborhood.summary(),rows:neighborhood.rows};neighborhood.dispose();}if(e)e.destroy();canvas.remove();delete window.__regressionEngine;out.engineClosed=true;}
  return out;
})
