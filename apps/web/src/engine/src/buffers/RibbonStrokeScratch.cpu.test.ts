import {expect,it,vi} from 'vitest'
import type {ILayerBuffer} from './ILayerBuffer'
const memory=vi.hoisted(()=>({allocations:0,copies:0}))
vi.mock('./AccumulationBuffer',()=>({AccumulationBuffer:class{
  width:number;height:number;pixels:Uint8Array
  constructor(_gl:unknown,w:number,h:number){this.width=w;this.height=h;this.pixels=new Uint8Array(w*h*4);memory.allocations++}
  clear(){this.pixels.fill(0)}
  copyTo(other:{pixels:Uint8Array}){memory.copies++;other.pixels.set(this.pixels)}
  copyRegionInto(other:{pixels:Uint8Array}){this.copyTo(other)}
  readPixels(){return this.pixels.slice()}
  restorePixelsRect(_w:number,_h:number,pixels:Uint8Array){this.pixels.set(pixels)}
  destroy(){}
}}))
import {AccumulationBuffer} from './AccumulationBuffer'
import {RibbonScratchPool} from './RibbonScratchPool'
import {RibbonStrokeScratch} from './RibbonStrokeScratch'
const fields=['original','coverage','inkLoad','inkSettled','inkColor','colorSettled','inkDry','colorDry','solventLoad','foreignSolventLoad'] as const
function fixture(){
  const pool=new RibbonScratchPool({} as WebGLRenderingContext)
  const tile=new AccumulationBuffer({} as WebGLRenderingContext,4,3)
  const target={resolveForPaint:()=>[{originX:0,originY:0,buffer:tile}]} as unknown as ILayerBuffer
  const scratch=new RibbonStrokeScratch(pool,true,true),entry=scratch.getOrCreate(tile)
  fields.forEach((name,i)=>{
    entry[name]??=pool.acquire(4,3)
    const bytes=new Uint8Array(4*3*4).map((_,p)=>(i*17+p*13)%256)
    entry[name]!.restorePixelsRect(4,3,bytes)
  })
  scratch.pigmentInputsKnownZero=false
  scratch.advanceWater(1.25,3.75);scratch.noteDabSpacing(7);scratch.noteDirection(3,4);scratch.paints.add('blue')
  return{pool,tile,target,scratch}
}
it('reads exact RGBA material into owned CPU arrays without GPU clones and restores all fields',()=>{
  const {pool,tile,target,scratch}=fixture()
  const allocations=memory.allocations
  const saved=scratch.captureRestingCpu(()=>({originX:0,originY:0}))!
  expect(saved.bytes).toBe(4*3*4*fields.length)
  expect(memory.allocations).toBe(allocations)
  const bytes=fields.map(name=>scratch.peek(tile)![name]!.readPixels())
  scratch.peek(tile)!.inkLoad!.clear()
  expect(saved.tiles[0].bufs.inkLoad!.pixels).toEqual(bytes[2])
  scratch.destroy();pool.trimFree()
  const copies=memory.copies
  const restored=RibbonStrokeScratch.restoreCpu(pool,saved,target)
  expect(memory.copies).toBe(copies)
  fields.forEach((name,i)=>expect(restored.peek(tile)![name]!.readPixels(),name).toEqual(bytes[i]))
  expect(restored.pigmentInputsKnownZero).toBe(false)
  expect(restored.waterUsed).toBe(1.25);expect(restored.pigmentUsed).toBe(3.75)
  expect(restored.noteDabSpacing(0)).toBe(7);expect(restored.noteDirection(0,0)).toEqual([.6,.8])
  expect([...restored.paints]).toEqual(['blue'])
  restored.destroy();pool.trimFree()
  expect(pool.bytes).toEqual({live:0,free:0})
})
it('refuses transient material and pending writes rather than dropping live film',()=>{
  const {scratch,tile,pool}=fixture()
  scratch.diffusePending=true
  expect(scratch.captureRestingCpu(()=>({originX:0,originY:0}))).toBeNull()
  scratch.diffusePending=false
  scratch.filmBuffers(tile)
  expect(scratch.captureRestingCpu(()=>({originX:0,originY:0}))).toBeNull()
  scratch.releaseFilm()
  expect(scratch.captureRestingCpu(()=>({originX:0,originY:0}))).not.toBeNull()
  scratch.destroy();pool.trimFree()
})
it('rejects corrupt CPU buffer sizes before allocating any restore textures',()=>{
  const {scratch,pool,target}=fixture()
  const saved=scratch.captureRestingCpu(()=>({originX:0,originY:0}))!
  saved.tiles[0].bufs.inkLoad!.pixels=new Uint8Array(1)
  const before=memory.allocations
  expect(()=>RibbonStrokeScratch.restoreCpu(pool,saved,target)).toThrow('invalid buffer dimensions')
  expect(memory.allocations).toBe(before)
  scratch.destroy();pool.trimFree()
})
