(() => {
  if (!window.__engine) throw Error('No real room engine')
  window.__wcRelease?.dispose()
  const E = window.__engine, pointerRelease = window.__engine.canvas.releasePointerCapture, original = new Map(), events = [], frames = []
  let running = true, raf, previous, phase = 'installed'
  const emit = (kind, data = {}) => { events.push({ kind, at: performance.now(), phase, ...data }); if (events.length > 2000) events.shift() }
  const wrap = (name, data) => {
    if (typeof E[name] !== 'function') return
    const fn = E[name]; original.set(name, fn)
    E[name] = function (...args) {
      const start = performance.now(); emit(name + ':enter', data(args))
      try { return fn.apply(this, args) }
      finally { emit(name + ':return', { ms: performance.now() - start }) }
    }
  }
  const opInfo = op => ({ id: op?.id, type: op?.type, seq: op?.seq, author: op?.userId, stroke: op?.strokeId })
  wrap('appendOperation', args => ({ ...opInfo(args[0]), source: args[1] ?? 'local', pendingBefore: !!E._settle, queuedBefore: E._opQueue.length }))
  wrap('confirmOperation', args => ({ id: args[0], seq: args[1] }))
  wrap('appendPeerLiveDabs', args => ({ author: args[0], stroke: args[1]?.strokeId, dabs: args[1]?.dabs?.length }))
  for (const name of ['undo', 'redo', 'restoreLayerFromSnapshot','_runSlice','_startSettle','_completeSettle']) wrap(name, args => ({ scratchLive:args[0]?.live, scratchTiles:args[0]?.tileEntries?[...args[0].tileEntries()].length:null, pendingBefore: !!E._settle, queue: E._opQueue.length, peerLive: E._peerLiveStrokes.size,waterOnly:E._ribbonPainter.waterOnlyDepth,segment:E._ribbonPainter.diagnosticDepth }))
  const queue=E._settleQueue, queueOriginal=new Map();for(const name of ['tick','advance','cancel']){const fn=queue[name];queueOriginal.set(name,fn);queue[name]=function(...args){const before=this._settle;emit('queue-'+name+':enter',{exists:!!before,scratchLive:before?.scratch.live,waterOnly:E._ribbonPainter.waterOnlyDepth,segment:E._ribbonPainter.diagnosticDepth});try{return fn.apply(this,args);}finally{emit('queue-'+name+':return',{sameJob:this._settle===before,exists:!!this._settle,waterOnly:E._ribbonPainter.waterOnlyDepth,segment:E._ribbonPainter.diagnosticDepth});}};}
  const nativeInputs=[],quantizationMapStats=[];const painter=E._ribbonPainter, originalPaint=painter.paint;
  painter.paint=function*(...args){let keyRemap=[];if(window.__wcQuantizeNative&&args[10]&&!args[12]?.waterOnly){const fields=['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t'];const round=d=>Object.fromEntries(Object.entries(d).map(([k,v])=>[k,fields.includes(k)?Math.fround(v):v]));const originals=args[1];args[1]=originals.map(round);keyRemap=args[1].map((clone,i)=>[clone,originals[i]]);if(args[7])args[7]=round(args[7]);}if(args[10]&&args[11]===0&&!args[12]?.waterOnly&&nativeInputs.length<2000)nativeInputs.push({phase,preset:args[3],dabs:args[1].map(d=>({...d}))});const context={preset:args[3],dabs:args[1].length,piece:args[11],foreign:args[6]?.foreignSources?.length};emit('painter-enter',{...context,waterOnly:this.waterOnlyDepth,segment:this.diagnosticDepth});const work=originalPaint.apply(this,args);try{for(;;){const r=work.next();if(this.waterOnlyDepth||r.done)emit('painter-yield',{...context,done:r.done,waterOnly:this.waterOnlyDepth,segment:this.diagnosticDepth});if(r.done){const proof={preset:args[3],n:keyRemap.length,retained:0,hits:0,misses:0,unexpected:0};for(const[clone,original]of keyRemap){if(args[6].standing.has(clone)){const water=args[6].standing.get(clone);args[6].standing.delete(clone);args[6].standing.set(original,water);proof.retained++;if(args[6].standing.get(original)===water)proof.hits++;else proof.unexpected++;}else proof.misses++;}if(keyRemap.length&&!args[12]?.segmented)quantizationMapStats.push(proof);return r.value;}yield r.value;}}catch(error){emit('painter-throw',{...context,error:String(error),waterOnly:this.waterOnlyDepth,segment:this.diagnosticDepth});throw error;}finally{emit('painter-return',{...context,waterOnly:this.waterOnlyDepth,segment:this.diagnosticDepth});work.return?.();}};
  const local = E._onLocalOperation
  E._onLocalOperation = function (op) { emit('local-emission', opInfo(op)); return local?.call(this, op) }
  function tick(now) {
    if (!running) return
    if (previous !== undefined) { frames.push({ phase, gap: now - previous }); if (frames.length > 12000) frames.shift() }
    previous = now; raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) emit('longtask', { ms: entry.duration }) })
  try { observer.observe({ type: 'longtask', buffered: false }) } catch {}
  const idle = () => !E._pointer._active && !E._peerLiveStrokes.size && !E._settle && !E._opQueue.length && !E._rebuildJobs.size && !E._pendingRebuilds.size
  const state = () => ({
    nativeFloat32:!!window.__wcQuantizeNative,painterCounters:{waterOnly:E._ribbonPainter.waterOnlyDepth,segment:E._ribbonPainter.diagnosticDepth},
    userId: window.__roomStore?.getState().userId, activeLayer: E._activeId, engineIsCurrent: E===window.__engine, destroyed: E._destroyed, previews:{keys:[...E._previews.tiles.keys()],area:[...E._previews.areaLayers]}, pageSize:E._pageSize, page: {width:E._opts.pageWidth,height:E._opts.pageHeight}, compositeOrder:E._compositeOrder, displayOrder:E._layerOrder, layerBuffers:[...E._layers].map(([id,b])=>({id,bounds:b.getContentBounds?.(),resident:b.allResident().map(t=>({x:t.originX,y:t.originY,w:t.buffer.width,h:t.buffer.height}))})), roomLayers:window.__roomStore?.getState().layers,
    log: E.getOperations().map(opInfo), entries: E._log.entries.map(entry => ({ ...opInfo(entry.op), state: entry.state, pending: !!entry.pending, serverSeq: entry.serverSeq })), peerLive: E._peerLiveStrokes.size, idle: idle(), lost: E.gl.isContextLost(), timeOrigin: performance.timeOrigin,
    peers: window.__roomStore?.getState().participants.map(p => p.id ?? p.userId), visibility: document.visibilityState,
    renderer: E.gpuInfo(), latency: window.__liveLatency?.stats() ?? null,
    flags: Object.fromEntries(['diagnosticSegmentDelivery','diagnosticSharedFluid','diagnosticSolventField','diagnosticForeignSolvent','diagnosticWaterPolicy','diagnosticPigmentFluidDose','diagnosticRecord','diagnosticLandingReservoir','diagnosticLandingPolicy','diagnosticReadFluid'].map(k => [k,E._ribbonPainter[k]])),
  })
  function bufferCensus(buf) {
    if(!buf)return null;
    const gl=E.gl, prev=gl.getParameter(gl.FRAMEBUFFER_BINDING), row=new Uint8Array(buf.width*4), sums=[0,0,0,0], maxima=[0,0,0,0];let nonzero=0;
    try{gl.bindFramebuffer(gl.FRAMEBUFFER,buf.fbo);for(let y=16;y<buf.height;y+=32){gl.readPixels(0,y,buf.width,1,gl.RGBA,gl.UNSIGNED_BYTE,row);for(let x=16;x<buf.width;x+=32){const i=x*4;if(row[i]||row[i+1]||row[i+2]||row[i+3])nonzero++;for(let k=0;k<4;k++){sums[k]+=row[i+k];maxima[k]=Math.max(maxima[k],row[i+k]);}}}}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,prev);}
    return {sampledNonzero:nonzero,sums,maxima};
  }
  function census(){return {layers:[...E._layers].map(([id,b])=>({id,tiles:b.allResident().map(t=>({x:t.originX,y:t.originY,data:bufferCensus(t.buffer)}))})),chunks:[...E._replayRibbonChunks].map(([id,c])=>({id,tiles:[...c.scratch.tileEntries()].map(([tile,v])=>({inkLoad:bufferCensus(v.inkLoad),inkDry:bufferCensus(v.inkDry),colorDry:bufferCensus(v.colorDry),solvent:bufferCensus(v.solventLoad),coverage:bufferCensus(v.coverage)}))}))};}
  const probe = {
    phase(label) { phase = label; window.__liveLatency?.reset(); emit('phase'); return state() },
    state,
    async waitIdle(timeout = 90000) {
      const started = performance.now(); let stable = 0
      while (stable < 3) {
        if (E.gl.isContextLost()) throw Error('Context lost')
        if (performance.now() - started > timeout) throw Error('Engine idle timeout')
        stable = idle() ? stable + 1 : 0
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
      return state()
    },
    async canonical() {
      await probe.waitIdle()
      // Public export in the accepted source excludes the presentation reveal.
      const blob = await E.exportPNG(false), bytes = new Uint8Array(await blob.arrayBuffer())
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      let data = ''; for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i,i+8192))
      return { ...state(), census:census(), png: btoa(data), pngSha256: Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''), gl: E.gl.getError() }
    },
    report() {
      const byPhase = {}
      for (const sample of frames) (byPhase[sample.phase] ??= []).push(sample.gap)
      const frameStats = Object.fromEntries(Object.entries(byPhase).map(([label,values]) => {
        const sorted = [...values].sort((a,b)=>a-b)
        return [label,{ n: values.length, p95: sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)], max: Math.max(...values), over33: values.filter(v=>v>33).length, over100: values.filter(v=>v>100).length }]
      }))
      return { ...state(), events, frameStats,nativeInputs,quantizationMapStats,operations:JSON.parse(JSON.stringify(E.getOperations().filter(o=>o.type==='stroke').map(({id,preset,color,layerId,strokeId,washId,dabs,dabsPacked,wet,timestamp,seq,userId})=>({id,preset,color,layerId,strokeId,washId,dabs,dabsPacked,wet,timestamp,seq,userId})))) }
    },
    dispose() { running = false; cancelAnimationFrame(raf); observer.disconnect(); for (const [name,fn] of original) E[name] = fn; E._onLocalOperation = local; painter.paint=originalPaint;for(const[name,fn]of queueOriginal)queue[name]=fn; E.canvas.releasePointerCapture = pointerRelease; delete window.__wcRelease },
  }
  window.__wcRelease = probe
  return JSON.stringify(state())
})()
