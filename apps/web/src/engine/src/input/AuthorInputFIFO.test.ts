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
