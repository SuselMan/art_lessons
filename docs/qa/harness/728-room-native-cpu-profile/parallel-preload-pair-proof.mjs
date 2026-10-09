const critical=['apps/web/src/engine/index.ts','apps/web/src/engine/src/webgpuCanonical/roomNativeRuntime.ts','apps/web/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts','apps/web/src/engine/src/webgpuCanonical/backend.ts']
export function assertParallelPreloadPair(reference,off,on){
 const all=[reference,off,on]
 for(const r of all){
  if(!r.complete||r.error||r.errors?.length||!r.ownedContextDisposed||r.final?.gl||r.final?.lost||r.final?.error||!r.export?.alpha)throw Error('Incomplete or dirty owned endpoint')
  if(r.source!==reference.source||r.browserPaper?.sha256!==reference.browserPaper?.sha256)throw Error('Source or decoded paper differs')
  if(r.browserSource?.length!==4||new Set(r.browserSource.map(f=>f.path)).size!==4||critical.some(p=>!/^([a-f0-9]{64})$/.test(r.browserSource.find(f=>f.path===p)?.sha256??'')||r.browserSource.find(f=>f.path===p)?.sha256!==reference.browserSource.find(f=>f.path===p)?.sha256))throw Error('Critical browser source differs')
  if(r.export.sha!==reference.export.sha||r.export.width!==reference.export.width||r.export.height!==reference.export.height||r.export.alpha!==reference.export.alpha)throw Error('Decoded material differs')
 }
 if(reference.packedTape?.length!==4||!reference.actualObserved||!reference.actualAsyncPressure)throw Error('New exact compiled four-stroke reference required')
 for(const r of [off,on]){
  const mapped=r.replay?.mapped
  if(mapped?.length!==4||new Set(mapped.map(o=>o.layerId)).size!==1||JSON.stringify(mapped)!==JSON.stringify(reference.packedTape.map(o=>({...o,layerId:mapped[0].layerId}))))throw Error('Replay changes beyond explicit logical-layer mapping')
  if(!r.endpointExact||!r.readbackOutsideReplayTiming||!(r.startup?.wallMs>=0)||!(r.replayWallMs>=0))throw Error('Endpoint/startup/replay timing scopes absent')
 }
 if(off.scheduler?.actualPreload!==false||on.scheduler?.actualPreload!==true||off.actualPreparation||!on.actualPreparation?.consumed)throw Error('Actual preload OFF/ON gate differs')
 const prepared=on.actualPreparation
 if(prepared.observed?.shaderSHAs?.length!==2||prepared.observed.shaderSHAs.some((sha,i)=>sha!==reference.actualObserved.ready.shaderSHAs[i])||prepared.pressure?.shaderSHA!==reference.actualAsyncPressure.compile.shaderSHA)throw Error('Exact compiled shader identities differ')
 if(prepared.consumed.observed?.length!==2||prepared.consumed.observed.some(x=>!x.completed||x.hits!==1)||prepared.consumed.pressure?.hits!==1)throw Error('Actual cached pipeline objects not consumed once')
 return{source:reference.source,endpoint:reference.export,rows:[off,on].map(r=>({preload:r.scheduler.actualPreload,startupWallMs:r.startup.wallMs,replayWallMs:r.replayWallMs,materialSHA:r.export.sha,ownedContextDisposed:r.ownedContextDisposed})),scope:'Single ordered same-packed OFF/ON native endpoint pair; decoded exported RGBA only, not all GPU fields, physical input latency, or statistically robust performance',limitations:['Reference plus two fresh owned contexts, same source/paper/input; timing excludes export readbacks','Startup includes browser/network/controller readiness, not shader or GPU duration','Cold/warm driver cache and fixed arm order confound performance; no causal speedup claim']}
}
