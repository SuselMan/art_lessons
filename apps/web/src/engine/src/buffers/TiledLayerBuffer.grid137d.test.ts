import{expect,it}from'vitest'
import{MockGL}from'../../testing/mockGL'
import{TiledLayerBuffer,LayerTilesNotReady,type TileRebuilder}from'./TiledLayerBuffer'
const gl=()=>new MockGL()as unknown as WebGLRenderingContext
const rect=(x:number)=>({minX:x*8,minY:0,maxX:x*8+8,maxY:8})
it('pins only touched destination keys, refcounts overlapping leases and ignores stale-generation release',()=>{
 const rebuild:TileRebuilder=()=>({readPixels:()=>null,destroy:()=>{}}),b=new TiledLayerBuffer(gl(),8,8,rebuild,8*8*4*8)
 const original=b.resolveForPaint(rect(0))[0],a=b.pinGridDestinations([original]),same=b.pinGridDestinations([original])
 for(let x=1;x<13;x++)b.resolveForPaint(rect(x))
 a.release();same.assertCurrent();expect(b.resolveVisible(rect(0))[0].buffer).toBe(original.buffer)
 b.clear();const replacement=b.resolveForPaint(rect(0))[0],fresh=b.pinGridDestinations([replacement]);same.release();fresh.assertCurrent();fresh.release();b.destroy()
})
it('a refused tile recovery stays evicted, display retains residents, full/source/write reads never claim partial complete',()=>{
 let attempts=0
 const b=new TiledLayerBuffer(gl(),8,8,()=>{attempts++;return{kind:'notReady',reason:'resource',retryKey:'busy'}},8*8*4*8)
 for(let x=0;x<10;x++)b.resolveForPaint(rect(x))
 const evicted=b.evictedTileCount
 expect(b.resolveVisible(rect(0))).toEqual([]);expect(attempts).toBe(1);expect(b.evictedTileCount).toBe(evicted)
 expect(()=>b.allResident()).toThrow(LayerTilesNotReady);expect(()=>b.resolveForPaint(rect(0))).toThrow(LayerTilesNotReady);expect(attempts).toBe(1)
 expect(b.gridBeginTargets()).toBeUndefined();b.destroy()
})
