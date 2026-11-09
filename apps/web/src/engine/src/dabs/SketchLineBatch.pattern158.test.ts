import{it,expect,vi}from'vitest'
import{SketchLineBatch}from'./SketchLineBatch'
import{MockGL}from'../../testing/mockGL'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{PolygonFillBatch}from'./PolygonFillBatch'
import type{BehaviorPlaced}from'../presets/brushBehavior'
import{pattern158}from'../../../../../../packages/shared/src/experimentPattern158.testFixture'
it('same polygon owner binds exact negative world origin and nonsquare period; none clears old shape without foreground fallback',()=>{
 const gl=new MockGL(),batch=new SketchLineBatch(gl as unknown as WebGLRenderingContext),mask=vi.fn(),clear=vi.fn(),texture=gl.createTexture(),assertCurrent=vi.fn(),buffer={width:32,height:16,texture:gl.createTexture(),clear,beginDraw:vi.fn(),endDraw:vi.fn()}as unknown as AccumulationBuffer,polygon={paintMask:mask}as unknown as PolygonFillBatch,pattern=pattern158(),stamp={ceiling:.5,color:[1,0,0],polygon:{points:[{x:-3,y:0},{x:8,y:0},{x:8,y:8}],winding:true,hardEdge:true}}as unknown as BehaviorPlaced
 try{batch.preparePattern();const upload=vi.spyOn(gl,'texImage2D'),compile=vi.spyOn(gl,'createProgram'),vec2=vi.spyOn(gl,'uniform2f'),vec4=vi.spyOn(gl,'uniform4f'),bind=vi.spyOn(gl,'bindTexture');batch.paintPolygon([stamp],buffer,buffer,-17,-9,polygon,{pattern,view:{texture,width:4,height:4,crop:{x:0,y:1,width:3,height:2},assertCurrent}})
 expect(mask).toHaveBeenCalledOnce();expect(clear).toHaveBeenCalledOnce();expect(assertCurrent).toHaveBeenCalledOnce();expect(vec2.mock.calls.some(([loc,x,y])=>loc.name==='u_origin'&&x===-17&&y===-9)).toBe(true);expect(vec4.mock.calls.some(([loc,x,y,w,h])=>loc.name==='u_rect'&&x===0&&y===1&&w===3&&h===2)).toBe(true);expect(bind.mock.calls.some(([,t])=>t===texture)).toBe(true);expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled()
 const draw=vi.spyOn(gl,'drawArrays');batch.paintPolygon([stamp],buffer,buffer,0,0,polygon,{pattern:{version:1,kind:'none'}});expect(clear).toHaveBeenCalledTimes(2);expect(draw).not.toHaveBeenCalled()
 }finally{batch.destroy()}
})
