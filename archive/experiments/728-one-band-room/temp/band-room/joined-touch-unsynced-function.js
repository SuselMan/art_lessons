async function joinedTouchFixed(arm) {
  const e = window.__engine
  if (!e || e._strokeLayerId || e._settle || e._wcCanonical.pending) throw Error('Actual Room must start idle')
  if (e._wcAsyncFinish || e._wcMaterialPresentation || !e._wcSourceFilmRebase || e._settlePlan.splitQuanta) throw Error('Required physical model flags')
  const ids = ['joined-fixed-first', 'joined-fixed-next']
  const starts = [[{x:220,y:300},{x:500,y:300},{x:720,y:320}], [{x:430,y:610},{x:650,y:630},{x:840,y:640}]]
  const originalPaint = e._paintStrokeDabs
  let gesture = 0, seeded = false
  // Diagnostic fixture identity is fixed before first actual source deposit;
  // the native pointer path, commands, scalars and event timestamps stay intact.
  e._paintStrokeDabs = function (...args) {
    if (!seeded) { this._strokeId = ids[gesture]; seeded = true }
    return originalPaint.apply(this, args)
  }
  const sample = (p, n) => ({ ...p, pressure: .8, tiltX:0, tiltY:0, twist:0, speed:0, timeStamp:1000+n*16, pointerType:'pen' })
  const gl=e.gl, canvas=e.canvas;const samplePixel=point=>{const pose=e._camera.pose;if(pose.angle!==0)throw Error('ROI angle guard');const px=Math.floor(canvas.width/2+(point.x-pose.wx)*pose.zoom),py=Math.floor(canvas.height/2-(point.y-pose.wy)*pose.zoom);if(px<2||py<2||px+3>canvas.width||py+3>canvas.height)throw Error('ROI viewport bounds');const prior=gl.getParameter(gl.FRAMEBUFFER_BINDING),bytes=new Uint8Array(100),at=performance.now();try{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(px-2,py-2,5,5,gl.RGBA,gl.UNSIGNED_BYTE,bytes)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,prior)}return{at:performance.now(),wait:performance.now()-at,bytes:[...bytes],point,px,py}};
  const idlePixels=starts.map(points=>samplePixel(points[0]));
  const stages = []
  e._wcJoinedTouch = arm === 'ON'
  try {
    for (gesture = 0; gesture < 2; gesture++) {
      seeded = false
      const points = starts[gesture]
      const before = e._settle;const beforeOps=before?.ops.length??0,beforeNext=before?.next??0
      const pixelBefore=idlePixels[gesture];const t = performance.now()
      e._onStart(sample(points[0], gesture*10))
      const downMs = performance.now()-t;const pixelAfter=samplePixel(points[0]);let changed=0,purple=0;for(let i=0;i<100;i+=4){changed+=Math.max(...[0,1,2].map(j=>Math.abs(pixelAfter.bytes[i+j]-pixelBefore.bytes[i+j])))>1;purple+=pixelAfter.bytes[i+2]-pixelAfter.bytes[i]>8&&pixelAfter.bytes[i+2]-pixelAfter.bytes[i+1]>8}
      if (!e._strokeLayerId) throw Error('Native input refused')
      if (gesture && arm === 'ON' && (!before || e._settle !== before || e._wcJoinedTouchLease !== before)) throw Error('Overlap admission not reached')
      if (gesture && arm === 'OFF' && e._settle) throw Error('Baseline did not drain')
      e._onMove(sample(points[1], gesture*10+1))
      e._onMove(sample(points[2], gesture*10+2))
      const upAt = performance.now()
      e._onEnd(sample(points[2], gesture*10+3))
      stages.push({gesture,noBaselineReadBeforeHot:true,downMs,pixelBefore,pixelAfter,changed,purple,firstPigmentUpperBound:pixelAfter.at-t,upMs:performance.now()-upAt,beforeOps,beforeNext,sourceCommands:e._ribbonStrokeScratch?.runningSourceCommands.length??0})
    }
    window.__joinedStages=structuredClone(stages);
    e._completeSettle()
    const scratch = e._wash?.scratch
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
    window.__joinedCapture={stages,fields,operations:e.getOperations()};
    if (!fields.some(x=>x.key==='inkColor'&&x.nonzero)||!fields.some(x=>x.key==='solventLoad'&&x.nonzero))throw Error('Meaningful C/V missing');
    if (!fields.some(x=>x.key==='inkLoad'&&x.nonzero)||!fields.some(x=>x.key==='coverage'&&x.nonzero)) throw Error('Meaningful P/coverage missing')
    const error=e.gl.getError();if(error||e.gl.isContextLost())throw Error('GL/loss '+error)
    return {arm,stages,fields,operations:e.getOperations(),error,joinedLease:e._wcJoinedTouchLease!==null,scope:'Fixed native two gesture input, second deposit center outside predecessor pigment core; baseline ROI saved beforefirstDown, no readbeforehotDown; GPUreadyupperboundnotbrowserpresent'}
  } finally {
    if (e._paintStrokeDabs !== originalPaint) e._paintStrokeDabs = originalPaint
    e._wcJoinedTouch = false
  }
}
