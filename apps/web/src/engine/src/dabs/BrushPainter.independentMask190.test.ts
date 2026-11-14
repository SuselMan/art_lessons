import{makeBrushGradient}from'@grafetto/shared'
import{gradient138,alpha138,gray138}from'../../../../../../packages/shared/src/pixelGradientWash138.testFixture'
import{installBrushPixels}from'../presets/importedBrushes'
import{expect,it,vi}from'vitest'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{type BehaviorScratch}from'./BrushBehaviorPainter'
import{MockGL}from'../../testing/mockGL'
import{childSize187}from'../../../../../../packages/shared/src/childAbsoluteSize187.testFixture'
import{brushExecutionContext}from'../presets/brushExecutionContext'
import{brushPreparationResources}from'./BrushPreparation'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{PencilPreset}from'../presets/pencilPresets'
function pair(){const root=childSize187(),child=root.behavior!.dual!.brush;root.version=child.version=190;root.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'};child.tip={...root.tip};child.behavior!.modulations=undefined;child.sizeByPressure=[[0,1],[1,1]];return root}
it.each(['plain','rootGradient','childGradient','erase','rootGradientErase'])('actual public190 %s paint retains the validated whole resource owner through child recursion and releases both required leases',mode=>{
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext),root=pair(),child=root.behavior!.dual!.brush
 const gradient=mode==='rootGradient'||mode==='childGradient'||mode==='rootGradientErase'
 if(gradient){installBrushPixels(alpha138,new Uint8Array(16).fill(255));installBrushPixels(gray138,new Uint8Array(16).fill(127));(mode==='childGradient'?child:root).tip=gradient138().tip}
 if(mode==='erase'||mode==='rootGradientErase')root.behavior!.erase=true
 painter.initGL()
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer),rootBuffer=buffer(),childBuffer=buffer(),make=()=>({getOrCreate:()=>({original:buffer(),coverage:buffer()}),brushCeiling:buffer,brushCeilingCopy:buffer,noteBrushEdgePx:()=>0})as unknown as BehaviorScratch,childScratch=make(),scratch=make()
 scratch.brushSecondary=()=>({scratch:childScratch,sampling:{remaining:0},tile:()=>childBuffer})
 const target={resolveForPaint:()=>[{originX:0,originY:0,buffer:rootBuffer,contentRect:null}],markContentPainted:()=>{}}as unknown as ILayerBuffer
 const dab={x:10,y:10,size:4,pressure:1,opacity:1,angle:0,sourceSize:4,sourceScale:1,sourceAngle:Math.PI/2,sourceTwist:180,sourceTangentialPressure:.5,aspectRatio:1,tiltX:0,tiltY:0,t:0},execution=brushExecutionContext({version:1,sequentialSeed:0,strokeSeed:0xffffffff},gradient?{version:1,gradient:makeBrushGradient([1,0,0,1],[0,0,1,0])}:undefined),stop=Error('actual child raster reached')
 try{
  // An orphan is still inadmissible; recursion must borrow the validated ROOT,
  // rather than weaken resource admission for arbitrary child descriptors.
  expect(()=>brushPreparationResources(child)).toThrow()
  painter.prepareRecordedStampResources(root);if(gradient)painter.preparePixelGradient(root,execution)
  const erases:number[]=[],secondary:number[]=[];const one=vi.spyOn(gl,'uniform1f').mockImplementation((loc,value)=>{loc.program.uniforms.set(loc.name,value);if(loc.name==='u_erase')erases.push(value);if(loc.name==='u_secondaryEnabled')secondary.push(value)})
  const cache=painter['textures'],before=cache['leases'].size,lease=vi.spyOn(cache,'leaseRequired'),upload=vi.spyOn(gl,'texImage2D'),draw=vi.spyOn(gl,'drawArrays').mockImplementation(()=>{if(secondary.at(-1)===1)throw stop})
  expect(()=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,{brush:root,pressure:{size:true,opacity:true}},[1,0,0],scratch,undefined,execution)).toThrow(stop)
  expect(childScratch.brushBehavior?.execution?.maskRole190?.role).toBe('child')
  expect(lease.mock.calls.length).toBeGreaterThanOrEqual(2)
  expect(cache['leases'].size).toBe(before)
  expect(upload).not.toHaveBeenCalled();expect(erases).toEqual([0,root.behavior!.erase?1:0]);one.mockRestore()
  draw.mockRestore();upload.mockRestore();lease.mockRestore()
 }finally{painter.destroy()}
})
