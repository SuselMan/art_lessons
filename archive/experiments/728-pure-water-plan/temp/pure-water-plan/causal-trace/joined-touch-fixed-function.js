async function joinedTouchFixed(arm) {
  const e = window.__engine
  if (!e || e._strokeLayerId || e._settle || e._wcCanonical.pending) throw Error('Actual Room must start idle')
  if (e._wcAsyncFinish || e._wcMaterialPresentation || !e._wcSourceFilmRebase || e._settlePlan.splitQuanta) throw Error('Required physical model flags')
  const ids = ['joined-fixed-first', 'joined-fixed-next']
  const starts = [[{x:220,y:300},{x:500,y:300},{x:720,y:320}], [{x:430,y:310},{x:650,y:330},{x:840,y:340}]]
  const originalPaint = e._paintStrokeDabs
  let gesture = 0, seeded = false, retainedScratch = null
  // Diagnostic fixture identity is fixed before first actual source deposit;
  // the native pointer path, commands, scalars and event timestamps stay intact.
  e._paintStrokeDabs = function (...args) {
    if (!seeded) { this._strokeId = ids[gesture]; seeded = true }
    return originalPaint.apply(this, args)
  }
  const sample = (p, n) => ({ ...p, pressure: .8, tiltX:0, tiltY:0, twist:0, speed:0, timeStamp:1000+n*16, pointerType:'pen' })
  const stages = []
  e._wcJoinedTouch = arm === 'ON'
  try {
    for (gesture = 0; gesture < 2; gesture++) {
      seeded = false
      const points = starts[gesture]
      const before = e._settle
      const t = performance.now()
      e._onStart(sample(points[0], gesture*10))
      const downMs = performance.now()-t
      if (!e._strokeLayerId) throw Error('Native input refused')
      retainedScratch = e._ribbonStrokeScratch
      if (gesture && arm === 'ON' && (!before || e._settle !== before || e._wcJoinedTouchLease !== before)) throw Error('Overlap admission not reached')
      if (gesture && arm === 'OFF' && e._settle) throw Error('Baseline did not drain')
      e._onMove(sample(points[1], gesture*10+1))
      e._onMove(sample(points[2], gesture*10+2))
      const upAt = performance.now()
      e._onEnd(sample(points[2], gesture*10+3))
      stages.push({gesture,downMs,upMs:performance.now()-upAt,beforeOps:before?.ops.length??0,beforeNext:before?.next??0,sourceCommands:e._ribbonStrokeScratch?.runningSourceCommands.length??0})
    }
    e._completeSettle()
    const scratch = retainedScratch
    if (!scratch) throw Error('Native scratch missing')
    const fields = []
    for (const [tile,entry] of scratch.tileEntries()) for (const key of ['original','coverage','inkLoad','inkColor','inkDry','colorDry','solventLoad','solventBase']) {
      const buffer = entry[key]
      if (!buffer) continue
      const rgba = buffer.readPixels()
      const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(x=>x.toString(16).padStart(2,'0')).join('')
      let nonzero=0;for(const value of rgba)nonzero+=value!==0
      fields.push({tileWidth:tile.width,tileHeight:tile.height,key,bytes:rgba.length,sha,nonzero})
    }
    for (let index=0;index<e._fieldCache.length;index++) for (const key of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band']) {
      const buffer=e._fieldCache[index][key],rgba=buffer.readPixels()
      const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(x=>x.toString(16).padStart(2,'0')).join('')
      let nonzero=0;for(const value of rgba)nonzero+=value!==0
      fields.push({field:index,key,bytes:rgba.length,sha,nonzero,scope:'solver cache, diagnostic channel role must be interpreted separately'})
    }
    if (!fields.some(x=>x.key==='inkLoad'&&x.nonzero)||!fields.some(x=>x.key==='coverage'&&x.nonzero)) throw Error('Meaningful P/coverage missing')
    const error=e.gl.getError();if(error||e.gl.isContextLost())throw Error('GL/loss '+error)
    return {arm,stages,fields,operations:e.getOperations(),error,scope:'Fixed native pointer input; CPU DOWN/UP times only; GPU readback outside input; no first-visible-pixel claim'}
  } finally {
    if (e._paintStrokeDabs !== originalPaint) e._paintStrokeDabs = originalPaint
    e._wcJoinedTouch = false
  }
}
