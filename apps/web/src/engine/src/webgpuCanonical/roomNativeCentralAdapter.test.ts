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
