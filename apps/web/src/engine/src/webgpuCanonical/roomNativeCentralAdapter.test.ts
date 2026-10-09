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

it('explicit cap8/16/32 changes only quantum grouping, preserving material/source bytes and order',async()=>{
 const run=async(cap:number|undefined)=>{
  const frames=new Map<number,()=>void>();let handle=0,step=0,cycles=0
  const material=new Uint8Array(40),events:string[]=[],groups:number[]=[],errors:unknown[]=[]
  const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:vi.fn(),failed:e=>errors.push(e)})
  const central=new RoomNativeCentralAdapter(fifo,vi.fn());if(cap!==undefined)central.setDiagnosticMaterialQuantumCap(cap)
  const done=central.admitFactory(()=>({step:()=>{material[step]=step+1;events.push('step'+step);return ++step===40},finish:()=>events.push('finish'),publish:()=>{events.push('publish');return Promise.resolve()},dispose:()=>events.push('dispose')}))
  central.enqueueSource(()=>events.push('sourceAfter:'+material.reduce((a,b)=>a+b,0)),()=>Promise.resolve())
  for(let n=0;n<100&&fifo.pending;n++){await Promise.resolve();const first=frames.entries().next().value;if(first){const before=step;frames.delete(first[0]);first[1]();cycles++;if(step>before)groups.push(step-before)}}
  await done;expect(errors).toEqual([]);return{material,events,groups,cycles}
 }
 const defaultRun=await run(undefined),eight=await run(8),sixteen=await run(16),thirtytwo=await run(32)
 for(const r of [eight,sixteen,thirtytwo]){expect(r.material).toEqual(defaultRun.material);expect(r.events).toEqual(defaultRun.events)}
 expect(defaultRun.groups).toEqual(eight.groups);expect(eight.groups).toEqual([8,8,8,8,8]);expect(sixteen.groups).toEqual([16,16,8]);expect(thirtytwo.groups).toEqual([32,8])
 expect(thirtytwo.cycles).toBeLessThan(eight.cycles)
})
it('quantum cap validates finite exact choices and retains4 ms CPU stop',async()=>{
 const frames=new Map<number,()=>void>();let handle=0,steps=0
 const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:vi.fn(),failed:vi.fn()})
 const central=new RoomNativeCentralAdapter(fifo,vi.fn())
 for(const cap of [NaN,Infinity,-1,0,1,8.5,64])expect(()=>central.setDiagnosticMaterialQuantumCap(cap)).toThrow()
 central.setDiagnosticMaterialQuantumCap(32)
 const clock=vi.spyOn(performance,'now');let tick=0;clock.mockImplementation(()=>tick+=3)
 try{
  const done=central.admitFactory(()=>({step:()=>++steps===3,finish:()=>{},dispose:()=>{}}))
  const frame=frames.entries().next().value!;frames.delete(frame[0]);frame[1]();expect(steps).toBe(2)
  for(let n=0;n<10&&fifo.pending;n++){await Promise.resolve();const first=frames.entries().next().value;if(first){frames.delete(first[0]);first[1]()}}
  await done
 }finally{clock.mockRestore()}
})

it('all caps preserve publication barrier, cancellation/device loss and original failures',async()=>{
 for(const cap of [8,16,32])for(const mode of ['held','cancel','loss','step-error','finish-error','publish-error']){
  const frames=new Map<number,()=>void>();let handle=0,steps=0,disposed=0,published=0,next=0,release!:()=>void
  const original=Error('original '+mode),errors:unknown[]=[]
  const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:vi.fn(),failed:e=>errors.push(e)})
  const central=new RoomNativeCentralAdapter(fifo,vi.fn());central.setDiagnosticMaterialQuantumCap(cap)
  const held=new Promise<void>(r=>{release=r})
  const done=central.admitFactory(()=>({step:()=>{if(mode==='step-error')throw original;return ++steps===33},finish:()=>{if(mode==='finish-error')throw original},publish:()=>{published++;return mode==='publish-error'?Promise.reject(original):held},dispose:()=>{disposed++}}))
  let rejection:unknown;const observed=done.catch(e=>{rejection=e})
  central.enqueueSource(()=>{next++},()=>Promise.resolve())
  const pump=async()=>{await Promise.resolve();const first=frames.entries().next().value;if(first){frames.delete(first[0]);first[1]()}}
  if(mode==='cancel'||mode==='loss'){await pump();fifo.cancel(mode==='loss');release();for(let n=0;n<4;n++)await pump();await observed;expect(rejection).toBeInstanceOf(Error);expect(next).toBe(0);expect(disposed).toBe(1);expect(fifo.pending).toBe(false)}
  else if(mode==='held'){for(let n=0;n<12;n++)await pump();expect(published).toBe(1);expect(next).toBe(0);release();for(let n=0;n<30&&fifo.pending;n++)await pump();await observed;expect(rejection).toBeUndefined();expect(next).toBe(1);expect(disposed).toBe(1)}
  else{for(let n=0;n<30&&fifo.pending;n++)await pump();await observed;expect(rejection).toBe(original);expect(errors).toEqual([original]);expect(next).toBe(0);expect(disposed).toBe(1);expect(fifo.pending).toBe(false)}
 }
})
it('cap is captured at material admission, not changed halfway through its job',async()=>{
 const frames=new Map<number,()=>void>();let handle=0,steps=0
 const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:vi.fn(),failed:vi.fn()})
 const central=new RoomNativeCentralAdapter(fifo,vi.fn())
 const done=central.admitFactory(()=>({step:()=>++steps===10,finish:()=>{},dispose:()=>{}}));central.setDiagnosticMaterialQuantumCap(32)
 const first=frames.entries().next().value!;frames.delete(first[0]);first[1]();expect(steps).toBe(8)
 for(let n=0;n<10&&fifo.pending;n++){await Promise.resolve();const frame=frames.entries().next().value;if(frame){frames.delete(frame[0]);frame[1]()}}
 await done
})

it('frozen next source input does not release a material publication ownership dependency',async()=>{
 const frames=new Map<number,()=>void>();let handle=0,release!:()=>void
 const fifo=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++handle,cb);return handle},unschedule:h=>frames.delete(h),changed:vi.fn(),failed:e=>{throw e}})
 const central=new RoomNativeCentralAdapter(fifo,vi.fn()),material={version:0},preparedNext=Object.freeze({version:2}),seen:number[]=[]
 const held=new Promise<void>(resolve=>{release=resolve})
 const done=central.admitFactory(()=>({step:()=>{material.version=1;return true},finish:()=>{},publish:async()=>{await held;seen.push(material.version)},dispose:()=>{}}))
 central.enqueueSource(()=>{material.version=preparedNext.version},async()=>{})
 const pump=async()=>{await Promise.resolve();const frame=frames.entries().next().value;if(frame){frames.delete(frame[0]);frame[1]()}}
 for(let i=0;i<10;i++)await pump()
 expect(material.version).toBe(1);expect(seen).toEqual([]);expect(fifo.pending).toBe(true)
 release();for(let i=0;i<30&&fifo.pending;i++)await pump();await done
 expect(seen).toEqual([1]);expect(material.version).toBe(2);expect(fifo.pending).toBe(false)
})
