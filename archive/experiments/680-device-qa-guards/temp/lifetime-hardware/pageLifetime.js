window.__actualS2Lifetime = async function(mode) {
  const [{RibbonStrokeScratch},{ribbonProfileFor},{presetForTool}] = await Promise.all([
    import('/src/engine/src/buffers/RibbonStrokeScratch.ts'),
    import('/src/engine/src/dabs/ribbonProfile.ts'),
    import('/src/engine/src/presets/resolvePreset.ts')
  ])
  const e=window.__engine, gl=e.gl, pool=e._ribbonScratchPool
  if(e._settle || e._opQueue.length) throw Error('Fresh idle engine required')
  const target=[...e._layers.values()][0]; if(!target)throw Error('Layer required')
  const created={textures:[],fbos:[]},deleted={textures:[],fbos:[]},restores=[]
  for(const [name,list] of [['createTexture',created.textures],['createFramebuffer',created.fbos],['deleteTexture',deleted.textures],['deleteFramebuffer',deleted.fbos]]) {
    const original=gl[name];gl[name]=function(...args){const value=original.apply(this,args);list.push(name.startsWith('create')?value:args[0]);return value};restores.push(()=>gl[name]=original)
  }
  const tile=pool.acquire(2048,2048), scratch=new RibbonStrokeScratch(pool,true,true)
  scratch.getOrCreate(tile);scratch.diffusePending=true
  const originalResolve=e._resolveWithinSheet;e._resolveWithinSheet=()=>[{buffer:tile,originX:0,originY:0,contentRect:null}]
  const acquired=[],released=[],originalAcquire=pool.acquire,originalRelease=pool.release
  pool.acquire=function(...args){const b=originalAcquire.apply(this,args);acquired.push(b);return b}
  pool.release=function(b){released.push(b);return originalRelease.call(this,b)}
  let inputs=[]
  try {
    scratch.noteFinish({target,preset:presetForTool('watercolor','normal:100:100:PB29:round'),profile:ribbonProfileFor('watercolor','normal:100:100:PB29:round'),color:[.3,.2,.7],opacity:1,bounds:{minX:100,minY:100,maxX:1500,maxY:1500},fieldSeed:[0,0],landedWet:0,wetPeak:0,radiusPx:80,dwellMs:0})
    e._finishRibbonStroke(scratch,false,false,true)
    const resident=new Set(Object.values(scratch.peek(tile)));inputs=[...new Set(acquired)].filter(b=>!resident.has(b)&&!released.includes(b))
    if(inputs.length<3||!e._settle)throw Error('Actual S2 captured inputs/job absent')
    const handles=inputs.map(b=>({texture:b.texture,fbo:b.fbo})),beforeRelease=released.length,beforeDelete=deleted.textures.length
    if(mode==='loss') {
      const ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('Actual loss extension absent')
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('loss event timeout')),5000);e.canvas.addEventListener('webglcontextlost',()=>{clearTimeout(timer);setTimeout(resolve,0)},{once:true});ext.loseContext()})
      if(!gl.isContextLost()||e._settle)throw Error('Loss/cancel not observed')
      if(released.slice(beforeRelease).some(b=>inputs.includes(b))||deleted.textures.length!==beforeDelete)throw Error('Dead-name cleanup returned/deleted handles')
      scratch.forget();pool.forget()
      return {mode,inputCount:inputs.length,lost:true,deadInputReturns:0,deadDeletes:0,ownerCount:e._settlePlan._ownedInputs.size}
    }
    if(mode==='cancel'){e._cancelSettle();e._cancelSettle();for(const b of inputs)if(released.filter(x=>x===b).length!==1)throw Error('Input release not exactly once')}
    e.destroy()
    for(const h of handles)if(deleted.textures.filter(t=>t===h.texture).length!==1||deleted.fbos.filter(f=>f===h.fbo).length!==1)throw Error('Captured input GL handle not deleted exactly once')
    scratch.destroy();tile.destroy();pool.destroy()
    return {mode,inputCount:inputs.length,createdTextures:created.textures.length,deletedTextures:deleted.textures.length,inputsDeletedExactlyOnce:true,ownerCount:e._settlePlan._ownedInputs.size,gl:gl.getError()}
  } finally {e._resolveWithinSheet=originalResolve;pool.acquire=originalAcquire;pool.release=originalRelease;for(const restore of restores.reverse())restore()}
}
