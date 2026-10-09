import {expect,it,vi} from 'vitest'
import {WatercolorCanonicalFIFO} from './WatercolorCanonicalFIFO'
import {retainPointerAdmission,type PointerAdmissionContext,type PointerAdmissionPort} from '../../../../../../docs/qa/harness/728-gl-timing/RetainedPointerAdmission'
import type {PointerData} from '../input/PointerInput'
const sample=(x:number):PointerData=>({x,y:x+1,pressure:x/10,tiltX:x,tiltY:-x,speed:x*2,timeStamp:100+x,pointerType:'pen'})
const context=():PointerAdmissionContext=>({strokeId:'fixed-id',layerId:'L1',generation:1,opts:{size:400,color:[1,2,3]},wet:{wet:.9}})
function fixture(){let id=0;const frames=new Map<number,()=>void>(),failed=vi.fn();const queue=new WatercolorCanonicalFIFO({blocked:()=>false,schedule:cb=>{frames.set(++id,cb);return id},unschedule:h=>{frames.delete(h)},changed:()=>{},failed});return{queue,failed,tick(){const next=frames.entries().next().value;if(!next)throw Error('No frame');frames.delete(next[0]);next[1]()},drain(){let remaining=100;while(frames.size&&remaining--)this.tick();expect(remaining).toBeGreaterThan(0)}}}
it('actual FIFO preserves completed early-UP gesture and immutable context before Undo/Dry, matching direct handlers',()=>{
 const s=fixture(),trace:unknown[]=[],input=context();let current:PointerAdmissionContext=context();let published=false
 const port:PointerAdmissionPort={valid:c=>c.generation===1,scope(c,run){const prior=current;current=c;try{return run()}finally{current=prior}},start:e=>trace.push(['start',current,e]),move:e=>trace.push(['move',current,e]),end:e=>trace.push(['end',current,e])}
 s.queue.enqueue({execute:function*(){yield 0;published=true},cancel:()=>{}})
 const a=retainPointerAdmission(s.queue,input,sample(1),port);const move=sample(2);a.move(move);a.end(sample(3));move.x=99;(input.opts as {size:number}).size=1;current={...context(),layerId:'L2',opts:{size:20}}
 for(const name of ['Undo','Dry'])s.queue.enqueue({execute:function*(){expect(published).toBe(true);trace.push(name)},cancel:()=>{}})
 expect(trace).toEqual([]);s.drain();expect(a.result.status).toBe('dispatched');expect(current.layerId).toBe('L2')
 const expected=context();expect(trace).toEqual([['start',expected,sample(1)],['move',expected,sample(2)],['end',expected,sample(3)],'Undo','Dry'])
})
it('capacity overflow rejects whole gesture explicitly, never dispatches truncated geometry or cancels unrelated predecessor',()=>{
 const s=fixture(),prior=vi.fn(),dispatch=vi.fn();s.queue.enqueue({execute:function*(){yield 0;prior()},cancel:()=>{}})
 const port:PointerAdmissionPort={valid:()=>true,scope:(_,run)=>run(),start:dispatch,move:dispatch,end:dispatch}
 const a=retainPointerAdmission(s.queue,context(),sample(1),port,2);a.move(sample(2));expect(()=>a.end(sample(3))).toThrow('capacity');s.drain();expect(prior).toHaveBeenCalledOnce();expect(dispatch).not.toHaveBeenCalled();expect(a.result.status).toBe('failed')
})
it('stale generation and context destruction cancel retained input without dispatch',()=>{
 for(const destroy of [false,true]){const s=fixture(),dispatch=vi.fn();let valid=true;const port:PointerAdmissionPort={valid:()=>valid,scope:(_,run)=>run(),start:dispatch,move:dispatch,end:dispatch};const a=retainPointerAdmission(s.queue,context(),sample(1),port);a.end(sample(2));if(destroy)s.queue.cancel(true);else valid=false;s.drain();expect(dispatch).not.toHaveBeenCalled();expect(a.result.status).toBe(destroy?'cancelled':'failed')}
})
it('handler throw restores scoped context and fails successors through actual FIFO',()=>{
 const s=fixture(),original=context();let current=original;const error=Error('handler');const successor=vi.fn();const port:PointerAdmissionPort={valid:()=>true,scope(c,run){current=c;try{return run()}finally{current=original}},start:()=>{throw error},move:()=>{},end:()=>{}};const a=retainPointerAdmission(s.queue,context(),sample(1),port);a.end(sample(2));s.queue.enqueue({execute:function*(){successor()},cancel:()=>{}});s.drain();expect(current).toBe(original);expect(a.result.error).toBe(error);expect(successor).not.toHaveBeenCalled();expect(s.failed).toHaveBeenCalledWith(error)
})
it('actual PointerInput coalesced normalized samples survive delayed dispatch; predictions excluded',async()=>{
 const {PointerInput}=await import('../input/PointerInput');const listeners=new Map<string,((e:PointerEvent)=>void)[]>();const canvas={width:100,height:100,style:{},addEventListener(type:string,fn:(e:PointerEvent)=>void){listeners.set(type,[...(listeners.get(type)??[]),fn])},removeEventListener(){},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})} as unknown as HTMLCanvasElement
 const pointer=new PointerInput(canvas),s=fixture(),direct:unknown[]=[],queued:unknown[]=[];let admission:ReturnType<typeof retainPointerAdmission>|undefined
 const port:PointerAdmissionPort={valid:()=>true,scope:(_,run)=>run(),start:e=>queued.push(['start',e]),move:e=>queued.push(['move',e]),end:e=>queued.push(['end',e])}
 pointer.on('start',e=>{direct.push(['start',e]);admission=retainPointerAdmission(s.queue,context(),e,port)}).on('move',e=>{direct.push(['move',e]);admission!.move(e)}).on('end',e=>{direct.push(['end',e]);admission!.end(e)})
 const event=(x:number,t:number)=>({button:0,pointerId:1,pointerType:'pen',pressure:.7,clientX:x,clientY:10,tiltX:12,tiltY:-8,timeStamp:t} as PointerEvent)
 const emit=(type:string,e:PointerEvent)=>{for(const fn of listeners.get(type)??[])fn(e)}
 emit('pointerdown',event(1,100));emit('pointermove',{...event(9,112),getCoalescedEvents:()=>[event(5,108),event(9,112)],getPredictedEvents:()=>[event(99,116)]});emit('pointerup',event(9,114));expect(queued).toEqual([]);s.drain();expect(queued).toEqual(direct);expect(queued).toHaveLength(4);pointer.destroy()
})
it('nested mutable brush data cannot change captured packet; unsupported objects fail closed before enqueue',()=>{
 const s=fixture(),input=context(),seen:unknown[]=[];const port:PointerAdmissionPort={valid:()=>true,scope(c,run){expect(Object.isFrozen(c.opts.color)).toBe(true);seen.push(c.opts.color);return run()},start:()=>{},move:()=>{},end:()=>{}}
 const a=retainPointerAdmission(s.queue,input,sample(1),port);(input.opts.color as number[])[0]=99;a.end(sample(2));s.drain();expect(seen).toEqual([[1,2,3]])
 expect(()=>retainPointerAdmission(s.queue,{...context(),wet:{value:new Map()}},sample(1),port)).toThrow('plain');expect(s.queue.pending).toBe(false)
})
