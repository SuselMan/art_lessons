import{describe,it,expect,vi}from'vitest'
import{compactHistoricalLayer}from'./HistoricalProjectionSource'
import type{AccumulationBuffer}from'./AccumulationBuffer'
import type{PaintTarget}from'./ILayerBuffer'
const gl={}as WebGLRenderingContext
function storage(width:number,height:number,material=false){
 const pixels=Uint8Array.from({length:width*height*4},(_,i)=>(i*37+11)%256)
 const destroy=vi.fn(),copyRegionInto=vi.fn((dest:AccumulationBuffer,sx:number,sy:number,dx:number,dy:number,w:number,h:number)=>{
  const to=dest as unknown as {pixels:Uint8Array;width:number}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++)to.pixels[((dy+y)*to.width+dx+x)*4+c]=pixels[((sy+y)*width+sx+x)*4+c]
 })
 return{width,height,baseBytes:width*height*4*(material?3:1),gl,pixels,destroy,copyRegionInto}
}
const tile=(buffer:ReturnType<typeof storage>,originX:number,originY:number,contentRect:PaintTarget['contentRect']):PaintTarget=>({buffer:buffer as unknown as AccumulationBuffer,originX,originY,contentRect})
function fixture(tiles:PaintTarget[]){const allocated:ReturnType<typeof storage>[]=[],allocate=vi.fn((_source:AccumulationBuffer,w:number,h:number)=>{const s=storage(w,h);allocated.push(s);return s as unknown as AccumulationBuffer});return{fresh:{allResident:vi.fn(()=>tiles)},allocate,allocated}}
function caught(work:()=>unknown){let failed=false,value:unknown='not thrown';try{work()}catch(error){failed=true;value=error}return{failed,value}}
describe('full historical source conservative compaction',()=>{
 it('preserves every occupied texel at negative/asymmetric origin with exact lower-left copy and transparent outside',()=>{
  const original=storage(8,6),f=fixture([tile(original,-10,20,{minX:-8,minY:21,maxX:-5,maxY:25})]),r=compactHistoricalLayer(f.fresh,f.allocate)!
  expect(r.bytes).toBe(3*4*4);expect(original.copyRegionInto).toHaveBeenCalledWith(f.allocated[0],2,1,0,0,3,4)
  const t=r.buffer.allResident()[0];expect([t.originX,t.originY,t.buffer.width,t.buffer.height]).toEqual([-8,21,3,4]);expect(t.contentRect).toEqual({minX:-8,minY:21,maxX:-5,maxY:25})
  for(let y=21;y<25;y++)for(let x=-8;x<-5;x++)for(let c=0;c<4;c++){
   const expected=original.pixels[((6-1-(y-20))*8+x+10)*4+c]
   expect(f.allocated[0].pixels[((4-1-(y-21))*3+x+8)*4+c]).toBe(expected)
  }
  expect(r.buffer.resolveVisible({minX:-9,minY:21,maxX:-8,maxY:25})).toEqual([]);expect(r.buffer.resolveVisible({minX:-5,minY:21,maxX:-4,maxY:25})).toEqual([])
  expect(r.buffer.resolveVisible({minX:-8,minY:20,maxX:-5,maxY:21})).toEqual([]);expect(r.buffer.resolveVisible({minX:-8,minY:25,maxX:-5,maxY:26})).toEqual([])
  expect(r.buffer.resolveVisible({minX:-8,minY:21,maxX:-7,maxY:22})).toHaveLength(1)
  expect(t.projectionSourceRect).toEqual({minX:-10,minY:20,maxX:-2,maxY:26});expect(Object.isFrozen(t.projectionSourceRect)).toBe(true);expect(Object.isFrozen(t)).toBe(true);expect(Object.isFrozen(t.contentRect)).toBe(true);const out=r.buffer.allResident();out.length=0;expect(r.buffer.allResident()).toHaveLength(1)
  expect(original.destroy).not.toHaveBeenCalled();r.buffer.destroy();expect(f.allocated[0].destroy).toHaveBeenCalledOnce();expect(()=>r.buffer.allResident()).toThrow('retired')
 })
 it('retains the entire conservative box rather than the current query ROI, with independent multi-tile origins',()=>{
  const a=storage(6,5),b=storage(7,3),f=fixture([tile(a,0,-10,{minX:-2,minY:-12,maxX:2,maxY:-6}),tile(b,6,-10,{minX:11,minY:-9,maxX:13,maxY:-7})]),r=compactHistoricalLayer(f.fresh,f.allocate)!
  expect(r.bytes).toBe((2*4+2*2)*4);expect(a.copyRegionInto.mock.calls[0].slice(1)).toEqual([0,1,0,0,2,4]);expect(b.copyRegionInto.mock.calls[0].slice(1)).toEqual([5,0,0,0,2,2])
  r.buffer.resolveVisible({minX:0,minY:-10,maxX:1,maxY:-9});expect(r.buffer.resolveVisible({minX:12,minY:-8,maxX:13,maxY:-7})).toHaveLength(1);expect(r.buffer.allResident()).toHaveLength(2);r.buffer.destroy()
 })
 it('null content is empty, not full; empty copies allocate nothing and account zero',()=>{
  const a=storage(9,7),f=fixture([tile(a,0,0,null)]),r=compactHistoricalLayer(f.fresh,f.allocate)!
  expect(r.bytes).toBe(0);expect(r.buffer.allResident()).toEqual([]);expect(f.allocate).not.toHaveBeenCalled();expect(a.destroy).not.toHaveBeenCalled();r.buffer.destroy();r.buffer.destroy()
 })
 it('returns null without allocation when there is no gain, including full occupied rectangles and empty fresh',()=>{
  const a=storage(3,7),f=fixture([tile(a,-3,8,{minX:-3,minY:8,maxX:0,maxY:15})]);expect(compactHistoricalLayer(f.fresh,f.allocate)).toBeNull();expect(f.allocate).not.toHaveBeenCalled();expect(a.destroy).not.toHaveBeenCalled();expect(compactHistoricalLayer({allResident:()=>[]},f.allocate)).toBeNull()
 })
 it('accounts projected RGBA only when full material storage can be retired by caller',()=>{
  const a=storage(3,7,true),f=fixture([tile(a,-3,8,{minX:-3,minY:8,maxX:0,maxY:15})]),r=compactHistoricalLayer(f.fresh,f.allocate)!
  expect(r.bytes).toBe(3*7*4);expect(a.baseBytes).toBe(r.bytes*3);expect(a.destroy).not.toHaveBeenCalled();expect(f.allocated[0].pixels).toEqual(a.pixels);r.buffer.destroy()
 })
 it('validates all metadata before first allocation; never tightens bounds or reads pixels',()=>{
  const a=storage(4,4),f=fixture([tile(a,0,0,{minX:0,minY:0,maxX:1,maxY:1}),tile(a,4,0,{minX:4.5,minY:0,maxX:5,maxY:1})]);expect(()=>compactHistoricalLayer(f.fresh,f.allocate)).toThrow('content bounds');expect(f.allocate).not.toHaveBeenCalled();expect(a.destroy).not.toHaveBeenCalled()
 })
 it('second allocation throwing undefined independently cleans first copy and preserves primary even if cleanup throws',()=>{
  const a=storage(4,4),f=fixture([tile(a,0,0,{minX:0,minY:0,maxX:1,maxY:1}),tile(a,4,0,{minX:4,minY:0,maxX:5,maxY:1})]),first=storage(1,1);first.destroy.mockImplementation(()=>{throw Error('cleanup')});let n=0
  const out=caught(()=>compactHistoricalLayer(f.fresh,()=>{if(n++)throw undefined;return first as unknown as AccumulationBuffer}));expect(out).toEqual({failed:true,value:undefined});expect(first.destroy).toHaveBeenCalledOnce();expect(a.destroy).not.toHaveBeenCalled()
 })
 it('copy failure destroys all acquired copies, not borrowed source, preserving the exact error',()=>{
  const a=storage(4,4),b=storage(4,4),f=fixture([tile(a,0,0,{minX:0,minY:0,maxX:1,maxY:1}),tile(b,4,0,{minX:4,minY:0,maxX:5,maxY:1})]),primary=Error('copy');b.copyRegionInto.mockImplementation(()=>{throw primary});const out=caught(()=>compactHistoricalLayer(f.fresh,f.allocate));expect(out.value).toBe(primary);expect(f.allocated).toHaveLength(2);for(const s of f.allocated)expect(s.destroy).toHaveBeenCalledOnce();expect(a.destroy).not.toHaveBeenCalled();expect(b.destroy).not.toHaveBeenCalled()
 })
 it('destroy is independently exhaustive/idempotent and preserves first undefined cleanup failure',()=>{
  const a=storage(4,4),f=fixture([tile(a,0,0,{minX:0,minY:0,maxX:1,maxY:1}),tile(a,4,0,{minX:4,minY:0,maxX:5,maxY:1})]),r=compactHistoricalLayer(f.fresh,f.allocate)!
  f.allocated[0].destroy.mockImplementation(()=>{throw undefined});f.allocated[1].destroy.mockImplementation(()=>{throw Error('second')});expect(caught(()=>r.buffer.destroy())).toEqual({failed:true,value:undefined});r.buffer.destroy();for(const s of f.allocated)expect(s.destroy).toHaveBeenCalledOnce();expect(()=>r.buffer.resolveVisible({minX:0,minY:0,maxX:1,maxY:1})).toThrow('retired')
 })
 it('rejects aliasing allocator without destroying any borrowed tile',()=>{
  const a=storage(4,4),f=fixture([tile(a,0,0,{minX:0,minY:0,maxX:1,maxY:1})]);expect(()=>compactHistoricalLayer(f.fresh,()=>a as unknown as AccumulationBuffer)).toThrow('aliases');expect(a.destroy).not.toHaveBeenCalled()
 })
})
