import {it,expect,vi} from 'vitest'
import {capturePagedPuddleSource} from './PagedPuddleSource'
import {createPagedPuddleTarget} from './PagedPuddleTarget'
import {CapturedReadScope} from './CapturedReadScope'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {MockGL} from '../../../testing/mockGL'
for(const kind of ['local','foreign','mixed'])it('sole water read reuse '+kind+' preserves every captured byte, mixed remains GPU',()=>{
 const plane=(n:number)=>({readPixels:vi.fn(()=>new Uint8Array(16).fill(n))})
 const entry={original:plane(1),coverage:plane(2),inkLoad:plane(3),inkColor:plane(4),solventLoad:kind==='foreign'?undefined:plane(5),foreignSolventLoad:kind==='local'?undefined:plane(6)}
 const tile={originX:0,originY:0,buffer:{width:2,height:2}},source={peek:()=>entry},target={allResident:()=>[tile]},combined=plane(7),fieldOp=vi.fn(),release=vi.fn(),pool={acquire:()=>combined,release}
 const baseline=capturePagedPuddleSource(source as any,target as any,{width:2,height:2},pool as any,{fieldOp} as any)
 const before=[entry.solventLoad?.readPixels.mock.calls.length??0,entry.foreignSolventLoad?.readPixels.mock.calls.length??0]
 const actual=capturePagedPuddleSource(source as any,target as any,{width:2,height:2},pool as any,{fieldOp} as any,{reuseSingleWaterRead:true})
 for(const name of ['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad','water'] as const)expect(actual[name].readRect({x:0,y:0,width:2,height:2})).toEqual(baseline[name].readRect({x:0,y:0,width:2,height:2}))
 expect(actual.materialSupport).toEqual(baseline.materialSupport)
 if(entry.solventLoad)expect(entry.solventLoad.readPixels.mock.calls.length-before[0]).toBe(1)
 if(entry.foreignSolventLoad)expect(entry.foreignSolventLoad.readPixels.mock.calls.length-before[1]).toBe(1)
 expect(fieldOp).toHaveBeenCalledTimes(kind==='mixed'?2:0);expect(release).toHaveBeenCalledTimes(kind==='mixed'?2:0)
})
for(const mode of ['off','cancel','captureThrow','barrierThrow','postThrow','complete'])it('real paged scope finally '+mode,()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,dispose=vi.spyOn(CapturedReadScope.prototype,'dispose'),capture=vi.spyOn(AccumulationBuffer.prototype,'captureReadPixels'),make=(w:number,h:number,f:any)=>new AccumulationBuffer(gl,w,h,f)
 const options:any={capturedBacking:mode!=='off',skipEmptyFixedWindows:true}
 if(mode==='cancel'||mode==='off')options.sourceCaptured=()=>({defer:true})
 if(mode==='barrierThrow')options.sourceCaptured=()=>{throw Error('barrier')}
 if(mode==='postThrow')options.solved=()=>{throw Error('post')}
 const solver=createPagedPuddleTarget({gl,pool:{},passes:{}} as any,{width:8,height:8},make,options)
 const target={allResident:()=>{if(mode==='captureThrow')throw Error('capture');return []}}
 try{
 solver.resetFromScratch({} as any,target as any,1)
 if(mode==='captureThrow'||mode==='barrierThrow')expect(()=>solver.step(1)).toThrow()
 else if(mode==='postThrow')expect(()=>{for(let i=0;i<30&&!solver.state.done;i++)solver.step(1)}).toThrow('post')
 else if(mode==='complete'){for(let i=0;i<30&&!solver.state.done;i++)solver.step(1);expect(solver.state.done).toBe(true)}
 else{solver.step(1);expect(dispose).not.toHaveBeenCalled();solver.cancel()}
 expect(dispose).toHaveBeenCalledTimes(mode==='off'?0:1)
 expect(capture).not.toHaveBeenCalled() // empty source; no unnecessary buffer read
 }finally{solver.destroy();dispose.mockRestore();capture.mockRestore()}
})
import {BufferResidency} from '../../buffers/BufferResidency'
for(const mode of ['cancel','writeThenCancel','captureThrow','postThrow','complete'])it('owns real cached capture proofs until finally '+mode,()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,cache=new BufferResidency(gl,120*1024*1024),owned:AccumulationBuffer[]=[],make=(w:number,h:number,f:any='nearest')=>{const b=new AccumulationBuffer(gl,w,h,f,cache);owned.push(b);return b}
 const original=make(8,8),coverage=make(8,8),inkLoad=make(8,8),inkColor=make(8,8),solventLoad=make(8,8)
 original.writePixels(Uint8Array.from({length:256},(_,i)=>i));for(const b of [coverage,inkLoad,inkColor,solventLoad])b.clear()
 const entry={original,coverage,inkLoad,inkColor,solventLoad},tile={originX:0,originY:0,buffer:original},source={peek:()=>entry},target={allResident:()=>[tile]}
 if(mode==='captureThrow')vi.spyOn(coverage,'readPixels').mockImplementationOnce(()=>{throw Error('capture')})
 const options:any={capturedBacking:true,skipEmptyFixedWindows:true}
 if(mode==='cancel'||mode==='writeThenCancel')options.sourceCaptured=()=>({defer:true})
 if(mode==='postThrow')options.solved=()=>{expect(Reflect.get(original,'_capturedRead')).toBeDefined();throw Error('post')}
 const solver=createPagedPuddleTarget({gl,pool:{},passes:{}} as any,{width:8,height:8},make,options)
 try{
 solver.resetFromScratch(source as any,target as any,1)
 if(mode==='captureThrow')expect(()=>solver.step(1)).toThrow('capture')
 else if(mode==='postThrow')expect(()=>{for(let i=0;i<30&&!solver.state.done;i++)solver.step(1)}).toThrow('post')
 else if(mode==='complete'){for(let i=0;i<30&&!solver.state.done;i++)solver.step(1);expect(solver.state.done).toBe(true)}
 else{solver.step(1);expect(Reflect.get(original,'_capturedRead')).toBeDefined();if(mode==='writeThenCancel'){original.clear();expect(Reflect.get(original,'_capturedRead')).toBeUndefined()}solver.cancel()}
 for(const b of [original,coverage,inkLoad,inkColor,solventLoad])expect(Reflect.get(b,'_capturedRead')).toBeUndefined()
 }finally{solver.destroy();for(const b of owned)b.destroy();expect(cache.bufferCount).toBe(0);cache.dispose()}
})
