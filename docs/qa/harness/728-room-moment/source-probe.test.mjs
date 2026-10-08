import test from 'node:test'
import assert from 'node:assert/strict'
import {installMomentStageProbe} from './stage-probe.mjs'

test('OFF source copies actual P/C after emit, survives until successful publication, restores hooks',async()=>{
 const events=[],buffers=[]
 class Seam {encodeAfterLanding(){throw Error('OFF must not execute moment seam')}}
 class Executor {
  emitPrepared(){events.push('emit')}
  async publishCurrentToGl(){events.push('publish')}
 }
 globalThis.window={};globalThis.GPUMapMode={READ:1};globalThis.GPUBufferUsage={COPY_DST:1,MAP_READ:2}
 const source=installMomentStageProbe.toString().replace("await import('/src/engine/src/experiments/wetBrushMomentSourceSeam.ts')",'({WetBrushMomentSourceSeam:Seam})').replace("await import('/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts')",'({CanonicalRoomWatercolorExecutor:Executor})')
 const install=Function('Seam','Executor',`return (${source})`)(Seam,Executor)
 const originalEmit=Executor.prototype.emitPrepared,originalPublish=Executor.prototype.publishCurrentToGl
 await install(true)
 const e=new Executor();e.target={buffer:{height:1024}};e.scratch={tiles:{peek:()=>({inkLoad:{texture:'actualP'},inkColor:{texture:'actualC'}})}}
 e.backend={device:{createBuffer:({size})=>{const b={destroyed:false,async mapAsync(){assert.equal(this.destroyed,false);events.push('map')},getMappedRange:()=>new ArrayBuffer(size),unmap(){},destroy(){this.destroyed=true}};buffers.push(b);return b}}}
 e.adapter={runQuantum:fn=>fn({encoder:{copyTextureToBuffer(a){events.push(a.texture)}}})}
 const actualStamp={center:[350,400],pressure:.7,uniforms:{bristleCombs:50}}
 e.emitPrepared({ordinal:2,strokeId:'original',metadata:{gesture:3},materialGesture:3,segment:{rect:[270,494,260,260],film:true,commands:[{kind:'stamp',phase:'pigment',stamp:actualStamp}]}})
 assert.deepEqual(events,['emit','actualP','actualC']);assert(buffers.every(b=>!b.destroyed))
 await e.publishCurrentToGl();assert.equal(window.__momentStageResults[0].published,true);assert.equal(window.__momentStageResults[0].recipe,null);assert.equal(window.__momentStageResults[0].sourceOrdinal,2);assert.deepEqual(window.__momentStageResults[0].sourceMetadata.commands[0].stamp,actualStamp);assert.equal(window.__momentStageResults[0].sourceMetadata.gesture,3);assert(buffers.every(b=>b.destroyed))
 assert.deepEqual(events.slice(3),['publish','map','map'])
 window.__restoreMomentStageProbe();assert.equal(Executor.prototype.emitPrepared,originalEmit);assert.equal(Executor.prototype.publishCurrentToGl,originalPublish);assert.equal(window.__momentStagePayloads.size,0)
 // Failure must not be labelled a successful publication, and pending leases retire.
 Executor.prototype.publishCurrentToGl=async()=>{throw Error('publication failed')};await install(true)
 e.emitPrepared({ordinal:3,strokeId:'original',segment:{rect:[270,494,260,260]}})
 await assert.rejects(e.publishCurrentToGl(),/publication failed/)
 assert.equal(window.__momentStageResults[0].published,false);assert(buffers.every(b=>b.destroyed));window.__restoreMomentStageProbe()
 delete globalThis.window
})
