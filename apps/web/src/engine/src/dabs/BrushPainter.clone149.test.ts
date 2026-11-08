import{it,expect,vi}from'vitest'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{spray133,dab133}from'../../../../../../packages/shared/src/sprayWash133.testFixture'
import{MockGL}from'../../testing/mockGL'
import{brushExecutionContext}from'../presets/brushExecutionContext'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import type{PencilPreset}from'../presets/pencilPresets'
import type{CanonicalBeginRuntime}from'./CanonicalBeginRuntime'
it('public149 preflight never publishes state or touches destination when source is absent/history-pending',()=>{
 const gl=new MockGL()as unknown as WebGLRenderingContext,open=vi.fn(()=>({kind:'notReady',reason:'history',retryKey:'wait'})),ctx={gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:8,h:8}),scale:1},openLayeredCanonicalBegin:open,acquireSprayScratch:vi.fn(),reserveCanonicalBeginSource:vi.fn()}as unknown as BrushContext
 const painter=new BrushPainter(ctx),b=spray133();delete b.spray;b.version=149;b.behavior!.rendering!.accumulation='directOver';b.clone={version:1,moveSourcePoint:true,source:'projectionCanvas',sourcePolicy:'canonical-begin-v1'}
 const target={resolveForPaint:vi.fn(),markContentPainted:vi.fn()}as unknown as ILayerBuffer,scratch={getOrCreate:vi.fn()}as unknown as BehaviorScratch,execution=brushExecutionContext(undefined,{version:1,clone:{x:0,y:0,offsetX:1,offsetY:2},projection:[]}),paint={brush:b,pressure:{size:false,opacity:false}},runtime={capability:'cloneProjection149',binding:{layerId:'l',userId:'u',strokeId:'s',targetGeneration:1,prefixKey:'p',begin:{kind:'canonical',firstOpId:'first',seq:1}}}as CanonicalBeginRuntime
 try{
  expect(()=>painter.paint(target,[dab133()],{sizeMultiplier:1}as PencilPreset,paint,[1,0,0],scratch,undefined,execution,runtime)).toThrow('canonical BEGIN source')
  expect(()=>painter.prepareCloneBeginGesture(target,dab133(),'u','s',paint,execution,runtime,scratch)).toThrow('source owner unavailable')
  painter.prepareClone();expect(painter.prepareCloneBeginGesture(target,dab133(),'u','s',paint,execution,runtime,scratch)).toEqual({kind:'notReady',reason:'history',retryKey:'wait'})
  expect(open).toHaveBeenCalledTimes(1);expect(scratch.brushBehavior).toBeUndefined();expect(scratch.canonicalSource).toBeUndefined();expect(scratch.getOrCreate).not.toHaveBeenCalled();expect(target.resolveForPaint).not.toHaveBeenCalled();expect(ctx.acquireSprayScratch).not.toHaveBeenCalled()
 }finally{painter.destroy()}
})
