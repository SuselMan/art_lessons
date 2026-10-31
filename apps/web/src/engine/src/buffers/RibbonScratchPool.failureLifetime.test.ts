import {afterEach,expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {RibbonScratchPool} from './RibbonScratchPool'
import {snapshotContextStorage} from './ContextStorageOwner'
afterEach(()=>vi.restoreAllMocks())
function setup(){const gl=new MockGL() as unknown as WebGLRenderingContext;return {gl,pool:new RibbonScratchPool(gl)}}
function failOneRetirement(){const original=AccumulationBuffer.prototype.destroy,primary=new Error('pool child cleanup failed');let failed=false
 const retire=vi.spyOn(AccumulationBuffer.prototype,'destroy').mockImplementation(function(this:AccumulationBuffer){original.call(this);if(!failed){failed=true;throw primary}})
 return {primary,retire}}
it('retires every idle buffer once after one destroy fails while outstanding borrowers remain separately owned',()=>{
 const {gl,pool}=setup(),a=pool.acquire(4,4),b=pool.acquire(8,4),live=pool.acquire(2,2);pool.release(a);pool.release(b)
 const {primary,retire}=failOneRetirement()
 expect(()=>pool.destroy()).toThrow(primary);expect(pool.gpuAllocationSnapshot()).toEqual([])
 expect(retire.mock.contexts.filter(value=>value===a)).toHaveLength(1);expect(retire.mock.contexts.filter(value=>value===b)).toHaveLength(1)
 expect(retire.mock.contexts.some(value=>value===live)).toBe(false)
 pool.destroy();expect(retire).toHaveBeenCalledTimes(2)
 live.destroy();expect(snapshotContextStorage(gl).residentBytes).toBe(0)
})
it('trims every idle buffer after a child fault while preserving a separate prepared acquisition',()=>{
 const {gl,pool}=setup(),a=pool.acquire(4,4),b=pool.acquire(8,4),c=pool.acquire(12,4);pool.release(a);pool.release(b);pool.release(c)
 const plan=pool.prepareAcquisition([{width:4,height:4}]),{primary,retire}=failOneRetirement()
 expect(()=>pool.trimFree()).toThrow(primary)
 expect(pool.bytes).toEqual({live:64,free:0});expect(pool.gpuAllocationSnapshot()).toHaveLength(1)
 expect(retire.mock.contexts.filter(value=>value===b)).toHaveLength(1);expect(retire.mock.contexts.filter(value=>value===c)).toHaveLength(1)
 expect(retire.mock.contexts.some(value=>value===a)).toBe(false)
 expect(plan.take(0)).toBe(a);plan.close();pool.release(a);pool.destroy()
 expect(snapshotContextStorage(gl).residentBytes).toBe(0)
})
it('continues trimming both overfull size classes and detaches every retired entry before a child fault',()=>{
 const {gl,pool}=setup();pool.holding=true
 const buffers=[...Array.from({length:26},()=>pool.acquire(4,4)),...Array.from({length:26},()=>pool.acquire(8,4))]
 for(const buffer of buffers)pool.release(buffer);pool.holding=false
 const {primary,retire}=failOneRetirement()
 expect(()=>pool.trimToCeiling()).toThrow(primary)
 expect(pool.bytes).toEqual({live:0,free:24*64+24*128});expect(pool.gpuAllocationSnapshot()).toHaveLength(48)
 expect(retire).toHaveBeenCalledTimes(4);pool.trimToCeiling();expect(retire).toHaveBeenCalledTimes(4)
 pool.destroy();expect(snapshotContextStorage(gl).residentBytes).toBe(0)
})
it('consumes an over-ceiling release even if driver cleanup throws rather than leaving a retired live entry',()=>{
 const {gl,pool}=setup(),buffers=Array.from({length:25},()=>pool.acquire(4,4))
 for(const buffer of buffers.slice(0,24))pool.release(buffer)
 const {primary}=failOneRetirement(),last=buffers[24]
 expect(()=>pool.release(last)).toThrow(primary)
 expect(pool.gpuAllocationSnapshot()).toHaveLength(24)
 expect(()=>pool.release(last)).toThrow('Unknown or already released')
 pool.destroy();expect(snapshotContextStorage(gl).residentBytes).toBe(0)
})
