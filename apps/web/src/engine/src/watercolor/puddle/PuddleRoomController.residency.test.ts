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
vi.mock('./PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import {PuddleRoomController, MaterialSourceBusy, type PuddleRoomHost} from './PuddleRoomController'
function fixture(budget=1024*1024){
 vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{})
 const pool=new RibbonScratchPool({} as WebGLRenderingContext)
 const rehydrate=vi.fn()
 const controller=new PuddleRoomController({gl:{},size:4,pool,cpuByteBudget:budget,settlePlan:{prepare(){}},rehydrate,
  render:((scratch,tile,_ctx,output)=>scratch.peek(tile.buffer)!.inkLoad!.copyTo(output)) as PuddleRoomHost['render'],changed(){},released(){},drawing:()=>false,display(){}} as unknown as PuddleRoomHost)
 const profile={ink:true,normalizeDeposit:true} as Parameters<typeof controller.source>[2]
 const targets=Array.from({length:8},()=>{
   const buffer=new AccumulationBuffer({} as WebGLRenderingContext,4,4),tile={originX:0,originY:0,buffer}
   return {allResident:()=>[tile],resolveForPaint:()=>[tile]} as unknown as ILayerBuffer
 })
 function draw(i:number){
  const result=controller.source(targets[i],`g${i}`,profile,1,'',{pin:true})
  const tile=targets[i].allResident()[0],entry=result.scratch.getOrCreate(tile.buffer)
  entry.inkLoad??=pool.acquire(4,4);entry.inkColor??=pool.acquire(4,4)
  entry.inkLoad.restorePixelsRect(4,4,new Uint8Array(64).fill(i+10))
  result.scratch.noteFinish({target:targets[i],bounds:{minX:0,minY:0,maxX:4,maxY:4},fieldSeed:[0,0]} as Parameters<typeof result.scratch.noteFinish>[0])
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
