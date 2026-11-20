import{expect,it,vi}from'vitest'
import{makeBrushGradient}from'@grafetto/shared'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import{MockGL}from'../../testing/mockGL'
import{brush119,assets119}from'../../../../../../packages/shared/src/gihOriginalRgba119.testFixture'
import{alpha138,gray138}from'../../../../../../packages/shared/src/pixelGradientWash138.testFixture'
import{brushExecutionContext}from'../presets/brushExecutionContext'
import{installBrushPixels}from'../presets/importedBrushes'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{PencilPreset}from'../presets/pencilPresets'
it.each(['staticRGBA','unequalGIH','wash']as const)('191 %s keeps the original RGBA resource key while the texture consumes the captured Gradient',mode=>{
 const root=brush119('dimensions');root.version=191
 if(mode!=='unequalGIH'){delete root.tip.animation;if(root.tip.color&&'frames'in root.tip.color)delete root.tip.color.frames}
 if(mode==='wash')root.behavior!.rendering!.accumulation='alphaDarken'
 root.texture={id:gray138,strength:.75,periodPx:4,patternSize:{width:4,height:4},material:{kind:'gradient',alpha:alpha138}}
 for(const a of assets119)installBrushPixels(a.id,new Uint8Array(a.size*a.size).fill(127));installBrushPixels(gray138,new Uint8Array(16).fill(191));installBrushPixels(alpha138,new Uint8Array(16).fill(64))
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext)
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer),targetBuffer=buffer(),scratch={getOrCreate:()=>({original:buffer(),coverage:buffer()}),brushCeiling:buffer,brushCeilingCopy:buffer,noteBrushEdgePx:()=>0}as unknown as BehaviorScratch,target={resolveForPaint:()=>[{originX:0,originY:0,buffer:targetBuffer,contentRect:null}],markContentPainted:()=>{}}as unknown as ILayerBuffer
 const execution=brushExecutionContext({version:1,sequentialSeed:0,strokeSeed:0xffffffff},{version:1,gradient:makeBrushGradient([1,0,0,1],[0,0,1,0])})
 painter.initGL()
 try{
  painter.prepareRecordedStampResources(root);painter.preparePixelGradient(root,execution);painter.prepareTextureGradient(root,execution)
  const view=vi.spyOn(painter as unknown as{preparedImage:(...args:unknown[])=>unknown},'preparedImage'),upload=vi.spyOn(gl,'texImage2D'),compile=vi.spyOn(gl,'createProgram'),stop=Error('actual original RGBA draw'),draw=vi.spyOn(gl,'drawArrays').mockImplementation(()=>{throw stop})
  const dab={x:10,y:10,size:4,pressure:1,opacity:1,angle:0,sourceSize:4,sourceScale:1,sourceAngle:Math.PI/2,sourceTwist:180,sourceTangentialPressure:.5,aspectRatio:1,tiltX:0,tiltY:0,t:0}
  expect(()=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,{brush:root,pressure:{size:true,opacity:true}},[1,0,0],scratch,undefined,execution)).toThrow(stop)
  expect(view.mock.calls.length).toBe(mode==='unequalGIH'?3:1);expect(view.mock.calls.every(args=>args[3]===undefined&&args[4]===undefined)).toBe(true)
  expect(upload).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();draw.mockRestore()
 }finally{painter.destroy()}
})
