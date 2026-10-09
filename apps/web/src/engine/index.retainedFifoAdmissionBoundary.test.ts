import {afterEach,expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,paperReady} from './testing/engineTestUtils'
import type {PencilEngine} from './index'
import type {PointerData} from './src/input/PointerInput'
import {retainPointerAdmission,type PointerAdmissionPort} from '../../../../docs/qa/harness/728-gl-timing/RetainedPointerAdmission'
const engines:PencilEngine[]=[]
afterEach(()=>{for(const e of engines.splice(0))e.destroy()})
const sample=(x:number):PointerData=>({x,y:12,pressure:.7,tiltX:0,tiltY:0,speed:.2,timeStamp:100+x,pointerType:'pen'})
async function fixture(){const {engine:e}=createTestEngine({userId:'actor',diagnosticPointerAdmission:true},{width:64,height:64});engines.push(e);e.appendOperation(makeLayerAdd('actor','L'));e.setActiveLayer('L');await paperReady(e);e.setTool('pencil');const packet=e.diagnosticCapturePointerAdmission('retained-gesture'),revision=e['_log'].revision,events:string[]=[]
 const source=vi.spyOn(e as unknown as {_onStart(s:PointerData):void},'_onStart'),attempt=vi.fn((kind:'start'|'move'|'end',s:PointerData)=>{events.push('attempt-'+kind);e.diagnosticDispatchPointerAdmission(packet,kind,s,1000)})
 const port:PointerAdmissionPort={valid:c=>c.generation===e['_log'].revision,scope:(_c,dispatch)=>dispatch(),start:s=>attempt('start',s),move:s=>attempt('move',s),end:s=>attempt('end',s)}
 return {e,queue:e['_wcCanonical'],events,source,attempt,port,context:{strokeId:'retained-gesture',layerId:'L',generation:revision,opts:{tool:'pencil'},wet:{}}}
}
it('actual Engine FIFO retains early UP before predecessor publish, then actual dispatcher rejects its own busy request',async()=>{
 const f=await fixture(),cancelled=vi.fn()
 f.queue.enqueue({execute:function*(){f.events.push('predecessor-started');expect(f.attempt).not.toHaveBeenCalled();expect(f.source).not.toHaveBeenCalled();yield 0;expect(f.attempt).not.toHaveBeenCalled();f.events.push('predecessor-published')},cancel:cancelled})
 const retained=retainPointerAdmission(f.queue,f.context,sample(8),f.port,8);retained.move(sample(16));retained.end(sample(24))
 expect(f.attempt).not.toHaveBeenCalled();expect(f.source).not.toHaveBeenCalled();expect(retained.result.status).toBe('retained');expect(f.queue.queuedRequestCount).toBe(2)
 await vi.waitFor(()=>expect(retained.result.status).toBe('failed'),{timeout:500})
 expect(f.events).toEqual(['predecessor-started','predecessor-published','attempt-start']);expect(f.attempt).toHaveBeenCalledTimes(1);expect(f.source).not.toHaveBeenCalled();expect(String(retained.result.error)).toContain('stale/unsupported owner')
 expect(f.e.getOperations().some(op=>op.type==='stroke')).toBe(false);expect(cancelled).not.toHaveBeenCalled();expect(f.e['_wcAsyncError']).toBe(retained.result.error)
})
it('targeted cancellation of retained early-UP request leaves executing predecessor intact in actual Engine FIFO',async()=>{
 const f=await fixture(),cancelled=vi.fn();let retained:ReturnType<typeof retainPointerAdmission>
 f.queue.enqueue({execute:function*(){f.events.push('predecessor-started');retained.cancel();expect(f.queue.queuedRequestCount).toBe(1);yield 0;f.events.push('predecessor-published')},cancel:cancelled})
 retained=retainPointerAdmission(f.queue,f.context,sample(8),f.port,8);retained.end(sample(24))
 await vi.waitFor(()=>expect(f.queue.pending).toBe(false),{timeout:500});expect(retained.result.status).toBe('cancelled');expect(f.events).toEqual(['predecessor-started','predecessor-published']);expect(cancelled).not.toHaveBeenCalled();expect(f.attempt).not.toHaveBeenCalled();expect(f.source).not.toHaveBeenCalled();expect(f.e.getOperations().some(op=>op.type==='stroke')).toBe(false)
})
