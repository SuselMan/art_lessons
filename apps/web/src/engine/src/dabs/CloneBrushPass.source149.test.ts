import{it,expect,vi}from'vitest'
import{CloneBrushPass}from'./CloneBrushPass'
import{CanvasProjectionSampler}from'../raster/CanvasProjectionSampler'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{MockGL}from'../../testing/mockGL'
import type{CanonicalBeginSource}from'./CanonicalBeginSource'
import type{BrushScratch}from'./BrushPainter'
import type{PaintTarget}from'../buffers/ILayerBuffer'
import type{Dab}from'@grafetto/shared'
it('149 uses only its frozen merged source and requires prewarm; historical54 still uses target originals',()=>{
 const gl=new MockGL()as unknown as WebGLRenderingContext,pass=new CloneBrushPass(gl),buffer=new AccumulationBuffer(gl,8,8),original=new AccumulationBuffer(gl,8,8),mask=new AccumulationBuffer(gl,8,8)
 const tile:PaintTarget={buffer,originX:-8,originY:0,contentRect:{minX:-8,minY:0,maxX:0,maxY:8}},target={resolveVisible:vi.fn(()=>[tile]),resolveForPaint:vi.fn(()=>[tile])},scratch={getOrCreate:vi.fn(()=>({original}))}as unknown as BrushScratch
 const frozen=vi.fn(()=>[{...tile,buffer:original}]),source={assertCurrent:vi.fn(),resolveForRead:frozen}as unknown as CanonicalBeginSource,dab={x:0,y:0}as Dab,pick={x:0,y:0,offsetX:1,offsetY:2}
 const gather=vi.spyOn(CanvasProjectionSampler.prototype,'gather').mockImplementation((_patch,rect,layers)=>{for(const layer of layers)layer.buffer.resolveVisible(rect)})
 try{
  expect(()=>pass.paint(tile,tile.contentRect!,mask,scratch,target,pick,dab,true,.5,source)).toThrow('not prepared');expect(frozen).not.toHaveBeenCalled()
  pass.prepare();pass.paint(tile,tile.contentRect!,mask,scratch,target,pick,dab,true,.5,source)
  expect(frozen).toHaveBeenCalledTimes(1);expect(target.resolveVisible).not.toHaveBeenCalled();expect(scratch.getOrCreate).not.toHaveBeenCalled()
  pass.paint(tile,tile.contentRect!,mask,scratch,target,pick,dab,false,.5)
  expect(target.resolveVisible).toHaveBeenCalledTimes(1);expect(scratch.getOrCreate).toHaveBeenCalledWith(buffer)
 }finally{gather.mockRestore();pass.destroy();buffer.destroy();original.destroy();mask.destroy()}
})
