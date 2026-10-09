import {afterEach,it,expect,vi} from 'vitest'
import {DiagnosticPassTimestamps} from './diagnosticPassTimestamps'
afterEach(()=>vi.unstubAllGlobals())
function fixture(capacity=4){
 vi.stubGlobal('GPUBufferUsage',{QUERY_RESOLVE:1,COPY_SRC:2,COPY_DST:4,MAP_READ:8});vi.stubGlobal('GPUMapMode',{READ:1})
 const queryDestroy=vi.fn(),events:string[]=[],buffers:Array<{destroy:ReturnType<typeof vi.fn>}>=[]
 const resolveQuerySet=vi.fn(),submit=vi.fn(),mapAsync=vi.fn(async()=>{})
 let lose!:()=>void
 const device={lost:new Promise<void>(resolve=>{lose=resolve}),features:new Set(['timestamp-query']),createQuerySet:vi.fn(()=>({destroy:queryDestroy})),createBuffer:vi.fn(({size}:{size:number})=>{const b={destroy:vi.fn(),mapAsync,getMappedRange:()=>new ArrayBuffer(size)};buffers.push(b);return b}),createCommandEncoder:()=>({resolveQuerySet,copyBufferToBuffer:vi.fn(),finish:()=>({})}),queue:{submit}}
 const encoder={beginComputePass:vi.fn((d:unknown)=>{events.push('compute');return d}),beginRenderPass:vi.fn((d:unknown)=>{events.push('render');return d}),finish:vi.fn(()=>{events.push('finish');return'commands'})}
 const recorder=new DiagnosticPassTimestamps(device as unknown as GPUDevice,capacity)
 return{lose,recorder,encoder,device,submit,mapAsync,resolveQuerySet,queryDestroy,buffers,events}
}
it('preserves ordered original calls and descriptor; no hot submit/map/resolve',()=>{
 const f=fixture(),d={label:'compute'},q=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder)
 q.encoder.beginComputePass(d);q.encoder.beginRenderPass({colorAttachments:[]});expect(q.encoder.finish()).toBe('commands');q.commit()
 expect(f.events).toEqual(['compute','render','finish']);expect(d).toEqual({label:'compute'});expect(f.encoder.beginComputePass.mock.calls[0][0]).toMatchObject({label:'compute',timestampWrites:{beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}})
 expect(f.submit).not.toHaveBeenCalled();expect(f.mapAsync).not.toHaveBeenCalled();expect(f.resolveQuerySet).not.toHaveBeenCalled();expect(f.device.createBuffer).not.toHaveBeenCalled();f.recorder.destroy();expect(f.queryDestroy).toHaveBeenCalledOnce()
})
it('resolves only committed slots after input and destroys query/buffers',async()=>{
 const f=fixture(),abandoned=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder);abandoned.encoder.beginComputePass();abandoned.abort()
 const q=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder);q.encoder.beginComputePass({label:'actual'});q.commit()
 const result=await f.recorder.readAfterInput();expect(result).toEqual([{index:1,kind:'compute',label:'actual',quantum:2,nanoseconds:'0'}]);expect(f.resolveQuerySet).toHaveBeenCalledExactlyOnceWith(expect.anything(),2,2,expect.anything(),256);expect(f.submit).toHaveBeenCalledOnce();expect(f.mapAsync).toHaveBeenCalledOnce();for(const b of f.buffers)expect(b.destroy).toHaveBeenCalledOnce();expect(f.queryDestroy).toHaveBeenCalledOnce();await expect(f.recorder.readAfterInput()).rejects.toThrow('closed')
})
it('bounds capture and refuses competing timestamp descriptors',()=>{const f=fixture(1),q=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder);q.encoder.beginComputePass();expect(()=>q.encoder.beginComputePass()).toThrow('capacity');q.abort();f.recorder.destroy();expect(()=>f.recorder.begin(f.encoder as unknown as GPUCommandEncoder)).toThrow('closed')})
it('refuses read while encoding and leaves existing timestamp descriptors untouched',async()=>{const f=fixture(),q=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder);const d={timestampWrites:{querySet:{} as GPUQuerySet,beginningOfPassWriteIndex:0}};expect(()=>q.encoder.beginComputePass(d)).toThrow('already instrumented');expect(f.encoder.beginComputePass).not.toHaveBeenCalled();await expect(f.recorder.readAfterInput()).rejects.toThrow('encoding');expect(f.device.createBuffer).not.toHaveBeenCalled();q.abort();q.abort();expect(await f.recorder.readAfterInput()).toEqual([]);expect(f.queryDestroy).toHaveBeenCalledOnce()})
it('does not resolve a pass rejected by the original encoder even when caller catches it',async()=>{const f=fixture(),q=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder);f.encoder.beginComputePass.mockImplementationOnce(()=>{throw Error('original pass failed')});expect(()=>q.encoder.beginComputePass()).toThrow('original pass failed');q.commit();expect(await f.recorder.readAfterInput()).toEqual([]);expect(f.resolveQuerySet).not.toHaveBeenCalled();expect(f.submit).not.toHaveBeenCalled()})
it('map rejection and disposal during read clean every resource',async()=>{for(const disposed of [false,true]){const f=fixture(),q=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder);q.encoder.beginComputePass();q.commit();f.mapAsync.mockImplementationOnce(async()=>{if(disposed)f.recorder.destroy();else throw Error('device lost')});await expect(f.recorder.readAfterInput()).rejects.toThrow(disposed?'disposed':'device lost');for(const b of f.buffers)expect(b.destroy).toHaveBeenCalledOnce();expect(f.queryDestroy).toHaveBeenCalledOnce()}})

it('device loss closes capture and destroys its query pool without readback',async()=>{const f=fixture();f.lose();await Promise.resolve();expect(f.queryDestroy).toHaveBeenCalledOnce();expect(()=>f.recorder.begin(f.encoder as unknown as GPUCommandEncoder)).toThrow('closed');expect(f.submit).not.toHaveBeenCalled();expect(f.device.createBuffer).not.toHaveBeenCalled()})
it('discarded empty candidate slots are never resolved or reused',async()=>{const f=fixture(),empty=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder);empty.encoder.beginComputePass();expect(()=>f.recorder.discardRecordedRows()).toThrow();empty.commit();f.recorder.discardRecordedRows();const actual=f.recorder.begin(f.encoder as unknown as GPUCommandEncoder);actual.encoder.beginComputePass({label:'actual nonempty'});actual.commit();const rows=await f.recorder.readAfterInput();expect(rows).toHaveLength(1);expect(rows[0].index).toBe(1);expect(f.resolveQuerySet).toHaveBeenCalledExactlyOnceWith(expect.anything(),2,2,expect.anything(),256);expect(f.submit).toHaveBeenCalledOnce();expect(()=>f.recorder.discardRecordedRows()).toThrow()})
