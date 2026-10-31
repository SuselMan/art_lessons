import {afterEach,expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {TiledLayerBuffer} from './TiledLayerBuffer'
import {RibbonScratchPool} from './RibbonScratchPool'
import {attachContextStorage,snapshotContextStorage} from './ContextStorageOwner'
const box={minX:0,minY:0,maxX:4,maxY:4},two={...box,maxX:8}
function setup(limit:number){const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext;attachContextStorage(gl,{limitBytes:limit});return {mock,gl,layer:new TiledLayerBuffer(gl,4,4)}}
afterEach(()=>vi.restoreAllMocks())
it('reuses existing mip storage at its exact physical cap with no new GL allocation or second charge',()=>{
 const s=setup(84),buffer=s.layer.resolveForPaint(box)[0].buffer;buffer.ensureMipmaps()
 const upload=vi.spyOn(s.mock,'texImage2D');upload.mockClear()
 const result=s.layer.withPaintTargets(box,targets=>{expect(targets[0].buffer).toBe(buffer);expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:84,reservedBytes:0});return 7})
 expect(result).toBe(7);expect(upload).not.toHaveBeenCalled();s.layer.destroy()
 expect(snapshotContextStorage(s.gl).residentBytes).toBe(0)
})
it('materializes missing tile bytes from the exact same reservation beside resident mip storage',()=>{
 const s=setup(148),buffer=s.layer.resolveForPaint(box)[0].buffer;buffer.ensureMipmaps()
 s.layer.withPaintTargets(two,targets=>{expect(targets).toHaveLength(2);expect(targets[0].buffer).toBe(buffer);expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:148,reservedBytes:0})})
 s.layer.destroy();expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})
it('rejects the missing-byte plan before GL allocation and releases claims on resident tiles',()=>{
 const s=setup(147);s.layer.resolveForPaint(box)[0].buffer.ensureMipmaps()
 const upload=vi.spyOn(s.mock,'texImage2D');upload.mockClear()
 expect(()=>s.layer.withPaintTargets(two,()=>{})).toThrow('admission')
 expect(upload).not.toHaveBeenCalled();expect(s.layer.tileCount).toBe(1)
 expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:84,reservedBytes:0});s.layer.clear()
})
it('shares finite capacity with a prepared scratch acquisition without double charging either owner',()=>{
 const s=setup(192),pool=new RibbonScratchPool(s.gl);s.layer.resolveForPaint(box)
 const scratch=pool.prepareAcquisition([{width:4,height:4}])
 try{s.layer.withPaintTargets(two,()=>{const buffer=scratch.take(0);expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:192,reservedBytes:0});pool.release(buffer)})}
 finally{scratch.close();pool.destroy();s.layer.destroy()}
 expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})
it('hands the same reservation through actual evicted-tile recovery',()=>{
 const s=setup(576),session={readPixels:vi.fn(()=>new Uint8Array(64).fill(7)),destroy:vi.fn()}
 const layer=new TiledLayerBuffer(s.gl,4,4,()=>session,512)
 for(let x=0;x<9;x++)layer.resolveForPaint({minX:x*4,minY:0,maxX:x*4+1,maxY:1})
 expect(layer.evictedTileCount).toBe(1)
 layer.withPaintTargets(box,targets=>{expect(targets).toHaveLength(1);expect(snapshotContextStorage(s.gl).reservedBytes).toBe(0)})
 expect(session.readPixels).toHaveBeenCalledOnce();expect(session.destroy).toHaveBeenCalledOnce()
 layer.destroy();s.layer.destroy();expect(snapshotContextStorage(s.gl).residentBytes).toBe(0)
})
it('releases reservation and target retention after allocation or drawing failures',()=>{
 const s=setup(64),primary=new Error('clear failed');vi.spyOn(s.mock,'clear').mockImplementationOnce(()=>{throw primary})
 expect(()=>s.layer.withPaintTargets(box,()=>{})).toThrow(primary)
 expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0});expect(s.layer.tileCount).toBe(0)
 expect(()=>s.layer.withPaintTargets(box,()=>{expect(()=>s.layer.destroy()).toThrow('retained');throw Error('draw failed')})).toThrow('draw failed')
 s.layer.destroy();expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0})
})
it('rejects unsafe/unbounded geometry and stale resident storage before any GL allocation',()=>{
 const s=setup(64);s.layer.resolveForPaint(box)
 const upload=vi.spyOn(s.mock,'texImage2D');upload.mockClear()
 for(const bounds of [{...box,maxX:1e12},{...box,minX:NaN},{...box,minX:Number.MAX_SAFE_INTEGER-1,maxX:Number.MAX_SAFE_INTEGER}])expect(()=>s.layer.withPaintTargets(bounds,()=>{})).toThrow()
 AccumulationBuffer.forgetContextStorage(s.gl)
 expect(()=>s.layer.withPaintTargets(box,()=>{})).toThrow('Stale');expect(upload).not.toHaveBeenCalled();s.layer.destroy()
})
it('rejects a retained-target fanout overflow before allocating a missing tile',()=>{
 const s=setup(Infinity),targets=s.layer.resolveForPaint({minX:0,minY:0,maxX:256,maxY:4}),release=s.layer.retainTargets(targets)
 const upload=vi.spyOn(s.mock,'texImage2D');upload.mockClear()
 expect(()=>s.layer.withPaintTargets({minX:256,minY:0,maxX:260,maxY:4},()=>{})).toThrow('capacity')
 expect(upload).not.toHaveBeenCalled();release();s.layer.destroy()
})

it('reserves a sparse union once without allocating the distant gap or charging overlapping footprints twice',()=>{
 const s=setup(128),far={minX:4000000,minY:0,maxX:4000004,maxY:4}
 s.layer.withPaintTargetRects([box,box,far],targets=>{expect(targets.map(t=>t.originX)).toEqual([0,4000000]);expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:128,reservedBytes:0});expect(()=>s.layer.clear()).toThrow('retained')})
 expect(s.layer.tileCount).toBe(2);s.layer.destroy();expect(snapshotContextStorage(s.gl).residentBytes).toBe(0)
})
it('rejects a sparse union above the shared target bound before allocation, including individually small footprints',()=>{
 const s=setup(Infinity),upload=vi.spyOn(s.mock,'texImage2D');upload.mockClear()
 const bounds=Array.from({length:33},(_,i)=>({minX:i*16,minY:0,maxX:i*16+8,maxY:4}))
 expect(()=>s.layer.withPaintTargetRects(bounds,()=>{})).toThrow('fanout')
 expect(upload).not.toHaveBeenCalled();expect(s.layer.tileCount).toBe(0)
 s.layer.destroy()
})
it('protects early newly allocated sparse targets from eviction while later targets resolve in the same borrow',()=>{
 const s=setup(576),layer=new TiledLayerBuffer(s.gl,4,4,()=>({readPixels:()=>null,destroy:()=>{}}),512)
 const bounds=Array.from({length:9},(_,i)=>({minX:i*4,minY:0,maxX:i*4+1,maxY:1}))
 layer.withPaintTargetRects(bounds,targets=>{expect(targets).toHaveLength(9);expect(layer.evictedTileCount).toBe(0);for(const target of targets)expect(target.buffer.storageOwnerCurrent).toBe(true)})
 layer.destroy();s.layer.destroy();expect(snapshotContextStorage(s.gl).residentBytes).toBe(0)
})

it('recovers a sparse requested prefix in one shared rebuild session before any eviction of its results',()=>{
 const s=setup(640),session={readPixels:vi.fn(()=>new Uint8Array(64).fill(9)),destroy:vi.fn()},rebuild=vi.fn(()=>session)
 const layer=new TiledLayerBuffer(s.gl,4,4,rebuild,512)
 for(let x=0;x<10;x++)layer.resolveForPaint({minX:x*4,minY:0,maxX:x*4+1,maxY:1})
 expect(layer.evictedTileCount).toBe(2)
 layer.withPaintTargetRects([box,{minX:4,minY:0,maxX:8,maxY:4}],targets=>{expect(targets).toHaveLength(2);expect(targets.every(t=>t.buffer.storageOwnerCurrent)).toBe(true)})
 expect(rebuild).toHaveBeenCalledOnce();expect(session.readPixels).toHaveBeenCalledTimes(2);expect(session.destroy).toHaveBeenCalledOnce()
 layer.destroy();s.layer.destroy();expect(snapshotContextStorage(s.gl).residentBytes).toBe(0)
})

it('prepares sparse resident/new storage without GL then materializes one tile per explicit take',()=>{
 const s=setup(192);const original=s.layer.resolveForPaint(box)[0].buffer,upload=vi.spyOn(s.mock,'texImage2D');upload.mockClear()
 const plan=s.layer.preparePaintTargetRects([two,{minX:400,maxX:404,minY:0,maxY:4}])
 expect(upload).not.toHaveBeenCalled();expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:64,reservedBytes:128})
 expect(plan.take(0).buffer).toBe(original);expect(upload).not.toHaveBeenCalled()
 plan.take(1);expect(upload).toHaveBeenCalledTimes(1);expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:128,reservedBytes:64})
 expect(()=>s.layer.clear()).toThrow('retained');plan.close();plan.close();s.layer.destroy()
 expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0});expect(()=>plan.take(2)).toThrow('Stale')
})
it('rejects cooperative historical recovery before reservation or replay while preserving synchronous recovery',()=>{
 const s=setup(640),rebuild=vi.fn(()=>({readPixels:()=>null,destroy:()=>{}})),layer=new TiledLayerBuffer(s.gl,4,4,rebuild,512)
 for(let x=0;x<9;x++)layer.resolveForPaint({minX:x*4,minY:0,maxX:x*4+1,maxY:1})
 const before=snapshotContextStorage(s.gl),upload=vi.spyOn(s.mock,'texImage2D');upload.mockClear()
 expect(()=>layer.preparePaintTargetRects([box])).toThrow('recovery required');expect(rebuild).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();expect(snapshotContextStorage(s.gl)).toEqual(before)
 layer.withPaintTargets(box,()=>{});expect(rebuild).toHaveBeenCalledOnce();layer.destroy();s.layer.destroy()
})
it('blocks ordinary writers on pending new storage before GL and releases the pin after cancellation',()=>{
 const s=setup(128),plan=s.layer.preparePaintTargetRects([box]),upload=vi.spyOn(s.mock,'texImage2D');upload.mockClear()
 for(const write of [()=>s.layer.resolveForPaint(box),()=>s.layer.withPaintTargets(box,()=>{})])expect(write).toThrow('pending storage')
 expect(upload).not.toHaveBeenCalled();expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:64})
 plan.close();s.layer.resolveForPaint(box);s.layer.destroy()
})
it('keeps resident storage pins distinct from short draw leases across unrelated trimming',()=>{
 const s=setup(640),layer=new TiledLayerBuffer(s.gl,4,4,()=>({readPixels:()=>null,destroy:()=>{}}),512),target=layer.resolveForPaint(box)[0]
 const plan=layer.preparePaintTargetRects([box]),release=layer.retainTargets([target]);release()
 for(let i=1;i<10;i++)layer.resolveForPaint({minX:i*4,minY:0,maxX:i*4+1,maxY:1})
 expect(plan.take(0).buffer).toBe(target.buffer);expect(target.buffer.storageOwnerCurrent).toBe(true)
 expect(()=>layer.clear()).toThrow('retained');plan.close();layer.clear();s.layer.destroy()
})
it('rejects a retired ledger between cooperative steps and closes every storage pin',()=>{
 const s=setup(128),plan=s.layer.preparePaintTargetRects([two]);plan.take(0)
 AccumulationBuffer.forgetContextStorage(s.gl)
 expect(()=>plan.take(1)).toThrow();plan.close();expect(()=>s.layer.clear()).not.toThrow()
})
it('releases all cooperative pins on physical admission failure or an unpublished clear failure',()=>{
 const denied=setup(63)
 expect(()=>denied.layer.preparePaintTargetRects([box])).toThrow('admission');expect(denied.layer['retainedTargets'].size).toBe(0);denied.layer.destroy()
 const s=setup(64),primary=new Error('candidate clear'),plan=s.layer.preparePaintTargetRects([box])
 vi.spyOn(s.mock,'clear').mockImplementationOnce(()=>{throw primary})
 expect(()=>plan.take(0)).toThrow(primary);expect(s.layer.tileCount).toBe(0)
 plan.close();expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:0,reservedBytes:0});expect(()=>s.layer.destroy()).not.toThrow()
})
it('validates every retained identity before incrementing an earlier valid draw lease',()=>{
 const s=setup(128),targets=s.layer.resolveForPaint(two),stale=targets[1]
 s.layer['retainedTargets'].set('1,0',{buffer:undefined,count:0,storagePins:1})
 expect(()=>s.layer.retainTargets(targets)).toThrow('stale')
 expect(s.layer['retainedTargets'].has('0,0')).toBe(false)
 s.layer['retainedTargets'].delete('1,0');expect(stale.buffer.storageOwnerCurrent).toBe(true);s.layer.destroy()
})
