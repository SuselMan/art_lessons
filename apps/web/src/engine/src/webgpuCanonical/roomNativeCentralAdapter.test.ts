import {expect,it,vi} from 'vitest'
import {WatercolorCanonicalFIFO} from '../watercolor/WatercolorCanonicalFIFO'
import {RoomNativeCentralAdapter} from './roomNativeCentralAdapter'

it('prepares and drains a native finish at its original FIFO boundary before later source',async()=>{
 const frames=new Map<number,()=>void>();let handle=0
 const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>{frames.delete(h)},changed:vi.fn(),failed:e=>{throw e}})
 const central=new RoomNativeCentralAdapter(fifo,vi.fn()),events:string[]=[]
 central.enqueueSource(()=>events.push('source1'),async()=>{})
 let steps=0
 const finished=central.admitFactory(()=>{expect(central.isIdle).toBe(true);events.push('prepare');return{step:()=>{events.push('step');return ++steps===10},finish:()=>events.push('finish'),publish:async()=>{events.push('publish')},dispose:()=>events.push('dispose')}})
 central.enqueueSource(()=>events.push('source2'),async()=>{})
 for(let n=0;n<100&&fifo.pending;n++){await Promise.resolve();const first=frames.entries().next().value;if(first){frames.delete(first[0]);first[1]()}}
 await finished
 expect(events[0]).toBe('source1');expect(events.indexOf('prepare')).toBeLessThan(events.indexOf('finish'));expect(events.indexOf('finish')).toBeLessThan(events.indexOf('source2'))
 expect(events.filter(e=>e==='step')).toHaveLength(10);expect(events.filter(e=>e==='dispose')).toHaveLength(1)
})
it('each retained source publication completes before the next source can mutate fields',async()=>{
 const frames=new Map<number,()=>void>();let handle=0,release:()=>void=()=>{}
 const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:vi.fn(),failed:e=>{throw e}})
 const central=new RoomNativeCentralAdapter(fifo,vi.fn()),events:string[]=[],held=new Promise<void>(r=>{release=r})
 central.enqueueSource(()=>events.push('retained1'),async()=>{events.push('audit1');await held;events.push('published1')})
 central.enqueueSource(()=>events.push('retained2'),async()=>{events.push('published2')})
 const pump=async()=>{await Promise.resolve();const frame=frames.entries().next().value;if(frame){frames.delete(frame[0]);frame[1]()}}
 for(let i=0;i<10;i++)await pump();expect(events).toEqual(['retained1','audit1'])
 release();for(let i=0;i<30&&fifo.pending;i++)await pump()
 expect(events).toEqual(['retained1','audit1','published1','retained2','published2']);expect(fifo.pending).toBe(false)
})

it('DEV markers preserve exact FIFO ordering, held publication and material steps',async()=>{
 const run=async(observe:boolean,throwing=false)=>{
  const frames=new Map<number,()=>void>();let handle=0,release!:()=>void,steps=0
  const errors:unknown[]=[],events:string[]=[],markers:Array<{request:number;kind:string;phase:string}>=[]
  const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:()=>events.push('changed'),failed:e=>errors.push(e)})
  const central=new RoomNativeCentralAdapter(fifo,()=>events.push('published'))
  if(observe)central.diagnosticObserver=e=>{markers.push(e);if(throwing)throw Error('Observer failed')}
  const held=new Promise<void>(r=>{release=r})
  central.enqueueSource(()=>events.push('source1'),()=>held)
  const done=central.admitFactory(()=>{events.push('prepare');return{step:()=>{events.push('step');return ++steps===10},finish:()=>events.push('finish'),publish:()=>{events.push('publish');return Promise.resolve()},dispose:()=>events.push('dispose')}})
  central.enqueueSource(()=>events.push('source2'),()=>Promise.resolve())
  const pump=async()=>{await Promise.resolve();const first=frames.entries().next().value;if(first){frames.delete(first[0]);first[1]()}}
  for(let n=0;n<4;n++)await pump()
  expect(events).not.toContain('prepare');release()
  for(let n=0;n<100&&fifo.pending;n++)await pump()
  await done;expect(errors).toEqual([]);expect(fifo.pending).toBe(false)
  return{events,markers}
 }
 const off=await run(false),on=await run(true),badSink=await run(true,true)
 expect(on.events).toEqual(off.events);expect(badSink.events).toEqual(off.events)
 expect(on.markers.filter(e=>e.phase==='admitted').map(e=>[e.request,e.kind])).toEqual([[0,'source'],[1,'material'],[2,'source']])
 const phases=on.markers.filter(e=>e.request===1).map(e=>e.phase)
 expect(phases.filter(x=>x==='step:start')).toHaveLength(10)
 expect(phases.indexOf('publish:start')).toBeLessThan(phases.indexOf('publish:done'))
 expect(phases.at(-1)).toBe('complete')
})
it('DEV publication rejection marker retains original failure and cancellation',async()=>{
 const frames=new Map<number,()=>void>();let handle=0
 const failure=Error('original publication failure'),errors:unknown[]=[],phases:string[]=[]
 const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:vi.fn(),failed:e=>errors.push(e)})
 const central=new RoomNativeCentralAdapter(fifo,vi.fn());central.diagnosticObserver=e=>phases.push(e.phase)
 central.enqueueSource(()=>{},()=>Promise.reject(failure));central.enqueueSource(()=>{throw Error('must not execute')},()=>Promise.resolve())
 for(let n=0;n<10&&fifo.pending;n++){await Promise.resolve();const first=frames.entries().next().value;if(first){frames.delete(first[0]);first[1]()}}
 expect(errors).toEqual([failure]);expect(phases).toContain('publish:failed');expect(phases).not.toContain('complete');expect(fifo.pending).toBe(false)
})
