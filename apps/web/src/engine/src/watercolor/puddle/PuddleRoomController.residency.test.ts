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
