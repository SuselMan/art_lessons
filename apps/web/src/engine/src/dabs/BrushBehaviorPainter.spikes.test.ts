import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {BrushContext} from './BrushPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from '../presets/pencilPresets'
import {DIGITAL_BRUSHES} from '../presets/digitalBrushPresets'

it('draws the full world allocation while retaining source axes, angle, AA and independent child mirror',()=>{
 const values=new Map<string,number[]>(),captured=new Map<string,number[]>(),requested:{minX:number;minY:number;maxX:number;maxY:number}[]=[]
 const stop=new Error('spiked deposition reached'),sources:string[]=[]
 const gl=new Proxy({}, {get:(_t,key)=>{
  if(key==='getUniformLocation')return (_p:unknown,name:string)=>name
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true
  if(key==='getAttribLocation')return ()=>0
  if(key==='getExtension')return ()=>null
  if(key==='shaderSource')return (_s:unknown,source:string)=>sources.push(source)
  if(String(key).startsWith('uniform'))return (name:string,...args:number[])=>values.set(name,args)
  if(key==='drawArrays')return ()=>{for(const [k,v]of values)captured.set(k,v);throw stop}
  if(String(key).startsWith('create'))return ()=>({})
  return ()=>{}
 }}) as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1} as unknown as BrushContext,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>()=>{})
 const base:BrushDescriptor={...DIGITAL_BRUSHES[0],version:73,model:'stamp',tip:{kind:'procedural',hardness:1,aspect:5,angle:Math.PI/4,rotation:'fixed',profile:{kind:'standard',shape:'ellipse',horizontalFade:1,verticalFade:1,antialias:true},autoShape:{version:1,spikes:4}},behavior:{version:2},flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]]}
 const child:BrushDescriptor={...base,tip:{...base.tip,aspect:2,angle:.3,autoShape:{version:1,spikes:3}},behavior:{version:2,mirror:{horizontal:true,vertical:false,value:1}}}
 const brush:BrushDescriptor={...base,behavior:{version:2,mirror:{horizontal:false,vertical:true,value:1},dual:{brush:child,blendMode:'multiply'}}}
 const buffer={width:64,height:64,texture:{},beginDraw(){},clear(){},endDraw(){}} as unknown as AccumulationBuffer
 const scratch={getOrCreate:()=>({original:buffer,coverage:buffer}),brushCeiling:()=>buffer,noteBrushEdgePx:()=>0} as unknown as BehaviorScratch
 const dab={x:20,y:20,size:20,pressure:1,opacity:1,angle:Math.PI/4,aspectRatio:5,tiltX:0,tiltY:0,t:0}as Dab
 expect(()=>painter.paint({resolveForPaint:bounds=>{requested.push(bounds);return[{originX:0,originY:0,buffer,contentRect:null}]},markContentPainted:()=>{}},[dab],{sizeMultiplier:.2}as PencilPreset,brush,{size:true,opacity:true},[1,0,0],scratch)).toThrow(stop)
 expect(requested[0].minY).toBeLessThanOrEqual(20-10*Math.SQRT2)
 expect(requested[0].maxY).toBeGreaterThanOrEqual(20+10*Math.SQRT2)
 expect(captured.get('u_tipProceduralGeometry')).toEqual([10,2,3,0])
 expect(captured.get('u_autoSpikes')).toEqual([4,3])
 expect(captured.get('u_autoSpikeAngle')).toEqual([Math.PI/4])
 expect(captured.get('u_angle')).toEqual([0])
 expect(captured.get('u_aspectRatio')).toEqual([1])
 expect(captured.get('u_dabRadius')?.[0]).toBeCloseTo(10*Math.SQRT2,12)
 expect(captured.get('u_flip')).toEqual([1,-1])
 expect(captured.get('u_dualFlip')).toEqual([-1,1])
 expect(sources.some(s=>s.includes('brushAutoSpikeFrame(gaussianFrame,u_autoSpikes.x,u_autoSpikeAngle,u_flip)'))).toBe(true)
})
