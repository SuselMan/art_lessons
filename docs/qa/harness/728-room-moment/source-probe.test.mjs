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
 // Zero-state census owns six real source fields and six postpublication
 // fields; buffers remain diagnostic and are released after mapping.
 Executor.prototype.publishCurrentToGl=originalPublish;await install(true,{zeroState:true})
 const state={};for(const role of ['inkLoad','inkColor','inkBase','colorBase','strokeInk','strokeColor'])state[role]={texture:role}
 e.scratch.tiles.peek=()=>state
 e.emitPrepared({ordinal:4,strokeId:'original',metadata:{gesture:3},materialGesture:3,momentRecipe:{mixRate:0,advectionRate:0},segment:{rect:[270,494,260,260],film:true,commands:[]}})
 await e.publishCurrentToGl();const zero=window.__momentStageResults[0]
 assert.equal(zero.stages.length,12);assert.deepEqual(zero.stages.map(s=>s.stage),['source-P','source-C','source-inkBase','source-colorBase','source-strokeInk','source-strokeColor','post-P','post-C','post-inkBase','post-colorBase','post-strokeInk','post-strokeColor'])
 for(let i=0;i<6;i++)assert.equal(zero.stages[i].sha,zero.stages[i+6].sha)
 assert(buffers.every(b=>b.destroyed));window.__restoreMomentStageProbe()
 // Existing controller substitutes a CLONED zero recipe in oldEmit. The
 // observer must inspect the actually delivered pending recipe, not input.
 Executor.prototype.emitPrepared=function(chunk){this.pendingMoment={chunk:{...chunk,momentRecipe:{...chunk.momentRecipe,mixRate:0,advectionRate:0}}}}
 await install(true,{zeroState:true});for(const role of ['inkBase','colorBase','strokeInk','strokeColor'])state[role]=null
 e.emitPrepared({ordinal:5,strokeId:'water',metadata:{gesture:4},materialGesture:4,momentRecipe:{mixRate:64,advectionRate:32},segment:{rect:[270,494,260,260],film:false,waterOnly:true,commands:[]}})
 await e.publishCurrentToGl();const water=window.__momentStageResults[0]
 assert.equal(water.stages.filter(s=>s.absent).length,8);assert(water.stages.filter(s=>s.absent).every(s=>s.byteLength===0));assert.equal(window.__momentPreparedCensus[0].film,false);assert.deepEqual(window.__momentPreparedCensus[0].actualRecipe,{mixRate:0,advectionRate:0})
 assert(buffers.every(b=>b.destroyed));window.__restoreMomentStageProbe()
 // A setup allocation failure keeps the primary error even if a FIFO
 // subsequently reports cancellation; both known observation leases retire.
 await install(true,{zeroState:true});for(const role of ['inkBase','colorBase','strokeInk','strokeColor'])state[role]={texture:role}
 const allocate=e.backend.device.createBuffer,boom=new Error('third observation allocation failed');let allocations=0
 e.backend.device.createBuffer=args=>{if(++allocations===3)throw boom;return allocate(args)}
 assert.throws(()=>e.emitPrepared({ordinal:6,strokeId:'source',metadata:{gesture:5},materialGesture:5,momentRecipe:{mixRate:64,advectionRate:32},segment:{rect:[270,494,260,260],film:true,commands:[]}}),error=>error===boom)
 assert.equal(window.__momentObserverErrors[0].error,'Error: third observation allocation failed');assert.equal(window.__momentObserverErrors[0].stage,'observer.emitPrepared:reject');assert.equal(window.__momentPreparedCensus.length,1);assert(buffers.every(b=>b.destroyed))
 window.__restoreMomentStageProbe();e.backend.device.createBuffer=allocate
 // Active snapshot observes nonzero recipes without changing owner math.
 Executor.prototype.emitPrepared=originalEmit;e.pendingMoment=null
 state.filmGesture=3;state.inkSettled={texture:'historicalP'};state.colorSettled={texture:'historicalC'}
 await install(true,{activeSnapshot:true})
 const activeRecipe={mixRate:64,advectionRate:32}
 e.emitPrepared({ordinal:7,strokeId:'active',metadata:{gesture:3},materialGesture:3,momentRecipe:activeRecipe,segment:{rect:[270,494,260,260],film:true,commands:[]}})
 await e.publishCurrentToGl();const active=window.__momentStageResults[0]
 assert.equal(active.stages.length,16)
 assert.deepEqual(active.sourceMetadata.settledSelectionBeforeTransport,{ink:'inkBase',color:'colorBase'})
 assert.deepEqual(window.__momentPreparedCensus[0].actualRecipe,activeRecipe)
 assert.equal(active.stages.find(s=>s.stage==='source-inkSettled').absent,undefined)
 assert(buffers.every(b=>b.destroyed));window.__restoreMomentStageProbe()

 await install(true,{activeSnapshot:true,waterHistory:true,worldROI:[402,352,78,96]})
 state.solventLoad={texture:'actualV'};state.foreignSolventLoad=null;state.solventGesture=8;e.scratch.foreignSources=[{gesture:'priorWater',footprints:[{}]}]
 const origins=[];e.adapter.runQuantum=fn=>fn({encoder:{copyTextureToBuffer(a,b,size){origins.push({origin:a.origin,stride:b.bytesPerRow,size})}}})
 e.emitPrepared({ordinal:8,strokeId:'common',metadata:{gesture:8},materialGesture:8,segment:{rect:[220,494,260,260],film:true,commands:[]}})
 await e.publishCurrentToGl();const common=window.__momentStageResults[0]
 assert.equal(common.stages.length,20);assert.deepEqual(common.capture,{x:182,y:82,width:78,height:96});assert(origins.every(o=>o.origin[0]===402&&o.origin[1]===352&&o.stride===512));assert.equal(common.stages.find(s=>s.stage==='source-solventLoad').byteLength,78*96*4);assert.equal(common.stages.find(s=>s.stage==='post-foreignSolventLoad').absent,true);assert.deepEqual(common.sourceMetadata.history.foreignSourcesKey,['priorWater'])
 assert.throws(()=>e.emitPrepared({ordinal:9,segment:{rect:[0,924,100,100],commands:[]}}),/outside actual source/)
 window.__restoreMomentStageProbe()
 await assert.rejects(install(false,{activeSnapshot:true}),/source-only/)
 delete globalThis.window
})
