import {expect,it,vi} from 'vitest'
import type {ILayerBuffer} from '../../buffers/ILayerBuffer'
const memory=vi.hoisted(()=>({allocations:0,copies:0}))
vi.mock('../../buffers/AccumulationBuffer',()=>({AccumulationBuffer:class{
  width:number;height:number;pixels:Uint8Array
  constructor(_gl:unknown,w:number,h:number){this.width=w;this.height=h;this.pixels=new Uint8Array(w*h*4);memory.allocations++}
  clear(){this.pixels.fill(0)}
  copyTo(other:{pixels:Uint8Array}){memory.copies++;other.pixels.set(this.pixels)}
  readPixels(){return this.pixels.slice()}
  restorePixelsRect(_w:number,_h:number,pixels:Uint8Array){this.pixels.set(pixels)}
  destroy(){}
}}))

vi.mock('./PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:()=>({})})}))
vi.mock('./PuddlePresentation',()=>({createPuddlePresentation:()=>{
 let shown=new Uint8Array()
 // Exact INPUT alpha branch for this fixture's R=G=B=A material. This is
 // an owned byte-image display model, not a WebGL watercolor shader oracle.
 return{invalidate(){},destroy(){},reset(buffer:{pixels:Uint8Array}){shown=buffer.pixels.slice()},setTarget(){},
  acceptInput(before:{pixels:Uint8Array},after:{pixels:Uint8Array}){
   if(shown.length!==after.pixels.length)shown=new Uint8Array(after.pixels.length)
   for(let i=0;i<shown.length;i+=4){const b=before.pixels[i+3]/255,a=after.pixels[i+3]/255,current=shown[i+3]/255
    if(Math.abs(a-b)<.001)continue
    const alpha=b<.995?1-(1-current)*(1-a)/Math.max(1-b,1/255):current+a-b
    shown.fill(Math.round(Math.min(1,Math.max(0,alpha))*255),i,i+4)
   }
  },tick:()=>({copyTo(destination:{pixels:Uint8Array}){destination.pixels.set(shown)}})}
}}))
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import {PuddleRoomController, MaterialSourceBusy, type PuddleRoomHost} from './PuddleRoomController'
function fixture(budget=1024*1024,width=4,height=4){
 vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{})
 const pool=new RibbonScratchPool({} as WebGLRenderingContext)
 const rehydrate=vi.fn()
 const controller=new PuddleRoomController({gl:{},size:{width,height},pool,cpuByteBudget:budget,settlePlan:{prepare(){}},rehydrate,
  render:((scratch,tile,_ctx,output)=>scratch.peek(tile.buffer)!.inkLoad!.copyTo(output)) as PuddleRoomHost['render'],changed(){},released(){},drawing:()=>false,display(){}} as unknown as PuddleRoomHost)
 const profile={ink:true,normalizeDeposit:true} as Parameters<typeof controller.source>[2]
 const targets=Array.from({length:8},()=>{
   const buffer=new AccumulationBuffer({} as WebGLRenderingContext,width,height),tile={originX:0,originY:0,buffer}
   return {allResident:()=>[tile],resolveForPaint:()=>[tile]} as unknown as ILayerBuffer
 })
 function draw(i:number){
  const result=controller.source(targets[i],`g${i}`,profile,1,'',{pin:true})
  const tile=targets[i].allResident()[0],entry=result.scratch.getOrCreate(tile.buffer)
  entry.inkLoad??=pool.acquire(width,height);entry.inkColor??=pool.acquire(width,height)
  entry.inkLoad.restorePixelsRect(width,height,new Uint8Array(width*height*4).fill(i+10))
  result.scratch.noteFinish({target:targets[i],bounds:{minX:0,minY:0,maxX:width,maxY:height},fieldSeed:[0,0]} as Parameters<typeof result.scratch.noteFinish>[0])
  controller.finish(result.scratch);result.release()
  return result
 }
 return{controller,pool,profile,targets,draw,rehydrate}
}
it('cycles eight logical wet sources through only two GPU slots without losing bytes or drying',()=>{
 const {controller,pool,profile,targets,draw}=fixture()
 for(let i=0;i<8;i++){draw(i);expect(controller.state.residentLayers).toBeLessThanOrEqual(2)}
 expect(controller.state.layers).toBe(8);expect(controller.state.parkedLayers).toBe(6)
 for(let i=0;i<8;i++){
  const source=controller.source(targets[i],`g${i}`,profile,2)
  expect(source.scratch.peek(targets[i].allResident()[0].buffer)!.inkLoad!.readPixels()).toEqual(new Uint8Array(64).fill(i+10))
  expect(controller.has(targets[i])).toBe(true);expect(controller.state.residentLayers).toBe(2)
 }
 controller.close(targets[0]);expect(controller.state.layers).toBe(7)
 controller.destroy();pool.trimFree();expect(pool.bytes.live).toBe(0);vi.unstubAllGlobals()
})
it('defers a third source while both suspended operations hold leases',()=>{
 const {controller,pool,profile,targets}=fixture()
 const a=controller.source(targets[0],'a',profile,1,'',{pin:true})
 const b=controller.source(targets[1],'b',profile,1,'',{pin:true})
 expect(()=>controller.source(targets[2],'c',profile,1)).toThrow(MaterialSourceBusy)
 expect(controller.has(targets[0])).toBe(true);expect(controller.has(targets[1])).toBe(true)
 a.release();b.release();controller.destroy();pool.trimFree();vi.unstubAllGlobals()
})
it('CPU eviction preserves marker and requests strict incoming-operation prefix on reopen',()=>{
 const {controller,pool,profile,targets,draw,rehydrate}=fixture(0)
 draw(0);const saved=controller.capture(targets[0])!
 draw(1);draw(2)
 expect(controller.has(targets[0])).toBe(true);expect(controller.state.cpuBytes).toBe(0)
 rehydrate.mockImplementationOnce(()=>{throw new Error('history unavailable')})
 expect(()=>controller.source(targets[0],'g0',profile,2,'',{beforeRecordedOpId:'incoming'})).toThrow('history unavailable')
 expect(controller.has(targets[0])).toBe(true)
 rehydrate.mockReturnValueOnce(saved)
 const restored=controller.source(targets[0],'g0',profile,2,'',{beforeRecordedOpId:'incoming'})
 expect(rehydrate).toHaveBeenLastCalledWith(targets[0],'incoming')
 expect(restored.scratch.peek(targets[0].allResident()[0].buffer)!.inkLoad!.readPixels()).toEqual(new Uint8Array(64).fill(10))
 controller.destroy();pool.trimFree();vi.unstubAllGlobals()
})

for(const [width,height]of [[512,768],[768,512]])it(`preserves rectangular ${width}x${height} source through parking, dry-baseline erasure and layer Dry`,()=>{
 const {controller,pool,profile,targets,draw}=fixture(64*1024*1024,width,height)
 try{draw(0);draw(1);draw(2)
  expect(controller.state.parkedLayers).toBe(1)
  const restored=controller.source(targets[0],'g0',profile,2)
  const entry=restored.scratch.peek(targets[0].allResident()[0].buffer)!
  const ink=entry.inkLoad!.readPixels()
  expect(ink.length).toBe(width*height*4)
  expect(ink.every(value=>value===10)).toBe(true)
  expect([entry.original.width,entry.original.height]).toEqual([width,height])
  expect(controller.eraseDryBase(targets[0],base=>base.clear(),2)).toBe(true)
  expect(entry.inkLoad!.readPixels().every((value,index)=>value===ink[index])).toBe(true)
  controller.dry(targets[0]);controller.finishDrying()
  expect(controller.has(targets[0])).toBe(false)
  expect(controller.has(targets[1])).toBe(true)
 }finally{controller.destroy();pool.trimFree();expect(pool.bytes.live).toBe(0);vi.unstubAllGlobals()}
})

it('restores previous goal and water material without target recomputation, then continues painting into that source',()=>{
 const {controller,pool,profile,targets,draw}=fixture()
 draw(0);controller.canonicalTiles(targets[0])
 const wet=Float64Array.of(1,2,.8,12,.4)
 expect(controller.captureUndo(targets[0],()=>true,()=>wet)).toBe(true)
 const after=controller.source(targets[0],'new',profile,2,'',{pin:true})
 after.scratch.peek(targets[0].allResident()[0].buffer)!.inkLoad!.restorePixelsRect(4,4,new Uint8Array(64).fill(200))
 controller.finish(after.scratch);after.release()
 const computations=controller.state.computations
 expect(controller.restoreUndo(targets[0])).toEqual({wet})
 expect(controller.state.undoHits).toBe(1)
 expect(controller.state.computations).toBe(computations)
 expect(targets[0].allResident()[0].buffer.readPixels()).toEqual(new Uint8Array(64).fill(10))
 const next=controller.source(targets[0],'third',profile,3,'',{pin:true})
 const entry=next.scratch.peek(targets[0].allResident()[0].buffer)!
 expect(entry.original.readPixels()).toEqual(new Uint8Array(64))
 const pixels=entry.inkLoad!.readPixels().map(v=>v+5)
 entry.inkLoad!.restorePixelsRect(4,4,pixels)
 controller.finish(next.scratch);next.release()
 expect(controller.canonicalTiles(targets[0])[0].buffer.readPixels()).toEqual(new Uint8Array(64).fill(15))
 controller.destroy();pool.trimFree();vi.unstubAllGlobals()
})
it('declines not-ready capture without synchronously computing a goal',()=>{
 const {controller,pool,targets,draw}=fixture()
 draw(0)
 expect(controller.captureUndo(targets[0],()=>true,()=>new Float64Array())).toBe(false)
 expect(controller.state.computations).toBe(0);expect(controller.state.cpuBytes).toBe(0)
 controller.destroy();pool.trimFree();vi.unstubAllGlobals()
})
it('shares one bounded budget with parking, which can overwrite or evict an Undo checkpoint',()=>{
 const {controller,pool,targets,draw}=fixture(300)
 draw(0);controller.canonicalTiles(targets[0])
 // original+coverage+P+C+goal alone exceed 300 bytes.
 expect(controller.captureUndo(targets[0],()=>true,()=>new Float64Array())).toBe(false)
 expect(controller.state.cpuBytes).toBeLessThanOrEqual(300)
 expect(controller.restoreUndo(targets[0])).toBeNull()
 controller.destroy();pool.trimFree();vi.unstubAllGlobals()
 const f=fixture()
 f.draw(0);f.controller.canonicalTiles(f.targets[0]);expect(f.controller.captureUndo(f.targets[0],()=>true,()=>new Float64Array())).toBe(true)
 f.draw(1);f.draw(2)
 expect(f.controller.restoreUndo(f.targets[0])).toBeNull() // Parking replaced pre-gesture version.
 f.controller.destroy();f.pool.trimFree();vi.unstubAllGlobals()
})
it('rejects invalid history proof and consumes a successful checkpoint so Redo uses ordinary replay',()=>{
 const {controller,pool,targets,draw}=fixture()
 draw(0);controller.canonicalTiles(targets[0])
 let valid=false
 expect(controller.captureUndo(targets[0],()=>valid,()=>new Float64Array())).toBe(true)
 expect(controller.restoreUndo(targets[0])).toBeNull()
 valid=true;expect(controller.restoreUndo(targets[0])).not.toBeNull()
 expect(controller.restoreUndo(targets[0])).toBeNull()
 controller.destroy();pool.trimFree();vi.unstubAllGlobals()
})

it('parking another layer evicts the resident Undo bytes through the same LRU budget without discarding its pinned live source',()=>{
 const {controller,pool,profile,targets,draw}=fixture(500)
 draw(0);controller.canonicalTiles(targets[0])
 expect(controller.captureUndo(targets[0],()=>true,()=>new Float64Array())).toBe(true)
 expect(controller.state.cpuBytes).toBe(320)
 draw(1)
 const lease=controller.source(targets[0],'g0',profile,2,'',{pin:true})
 draw(2) // Must park layer 1; layer 0's executing material cannot be evicted.
 expect(controller.state.cpuBytes).toBeLessThanOrEqual(500)
 expect(controller.owns(lease.scratch)).toBe(true)
 lease.release()
 expect(controller.restoreUndo(targets[0])).toBeNull()
 expect(controller.state.layers).toBe(3)
 controller.destroy();pool.trimFree();vi.unstubAllGlobals()
})

it('initializes the raw delta baseline after resuming an already solved hidden source',()=>{
 const {controller,pool,targets,draw}=fixture()
 let hidden=true
 controller['host'].deferPresentation=()=>hidden
 try{
  draw(0)
  controller.canonicalTiles(targets[0]) // A forced canonical read completes the hidden goal.
  const layer=controller['layers'].get(targets[0])!
  expect(layer.goalReady).toBe(true)
  hidden=false;controller.resumePresentation(targets[0])
  const baseline=layer.raw.readPixels(),entry=layer.scratch.peek(targets[0].allResident()[0].buffer)!
  // The renderer in this fixture is a strict source-P copy. A normal next
  // accept uses raw as beforeRGBA, so a zero/stale baseline re-adds old ink.
  expect(baseline).toEqual(entry.inkLoad!.readPixels())
  expect(baseline.some(value=>value!==0)).toBe(true)
 }finally{controller.destroy();pool.trimFree();vi.unstubAllGlobals()}
})

it('matches ordinary live before-UP pixels after resuming a solved hidden source',()=>{
 function run(deferred:boolean){
  const {controller,pool,profile,targets,draw}=fixture()
  let hidden=deferred;controller['host'].deferPresentation=()=>hidden
  try{draw(0);controller.canonicalTiles(targets[0]);hidden=false;controller.resumePresentation(targets[0])
   const source=controller.source(targets[0],'next-live',profile,2,'',{pin:true})
   try{const tile=targets[0].allResident()[0],entry=source.scratch.getOrCreate(tile.buffer)
    entry.inkLoad!.restorePixelsRect(4,4,new Uint8Array(64).fill(20))
    source.scratch.noteFinish({target:targets[0],bounds:{minX:0,minY:0,maxX:4,maxY:4},fieldSeed:[0,0]} as Parameters<typeof source.scratch.noteFinish>[0])
    controller.accept(source.scratch) // Real next material input, deliberately no finish/UP.
    return tile.buffer.readPixels()
   }finally{source.release()}
  }finally{controller.destroy();pool.trimFree();vi.unstubAllGlobals()}
 }
 const ordinary=run(false),hidden=run(true)
 expect(ordinary.every(value=>value===20)).toBe(true)
 expect(hidden).toEqual(ordinary)
})
