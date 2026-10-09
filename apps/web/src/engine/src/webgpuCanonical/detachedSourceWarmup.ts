import type {CanonicalWatercolorWebGpu} from './backend'
import {CanonicalFieldBuffer,CanonicalScratchPool} from './fieldBuffer'
import {CanonicalTileScratch} from './tileScratch'
import {CanonicalSourcePhaseExecutor,type PreparedSourceSegment} from './sourcePhaseExecutor'
import {CanonicalFieldOps} from './passes/fieldOps'
import {runDetachedWarmup} from './detachedWarmup'
import {CanonicalSingleTileFinish,type CanonicalTileLiveInput} from './finishTile'
import {CanonicalRoomTileBridge} from './roomTileBridge'
import {CanonicalPlanAdapter} from './settlePlanAdapter'
import {cloneWarmPacket,warmPacketSha256,assertWarmResourceRetirement} from './warmPacket'

/** QA-only shader-first-use packet. Caller supplies ALREADY prepared immutable
 * commands. No delivery, journal, canonical planner or Room publication here.
 * Source-owned state belongs exclusively to the detached1024 tile. */
export async function warmDetachedPreparedSource(backend:CanonicalWatercolorWebGpu,segment:PreparedSourceSegment){return warmSourcePacket(backend,segment)}
/** Separate full first-LIVE-use QA arm: source + literal live material composite
 * + detached raw canvas. No dry planner/pressure/front model is executed. */
export async function warmDetachedFirstLiveUse(backend:CanonicalWatercolorWebGpu,segment:PreparedSourceSegment,live:CanonicalTileLiveInput){return warmSourcePacket(backend,segment,live)}
async function warmSourcePacket(backend:CanonicalWatercolorWebGpu,segment:PreparedSourceSegment,live?:CanonicalTileLiveInput){
 if(backend.options.roomOwnedResources!==true)throw new Error('Detached source warmup requires Room-owned backend')
 if(!segment.commands.length||segment.commands.length>64)throw new Error('Bounded warm source packet required')
 const vertexBytes=segment.commands.reduce((sum,c)=>sum+(c.kind==='ribbon'?c.batch.vertices.byteLength:0),0)
 if(vertexBytes>65536)throw new Error('Warm ribbon packet exceeds TOTAL geometry cap')
 let transientBufferBytes=0
 const beforeResources=backend.diagnosticResourceLedger
 const identity=live?{segment,live}:segment
 const sourceSha256=await warmPacketSha256(identity),packet=cloneWarmPacket(segment),liveCopy=live?structuredClone(live):undefined
 const result=await runDetachedWarmup(backend,async scope=>{
  const uniforms:GPUBuffer[]=[]
  // Resource-only proxy: math/command methods bind the original backend. Every
  // detached field is retained until the scope completion fence, even if the
  // scratch pool logically releases it sooner. The shared device stays alive.
  const owner=new Proxy(backend,{get(target,key){
   if(key==='createField')return(label:string,w:number,h:number,filter:'nearest'|'linear'='nearest')=>scope.create(label,w,h,filter)
   if(key==='destroyField')return()=>{} // scope owns physical retirement
   const value=Reflect.get(target,key,target)
   if(key==='encodePreparedStamp'||key==='encodePreparedRibbon')return(...args:unknown[])=>{const buffers=Reflect.apply(value,target,args) as GPUBuffer[];uniforms.push(...buffers);return buffers}
   return typeof value==='function'?value.bind(target):value
  }})
  const pool=new CanonicalScratchPool(owner),tile=new CanonicalFieldBuffer(owner,1024,1024,'nearest','QA detached prepared source tile'),scratch=new CanonicalTileScratch(pool,true,true),ops=new CanonicalFieldOps(backend.device)
  backend.device.pushErrorScope('validation')
  try{
   // Match first actual Room owner construction. This compiles both canonical
   // brush pipeline descriptors; no brush/planner dispatch is added.
   if(liveCopy)new CanonicalPlanAdapter(owner)
   const encoder=backend.device.createCommandEncoder({label:'QA detached original source warmup'})
   let release=()=>{}
   try{const encoded=backend.encodeOwnerCommands(encoder,()=>{
    tile.clear()
    const ctx={device:backend.device,encoder,nearest:backend.nearest,linear:backend.linear}
    const source=new CanonicalSourcePhaseExecutor(owner,scratch,[{buffer:tile,originX:0,originY:0}],{fieldOp(out,a,b,mode,k,scissor){uniforms.push(ops.run(ctx,{out:out.field,a:a.field,b:b.field,coverage:a.field,paper:backend.paper,world:{x:0,y:0,width:out.width,height:out.height}},mode,k,{scissor,noise:backend.noise}))}})
    uniforms.push(...source.execute(encoder,packet,1))
    if(liveCopy)uniforms.push(...new CanonicalSingleTileFinish(owner,scratch,[{buffer:tile,originX:0,originY:0}]).encodeLive(encoder,liveCopy))
    return uniforms
   })
   release=encoded.release
   transientBufferBytes=[...new Set(uniforms)].reduce((sum,b)=>sum+b.size,0)
   if(transientBufferBytes>262144)throw new Error('Warm source transient buffer cap exceeded')
   backend.device.queue.submit([encoder.finish()]);await backend.whenIdle()
   }finally{new Set(uniforms).forEach(b=>b.destroy());release()}
   if(liveCopy){
    const bridge=new CanonicalRoomTileBridge(backend.device,document.createElement('canvas'),1024,1024)
    try{await bridge.warmDetachedCanvas(tile.field)}finally{bridge.destroy()}
   }
   scope.assertCurrent()
  }finally{scratch.destroy();tile.destroy();pool.destroy();const validation=await backend.device.popErrorScope();if(validation)throw new Error(`Detached source warm GPU validation: ${validation.message}`)}
 },96*1024*1024)
 if(await warmPacketSha256(identity)!==sourceSha256)throw new Error('Prepared warm source mutated during execution')
 const afterResources=backend.diagnosticResourceLedger
 const sharedResourceDeltaBytes=assertWarmResourceRetirement(beforeResources,afterResources)
 return{...result,sourceSha256,vertexBytes,transientBufferBytes,sharedResourceDeltaBytes,scope:liveCopy?'prepared source + live composite + raw canvas':'prepared source only',plannerWarmed:false,pressureDispatched:false,brushPipelinesConstructed:!!liveCopy,liveCompositeWarmed:!!liveCopy,rawCanvasWarmed:!!liveCopy,glPublished:false}
}
