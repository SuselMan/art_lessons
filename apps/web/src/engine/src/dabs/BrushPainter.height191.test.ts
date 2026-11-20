import{expect,it,vi}from'vitest'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import{MockGL}from'../../testing/mockGL'
import{childSize187}from'../../../../../../packages/shared/src/childAbsoluteSize187.testFixture'
import{brushExecutionContext}from'../presets/brushExecutionContext'
import{installBrushPixels}from'../presets/importedBrushes'
import{brushPreparationPlan,brushUsesStampEffects}from'./BrushPreparation'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{PencilPreset}from'../presets/pencilPresets'
it.each(['height','linearHeight','heightPhotoshop','linearHeightPhotoshop']as const)('plain procedural191 %s prewarms and actually selects the extended alpha effects program',mode=>{
 const root=childSize187();root.version=191;delete root.behavior!.dual;root.tip={kind:'procedural',hardness:1,aspect:1.428,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'ellipse',horizontalFade:.6,verticalFade:.8,antialias:true}}
 const id=`asset:${'b'.repeat(64)}`as const;installBrushPixels(id,new Uint8Array(16).fill(191));root.texture={id,strength:.75,periodPx:4,patternSize:{width:4,height:4},application:{mode,soft:false}}
 expect(brushUsesStampEffects(root)).toBe(true);expect(brushPreparationPlan(root).capabilities).toContain('stampEffects')
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext)
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer),targetBuffer=buffer(),scratch={getOrCreate:()=>({original:buffer(),coverage:buffer()}),brushCeiling:buffer,brushCeilingCopy:buffer,noteBrushEdgePx:()=>0}as unknown as BehaviorScratch,target={resolveForPaint:()=>[{originX:0,originY:0,buffer:targetBuffer,contentRect:null}],markContentPainted:()=>{}}as unknown as ILayerBuffer
 painter.initGL()
 try{
  painter.prepareRecordedStampResources(root)
  const selected=Reflect.get(Reflect.get(painter,'behavior'),'effectsStamp')as{program:WebGLProgram};expect(selected).toBeDefined()
  const use=vi.spyOn(gl,'useProgram'),compile=vi.spyOn(gl,'createProgram'),stop=Error('actual selected stamp draw'),draw=vi.spyOn(gl,'drawArrays').mockImplementation(()=>{throw stop})
  const dab={x:10,y:10,size:4,pressure:1,opacity:1,angle:0,sourceSize:4,sourceScale:1,sourceAngle:Math.PI/2,sourceTwist:180,sourceTangentialPressure:.5,aspectRatio:1,tiltX:0,tiltY:0,t:0}
  expect(()=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,{brush:root,pressure:{size:true,opacity:true}},[1,0,0],scratch,undefined,brushExecutionContext({version:1,sequentialSeed:0,strokeSeed:0xffffffff}))).toThrow(stop)
  expect(use.mock.calls.at(-1)?.[0]).toBe(selected.program);expect(compile).not.toHaveBeenCalled();draw.mockRestore()
 }finally{painter.destroy()}
})
