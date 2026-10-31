import {expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {RibbonScratchPool} from './RibbonScratchPool'
import {attachAccumStorage,snapshotAccumStorage} from './ContextStorageOwner'
function setup(limit:number){const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext;attachAccumStorage(gl,{limitBytes:limit});return {mock,gl,pool:new RibbonScratchPool(gl)}}
it('reuses resident idle mip storage at an exact finite cap with no second reservation or GL allocation',()=>{
 const s=setup(84),buffer=s.pool.acquire(4,4);buffer.ensureMipmaps();s.pool.release(buffer)
 const allocate=vi.spyOn(s.gl,'texImage2D');allocate.mockClear()
 const plan=s.pool.prepareAcquisition([{width:4,height:4}])
 expect(snapshotAccumStorage(s.gl)).toMatchObject({residentBytes:84,reservedBytes:0})
 expect(allocate).not.toHaveBeenCalled();expect(plan.take(0)).toBe(buffer);plan.close()
 s.pool.release(buffer);s.pool.destroy();expect(snapshotAccumStorage(s.gl).residentBytes).toBe(0)
})
it('hands the SAME missing-byte reservation to actual allocation while resident reuse stays charged once',()=>{
 const s=setup(128),idle=s.pool.acquire(4,4);s.pool.release(idle)
 const plan=s.pool.prepareAcquisition([{width:4,height:4},{width:4,height:4}])
 expect(snapshotAccumStorage(s.gl)).toMatchObject({residentBytes:64,reservedBytes:64})
 expect(plan.take(0)).toBe(idle);const fresh=plan.take(1)
 expect(snapshotAccumStorage(s.gl)).toMatchObject({residentBytes:128,reservedBytes:0})
 plan.close();s.pool.release(idle);s.pool.release(fresh);s.pool.destroy()
 expect(snapshotAccumStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})
it('denies a whole plan before GL storage and returns every claimed idle match',()=>{
 const s=setup(64),idle=s.pool.acquire(4,4);s.pool.release(idle)
 const allocate=vi.spyOn(s.gl,'texImage2D');allocate.mockClear()
 expect(()=>s.pool.prepareAcquisition([{width:4,height:4},{width:4,height:4}])).toThrow('admission')
 expect(allocate).not.toHaveBeenCalled();expect(s.pool.bytes).toEqual({live:0,free:64})
 expect(s.pool.acquire(4,4)).toBe(idle);s.pool.release(idle);s.pool.destroy()
})
it('prevents overlapping plans from aliasing the same idle allocation and cancellation releases only untaken claims',()=>{
 const s=setup(128),idle=s.pool.acquire(4,4);s.pool.release(idle)
 const first=s.pool.prepareAcquisition([{width:4,height:4}]),second=s.pool.prepareAcquisition([{width:4,height:4}])
 expect(snapshotAccumStorage(s.gl).reservedBytes).toBe(64)
 const a=first.take(0),b=second.take(0);expect(a).not.toBe(b)
 first.close();second.close();expect(s.pool.bytes).toEqual({live:128,free:0})
 s.pool.release(a);s.pool.release(b)
 const cancelled=s.pool.prepareAcquisition([{width:4,height:4},{width:4,height:4}]);cancelled.close();cancelled.close()
 expect(s.pool.bytes).toEqual({live:0,free:128});expect(()=>cancelled.take(0)).toThrow('stale')
 s.pool.destroy()
})
it('retires an allocation-failed plan and its remaining promise without retrying uncertain driver storage',()=>{
 const s=setup(64),plan=s.pool.prepareAcquisition([{width:4,height:4}])
 vi.spyOn(s.gl,'createTexture').mockImplementationOnce(()=>{throw new Error('Buffer texture allocation failed')})
 expect(()=>plan.take(0)).toThrow('allocation failed')
 expect(snapshotAccumStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0})
 expect(()=>plan.take(0)).toThrow('stale');plan.close();expect(s.pool.bytes).toEqual({live:0,free:0})
 s.pool.destroy()
})
it('rejects a stale pool plan and destroys its still-owned held buffers after ordinary pool teardown',()=>{
 const s=setup(64),idle=s.pool.acquire(4,4);s.pool.release(idle)
 const plan=s.pool.prepareAcquisition([{width:4,height:4}]);s.pool.destroy()
 expect(()=>plan.take(0)).toThrow('stale');plan.close()
 expect(idle.storageByteLength).toBe(0);expect(snapshotAccumStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})
it('forgets a lost-context plan without GL deletes and does not return old-owner buffers to a new context',()=>{
 const s=setup(64),idle=s.pool.acquire(4,4);s.pool.release(idle)
 const plan=s.pool.prepareAcquisition([{width:4,height:4}]),del=vi.spyOn(s.gl,'deleteTexture');del.mockClear()
 s.pool.forget();AccumulationBuffer.forgetContextStorage(s.gl);plan.close()
 expect(del).not.toHaveBeenCalled();expect(s.pool.gpuAllocationSnapshot()).toEqual([])
 const fresh=s.pool.acquire(4,4);expect(fresh).not.toBe(idle);s.pool.release(fresh);s.pool.destroy()
})
it('rejects invalid requests before changing pool ownership, including sparse input and explicit null policies',()=>{
 const s=setup(64),idle=s.pool.acquire(4,4);s.pool.release(idle)
 for(const requests of [[],Array(2),[{width:4,height:4},{width:0,height:4}],[{width:4,height:4,filter:null}],[{width:4,height:4,pixelEncoding:null}]]) {
  expect(()=>s.pool.prepareAcquisition(requests as never)).toThrow();expect(s.pool.bytes).toEqual({live:0,free:64})
 }
 s.pool.destroy()
})

it('retires held storage from a stale context owner even if the pool has not yet been forgotten',()=>{
 const s=setup(64),idle=s.pool.acquire(4,4);s.pool.release(idle)
 const plan=s.pool.prepareAcquisition([{width:4,height:4}]),del=vi.spyOn(s.gl,'deleteTexture');del.mockClear()
 AccumulationBuffer.forgetContextStorage(s.gl)
 expect(()=>plan.take(0)).toThrow('reservation');expect(del).not.toHaveBeenCalled()
 expect(s.pool.gpuAllocationSnapshot()).toEqual([]);plan.close()
 const fresh=s.pool.acquire(4,4);expect(fresh).not.toBe(idle);s.pool.release(fresh);s.pool.destroy()
})
it('preserves uncertain driver storage as an orphan charge and prevents retry after failed cleanup',()=>{
 const s=setup(64),plan=s.pool.prepareAcquisition([{width:4,height:4}]),error=vi.spyOn(s.gl,'getError')
 error.mockReturnValueOnce(0).mockReturnValueOnce(1285)
 vi.spyOn(s.gl,'deleteTexture').mockImplementationOnce(()=>{throw new Error('driver deletion failed')})
 expect(()=>plan.take(0)).toThrow('texture allocation GL error')
 expect(snapshotAccumStorage(s.gl)).toMatchObject({residentBytes:64,orphanBytes:64,reservedBytes:0})
 expect(()=>plan.take(0)).toThrow('stale');expect(()=>s.pool.prepareAcquisition([{width:4,height:4}])).toThrow('admission')
 plan.close();s.pool.destroy();AccumulationBuffer.forgetContextStorage(s.gl)
})

it('transfers an admitted idle scratch exactly once without GL and leaves a missing slot reserved',()=>{
 const s=setup(128),idle=s.pool.acquire(4,4);s.pool.release(idle)
 const plan=s.pool.prepareAcquisition([{width:4,height:4},{width:4,height:4}]),upload=vi.spyOn(s.gl,'texImage2D'),query=vi.spyOn(s.gl,'getParameter');upload.mockClear();query.mockClear()
 try{
  const before=snapshotAccumStorage(s.gl)
  expect(plan.takeResident(1)).toBeUndefined();expect(snapshotAccumStorage(s.gl)).toEqual(before)
  expect(plan.takeResident(0)).toBe(idle);expect(upload).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled()
  expect(()=>plan.takeResident(0)).toThrow();expect(()=>plan.take(0)).toThrow()
 }finally{plan.close();s.pool.release(idle);s.pool.destroy()}
 expect(()=>plan.takeResident(1)).toThrow()
})
it('rejects stale held scratch metadata instead of returning healthy-missing undefined',()=>{
 const s=setup(128),idle=s.pool.acquire(4,4);s.pool.release(idle)
 const plan=s.pool.prepareAcquisition([{width:4,height:4},{width:4,height:4}]),upload=vi.spyOn(s.gl,'texImage2D');upload.mockClear()
 try{expect(typeof plan.takeResident).toBe('function');AccumulationBuffer.forgetContextStorage(s.gl);expect(()=>plan.takeResident(0)).toThrow();expect(()=>plan.takeResident(1)).toThrow();expect(upload).not.toHaveBeenCalled()}
 finally{plan.close();s.pool.destroy()}
})
