import {beginBrushBehavior,behaviorStampsForDab,brushSourceSpacingAxes} from './brushBehavior'
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
 const paint=(b:BrushDescriptor,fg:[number,number,number]=[0,1,0],activeScratch=scratch)=>painter.paint({resolveForPaint:(bounds:unknown)=>{resolvedBounds.push(bounds);return[{originX:origin,originY:origin,buffer,contentRect:null}]},markContentPainted:()=>{}}as unknown as ILayerBuffer,[0,1].slice(0,limit).map(i=>({x:20+i*10,y:20,size:12,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:i*10}as Dab)),{sizeMultiplier:1}as PencilPreset,{brush:b,pressure:{size:true,opacity:true}},fg,activeScratch,undefined)
 return {painter,gl,stop,calls,uploads,scratch,paint,resolvedBounds}
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

function variableBrush():BrushDescriptor {
 const b=brush(true);b.version=86
 const map=(id:string)=>id.replace('a84','b86') as `asset:${string}`
 b.tip.mask=map(ids[0]);b.tip.maskBounds={x:0,y:0,width:1,height:1}
 b.tip.animation={mode:'incremental',frames:[map(ids[0]),map(ids[4])],geometry:{version:1,frames:[{sourceWidth:4,sourceHeight:2,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:8,sourceHeight:6,maskBounds:{x:0,y:0,width:1,height:1}}]}}
 b.tip.color={planes:[map(ids[1]),map(ids[2]),map(ids[3])],frames:[[map(ids[1]),map(ids[2]),map(ids[3])],[map(ids[4]),map(ids[5]),map(ids[6])]]}
 return b
}
it('variable GIH86 facade preserves original dimensions and selected-frame footprint without local selection',()=>{
 const b=variableBrush(),s=setup(2,true)
 try{
  expect(()=>s.paint(b)).toThrow(s.stop)
  expect(s.calls.map(c=>c.values.get('u_gihFrame'))).toEqual([[1,4,2,4],[1,8,6,8]])
  // Nominal12px: first original4x2 ->12x6, second8x6 ->24x18, no resize-to-first.
  expect(s.calls.map(c=>c.values.get('u_dabRadius'))).toEqual([[3],[9]])
  expect(s.calls.map(c=>c.values.get('u_aspectRatio'))).toEqual([[2],[24/18]])
  expect(s.calls.map(c=>c.values.get('u_dabCenter'))).toEqual([[20,20],[36,26]])
  expect(s.calls.map(c=>c.values.get('u_originalRgbaTip'))).toEqual([[1],[1]])
  expect(s.scratch.brushBehavior?.dabOrdinal).toBe(2)
  expect(s.resolvedBounds[0]).toEqual({minX:13,minY:16,maxX:49,maxY:36})
 }finally{s.painter.destroy()}
})
it('variable GIH86 validates all original frame metadata before author state changes',()=>{
 const b=variableBrush(),s=setup(1,true)
 b.tip.animation!.geometry!.frames[1].maskBounds.width=.5
 try{expect(()=>s.paint(b)).toThrow('padding');expect(s.scratch.brushBehavior).toBeUndefined();expect(s.calls).toHaveLength(0)}finally{s.painter.destroy()}
})

it('variable GIH86 grayscale shares selected placement and sampler geometry without original RGB',()=>{
 const b=variableBrush(),s=setup(2,true);delete b.tip.color
 try{expect(()=>s.paint(b)).toThrow(s.stop);expect(s.calls.map(c=>c.values.get('u_gihFrame'))).toEqual([[1,4,2,4],[1,8,6,8]]);expect(s.calls.map(c=>c.values.get('u_originalRgbaTip'))).toEqual([[0],[0]]);expect(s.calls.map(c=>c.values.get('u_dabCenter'))).toEqual([[20,20],[36,26]])}finally{s.painter.destroy()}
})
it('variable GIH86 reanchors a larger selected frame on the opposite reference hotspot when mirrored',()=>{
 const b=variableBrush(),s=setup(2,true);b.behavior!.mirror={horizontal:true,vertical:false,value:1}
 try{expect(()=>s.paint(b)).toThrow(s.stop);expect(s.calls.map(c=>c.values.get('u_dabCenter'))).toEqual([[20,20],[24,26]]);expect(s.calls[1].values.get('u_gihSampleX')![0]).toBeLessThan(0)}finally{s.painter.destroy()}
})
it('returning from GIH86 to unchanged Pixel84 clears selected-frame uniforms',()=>{
 const b=variableBrush(),s=setup(1,true)
 try{
  expect(()=>s.paint(b)).toThrow(s.stop)
  const old=structuredClone(b);old.version=84;delete old.tip.animation
  if(!old.tip.color||!('planes'in old.tip.color))throw Error('Expected RGB');delete old.tip.color.frames
  const scratch={getOrCreate:s.scratch.getOrCreate,brushCeiling:s.scratch.brushCeiling,noteBrushEdgePx:s.scratch.noteBrushEdgePx}as unknown as BehaviorScratch
  expect(()=>s.paint(old,[0,1,0],scratch)).toThrow(s.stop)
  expect(s.calls[1].values.get('u_gihFrame')).toEqual([0,0,0,1]);expect(s.calls[1].values.get('u_originalRgbaTip')).toEqual([1])
 }finally{s.painter.destroy()}
})

it('frame identity is chosen once per logical dab and never changes nominal spacing or stamp size',()=>{
 const b=variableBrush(),old=structuredClone(b);delete old.tip.animation!.geometry
 const dab={x:20,y:20,size:12,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}as Dab
 const state=beginBrushBehavior(dab),legacy=beginBrushBehavior(dab)
 const got=[behaviorStampsForDab(b,dab,state,[1,0,0])[0],behaviorStampsForDab(b,{...dab,t:10},state,[1,0,0])[0]]
 const prior=[behaviorStampsForDab(old,dab,legacy,[1,0,0])[0],behaviorStampsForDab(old,{...dab,t:10},legacy,[1,0,0])[0]]
 expect(got.map(x=>x.frameIndex)).toEqual([0,1]);expect(state.dabOrdinal).toBe(legacy.dabOrdinal)
 for(let i=0;i<got.length;i++){const {frameIndex,frameCoordinateFlip,...nominal}=got[i];expect(frameIndex).toBe(i);expect(frameCoordinateFlip).toBe(false);expect(nominal).toEqual(prior[i])}
 const profile={mode:'diameter' as const,coefficient:.2}
 expect(brushSourceSpacingAxes(b,dab,beginBrushBehavior(dab),profile,1,0)).toEqual(brushSourceSpacingAxes(old,dab,beginBrushBehavior(dab),profile,1,0))
 // Same seed and tuples split into separate paint/input batches still consume identical animation ordinals.
 expect(state.seed).toBe(legacy.seed);expect(state.dabSequence).toBe(legacy.dabSequence)
})

it('frame index distinguishes geometry even when both alpha and RGB texture identities are shared',()=>{
 const b=variableBrush(),s=setup(2,true),a=b.tip.animation!
 if(!b.tip.color||!('planes'in b.tip.color)||!b.tip.color.frames)throw Error('Expected RGB frames')
 a.frames[1]=a.frames[0];a.geometry!.frames[1]={sourceWidth:4,sourceHeight:4,maskBounds:{x:0,y:0,width:1,height:1}};b.tip.color.frames[1]=[...b.tip.color.planes]
 try{expect(()=>s.paint(b)).toThrow(s.stop);expect(s.calls[0].texture).toBe(s.calls[1].texture);expect(s.calls.map(c=>c.values.get('u_gihFrame'))).toEqual([[1,4,2,4],[1,4,4,4]]);expect(s.calls.map(c=>c.values.get('u_dabRadius'))).toEqual([[3],[6]])}finally{s.painter.destroy()}
})
it('retiled rendering keeps the same selected sampler transform and logical ordinal',()=>{
 const b=variableBrush(),a=setup(2,true),tile=setup(2,true,16)
 try{
  expect(()=>a.paint(b)).toThrow(a.stop);expect(()=>tile.paint(b)).toThrow(tile.stop)
  for(let i=0;i<2;i++){expect(tile.calls[i].values.get('u_gihSampleX')).toEqual(a.calls[i].values.get('u_gihSampleX'));expect(tile.calls[i].values.get('u_gihSampleY')).toEqual(a.calls[i].values.get('u_gihSampleY'))}
  expect(tile.calls.map(c=>c.values.get('u_dabCenter'))).toEqual([[4,4],[20,10]])
  expect(tile.scratch.brushBehavior?.dabOrdinal).toBe(a.scratch.brushBehavior?.dabOrdinal)
 }finally{a.painter.destroy();tile.painter.destroy()}
})

it('plain parent cannot bypass primary-only GIH86 by nesting a grayscale variable child',()=>{
 const child=variableBrush();delete child.tip.color
 const s=setup(1,true),parent=structuredClone(digitalBrushFromPreset('hard-round'))
 parent.behavior={version:2,dual:{brush:child,blendMode:'multiply',sampling:'independent'}}
 try{expect(()=>brushPreparationPlan(parent)).toThrow('Variable GIH child is unsupported')}finally{s.painter.destroy()}
})

it.each(['spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal']as const)('GIH86 preparation rejects non-Pixel family %s before branch bypass',family=>{
 const b=variableBrush(),s=setup(1,true);delete b.tip.color
 const combined={...b,[family]:{}}
 try{expect(()=>brushPreparationPlan(combined)).toThrow('Unsupported variable GIH geometry combination');expect(s.scratch.brushBehavior).toBeUndefined();expect(s.calls).toHaveLength(0)}finally{s.painter.destroy()}
})
