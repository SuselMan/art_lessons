import {expect,it,vi} from 'vitest'
import {MockGL} from '../../../testing/mockGL'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import {ribbonProfileFor} from '../../dabs/ribbonProfile'
import {createNativePuddleTarget,type NativePuddleTargetOptions,type PuddleTargetHost} from './PuddleTarget'

// This models canonical job ownership/copies. MockGL is not a shader oracle.
function fixture(finalOnly?:boolean,consumePreparedSource=false){
 const gl=new MockGL() as unknown as WebGLRenderingContext
 const created=vi.spyOn(gl,'createTexture'),deleted=vi.spyOn(gl,'deleteTexture')
 const pool=new RibbonScratchPool(gl),key=pool.acquire(3,3),source=new RibbonStrokeScratch(pool,true,true)
 key.clear();const entry=source.getOrCreate(key)
 const bytes=(value:number)=>new Uint8Array(36).fill(value)
 entry.inkLoad!.writePixels(bytes(24));entry.inkColor!.writePixels(bytes(36));entry.coverage.writePixels(bytes(80))
 entry.solventLoad=pool.acquire(3,3);entry.solventLoad.writePixels(bytes(64))
 if(consumePreparedSource){entry.foreignSolventLoad=pool.acquire(3,3);entry.foreignSolventLoad.writePixels(bytes(8))}
 const tile={buffer:key,originX:0,originY:0,contentRect:null},target={allResident:()=>[tile]}
 const preset='normal:95:34:PB29:round:wc@m70-r2-v1'
 source.paints.add('.1,.3,.8');source.paints.add('.9,.8,.1')
 source.noteFinish({target,preset,profile:ribbonProfileFor('watercolor',preset)!,color:[.1,.3,.8],opacity:1,
  bounds:{minX:0,minY:0,maxX:3,maxY:3},fieldSeed:[0,0],landedWet:0,wetPeak:1,radiusPx:40,dwellMs:0} as unknown as Parameters<typeof source.noteFinish>[0])
 const trace:string[]=[],previewCalls=vi.fn(),disposed=vi.fn(),finished=vi.fn()
 const implementation:PuddleTargetHost['settlePlan']['prepare']=(...args)=>{
  const clone=args[0],paint=args[1][0],preview=args[10],current=clone.peek(paint.buffer)!
  return {compositeDomain:args[2],ops:[0,1,2].map(n=>()=>{
   trace.push('op'+n);current.inkLoad!.writePixels(bytes(40+n));current.inkColor!.writePixels(bytes(60+n))
   if(preview){previewCalls();preview(paint,current.inkLoad!,current.inkColor,current.coverage)}
  }),finish(){trace.push('finish');finished();current.inkLoad!.writePixels(bytes(180));current.inkColor!.writePixels(bytes(220))},dispose:disposed}
 }
 const prepare=vi.fn(implementation)
 const host={gl,pool,settlePlan:{prepare},passes:{fieldOp(out:AccumulationBuffer,a:AccumulationBuffer){a.copyTo(out)}},
  invalidateFrontPaths:vi.fn(),hasActiveSettle:()=>false} as unknown as PuddleTargetHost
 const options={deferFinalMix:true,
  contrast:{prepare(p:AccumulationBuffer,c:AccumulationBuffer,_w:AccumulationBuffer,_v:boolean,rp:AccumulationBuffer,rc:AccumulationBuffer){p.copyTo(rp);c.copyTo(rc)},destroy(){}},
  background:{capture(){},ops:()=>[],destroy(){}}} as unknown as NativePuddleTargetOptions
 if(finalOnly!==undefined)options.finalOnly=finalOnly
 options.consumePreparedSource=consumePreparedSource
 const solver=createNativePuddleTarget(host,3,options)
 const read=()=>{const m=solver.buffers();return{p:m.p.readPixels(),c:m.c.readPixels(),coverage:m.coverage.readPixels()}}
 const sourceBefore={p:entry.inkLoad!.readPixels(),c:entry.inkColor!.readPixels(),coverage:entry.coverage.readPixels()}
 return{solver,prepare,source,tile,entry,trace,previewCalls,disposed,finished,read,sourceBefore,
  finish(){let guard=0;while(!solver.state.done){solver.step(1);if(++guard>20)throw Error('Job never completed')}return read()},
  cleanup(){solver.destroy();source.destroy();pool.release(key);pool.trimFree();expect(pool.bytes.live).toBe(0);expect(deleted).toHaveBeenCalledTimes(created.mock.calls.length)}}
}

it.each([undefined,false])('keeps native intermediate preview callbacks by default (finalOnly=%s)',finalOnly=>{
 const f=fixture(finalOnly)
 try{f.solver.resetFromScratch(f.source,f.tile,1)
  expect(f.prepare.mock.calls[0][10]).toBeTypeOf('function')
  f.solver.step(1);expect(f.previewCalls).toHaveBeenCalledOnce()
  expect(f.read().p).toEqual(new Uint8Array(36).fill(40))
  expect(f.finish().p).toEqual(new Uint8Array(36).fill(180));expect(f.finished).toHaveBeenCalledOnce()
 }finally{f.cleanup()}
})
it('adopts a disposable window without a second scratch and releases both solvent leases',()=>{
 const f=fixture(true,true)
 try{
  f.solver.resetFromScratch(f.source,f.tile,1)
  expect(f.prepare.mock.calls[0][0]).toBe(f.source)
  const output=f.finish()
  expect(output.p).toEqual(new Uint8Array(36).fill(180))
  expect(output.c).toEqual(new Uint8Array(36).fill(220))
  expect(output.coverage).toEqual(f.sourceBefore.coverage)
  expect(f.source.peek(f.tile.buffer)).toBeNull()
 }finally{f.cleanup()}
})
it('cancels an adopted window without leaking or releasing its material twice',()=>{
 const f=fixture(true,true)
 try{
  f.solver.resetFromScratch(f.source,f.tile,1);f.solver.step(1)
  f.solver.cancel();f.solver.cancel();f.source.destroy()
  expect(f.disposed).toHaveBeenCalledOnce()
  expect(f.source.peek(f.tile.buffer)).toBeNull()
 }finally{f.cleanup()}
})
it('rejects consuming a caller source when local background mixing would need its original bytes',()=>{
 expect(()=>createNativePuddleTarget({} as PuddleTargetHost,3,{consumePreparedSource:true})).toThrow('deferred final mixing')
})
it('omits presentation work but preserves canonical order, final output, contour and immutable source',()=>{
 const run=(finalOnly:boolean)=>{const f=fixture(finalOnly)
  try{f.solver.resetFromScratch(f.source,f.tile,1)
   const initial=f.read();f.solver.step(1)
   if(finalOnly){expect(f.prepare.mock.calls[0][10]).toBeUndefined();expect(f.read()).toEqual(initial)}
   else expect(f.read().p).toEqual(new Uint8Array(36).fill(40))
   const output=f.finish()
   expect(f.entry.inkLoad!.readPixels()).toEqual(f.sourceBefore.p)
   expect(f.entry.inkColor!.readPixels()).toEqual(f.sourceBefore.c)
   expect(f.entry.coverage.readPixels()).toEqual(f.sourceBefore.coverage)
   expect(output.p).toEqual(new Uint8Array(36).fill(180));expect(output.c).toEqual(new Uint8Array(36).fill(220))
   expect(output.coverage).toEqual(f.sourceBefore.coverage)
   expect(f.finished).toHaveBeenCalledOnce()
   expect(f.previewCalls).toHaveBeenCalledTimes(finalOnly?0:3)
   return{output,trace:f.trace.slice()}
  }finally{f.cleanup()}}
 expect(run(true)).toEqual(run(false))
})
it.each([false,true])('cancels the unfinished job once and can compute the next revision (finalOnly=%s)',finalOnly=>{
 const f=fixture(finalOnly)
 try{f.solver.resetFromScratch(f.source,f.tile,1);f.solver.step(1)
  f.solver.cancel();f.solver.cancel();expect(f.disposed).toHaveBeenCalledOnce();expect(f.finished).not.toHaveBeenCalled()
  f.solver.resetFromScratch(f.source,f.tile,2)
  expect(f.finish().p).toEqual(new Uint8Array(36).fill(180))
  expect(f.finished).toHaveBeenCalledOnce();expect(f.disposed).toHaveBeenCalledOnce()
  expect(f.entry.inkLoad!.readPixels()).toEqual(f.sourceBefore.p)
 }finally{f.cleanup()}
})
