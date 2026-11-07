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
import {brushExecutionContext} from './brushExecutionContext'
import {makeBrushGradient,isBrushLibrary} from '@grafetto/shared'
import {bindBrushGradient} from '../dabs/BrushPreparation'
import {colorSmudgeGradientTipPixels} from './colorSmudgeTip'
const ids=Array.from({length:7},(_,i)=>`asset:${(0xa840+i).toString(16).padStart(64,'0')}`as const)
function brush(pipe=false):BrushDescriptor{
 const b=structuredClone(digitalBrushFromPreset('hard-round'))
 b.model='stamp';b.version=84;b.flow=1;b.opacity=1;b.paperInteraction=0
 b.tip={kind:'bitmap',mask:ids[0],hardness:1,aspect:1,angle:0,rotation:'fixed',color:{planes:[ids[1],ids[2],ids[3]],...(pipe?{frames:[[ids[1],ids[2],ids[3]],[ids[4],ids[5],ids[6]]]as [[`asset:${string}`,`asset:${string}`,`asset:${string}`],[`asset:${string}`,`asset:${string}`,`asset:${string}`]]}:{})},...(pipe?{animation:{mode:'incremental' as const,frames:[ids[0],ids[0]]}}:{})}
 b.behavior={version:2,rendering:{accumulation:'directOver',mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'normal'}}
 b.sizeByPressure=[[0,1],[1,1]];b.opacityByPressure=[[0,1],[1,1]];b.flowByPressure=[[0,1],[1,1]]
 delete b.texture;delete b.wet
 b.id='imported-9797979797979797';b.version=97;b.tip.color={gradient:{gray:ids[1]}};delete b.tip.animation;return b
}
function setup(limit=1,variable=false,origin=0){
 ids.forEach((id,i)=>installBrushPixels(variable?id.replace('a84','b86'):id,variable?new Uint8Array(i<=3?16:64).fill(i===0?255:128):new Uint8Array(i===0?[255,128,0,64]:i<=3?[255,64,192,32]:[32,192,64,255])))
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
 const resolvedBounds:unknown[]=[]
 const paint=(b:BrushDescriptor,execution:ReturnType<typeof brushExecutionContext>,fg:[number,number,number]=[0,1,0],activeScratch=scratch)=>painter.paint({resolveForPaint:(bounds:unknown)=>{resolvedBounds.push(bounds);return[{originX:origin,originY:origin,buffer,contentRect:null}]},markContentPainted:()=>{}}as unknown as ILayerBuffer,[0,1].slice(0,limit).map(i=>({x:20+i*10,y:20,size:12,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:i*10}as Dab)),{sizeMultiplier:1}as PencilPreset,{brush:b,pressure:{size:true,opacity:true}},fg,activeScratch,undefined,execution)
 return {painter,gl,stop,calls,uploads,scratch,paint,resolvedBounds}
}

const paletteA=makeBrushGradient([1,0,0,0],[0,0,1,1]),paletteB=makeBrushGradient([0,1,0,1],[1,1,1,1])
const execution=(gradient:string)=>brushExecutionContext(undefined,{version:1,gradient})
it('prepares distinct captured-palette keys and actual PMA uploads before the public Pixel paint route',()=>{
 const b=brush(),s=setup(),planes=[ids[1],ids[1],ids[1]]as const
 try{
  expect(brushUsesStampEffects(b)).toBe(true)
  const plan=brushPreparationPlan(b),a=bindBrushGradient(plan.resources,paletteA),c=bindBrushGradient(plan.resources,paletteB),ra=a.find(r=>r.gradientMap)!,rb=c.find(r=>r.gradientMap)!
  expect(brushTextureResourceKey(ra)).not.toBe(brushTextureResourceKey(rb));expect(()=>bindBrushGradient(plan.resources,undefined)).toThrow('captured palette')
  expect(()=>s.paint(b,undefined)).toThrow('captured canvas gradient');expect(s.scratch.brushBehavior).toBeUndefined()
  expect(()=>s.paint(b,execution(paletteA))).toThrow('not prepared');expect(s.scratch.brushBehavior).toBeUndefined();expect(s.calls).toHaveLength(0)
  s.painter.preparePixelGradient(b,execution(paletteA))
  const viewA=s.painter['preparedImage'](ids[0],planes,undefined,paletteA)
  expect(()=>s.paint(b,execution(paletteA))).toThrow(s.stop);expect(s.calls[0].texture).toBe(viewA.texture);expect(s.calls[0].values.get('u_originalRgbaTip')).toEqual([1])
  const rgba=s.uploads.filter(c=>c[2]===s.gl.RGBA&&c[3]===2&&c[4]===2)
  expect(rgba).toHaveLength(1);expect(rgba[0][8]).toEqual(colorSmudgeGradientTipPixels(new Uint8Array([255,128,0,64]),new Uint8Array([255,64,192,32]),paletteA))
  expect(()=>s.paint(b,execution(paletteB))).toThrow();expect(s.calls).toHaveLength(1)
  s.painter.preparePixelGradient(b,execution(paletteB));const viewB=s.painter['preparedImage'](ids[0],planes,undefined,paletteB);expect(viewB.texture).not.toBe(viewA.texture)
  s.painter.preparePixelGradient(b,execution(paletteA));expect(s.uploads.filter(c=>c[2]===s.gl.RGBA&&c[3]===2&&c[4]===2)).toHaveLength(2)
  s.painter.initGL();expect(()=>viewA.assertCurrent()).toThrow('retired');expect(()=>viewB.assertCurrent()).toThrow('retired')
 }finally{s.painter.destroy()}
})
it('keeps revision96 and unsupported Pixel gradient combinations closed',()=>{
 const b=brush(),lib=()=>({schemaVersion:1,assets:ids.slice(0,2).map(id=>({id,size:2,file:id.slice(6)+'.bin'})),skipped:[],brushes:[{name:'Authored gradient application',source:'kpp',warnings:[],descriptor:b}]})
 const parent=structuredClone(digitalBrushFromPreset('hard-round'));parent.id='imported-9797979797979798';parent.version=97;parent.behavior={version:2,dual:{brush:structuredClone(b),blendMode:'multiply'}};const childLib={...lib(),brushes:[{name:'Parent with gradient child',source:'kpp',warnings:[],descriptor:parent}]};expect(isBrushLibrary(childLib)).toBe(false)
 expect(isBrushLibrary(lib())).toBe(true);b.version=96;expect(isBrushLibrary(lib())).toBe(false);b.version=97
 b.behavior!.rendering!.accumulation='alphaDarken';expect(isBrushLibrary(lib())).toBe(false);b.behavior!.rendering!.accumulation='directOver'
 b.tip.animation={mode:'incremental',frames:[ids[0],ids[0]]};expect(isBrushLibrary(lib())).toBe(false);delete b.tip.animation
 b.behavior!.dual={brush:structuredClone(digitalBrushFromPreset('hard-round')),blendMode:'multiply'};expect(isBrushLibrary(lib())).toBe(false);delete b.behavior!.dual
 const oversized=lib();oversized.assets.forEach(a=>a.size=1024);expect(isBrushLibrary(oversized)).toBe(false)
})
