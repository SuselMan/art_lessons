import{it,expect,vi}from'vitest'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{MockGL}from'../../testing/mockGL'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import type{PencilPreset}from'../presets/pencilPresets'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
type BrushTarget=Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>
import{experiment158,pattern158}from'../../../../../../packages/shared/src/experimentPattern158.testFixture'
it('actual facade rejects missing pattern/borrowed CAS before scratch, geometry state or GL draw',()=>{
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),scale:1,worldSize:()=>({w:64,h:64})},segmentLength:()=>1}as unknown as BrushContext)
 painter.initGL();const b=experiment158(),scratch={getOrCreate:vi.fn(()=>{throw Error('state touched')}),noteBrushEdgePx:()=>0}as unknown as BehaviorScratch,target={resolveForPaint:vi.fn(()=>{throw Error('destination touched')}),markContentPainted:vi.fn()}as unknown as BrushTarget,dab={x:0,y:0,size:20,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}
 try{const draw=vi.spyOn(gl,'drawArrays');expect(()=>painter['behavior'].paint(target,[dab],{sizeMultiplier:1}as PencilPreset,b,{size:true,opacity:true},[1,0,0],scratch)).toThrow('captured canvas pattern');expect(()=>painter.prepareExperimentPattern(b,pattern158())).toThrow();expect(scratch.getOrCreate).not.toHaveBeenCalled();expect(target.resolveForPaint).not.toHaveBeenCalled();expect(scratch.brushBehavior).toBeUndefined();expect(draw).not.toHaveBeenCalled()
  expect(()=>painter['behavior'].paint(target,[dab],{sizeMultiplier:1}as PencilPreset,b,{size:true,opacity:true},[1,0,0],scratch,false,undefined,{brushSource:{version:1,pattern:{version:1,kind:'none'}}},true)).toThrow('Invalid Experiment Pattern158 scope')
 }finally{painter.destroy()}
})
