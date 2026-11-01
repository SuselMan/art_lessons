import {expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
import {LayerCompositor,type LayerCompositorContext} from './LayerCompositor'
import {exactFrame} from './cameraFrame'

const rect={minX:0,minY:0,maxX:8,maxY:8},frame=exactFrame({x:0,y:0,width:8,height:8})
function fixture(){
 const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext
 const layer=new TiledLayerBuffer(gl,8,8,undefined,undefined,undefined,'straight-rgba8')
 const tile=layer.resolveForPaint(rect)[0],pm=new AccumulationBuffer(gl,8,8,'linear'),target=new AccumulationBuffer(gl,8,8)
 const previews={tiles:new Map(),areaLayers:new Set<string>()},reveals=new Map()
 const presentation=vi.fn((_:AccumulationBuffer,_sx:number,_sy:number,draw:(b:AccumulationBuffer)=>void)=>draw(pm)),reveal=vi.fn()
 const context={gl,previews:()=>previews,layers:()=>new Map([['ink',layer]]),reveals:()=>reveals,straightPresentation:{withTile:presentation},drawReveal:reveal} as unknown as LayerCompositorContext
 const compositor=new LayerCompositor(context),draw=vi.spyOn(compositor,'drawTileComposite').mockImplementation(()=>{})
 return {mock,layer,tile,pm,target,previews,reveals,presentation,reveal,compositor,draw,close(){layer.destroy();pm.destroy();target.destroy()}}
}
it('skips actual known-blank straight fine tiles before sampling/conversion, then respects painted and cleared metadata',()=>{
 const s=fixture(),mips=vi.spyOn(s.tile.buffer,'ensureMipmaps'),sampling=vi.spyOn(s.tile.buffer,'setMipSampling'),clear=vi.spyOn(s.target,'clear')
 try{
  const render=()=>s.compositor['rebuildCacheHalf'](frame,s.target,[{id:'ink',opacity:1}],8,8)
  expect(s.layer.resolveVisible(rect)[0].contentRect).toBeNull()
  render();expect(s.presentation).not.toHaveBeenCalled();expect(mips).not.toHaveBeenCalled();expect(sampling).not.toHaveBeenCalled();expect(clear).toHaveBeenCalledTimes(1)
  s.layer.markContentPainted(rect);render();expect(s.presentation).toHaveBeenCalledTimes(1);expect(s.draw).toHaveBeenCalledTimes(1)
  s.tile.buffer.clear();s.layer.clearContentAt(0,0);render()
  expect(clear).toHaveBeenCalledTimes(3);expect(s.presentation).toHaveBeenCalledTimes(1);expect(s.draw).toHaveBeenCalledTimes(1)
 }finally{s.close()}
})
it('keeps area-preview shadow precedence and does not convert an unshadowed blank fine tile',()=>{
 const s=fixture()
 try{
  s.previews.tiles.set('ink',[]);s.previews.areaLayers.add('ink')
  s.compositor.drawCompositeItem(frame,'ink',1,s.target.fbo,8,8)
  expect(s.presentation).not.toHaveBeenCalled()
  s.previews.tiles.set('ink',[s.tile]);s.layer.markContentPainted(rect)
  s.compositor.drawCompositeItem(frame,'ink',1,s.target.fbo,8,8)
  expect(s.presentation).toHaveBeenCalledTimes(1) // preview only; underlying tile remains shadowed
 }finally{s.close()}
})
it('keeps a reveal anchored to a currently blank fine tile visible',()=>{
 const s=fixture()
 try{
  s.reveals.set(s.tile.buffer,{})
  s.compositor.drawCompositeItem(frame,'ink',1,s.target.fbo,8,8)
  expect(s.reveal).toHaveBeenCalledTimes(1);expect(s.presentation).not.toHaveBeenCalled()
 }finally{s.close()}
})
it('preserves PM fine/null and coarse/null routes rather than treating their metadata as canonical emptiness',()=>{
 const s=fixture()
 try{
  vi.spyOn(s.layer,'resolveVisible').mockReturnValue([{buffer:s.pm,originX:0,originY:0,contentRect:null}])
  s.compositor.drawCompositeItem(frame,'ink',1,s.target.fbo,8,8)
  expect(s.draw).toHaveBeenCalledTimes(1)
  vi.spyOn(s.layer,'resolveCoarse').mockReturnValue([{buffer:s.pm,originX:0,originY:0,contentRect:null}])
  s.compositor.drawCompositeItem({...frame,scale:.25},'ink',1,s.target.fbo,8,8)
  expect(s.draw).toHaveBeenCalledTimes(2)
 }finally{s.close()}
})
it('keeps an existing lower PM item while the straight layer contributes nothing',()=>{
 const s=fixture()
 try{
  const visible=vi.spyOn(s.layer,'resolveVisible')
  visible.mockReturnValueOnce([{buffer:s.pm,originX:0,originY:0,contentRect:null}])
  s.compositor['rebuildCacheHalf'](frame,s.target,[{id:'ink',opacity:1},{id:'ink',opacity:1}],8,8)
  expect(s.draw).toHaveBeenCalledTimes(1);expect(s.presentation).not.toHaveBeenCalled()
 }finally{s.close()}
})
it.each(['ink',null])('composes the canonical implicit layer without empty split resources (active %s)',active=>{
 const s=fixture(),below=vi.fn(()=>{throw Error('Unused below cache allocated')}),above=vi.fn(()=>{throw Error('Unused above cache allocated')})
 const compositor=new LayerCompositor({...s.compositor['ctx'],assembly:()=>s.target,activeId:()=>active,below,above}),clear=vi.spyOn(s.target,'clear'),disable=vi.spyOn(s.mock,'disable')
 const draw=vi.spyOn(compositor,'drawCompositeItem');vi.spyOn(compositor,'drawTileComposite').mockImplementation(()=>{})
 try{
  s.layer.markContentPainted(rect)
  compositor.runComposite(frame,[{id:'ink',opacity:.4}],rect,true)
  expect(clear).toHaveBeenCalledOnce();expect(draw).toHaveBeenCalledWith(frame,'ink',.4,s.target.fbo,8,8)
  expect(s.presentation).toHaveBeenCalledOnce();expect(below).not.toHaveBeenCalled();expect(above).not.toHaveBeenCalled();expect(disable).toHaveBeenCalledWith(s.mock.SCISSOR_TEST)
  compositor.runComposite(frame,[],null,true)
  expect(clear).toHaveBeenCalledTimes(2);expect(draw).toHaveBeenCalledOnce();expect(below).not.toHaveBeenCalled();expect(above).not.toHaveBeenCalled()
  const fault=Error('actual canonical item display failure');draw.mockImplementationOnce(()=>{throw fault})
  expect(()=>compositor.runComposite(frame,[{id:'ink',opacity:1}],rect,true)).toThrow(fault);expect(disable).toHaveBeenLastCalledWith(s.mock.SCISSOR_TEST)
 }finally{s.close()}
})
