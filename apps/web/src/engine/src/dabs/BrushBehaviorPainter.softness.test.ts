import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {BrushContext} from './BrushPainter'
import type {PencilPreset} from '../presets/pencilPresets'
import {DIGITAL_BRUSHES} from '../presets/digitalBrushPresets'

it('uploads per-dab standard fade coefficients for primary and paired mask before actual deposition',()=>{
 const run=(softness?:number)=>{
  const counts=new Map<string,number>(),values=new Map<string,number[]>(),atDraw=new Map<string,number[]>(),stop=new Error('deposition reached')
  const gl=new Proxy({}, {get:(_target,key)=>{
   if(key==='getUniformLocation')return (_p:unknown,name:string)=>name
   if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true
   if(key==='getAttribLocation')return ()=>0
   if(key==='getExtension')return ()=>null
   if(String(key).startsWith('uniform'))return (name:string,...args:number[])=>{counts.set(name,(counts.get(name)??0)+1);values.set(name,args)}
   if(key==='drawArrays')return ()=>{for(const [k,v]of values)atDraw.set(k,v);throw stop}
   if(String(key).startsWith('create'))return ()=>({})
   return ()=>{}
  }}) as WebGLRenderingContext
  const ctx={gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1} as unknown as BrushContext
  const painter=new BrushBehaviorPainter(ctx,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>()=>{})
  const base:BrushDescriptor={...DIGITAL_BRUSHES[0],model:'stamp',tip:{kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'ellipse',horizontalFade:0,verticalFade:1,antialias:false}},behavior:{version:2,...(softness===undefined?{}:{softness})},flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]]}
  const child:BrushDescriptor={...base,tip:{...base.tip,profile:{kind:'standard',shape:'rectangle',horizontalFade:1,verticalFade:0,antialias:false}},behavior:{version:2,softness:.25}}
  const brush={...base,behavior:{...base.behavior!,dual:{brush:child,blendMode:'multiply' as const}}}
  const buffer={width:64,height:64,texture:{},beginDraw(){},clear(){},endDraw(){}} as unknown as AccumulationBuffer
  const scratch={getOrCreate:()=>({original:buffer,coverage:buffer}),brushCeiling:()=>buffer,noteBrushEdgePx:()=>0} as unknown as BehaviorScratch
  const dab={x:20,y:20,size:20,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0} as Dab
  expect(()=>painter.paint({resolveForPaint:()=>[{originX:0,originY:0,buffer,contentRect:null}],markContentPainted:()=>{}},[dab],{sizeMultiplier:1}as PencilPreset,brush,{size:true,opacity:true},[1,0,0],scratch)).toThrow(stop)
  return {atDraw,counts}
 }
 const legacy=run(),active=run(.5),old=legacy.atDraw,soft=active.atDraw
 expect(legacy.counts.get('u_tipProcedural')).toBe(1)
 expect(active.counts.get('u_tipProcedural')).toBe(2)
 expect(old.get('u_tipProcedural')).toEqual([1,0,1,0])
 expect(soft.get('u_tipProcedural')).toEqual([1,.05,.5,0])
 expect(soft.get('u_dualProcedural')).toEqual([2,.25,.025,0])
 expect(soft.get('u_tipProceduralGeometry')).toEqual(old.get('u_tipProceduralGeometry'))
 expect(soft.get('u_opacity')).toEqual(old.get('u_opacity'))
 expect(soft.get('u_ceiling')).toEqual(old.get('u_ceiling'))
})
