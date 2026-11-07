import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushPainter,type BrushContext} from '../dabs/BrushPainter'
import {brushPreparationPlan,brushUsesStampEffects,brushTextureResourceKey} from '../dabs/BrushPreparation'
import type {BehaviorScratch} from '../dabs/BrushBehaviorPainter'
import type {ILayerBuffer} from '../buffers/ILayerBuffer'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from './pencilPresets'
import {digitalBrushFromPreset} from './digitalBrushPresets'
import {installBrushPixels} from './importedBrushes'
import {createBrushStampFragment} from '../raster/brushBehaviorShaders'
const ids=Array.from({length:7},(_,i)=>`asset:${(0xa840+i).toString(16).padStart(64,'0')}`as const)
function brush(pipe=false):BrushDescriptor{
 const b=structuredClone(digitalBrushFromPreset('hard-round'))
 b.model='stamp';b.version=84;b.flow=1;b.opacity=1;b.paperInteraction=0
 b.tip={kind:'bitmap',mask:ids[0],hardness:1,aspect:1,angle:0,rotation:'fixed',color:{planes:[ids[1],ids[2],ids[3]],...(pipe?{frames:[[ids[1],ids[2],ids[3]],[ids[4],ids[5],ids[6]]]as [[`asset:${string}`,`asset:${string}`,`asset:${string}`],[`asset:${string}`,`asset:${string}`,`asset:${string}`]]}:{})},...(pipe?{animation:{mode:'incremental' as const,frames:[ids[0],ids[0]]}}:{})}
 b.behavior={version:2,rendering:{accumulation:'directOver',mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'normal'}}
 b.sizeByPressure=[[0,1],[1,1]];b.opacityByPressure=[[0,1],[1,1]];b.flowByPressure=[[0,1],[1,1]]
 delete b.texture;delete b.wet
 return b
}
function setup(limit=1){
 ids.forEach((id,i)=>installBrushPixels(id,new Uint8Array(i===0?[255,128,0,64]:i<=3?[255,64,192,32]:[32,192,64,255])))
 const values=new Map<string,number[]>(),bindings=new Map<number,WebGLTexture|null>(),sources=new WeakMap<object,string>(),programSources=new WeakMap<object,string[]>(),calls:{texture:WebGLTexture|null|undefined;values:Map<string,number[]>}[]=[],uploads:unknown[][]=[]
 let active=33984,current:object|undefined
 const stop=new Error('actual original RGBA deposition reached'),constants=new Map<string,number>();let next=100
 const gl=new Proxy({}, {get:(_t,k)=>{
  if(k==='TEXTURE0')return 33984
  if(typeof k==='string'&&/^TEXTURE[1-7]$/.test(k))return 33984+Number(k.slice(7))
  if(k==='RGBA')return 6408
  if(k==='LUMINANCE')return 6409
  if(k==='LUMINANCE_ALPHA')return 6410
  if(typeof k==='string'&&/^[A-Z_0-9]+$/.test(k)){if(!constants.has(k))constants.set(k,next++);return constants.get(k)}
  if(k==='getParameter')return (parameter:number)=>parameter===constants.get('MAX_TEXTURE_SIZE')?2048:parameter===constants.get('ACTIVE_TEXTURE')?active:parameter===constants.get('TEXTURE_BINDING_2D')?bindings.get(active)??null:4
  if(k==='getExtension')return ()=>null
  if(k==='getShaderParameter'||k==='getProgramParameter')return ()=>true
  if(k==='getUniformLocation')return (_p:unknown,n:string)=>n
  if(k==='getAttribLocation')return ()=>0
  if(k==='shaderSource')return (shader:object,s:string)=>sources.set(shader,s)
  if(k==='attachShader')return (p:object,s:object)=>programSources.set(p,[...(programSources.get(p)??[]),sources.get(s)??''])
  if(k==='useProgram')return (p:object)=>{current=p}
  if(k==='activeTexture')return (unit:number)=>{active=unit}
  if(k==='bindTexture')return (_target:number,t:WebGLTexture|null)=>bindings.set(active,t)
  if(k==='texImage2D')return (...args:unknown[])=>uploads.push(args)
  if(typeof k==='string'&&k.startsWith('uniform'))return (name:string,...args:number[])=>values.set(name,args)
  if(k==='drawArrays')return ()=>{if(current&&programSources.get(current)?.some(s=>s.includes('vec3 brushOriginalRgbaPigment('))){calls.push({texture:bindings.get(33985),values:new Map(values)});if(calls.length>=limit)throw stop}}
  if(typeof k==='string'&&k.startsWith('create'))return ()=>({})
  return ()=>{}
 }})as WebGLRenderingContext
 const painter=new BrushPainter({gl,quadBuf:()=>({}),paper:{texture:{},scale:1,worldSize:()=>({w:64,h:64})},segmentLength:()=>1}as unknown as BrushContext)
 painter.initGL();painter.prepareStampEffects()
 const buffer={width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer
 const scratch={getOrCreate:()=>({original:buffer,coverage:{...buffer,texture:{}}}),brushCeiling:()=>({...buffer,texture:{}}),noteBrushEdgePx:()=>0}as unknown as BehaviorScratch
 const paint=(b:BrushDescriptor,fg:[number,number,number]=[0,1,0],activeScratch=scratch)=>painter.paint({resolveForPaint:()=>[{originX:0,originY:0,buffer,contentRect:null}],markContentPainted:()=>{}}as unknown as ILayerBuffer,[0,1].slice(0,limit).map(i=>({x:20+i*10,y:20,size:12,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:i*10}as Dab)),{sizeMultiplier:1}as PencilPreset,{brush:b,pressure:{size:true,opacity:true}},fg,activeScratch,undefined)
 return {painter,gl,stop,calls,uploads,scratch,paint}
}
it('actual Pixel preparation uses ONE common RGBA cache upload and the same borrowed view',()=>{
 const b=brush(),s=setup()
 try{
  const plan=brushPreparationPlan(b),resource=plan.resources.find(r=>!!r.colorPlanes)
  if(!resource)throw Error('No actual RGB resource')
  expect(brushUsesStampEffects(b)).toBe(true);expect(plan.capabilities).toEqual(['stampEffects'])
  expect(brushTextureResourceKey(resource)).toBe(`t:rgba:${ids[0]}:${ids.slice(1,4).join(':')}`)
  s.painter.prepareTexture(plan.resources,resource);s.painter.prepareTexture(plan.resources,resource)
  const rgba=s.uploads.filter(c=>c[2]===s.gl.RGBA&&c[3]===2&&c[4]===2)
  expect(rgba).toHaveLength(1);expect(rgba[0][8]).toBeInstanceOf(Uint8Array)
  expect(s.painter.hasPreparedTexture(resource)).toBe(true)
  const image=s.painter['preparedImage'](ids[0],[ids[1],ids[2],ids[3]])
  expect(()=>s.paint(b,[0,1,0])).toThrow(s.stop)
  expect(s.calls[0].texture).toBe(image.texture)
  expect(s.calls[0].values.get('u_originalRgbaTip')).toEqual([1])
  expect(s.calls[0].values.get('u_autoNoiseConfig')).toEqual([65535,0,0,0])
  expect(s.uploads.filter(c=>c[2]===s.gl.RGBA&&c[3]===2&&c[4]===2)).toHaveLength(1)
  s.painter.initGL();expect(()=>image.assertCurrent()).toThrow('retired')
 }finally{s.painter.destroy()}
})
it('never-selected Pixel peer prepares real RGB before author state and shares the common cache',()=>{
 const s=setup(),b=brush()
 try{
  const resource=brushPreparationPlan(b).resources.find(r=>!!r.colorPlanes)
  if(!resource)throw Error('Expected original RGBA resource')
  expect(s.painter.hasPreparedTexture(resource)).toBe(false)
  // No engine.prepareBrush/prepareTexture: READ enters actual facade directly.
  expect(()=>s.paint(b)).toThrow(s.stop)
  expect(s.calls[0].values.get('u_originalRgbaTip')).toEqual([1])
  expect(s.painter.hasPreparedTexture(resource)).toBe(true)
  expect(s.uploads.filter(c=>c[2]===s.gl.RGBA&&c[3]===2&&c[4]===2)).toHaveLength(1)
  const view=s.painter['preparedImage'](ids[0],[ids[1],ids[2],ids[3]])
  expect(s.calls[0].texture).toBe(view.texture)
  s.painter.initGL();expect(()=>view.assertCurrent()).toThrow('retired')
 }finally{s.painter.destroy()}
})
it('never-selected Pixel GIH preflights every paired RGB frame without alpha-only fallback',()=>{
 const s=setup(2),b=brush(true)
 try{
  expect(()=>s.paint(b)).toThrow(s.stop)
  const first=s.painter['preparedImage'](ids[0],[ids[1],ids[2],ids[3]])
  const second=s.painter['preparedImage'](ids[0],[ids[4],ids[5],ids[6]])
  expect(first.texture).not.toBe(second.texture)
  expect(s.calls.map(c=>c.texture)).toEqual([first.texture,second.texture])
  expect(s.uploads.filter(c=>c[2]===s.gl.RGBA&&c[3]===2&&c[4]===2)).toHaveLength(2)
 }finally{s.painter.destroy()}
})
it('missing imported RGB bytes fails before author state and deposition',()=>{
 const s=setup(),b=brush()
 if(!b.tip.color||!('planes' in b.tip.color))throw Error('Expected RGB planes')
 b.tip.color.planes[2]=`asset:${'f'.repeat(64)}`
 try{expect(()=>s.paint(b)).toThrow('Brush asset unavailable');expect(s.scratch.brushBehavior).toBeUndefined();expect(s.calls).toHaveLength(0)}finally{s.painter.destroy()}
})
it('incremental GIH frames sharing alpha bind their paired RGB resources in recorded order',()=>{
 const b=brush(true),s=setup(2)
 try{
  const plan=brushPreparationPlan(b);for(const resource of plan.resources.filter(r=>!!r.colorPlanes))s.painter.prepareTexture(plan.resources,resource)
  const first=s.painter['preparedImage'](ids[0],[ids[1],ids[2],ids[3]]),second=s.painter['preparedImage'](ids[0],[ids[4],ids[5],ids[6]])
  expect(first.texture).not.toBe(second.texture)
  expect(()=>s.paint(b)).toThrow(s.stop)
  expect(s.calls.map(c=>c.texture)).toEqual([first.texture,second.texture])
  expect(s.scratch.brushBehavior?.dabOrdinal).toBe(2)
 }finally{s.painter.destroy()}
})
it('only the effects shader reads ORIGINAL pigment and keeps old samplers/text unchanged',()=>{
 const old=createBrushStampFragment(true,true,true),shader=createBrushStampFragment(true,true,true,true)
 expect(old).not.toContain('u_originalRgbaTip')
 expect(shader).toContain('shape=tipSample.a;pigment=brushOriginalRgbaPigment(tipSample)')
 expect(shader).toContain('sampleValue.rgb/sampleValue.a')
 expect(shader).not.toContain('u_color*brushOriginalRgbaPigment')
 expect((shader.match(/uniform sampler2D/g)??[]).length).toBe((old.match(/uniform sampler2D/g)??[]).length)
})

it('same effects program clears the original-RGB flag when switching to an ordinary textured stamp',()=>{
 const b=brush(),s=setup()
 try{
  const plan=brushPreparationPlan(b);for(const resource of plan.resources.filter(r=>!!r.colorPlanes))s.painter.prepareTexture(plan.resources,resource)
  expect(()=>s.paint(b)).toThrow(s.stop)
  const ordinary=structuredClone(b)
  ordinary.tip={kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'ellipse',horizontalFade:1,verticalFade:1,antialias:false}}
  ordinary.texture={id:'cloud',periodPx:32,strength:1,application:{mode:'overlay',soft:true}}
  const nextScratch={getOrCreate:s.scratch.getOrCreate,brushCeiling:s.scratch.brushCeiling,noteBrushEdgePx:s.scratch.noteBrushEdgePx}as unknown as BehaviorScratch
  expect(()=>s.paint(ordinary,[0,0,1],nextScratch)).toThrow(s.stop)
  expect(s.calls[0].values.get('u_originalRgbaTip')).toEqual([1])
  expect(s.calls[1].values.get('u_originalRgbaTip')).toEqual([0])
 }finally{s.painter.destroy()}
})

it('spatially varying original RGB uses the real alpha-darken feedback path even for constant foreground',()=>{
 const b=brush(),s=setup()
 b.behavior!.rendering={accumulation:'alphaDarken',mode:'uniformGlaze',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'normal'}
 try{
  const plan=brushPreparationPlan(b);for(const resource of plan.resources.filter(r=>!!r.colorPlanes))s.painter.prepareTexture(plan.resources,resource)
  expect(()=>s.paint(b,[1,0,0])).toThrow(s.stop)
  expect(s.calls[0].values.get('u_washMode')).toEqual([2])
  expect(s.calls[0].values.get('u_originalRgbaTip')).toEqual([1])
 }finally{s.painter.destroy()}
})
