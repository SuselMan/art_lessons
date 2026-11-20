import {expect,it,vi} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushPainter,type BrushContext} from '../dabs/BrushPainter'
import {brushPreparationPlan,brushTextureResourceKey} from '../dabs/BrushPreparation'
import type {BehaviorScratch} from '../dabs/BrushBehaviorPainter'
import type {ILayerBuffer} from '../buffers/ILayerBuffer'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from './pencilPresets'
import {digitalBrushFromPreset} from './digitalBrushPresets'
import {installBrushPixels} from './importedBrushes'
import {brushExecutionContext} from './brushExecutionContext'
import {makeBrushGradient,isBrushLibrary} from '@grafetto/shared'
import {BrushPreparation,bindBrushGradient,brushPreparationBytes,brushPreparationTransientBytes,brushTextureLeasePlan} from '../dabs/BrushPreparation'
import {pixelGradientSourcePixels,pixelGradientPalettePixels} from './pixelFilteredGradient'
import {createBrushStampFragment} from '../raster/brushBehaviorShaders'
import {BrushTextureCache} from '../dabs/BrushTextureCache'
const ids=Array.from({length:7},(_,i)=>`asset:${(0xa840+i).toString(16).padStart(64,'0')}`as const)
function brush(pipe=false):BrushDescriptor{
 const b=structuredClone(digitalBrushFromPreset('hard-round'))
 b.model='stamp';b.version=84;b.flow=1;b.opacity=1;b.paperInteraction=0
 b.tip={kind:'bitmap',mask:ids[0],hardness:1,aspect:1,angle:0,rotation:'fixed',color:{planes:[ids[1],ids[2],ids[3]],...(pipe?{frames:[[ids[1],ids[2],ids[3]],[ids[4],ids[5],ids[6]]]as [[`asset:${string}`,`asset:${string}`,`asset:${string}`],[`asset:${string}`,`asset:${string}`,`asset:${string}`]]}:{})},...(pipe?{animation:{mode:'incremental' as const,frames:[ids[0],ids[0]]}}:{})}
 b.behavior={version:2,rendering:{accumulation:'directOver',mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'normal'}}
 b.sizeByPressure=[[0,1],[1,1]];b.opacityByPressure=[[0,1],[1,1]];b.flowByPressure=[[0,1],[1,1]]
 delete b.texture;delete b.wet
 b.id='imported-9797979797979797';b.version=100;b.tip.color={gradient:{gray:ids[1],sampling:'filteredGray-v1'}};delete b.tip.animation;return b
}
function setup(limit=1,variable=false,origin=0){
 ids.forEach((id,i)=>installBrushPixels(variable?id.replace('a84','b86'):id,variable?new Uint8Array(i<=3?16:64).fill(i===0?255:128):new Uint8Array(i===0?[255,128,0,64]:i<=3?[255,64,192,32]:[32,192,64,255])))
 const values=new Map<string,number[]>(),bindings=new Map<number,WebGLTexture|null>(),sources=new WeakMap<object,string>(),programSources=new WeakMap<object,string[]>(),calls:{texture:WebGLTexture|null|undefined;values:Map<string,number[]>;palette:WebGLTexture|null|undefined}[]=[],uploads:unknown[][]=[]
 let active=33984,current:object|undefined,failPalette=false
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
  if(k==='texImage2D')return (...args:unknown[])=>{if(failPalette&&args[3]===256&&args[4]===1)throw undefined;uploads.push(args)}
  if(typeof k==='string'&&k.startsWith('uniform'))return (name:string,...args:number[])=>values.set(name,args)
  if(k==='drawArrays')return ()=>{if(current&&programSources.get(current)?.some(s=>s.includes('vec3 brushOriginalRgbaPigment('))){calls.push({texture:bindings.get(33985),values:new Map(values),palette:bindings.get(33990)});if(calls.length>=limit)throw stop}}
  if(typeof k==='string'&&k.startsWith('create'))return ()=>({})
  return ()=>{}
 }})as WebGLRenderingContext
 const painter=new BrushPainter({gl,quadBuf:()=>({}),paper:{texture:{},scale:1,worldSize:()=>({w:64,h:64})},segmentLength:()=>1}as unknown as BrushContext)
 painter.initGL();painter.prepareStampEffects()
 const buffer={width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer
 const scratch={getOrCreate:()=>({original:buffer,coverage:{...buffer,texture:{}}}),brushCeiling:()=>({...buffer,texture:{}}),noteBrushEdgePx:()=>0}as unknown as BehaviorScratch
 const resolvedBounds:unknown[]=[]
 const paint=(b:BrushDescriptor,execution:ReturnType<typeof brushExecutionContext>,fg:[number,number,number]=[0,1,0],activeScratch=scratch)=>painter.paint({resolveForPaint:(bounds:unknown)=>{resolvedBounds.push(bounds);return[{originX:origin,originY:origin,buffer,contentRect:null}]},markContentPainted:()=>{}}as unknown as ILayerBuffer,[0,1].slice(0,limit).map(i=>({x:20+i*10,y:20,size:12,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:i*10}as Dab)),{sizeMultiplier:1}as PencilPreset,{brush:b,pressure:{size:true,opacity:true}},fg,activeScratch,undefined,execution)
 return {painter,gl,stop,calls,uploads,scratch,paint,resolvedBounds,failPalette:(value:boolean)=>{failPalette=value}}
}

const paletteA=makeBrushGradient([1,0,0,1],[0,0,1,0]),paletteB=makeBrushGradient([0,1,0,1],[1,1,1,1])
const execution=(gradient:string)=>brushExecutionContext(undefined,{version:1,gradient})
it('uses independent gray/alpha plus exact rectangular palette resources under genuine cache leases before public paint',()=>{
 const b=brush(),s=setup(),a=bindBrushGradient(brushPreparationPlan(b).resources,paletteA),other=bindBrushGradient(brushPreparationPlan(b).resources,paletteB),source=a.find(r=>r.gradientSource)!,palette=a.find(r=>r.gradientPalette)!,planes=[ids[1],ids[1],ids[1]]as const
 try{
  expect(brushPreparationBytes([source,palette],()=>2)).toBe(16+1024);expect(brushPreparationTransientBytes([source,palette])).toBe(1024)
  expect(brushTextureResourceKey(source)).toBe(brushTextureResourceKey(other.find(r=>r.gradientSource)!));expect(brushTextureResourceKey(palette)).not.toBe(brushTextureResourceKey(other.find(r=>r.gradientPalette)!))
  expect(()=>s.paint(b,execution(paletteA))).toThrow('not prepared');expect(s.scratch.brushBehavior).toBeUndefined()
  s.painter.preparePixelGradient(b,execution(paletteA));const view=s.painter['preparedImage'](ids[0],planes,undefined,paletteA,'filteredGray-v1')
  expect(view.palette).toBeDefined();expect(()=>s.paint(b,execution(paletteA))).toThrow(s.stop);expect(s.calls[0].texture).toBe(view.texture);expect(s.calls[0].palette).toBe(view.palette!.texture);expect(s.calls[0].values.get('u_gradientPalette')).toEqual([6])
  const sourceUpload=s.uploads.find(c=>c[2]===s.gl.RGBA&&c[3]===2&&c[4]===2),paletteUpload=s.uploads.find(c=>c[2]===s.gl.RGBA&&c[3]===256&&c[4]===1)
  expect(sourceUpload?.[8]).toEqual(pixelGradientSourcePixels(new Uint8Array([255,128,0,64]),new Uint8Array([255,64,192,32])));expect(paletteUpload?.[8]).toEqual(pixelGradientPalettePixels(paletteA))
  const release=s.painter['textures'].leaseRequired(brushTextureLeasePlan(a,'stamp'))
  try{s.painter.preparePixelGradient(b,execution(paletteB));expect(()=>view.assertCurrent()).not.toThrow();expect(()=>view.palette!.assertCurrent()).not.toThrow()}finally{release()}
  s.painter.preparePixelGradient(b,execution(paletteA));expect(s.uploads.filter(c=>c[2]===s.gl.RGBA&&c[3]===2&&c[4]===2)).toHaveLength(1);expect(s.uploads.filter(c=>c[2]===s.gl.RGBA&&c[3]===256&&c[4]===1)).toHaveLength(2)
  s.painter.initGL();expect(()=>view.assertCurrent()).toThrow('retired');expect(()=>view.palette!.assertCurrent()).toThrow('retired')
 }finally{s.painter.destroy()}
})
it('preserves primary undefined on a second-resource upload fault and releases the required inventory before retry',()=>{
 const b=brush(),s=setup(),resources=bindBrushGradient(brushPreparationPlan(b).resources,paletteA),source=resources.find(r=>r.gradientSource)!,palette=resources.find(r=>r.gradientPalette)!
 try{s.failPalette(true);let threw=false;try{s.painter.preparePixelGradient(b,execution(paletteA))}catch(error){threw=true;expect(error).toBeUndefined()}expect(threw).toBe(true);expect(s.scratch.brushBehavior).toBeUndefined();expect(s.calls).toHaveLength(0);expect(s.painter.hasPreparedTexture(source)).toBe(true);expect(s.painter.hasPreparedTexture(palette)).toBe(false)
  expect(()=>s.painter['textures'].remove(brushTextureResourceKey(source))).not.toThrow();s.failPalette(false);s.painter.preparePixelGradient(b,execution(paletteA));expect(s.painter.hasPreparedTexture(palette)).toBe(true)
 }finally{s.painter.destroy()}
})
it('refuses a new over-budget required palette before allocation without retiring the pinned older source',()=>{
 const gl={deleteTexture:()=>{}}as unknown as WebGLRenderingContext,cache=new BrushTextureCache(gl,1100),texture={}as WebGLTexture,A=[{key:'source',bytes:64},{key:'paletteA',bytes:1024}],B=[{key:'source',bytes:64},{key:'paletteB',bytes:1024}]
 const release=cache.leaseRequired(A);cache.protect(A.map(r=>r.key));cache.put('source',texture,64)
 expect(()=>cache.protect(['legacy-oversized-unplanned'])).toThrow('Unplanned brush group');expect(cache.get('source')).toBe(texture);expect(()=>cache.remove('source')).toThrow('leased')
 expect(()=>cache.leaseRequired(B)).toThrow('budget');expect(cache.get('source')).toBe(texture);expect(()=>cache.remove('source')).toThrow('leased');release();expect(()=>cache.remove('source')).not.toThrow();const next=cache.leaseRequired(B);next();cache.clear()
})
it('makes filtered sampling explicit and preserves old97 even at a later descriptor revision',()=>{
 const b=brush(),lib=()=>({schemaVersion:1,assets:ids.slice(0,2).map(id=>({id,size:2,file:id.slice(6)+'.bin'})),skipped:[],brushes:[{name:'Authored filtered gradient',source:'kpp',warnings:[],descriptor:b}]})
 expect(isBrushLibrary(lib())).toBe(true);b.version=99;expect(isBrushLibrary(lib())).toBe(false);b.version=100
 if(!b.tip.color||!('gradient'in b.tip.color))throw Error('Expected gradient');delete b.tip.color.gradient.sampling
 expect(isBrushLibrary(lib())).toBe(true);expect(brushPreparationPlan(b).resources.some(r=>r.gradientSource||r.gradientPalette)).toBe(false);expect(brushPreparationPlan(b).resources.some(r=>r.gradientMap)).toBe(true)
 b.tip.color.gradient.sampling='filteredGray-v1';const parent=structuredClone(digitalBrushFromPreset('hard-round'));parent.id='imported-1001001001001001';parent.version=100;parent.behavior={version:2,dual:{brush:b,blendMode:'multiply'}};expect(isBrushLibrary({...lib(),brushes:[{name:'Parent',source:'kpp',warnings:[],descriptor:parent}]})).toBe(false)
})
it('extends only the new shader family and keeps all historical generated sources byte-for-byte on default false',()=>{
 for(const args of[[false,false,false,false],[true,false,false,false],[true,true,false,false],[true,true,true,false],[true,true,true,true]]as const)expect(createBrushStampFragment(...args)).toBe(createBrushStampFragment(...args,false))
 const old=createBrushStampFragment(true,true,true,true),next=createBrushStampFragment(true,true,true,true,true);expect(old).not.toContain('u_gradientPalette');expect(next).toContain('sampleValue.a*palette.a');expect(next).toContain('(gray+0.5)/256.0');expect((next.match(/uniform sampler2D/g)??[]).length).toBe((old.match(/uniform sampler2D/g)??[]).length+1)
})
it('cancels selected readiness between source and palette jobs without a paint or retained required lease',async()=>{
 const b=brush(),s=setup(),resources=bindBrushGradient(brushPreparationPlan(b).resources,paletteA),source=resources.find(r=>r.gradientSource)!,palette=resources.find(r=>r.gradientPalette)!,frames=new Map<number,FrameRequestCallback>();let ordinal=0
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++ordinal,callback);return ordinal});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
 const driver=new BrushPreparation(),controller=new AbortController()
 try{const ready=driver.run([()=>s.painter.prepareTexture(resources,source),()=>s.painter.prepareTexture(resources,palette)],{signal:controller.signal},()=>true,'filtered100-A')
  const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(0));expect(s.painter.hasPreparedTexture(source)).toBe(true);expect(s.painter.hasPreparedTexture(palette)).toBe(false)
  controller.abort();await expect(ready).resolves.toEqual({status:'cancelled'});expect(frames.size).toBe(0);expect(s.calls).toHaveLength(0);expect(s.scratch.brushBehavior).toBeUndefined();expect(()=>s.painter['textures'].remove(brushTextureResourceKey(source))).not.toThrow()
 }finally{driver.cancel();s.painter.destroy();vi.unstubAllGlobals()}
})
it('prevalidates optional plus strict leases and a resident legacy group before changing protected keys',()=>{
 const gl={deleteTexture:()=>{}}as unknown as WebGLRenderingContext,cache=new BrushTextureCache(gl,100),texture={}as WebGLTexture
 cache.protect(['C']);cache.put('C',texture,60)
 const optional=cache.lease([{key:'A',bytes:40}]),required=cache.leaseRequired([{key:'B',bytes:40}])
 try{expect(()=>cache.protect(['C'])).toThrow('budget');expect(cache.get('C')).toBe(texture);expect(cache['protectedKeys'].has('C')).toBe(true);expect(cache['leases'].size).toBe(2)}finally{required();optional();cache.clear()}
})
it('blocks the historical oversized legacy protection path while a required inventory is pending',()=>{
 const gl={deleteTexture:()=>{}}as unknown as WebGLRenderingContext,cache=new BrushTextureCache(gl,1100),texture={}as WebGLTexture
 cache.protect(['oversized']);cache.put('oversized',texture,4096);expect(cache.get('oversized')).toBe(texture)
 const required=cache.leaseRequired([{key:'source',bytes:64},{key:'palette',bytes:1024}])
 try{expect(()=>cache.protect(['oversized'])).toThrow('budget');expect(cache.get('oversized')).toBe(texture);expect(cache['leases'].size).toBe(1);expect(cache['protectedKeys'].has('oversized')).toBe(true)}finally{required();cache.clear()}
})
it('invalidates actual paired views on released palette eviction and painter disposal',()=>{
 const b=brush(),s=setup(),planes=[ids[1],ids[1],ids[1]]as const,resources=bindBrushGradient(brushPreparationPlan(b).resources,paletteA),palette=resources.find(r=>r.gradientPalette)!;let disposed=false
 try{s.painter.preparePixelGradient(b,execution(paletteA));const view=s.painter['preparedImage'](ids[0],planes,undefined,paletteA,'filteredGray-v1'),release=s.painter['textures'].leaseRequired(brushTextureLeasePlan(resources,'stamp'))
  expect(()=>s.painter['textures'].remove(brushTextureResourceKey(palette))).toThrow('leased');release();s.painter['textures'].remove(brushTextureResourceKey(palette));expect(()=>view.assertCurrent()).toThrow('retired')
  s.painter.preparePixelGradient(b,execution(paletteA));const current=s.painter['preparedImage'](ids[0],planes,undefined,paletteA,'filteredGray-v1');s.painter.destroy();disposed=true;expect(()=>current.assertCurrent()).toThrow('retired');expect(()=>current.palette!.assertCurrent()).toThrow('retired')
 }finally{if(!disposed)s.painter.destroy()}
})
