import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {BrushContext} from './BrushPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from '../presets/pencilPresets'
import{sprayRectangle155,dab155}from'../../../../../../packages/shared/src/brushSprayRectangle155.testFixture'
import {brushExecutionContext} from '../presets/brushExecutionContext'
import {autoMaskNoiseKey} from '../raster/autoMaskNoise'

it('155 actualBBP consumes existingnoise shader withcapturedkey andstablefullgrid across physicaltiles',()=>{
 const values=new Map<string,number[]>(),draws:Map<string,number[]>[]=[],shaders=new WeakMap<object,string>(),programs=new WeakMap<object,string[]>()
 let current:object|undefined
 const stop=new Error('two noise tile depositions reached')
 const gl=new Proxy({}, {get:(_t,key)=>{
  if(key==='createShader')return ()=>({})
  if(key==='shaderSource')return (shader:object,source:string)=>shaders.set(shader,source)
  if(key==='createProgram')return ()=>({})
  if(key==='attachShader')return (program:object,shader:object)=>programs.set(program,[...(programs.get(program)??[]),shaders.get(shader)??''])
  if(key==='useProgram')return (program:object)=>{current=program}
  if(key==='getUniformLocation')return (_p:unknown,name:string)=>name
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true
  if(key==='getAttribLocation')return ()=>0
  if(key==='getExtension')return ()=>null
  if(String(key).startsWith('uniform'))return (name:string,...args:number[])=>values.set(name,args)
  if(key==='drawArrays')return ()=>{
   if(current&&programs.get(current)?.some(source=>source.includes('float brushAutoMaskNoiseU8('))){draws.push(new Map(values));if(draws.length===2||draws.length===3)throw stop}
  }
  return ()=>{}
 }})as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>()=>{})
 painter.initGL();painter.prepareAutoNoise()
 const base:BrushDescriptor=sprayRectangle155();base.behavior!.mirror={horizontal:true,vertical:false,value:1};base.spray!.count=1;base.spray!.radial.maximum=.001
 const buffer={width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){}}as unknown as AccumulationBuffer
 const scratch={getOrCreate:()=>({original:buffer,coverage:buffer}),brushCeiling:()=>buffer,noteBrushEdgePx:()=>0}as unknown as BehaviorScratch
 const dab={x:40,y:20,size:20,pressure:1,opacity:1,angle:.3,aspectRatio:5,tiltX:0,tiltY:0,t:0}as Dab
 const execution=brushExecutionContext({version:1,strokeSeed:123,sequentialSeed:456})
 expect(()=>painter.paint({resolveForPaint:()=>[0,32].map(originX=>({originX,originY:0,buffer,contentRect:null})),markContentPainted:()=>{}},[dab],{sizeMultiplier:.2}as PencilPreset,base,{size:true,opacity:true},[1,0,0],scratch,false,undefined,execution)).toThrow(stop)
 const word=(bytes:number[]|undefined)=>bytes![0]+bytes![1]*256+bytes![2]*65536+bytes![3]*16777216
 for(const draw of draws){
  expect(draw.get('u_autoNoiseConfig')).toEqual([32768,102,-1,-1])
  expect(word(draw.get('u_autoNoiseKey'))).toBe(autoMaskNoiseKey(123,0,0,0))
 }
 // Same world pixel (38,20): tile0 x38, tile32 x6; y is bottom-up43.
 const low32=(n:number)=>n>>>0
 expect(low32(word(draws[0].get('u_autoNoiseGridX'))-38)).toBe(low32(word(draws[1].get('u_autoNoiseGridX'))-6))
 expect(low32(word(draws[0].get('u_autoNoiseGridY'))-43)).toBe(low32(word(draws[1].get('u_autoNoiseGridY'))-43))
 expect(scratch.brushBehavior?.dabSequence).toBe(1)

})
it('155 eraseoverride is rejected by actualBBP beforestate/GL/resourceaccess',()=>{let calls=0;const gl=new Proxy({},{get(){calls++;throw Error('GL touched before scope')}})as WebGLRenderingContext;const painter=new BrushBehaviorPainter({gl}as BrushContext,()=>{throw Error('Texture before scope')},()=>{throw Error('Grain before scope')},()=>{},()=>{throw Error('Lease before scope')});const b=sprayRectangle155(),scratch={}as BehaviorScratch;expect(()=>painter.paint({resolveForPaint(){throw Error('Target before scope')},markContentPainted(){}},[dab155],{}as PencilPreset,b,{size:true,opacity:true},[1,0,0],scratch,false,undefined,brushExecutionContext({version:1,strokeSeed:123,sequentialSeed:456}),true)).toThrow('Invalid Spray rectangle noise155 scope');expect(scratch.brushBehavior).toBeUndefined();expect(calls).toBe(0)})
