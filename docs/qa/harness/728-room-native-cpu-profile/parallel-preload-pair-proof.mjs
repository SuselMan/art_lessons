import {assertSourceABrowserPassport} from './source-A-browser-passport.mjs'
const critical=['apps/web/src/engine/index.ts','apps/web/src/engine/src/webgpuCanonical/roomNativeRuntime.ts','apps/web/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts','apps/web/src/engine/src/webgpuCanonical/backend.ts']
export function assertParallelPreloadPair(reference,off,on){
 const all=[reference,off,on]
 for(const r of all){
  if(!r.complete||r.error||r.memoryError||r.memoryGuardFailure||r.errors?.length||!r.ownedContextDisposed||r.final?.gl||r.final?.lost||r.final?.error||!r.export?.alpha)throw Error('Incomplete or dirty owned endpoint')
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

export function assertSourcePrecompilePair(reference,off,on){
 const all=[reference,off,on],tape=reference.packedTape
 const required=['stamp:false:false:coverage','ribbon:coverage','canonicalCompositeRecipe','canonicalRawCanvasRecipe','pairedBrush','singleBrush']
 if(reference.scenario!=='water-pigment400-long'||tape?.length!==2||!reference.sourcePreparation?.ready||!/^[a-f0-9]{40}$/.test(reference.source??''))throw Error('Exact source A long reference required')
 if(tape[0].tool!=='watercolor'||tape[1].tool!=='watercolor'||tape[0].preset!=='normal:100:0:PB29:round'||tape[1].preset!=='normal:100:100:PB29:round'||JSON.stringify(tape[0].color)!==JSON.stringify([.2,0,.6])||JSON.stringify(tape[1].color)!==JSON.stringify([.2,0,.6]))throw Error('Fixed water/pigment source roles differ')
 const passport=reference.sourcePipelinePassport
 if(passport?.length!==15||new Set(passport.map(x=>x.key)).size!==15||passport.some(x=>! /^[a-f0-9]{64}$/.test(x.shaderSHA)||! /^[a-f0-9]{64}$/.test(x.descriptorSHA))||JSON.stringify(reference.sourceRequiredKeys)!==JSON.stringify(required))throw Error('Exact A recipe passport/subset required')
 for(const r of all){
  if(!r.complete||r.error||r.memoryError||r.memoryGuardFailure||r.errors?.length||!r.ownedContextDisposed||r.final?.gl!==0||r.final?.lost!==false||r.final?.error||!r.export?.alpha)throw Error('Incomplete A endpoint')
  if(r.source!==reference.source||r.browserPaper?.sha256!==reference.browserPaper?.sha256)throw Error('A source/paper differs');assertSourceABrowserPassport(r.browserFactorySource,reference.browserFactorySource);if(!(r.export.purple>0)||r.export.purple!==reference.export.purple)throw Error('Meaningful purple A endpoint absent/different')
  if(r.browserSource?.length!==4||new Set(r.browserSource.map(f=>f.path)).size!==4||critical.some(p=>! /^[a-f0-9]{64}$/.test(r.browserSource.find(f=>f.path===p)?.sha256??'')||r.browserSource.find(f=>f.path===p)?.sha256!==reference.browserSource.find(f=>f.path===p)?.sha256))throw Error('A browser source differs')
  if(r.export.sha!==reference.export.sha||r.export.width!==reference.export.width||r.export.height!==reference.export.height||r.export.alpha!==reference.export.alpha)throw Error('A decoded material differs')
 }
 for(const r of [off,on]){
  const mapped=r.replay?.mapped,p=r.actualPreparation
  if(mapped?.length!==2||new Set(mapped.map(o=>o.layerId)).size!==1||JSON.stringify(mapped)!==JSON.stringify(tape.map(o=>({...o,layerId:mapped[0].layerId}))))throw Error('A packed inputs differ')
  if(!r.endpointExact||!r.readbackOutsideReplayTiming||!(r.startup?.wallMs>=0)||!(r.replayWallMs>=0)||r.scheduler?.actualPreload!==true||r.scheduler?.fullWarm!==false||r.scheduler?.rawWarm!==false||r.scheduler?.inflightLimit!==0||r.scheduler?.asyncPressure!==false)throw Error('A fixed mode/warm differs')
  if(JSON.stringify(r.sourcePipelinePassport)!==JSON.stringify(passport)||JSON.stringify(r.sourceRequiredKeys)!==JSON.stringify(required))throw Error('A selected passport differs')
  if(p?.observed?.shaderSHAs?.length!==2||p.observed.shaderSHAs.some((sha,i)=>sha!==reference.actualObserved?.ready?.shaderSHAs?.[i])||p.pressure?.shaderSHA!==reference.actualAsyncPressure?.compile?.shaderSHA||p.consumed?.observed?.length!==2||p.consumed.observed.some(x=>!x.completed||x.hits!==1)||p.consumed.pressure?.hits!==1)throw Error('Existing3 exact identity/HIT differs')
 }
 if(off.scheduler.sourcePrecompile!==false||off.sourcePreparation||on.scheduler.sourcePrecompile!==true||!on.sourcePreparation?.ready)throw Error('A OFF/ON differs')
 const ready=on.sourcePreparation.ready
 if(ready.dispatches!==0||ready.fieldBytes!==0||JSON.stringify(ready.resourceBefore)!==JSON.stringify(ready.resourceAfter)||!Array.isArray(ready.resourceBefore)||ready.proofs?.length!==15||passport.some(e=>ready.proofs.filter(x=>x.key===e.key&&x.kind===e.kind&&x.shaderSHA===e.shaderSHA&&x.descriptorSHA===e.descriptorSHA&&x.completed).length!==1))throw Error('A exact prepared proof differs')
 const consumed=on.sourcePreparation.consumed
 if(consumed?.length!==required.length||required.some(k=>consumed.filter(x=>x.key===k&&x.completed&&x.hits>=1).length!==1))throw Error('A selected HIT absent')
 return{source:reference.source,endpoint:reference.export,rows:[off,on].map(r=>({sourcePrecompile:r.scheduler.sourcePrecompile,startupWallMs:r.startup.wallMs,replayWallMs:r.replayWallMs,seedBridgeCosts:r.seedBridgeCosts??[]})),scope:'Same-packed source A decoded endpoint equality; fixed cache order, no causal speedup claim'}
}
