import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {BrushContext} from './BrushPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from '../presets/pencilPresets'
import {DIGITAL_BRUSHES} from '../presets/digitalBrushPresets'
import {installBrushPixels} from '../presets/importedBrushes'

it('passes captured basis textures and per-dab primary/mask softness through the actual painter',()=>{
 const uniforms=new Map<string,number[]>(),draws:Map<string,number[]>[]=[],textures:unknown[][]=[]
 const stop=new Error('two source depositions reached'),shaderSources:string[]=[]
 const gl=new Proxy({}, {get:(_target,key)=>{
  if(key==='getUniformLocation')return (_p:unknown,name:string)=>name
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true
  if(key==='getAttribLocation')return ()=>0
  if(key==='getExtension')return ()=>null
  if(key==='shaderSource')return (_s:unknown,source:string)=>shaderSources.push(source)
  if(String(key).startsWith('uniform'))return (name:string,...args:number[])=>uniforms.set(name,args)
  if(key==='drawArrays')return ()=>{draws.push(new Map(uniforms));if(draws.length===2)throw stop}
  if(String(key).startsWith('create'))return ()=>({})
  return ()=>{}
 }}) as WebGLRenderingContext
 const ctx={gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1} as unknown as BrushContext
 const painter=new BrushBehaviorPainter(ctx,(...args)=>{textures.push(args);return {}as WebGLTexture},()=>({})as WebGLTexture,()=>{},()=>()=>{})
 const id=`asset:${'c'.repeat(64)}` as const
 // Three LUT entries, interleaved s0/s1, one RGBA texel per sample.
 // Authenticity/math fixtures are tested separately against Python output.
 const payload=new Uint8Array(64),view=new DataView(payload.buffer)
 for(let i=0;i<3;i++){view.setUint32(i*8,0,false);view.setUint32(i*8+4,0xffffffff,false)}
 installBrushPixels(id,payload)
 const profile={kind:'radialCurveSoftness' as const,lookup:id,resolution:1,encoding:'softness-affine-unorm32be-v1' as const,minimum:0,span:1,antialias:false as const}
 const base:BrushDescriptor={...DIGITAL_BRUSHES[0],model:'stamp',tip:{kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',profile},behavior:{version:2},flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]]}
 const child:BrushDescriptor={...base,behavior:{version:2,softness:.5}}
 const brush:BrushDescriptor={...base,behavior:{version:2,softness:.8,modulations:{softness:[{control:'pressure',minimum:0,jitter:0}]},dual:{brush:child,blendMode:'multiply'}}}
 const buffer={width:64,height:64,texture:{},beginDraw(){},clear(){},endDraw(){}} as unknown as AccumulationBuffer
 const scratch={getOrCreate:()=>({original:buffer,coverage:buffer}),brushCeiling:()=>buffer,noteBrushEdgePx:()=>0} as unknown as BehaviorScratch
 const dabs=[.25,.75].map((pressure,i)=>({x:20+i*5,y:20,size:20,pressure,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:i*10} as Dab))
 expect(()=>painter.paint({resolveForPaint:()=>[{originX:0,originY:0,buffer,contentRect:null}],markContentPainted:()=>{}},dabs,{sizeMultiplier:1}as PencilPreset,brush,{size:true,opacity:true},[1,0,0],scratch)).toThrow(stop)
 // Two existing texture-cache lookups per dab; no per-dab resource creation.
 expect(textures).toHaveLength(4)
 for(const args of textures){expect(args[0]).toBe(id);expect(args[4]).toBe(true)}
 expect(draws[0].get('u_tipProcedural')).toEqual([4,1,4,0])
 for(const draw of draws){
  expect(draw.get('u_tipSoftnessBasis')).toEqual([1,4,0,1])
  expect(draw.get('u_dualSoftnessBasis')).toEqual([1,4,0,1])
  expect(draw.get('u_dualSoftness')).toEqual([.5])
 }
 expect(draws[0].get('u_tipSoftness')).toEqual([.2])
 expect(draws[1].get('u_tipSoftness')?.[0]).toBeCloseTo(.6,14)
 expect(shaderSources.some(s=>s.includes('return brushRadialSoftnessMask(lookup,dot(p,p),basis,softness)'))).toBe(true)
})
