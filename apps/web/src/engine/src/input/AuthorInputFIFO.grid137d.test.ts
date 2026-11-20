import{expect,it}from'vitest'
import{AuthorInputFIFO}from'./AuthorInputFIFO'
it('parks without scheduling frames and resumes the SAME accepted-prefix work before end',()=>{
 const frames:Array<()=>void>=[],events:string[]=[]
 const q=new AuthorInputFIFO({schedule:f=>{frames.push(f);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 q.enqueue(function*(){events.push('accepted0');q.park();q.prepend(function*(){events.push('accepted1');yield;events.push('accepted2')})})
 q.enqueue(function*(){events.push('end')})
 expect(events).toEqual(['accepted0']);expect(frames).toHaveLength(0);expect(q.isParked).toBe(true)
 q.resume();while(frames.length)frames.shift()!()
 expect(events).toEqual(['accepted0','accepted1','accepted2','end']);expect(q.pending).toBe(false)
})
it('pen-up cancellation while parked cannot start after a later resource event',()=>{
 let starts=0;const q=new AuthorInputFIFO({schedule:()=>{throw Error('no polling')},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 q.park();q.enqueue(function*(){starts++});q.cancel();q.resume();expect(starts).toBe(0);expect(q.pending).toBe(false)
})

it('old captured move/end precede a queued nextStart, and cancelled nextStart never commits',()=>{
 const events:string[]=[],frames:Array<()=>void>=[]
 const q=new AuthorInputFIFO({schedule:f=>{frames.push(f);return frames.length},unschedule:()=>{},now:()=>0,failed:e=>{throw e}})
 let nextAlive=true
 q.park()
 q.prepend(function*(){q.beforeQueued(()=>{q.enqueue(function*(){events.push('oldMove')});q.enqueue(function*(){events.push('oldEnd')})})})
 q.enqueue(function*(){if(nextAlive)events.push('nextStart')})
 nextAlive=false;q.resume();while(frames.length)frames.shift()!()
 expect(events).toEqual(['oldMove','oldEnd']);expect(q.pending).toBe(false)
})
