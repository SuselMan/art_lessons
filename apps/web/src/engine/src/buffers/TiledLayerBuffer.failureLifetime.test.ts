import {afterEach,expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {TiledLayerBuffer} from './TiledLayerBuffer'
import {snapshotContextStorage} from './ContextStorageOwner'
const rect=(x:number)=>({minX:x*4,minY:0,maxX:x*4+1,maxY:1})
afterEach(()=>vi.restoreAllMocks())
it('retires an unpublished new tile after clear fails',()=>{
 const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4)
 const primary=new Error('clear failed');vi.spyOn(mock,'clear').mockImplementationOnce(()=>{throw primary})
 expect(()=>layer.resolveForPaint(rect(0))).toThrow(primary)
 expect(layer.tileCount).toBe(0);expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:0,reservedBytes:0})
 layer.destroy()
})
it('releases a failed recovery candidate and always closes its rebuild session, preserving the read error',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,primary=new Error('rebuild read failed'),cleanup=new Error('rebuild cleanup failed')
 const session={readPixels:vi.fn(()=>{throw primary}),destroy:vi.fn(()=>{throw cleanup})}
 const layer=new TiledLayerBuffer(gl,4,4,()=>session,8*64)
 for(let x=0;x<9;x++)layer.resolveForPaint(rect(x))
 expect(layer.evictedTileCount).toBe(1)
 const before=snapshotContextStorage(gl).residentBytes
 expect(()=>layer.resolveVisible(rect(0))).toThrow(primary)
 expect(session.destroy).toHaveBeenCalledOnce();expect(layer.evictedTileCount).toBe(1)
 expect(snapshotContextStorage(gl).residentBytes).toBe(before)
 layer.destroy();expect(snapshotContextStorage(gl).residentBytes).toBe(0)
})
it('retires all fine and coarse allocations once when one child retirement throws',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4,undefined,Infinity,()=>{})
 layer.resolveForPaint(rect(0));layer.resolveForPaint(rect(1));layer.resolveCoarse({minX:0,minY:0,maxX:8,maxY:4},2)
 const owned=layer.gpuAllocationSnapshot().map(row=>row.buffer),original=AccumulationBuffer.prototype.destroy,primary=new Error('first child cleanup failed')
 let failed=false
 const retire=vi.spyOn(AccumulationBuffer.prototype,'destroy').mockImplementation(function(this:AccumulationBuffer){original.call(this);if(!failed){failed=true;throw primary}})
 expect(()=>layer.destroy()).toThrow(primary)
 expect(layer.gpuAllocationSnapshot()).toEqual([]);expect(layer.tileCount).toBe(0)
 for(const buffer of owned)expect(retire.mock.contexts.filter(value=>value===buffer)).toHaveLength(1)
 layer.destroy();for(const buffer of owned)expect(retire.mock.contexts.filter(value=>value===buffer)).toHaveLength(1)
 expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})

it('preserves successfully recovered content and its coarse debt if a later tile in the same session fails',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,primary=new Error('second tile unavailable'),fold=vi.fn()
 const session={readPixels:vi.fn((bounds:{minX:number})=>{if(bounds.minX===4)throw primary;return new Uint8Array(64).fill(7)}),destroy:vi.fn()}
 const layer=new TiledLayerBuffer(gl,4,4,()=>session,8*64,fold)
 for(let x=0;x<10;x++)layer.resolveForPaint(rect(x))
 layer.resolveCoarse({minX:0,minY:0,maxX:40,maxY:4},2);fold.mockClear()
 expect(()=>layer.resolveVisible({minX:0,minY:0,maxX:8,maxY:1})).toThrow(primary)
 expect(session.destroy).toHaveBeenCalledOnce();expect(layer.evictedTileCount).toBe(1)
 layer.resolveCoarse({minX:0,minY:0,maxX:8,maxY:4},2)
 expect(fold).toHaveBeenCalledOnce()
 layer.destroy();expect(snapshotContextStorage(gl).residentBytes).toBe(0)
})
it('retires an unpublished coarse tile when its initial clear fails',()=>{
 const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext,layer=new TiledLayerBuffer(gl,4,4,undefined,Infinity,()=>{})
 layer.resolveForPaint(rect(0));const before=snapshotContextStorage(gl).residentBytes,primary=new Error('coarse clear failed')
 vi.spyOn(mock,'clear').mockImplementationOnce(()=>{throw primary})
 expect(()=>layer.resolveCoarse(rect(0),2)).toThrow(primary)
 expect(snapshotContextStorage(gl).residentBytes).toBe(before)
 expect(layer.gpuAllocationSnapshot()).toHaveLength(1)
 layer.destroy()
})

it('marks a retired eviction victim recoverable before a throwing child cleanup can leave a dead resident name',()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,session={readPixels:vi.fn(()=>new Uint8Array(64).fill(9)),destroy:vi.fn()}
 const layer=new TiledLayerBuffer(gl,4,4,()=>session,8*64)
 const victim=layer.resolveForPaint(rect(0))[0].buffer
 for(let x=1;x<8;x++)layer.resolveForPaint(rect(x))
 const original=victim.destroy.bind(victim),primary=new Error('eviction retirement failed')
 vi.spyOn(victim,'destroy').mockImplementationOnce(()=>{original();throw primary})
 expect(()=>layer.resolveForPaint(rect(8))).toThrow(primary)
 expect(layer.evictedTileCount).toBe(1);expect(layer.tileCount).toBe(8)
 const recovered=layer.resolveVisible(rect(0))[0].buffer
 expect(recovered).not.toBe(victim);expect(recovered.storageByteLength).toBe(64)
 expect(session.readPixels).toHaveBeenCalledOnce();expect(session.destroy).toHaveBeenCalledOnce()
 layer.destroy();expect(snapshotContextStorage(gl).residentBytes).toBe(0)
})
