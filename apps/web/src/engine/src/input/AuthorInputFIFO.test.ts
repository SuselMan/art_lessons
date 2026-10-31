import {expect,it} from 'vitest'
import {AuthorInputFIFO} from './AuthorInputFIFO'
it('bounds an input turn and preserves end/next-start metadata behind a long catchup',()=>{
 const frames:Array<()=>void>=[], output:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,2)
 fifo.enqueue(function*(){for(let i=0;i<9;i++){output.push(`a${i}`);yield}})
 const snapshot={color:'red',time:17};fifo.enqueue(function*(){output.push('endA')})
 fifo.enqueue(function*(){output.push(`startB:${snapshot.color}:${snapshot.time}`)})
 expect(output).toEqual(['a0','a1']);expect(fifo.pending).toBe(true)
 while(frames.length)frames.shift()!()
 expect(output).toEqual(['a0','a1','a2','a3','a4','a5','a6','a7','a8','endA','startB:red:17'])
})
it('closes an owned suspended generator exactly once on cancellation and ignores stale scheduled work',()=>{
 const frames:Array<()=>void>=[];let closed=0,writes=0
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 fifo.enqueue(function*(){try{while(true){writes++;yield}}finally{closed++}})
 expect(writes).toBe(1);fifo.cancel();expect(closed).toBe(1)
 frames.shift()!();expect(writes).toBe(1);fifo.cancel();expect(closed).toBe(1)
})
it('releases queued owned jobs without starting them and closes the active owner exactly once',()=>{
 const frames:Array<()=>void>=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 fifo.enqueue(function*(){try{yield}finally{events.push('active-finally')}},()=>events.push('active-release'))
 fifo.enqueue(function*(){events.push('queued-factory')},()=>events.push('queued-release'))
 fifo.cancel();fifo.cancel();frames.shift()!()
 expect(events).toEqual(['queued-release','active-finally','active-release']);expect(fifo.pending).toBe(false)
})
it('attempts every retirement when unschedule, generator return and releases throw, preserving the first cleanup error',()=>{
 const primary=new Error('unschedule'),events:string[]=[],frames:Array<()=>void>=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{throw primary},now:()=>0,failed:e=>{throw e}},4,1)
 fifo.enqueue(function*(){try{yield}finally{events.push('finally');throw Error('return')}},()=>{events.push('active');throw Error('release')})
 fifo.enqueue(function*(){},()=>{events.push('queued');throw Error('queued release')})
 expect(()=>fifo.cancel()).toThrow(primary);expect(events).toEqual(['queued','finally','active']);expect(fifo.pending).toBe(false)
 expect(()=>fifo.cancel()).not.toThrow();frames.shift()!();expect(events).toHaveLength(3)
})
it('releases a throwing factory and queued jobs before reporting the exact primary failure',()=>{
 const primary=new Error('factory'),events:string[]=[],frames:Array<()=>void>=[],errors:unknown[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{events.push('failed');errors.push(e)}},4,1)
 fifo.enqueue(function*(){yield})
 fifo.enqueue(()=>{throw primary},()=>{events.push('factory-release');throw Error('secondary')})
 fifo.enqueue(function*(){events.push('never')},()=>events.push('queued-release'))
 frames.shift()!()
 expect(errors).toEqual([primary]);expect(events).toEqual(['queued-release','factory-release','failed']);expect(fifo.pending).toBe(false)
})
it('defers an active release until reentrant cancellation exits next and preserves freshly enqueued work',()=>{
 const events:string[]=[],frames:Array<()=>void>=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}},4,1)
 fifo.enqueue(function*(){try{events.push('next');fifo.cancel();events.push('after-cancel');yield}finally{events.push('finally')}},()=>{events.push('release');fifo.enqueue(function*(){events.push('fresh')})})
 while(frames.length)frames.shift()!()
 expect(events).toEqual(['next','after-cancel','finally','release','fresh']);expect(fifo.pending).toBe(false)
})
it('retires suspended and queued owners when a later turn clock throws before selecting work',()=>{
 const primary=new Error('clock'),events:string[]=[],frames:Array<()=>void>=[];let clockFails=false
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>{if(clockFails)throw primary;return 0},failed:e=>events.push(e===primary?'primary':'wrong')},4,1)
 fifo.enqueue(function*(){try{yield;events.push('never')}finally{events.push('finally')}},()=>events.push('active-release'))
 fifo.enqueue(function*(){events.push('queued-never')},()=>events.push('queued-release'));clockFails=true;frames.shift()!()
 expect(events).toEqual(['queued-release','finally','active-release','primary']);expect(fifo.pending).toBe(false)
})
it('keeps reentrant fresh jobs scheduled even when failure notification itself throws',()=>{
 const primary=new Error('body'),notice=new Error('notice'),frames:Array<()=>void>=[],events:string[]=[]
 const fifo=new AuthorInputFIFO({schedule:cb=>{frames.push(cb);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{expect(e).toBe(primary);throw notice}},4,1)
 expect(()=>fifo.enqueue(function*(){throw primary},()=>{events.push('release');fifo.enqueue(function*(){events.push('fresh')},()=>events.push('fresh-release'))})).toThrow(notice)
 while(frames.length)frames.shift()!()
 expect(events).toEqual(['release','fresh','fresh-release']);expect(fifo.pending).toBe(false)
})
it('releases normally completed work and scheduling failures exactly once',()=>{
 const events:string[]=[],primary=new Error('schedule'),errors:unknown[]=[]
 const fifo=new AuthorInputFIFO({schedule:()=>{throw primary},unschedule:()=>{},now:()=>0,failed:e=>errors.push(e)},4,1)
 fifo.enqueue(function*(){events.push('done')},()=>events.push('done-release'))
 fifo.enqueue(function*(){try{yield}finally{events.push('finally')}},()=>events.push('yield-release'))
 fifo.cancel();expect(events).toEqual(['done','done-release','finally','yield-release']);expect(errors).toEqual([primary]);expect(fifo.pending).toBe(false)
})
