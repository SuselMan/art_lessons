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
