import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {BrushContext} from './BrushPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from '../presets/pencilPresets'
import {DIGITAL_BRUSHES} from '../presets/digitalBrushPresets'
const brush:BrushDescriptor={...DIGITAL_BRUSHES[0],version:102,behavior:{version:2,rendering:{mode:'buildUp',blendMode:'hardMixPhotoshop',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}
function fixture(tiles=0,selectedBrush:BrushDescriptor=brush,glOverride?:WebGLRenderingContext){
 const gl=glOverride??new Proxy({}, {get:(_t,key)=>{
  if(key==='getUniformLocation')return (_p:unknown,name:string)=>name
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true
  if(key==='getAttribLocation')return ()=>0
  if(key==='getExtension')return ()=>null
  if(String(key).startsWith('create'))return ()=>({})
  return ()=>{}
 }}) as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1} as unknown as BrushContext,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>()=>{})
 painter.initGL()
 const buffer=()=>({width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}} as unknown as AccumulationBuffer)
 const original=buffer(),coverage=buffer(),ceiling=buffer()
 const scratch={getOrCreate:()=>({original,coverage}),brushCeiling:()=>ceiling,brushCeilingCopy:()=>ceiling,noteBrushEdgePx:()=>0} as unknown as BehaviorScratch
 const target={resolveForPaint:()=>Array.from({length:tiles},(_,i)=>({originX:i*64,originY:0,buffer:buffer(),contentRect:null})),markContentPainted:()=>{}}
 const dab=(x:number):Dab=>({x,y:20,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:x})
 const paint=(points:number[])=>painter.paint(target,points.map(dab),{sizeMultiplier:1}as PencilPreset,selectedBrush,{size:true,opacity:true},[1,0,0],scratch)
 return {painter,scratch,paint}
}
it('requires actual extended preflight before state mutation and reuses it until reset',()=>{
 const f=fixture();expect(()=>f.paint([20])).toThrow('Extended composite is not prepared');expect(f.scratch.brushBehavior).toBeUndefined()
 f.painter.prepareCompositeEffects();expect(()=>f.paint([20])).not.toThrow();expect(f.scratch.brushBehavior).toBeDefined()
 f.painter.prepareCompositeEffects();f.painter.initGL();expect(()=>f.paint([24])).toThrow('Extended composite is not prepared')
 f.painter.destroy()
})

it('prepares Krita27 with the same private program and fails before state after reset',()=>{
 const selected=structuredClone(brush);selected.version=104;selected.behavior!.rendering!.blendMode='kritaHardMix';const f=fixture(0,selected)
 expect(()=>f.paint([20])).toThrow('Extended composite is not prepared');expect(f.scratch.brushBehavior).toBeUndefined();f.painter.prepareCompositeEffects();expect(()=>f.paint([20])).not.toThrow();expect(f.scratch.brushBehavior).toBeDefined();f.painter.initGL();expect(()=>f.paint([24])).toThrow('Extended composite is not prepared');f.painter.destroy()
})
