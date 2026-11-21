import{installBrushPixels}from'../presets/importedBrushes'
import{expect,it,vi}from'vitest'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{type BehaviorScratch}from'./BrushBehaviorPainter'
import{MockGL}from'../../testing/mockGL'
import{childSize187}from'../../../../../../packages/shared/src/childAbsoluteSize187.testFixture'
import{brushExecutionContext}from'../presets/brushExecutionContext'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import type{PencilPreset}from'../presets/pencilPresets'
function pair(){const root=childSize187(),child=root.behavior!.dual!.brush;root.version=child.version=190;root.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'};child.tip={...root.tip};child.behavior!.modulations=undefined;child.sizeByPressure=[[0,1],[1,1]];return root}
it('streams root Pixel202 fan pages inside the existing texture budget',()=>{
 const root=pair(),ids=Array.from({length:270},(_,i)=>`asset:${(i+1000).toString(16).padStart(64,'0')}` as const)
 for(const id of ids)installBrushPixels(id,new Uint8Array(256*256).fill(180))
 delete root.behavior!.dual;root.version=202;root.behavior!.rendering!.accumulation='alphaDarken'
 root.tip={kind:'bitmap',mask:ids[0],hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode:'dimensions',frames:ids,dimensions:[{mode:'angular',rank:18},{mode:'incremental',rank:15}],cursorPolicy:'first-request-v1'},material:{kind:'lightness',gray:ids[0],grayFrames:ids,strength:1}}
 root.behavior!.strokeInput={version:1,initialDirection:'cursorHistory',fanCorners:{stepDegrees:30}}
 root.behavior!.colorAdjustment={value:{control:'off',minimum:0,jitter:0,combine:{mode:'product',constant:.2,policy:'native-hsv-strength-v1',scaling:[{control:'pressure',minimum:0,jitter:0}],additive:[{control:'random',minimum:0,jitter:0}]}}}
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext)
 painter.initGL()
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer),rootBuffer=buffer(),childBuffer=buffer(),make=()=>({getOrCreate:()=>({original:buffer(),coverage:buffer()}),brushCeiling:buffer,brushCeilingCopy:buffer,noteBrushEdgePx:()=>0})as unknown as BehaviorScratch,childScratch=make(),scratch=make()
 scratch.brushSecondary=()=>({scratch:childScratch,sampling:{remaining:0},tile:()=>childBuffer})
 const target={resolveForPaint:()=>[{originX:0,originY:0,buffer:rootBuffer,contentRect:null}],markContentPainted:()=>{}}as unknown as ILayerBuffer
 const execution=brushExecutionContext({version:1,sequentialSeed:0,strokeSeed:42},undefined)
 const dab={x:10,y:10,size:4,pressure:1,opacity:1,angle:0,sourceSize:4,sourceScale:1,sourceAngle:Math.PI/2,sourceTwist:180,sourceTangentialPressure:.5,aspectRatio:1,tiltX:0,tiltY:0,t:0}
 try{
  painter.prepareRecordedStampResources(root)
  const upload=vi.spyOn(gl,'texImage2D')
  for(let i=0;i<100;i++)painter.paint(target,[{...dab,x:10+i,t:i,sourceAngle:(i%18)*Math.PI/9}],{sizeMultiplier:1}as PencilPreset,{brush:root,pressure:{size:true,opacity:true}},[1,0,0],scratch,undefined,execution)
  expect(upload.mock.calls.length).toBeGreaterThan(10)
  expect(painter['textures']['usedBytes']).toBeLessThanOrEqual(16*1024*1024)
 }finally{painter.destroy()}
})
