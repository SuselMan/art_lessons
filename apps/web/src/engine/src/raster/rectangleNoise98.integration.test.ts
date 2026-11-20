import {expect,it} from 'vitest'
import {isBrushLibrary,type BrushDescriptor,type Dab} from '@grafetto/shared'
import {brushPreparationPlan} from '../dabs/BrushPreparation'
import {BrushBehaviorPainter,type BehaviorScratch} from '../dabs/BrushBehaviorPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {BrushContext} from '../dabs/BrushPainter'
import type {PencilPreset} from '../presets/pencilPresets'
import {prepareGaussianRectangle,gaussianRectangleUniforms} from './autoRectangle'
import {digitalBrushFromPreset} from '../presets/digitalBrushPresets'
import {installBrushPixels} from '../presets/importedBrushes'
import {brushExecutionContext} from '../presets/brushExecutionContext'
import {beginBrushBehavior,behaviorStampsForDab} from '../presets/brushBehavior'
import {autoMaskNoiseKey,prepareAutoMaskNoiseGrid,autoMaskNoiseGridUniforms,prepareAutoMaskNoise,autoMaskNoiseAlpha} from './autoMaskNoise'
const base=()=>({...structuredClone(digitalBrushFromPreset('hard-round')),version:98,id:'imported-9898989898989898',model:'stamp',flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],sizeByPressure:[[0,1],[1,1]],behavior:{version:2}}as BrushDescriptor)
function curve(affine=false){
 const id=`asset:${(affine?'a':'b').repeat(64)}`as const,bytes=new Uint8Array(64),view=new DataView(bytes.buffer)
 for(let i=0;i<3;i++){if(affine)view.setUint32(i*8+4,0xffffffff);else view.setUint32(i*4,Math.round(i*.5*0xffffffff))}
 installBrushPixels(id,bytes)
 return affine?{kind:'curveRectangleSoftness' as const,lookup:id,resolution:1,encoding:'softness-affine-unorm32be-v1' as const,minimum:0,span:1,antialias:false as const}:{kind:'curveRectangle' as const,lookup:id,resolution:1,encoding:'unorm32be' as const,antialias:false as const}
}
function capture(brush:BrushDescriptor,dabSize=20,dabAspect=2,originX=-64){
 const values=new Map<string,number[]>(),textures:unknown[][]=[];const stop=new Error('actual source deposition reached')
 const gl=new Proxy({}, {get:(_t,k)=>{
  if(k==='getUniformLocation')return (_p:unknown,name:string)=>name
  if(k==='getShaderParameter'||k==='getProgramParameter')return ()=>true
  if(k==='getAttribLocation')return ()=>0
  if(k==='getExtension')return ()=>null
  if(String(k).startsWith('uniform'))return (name:string,...args:number[])=>values.set(name,args)
  if(k==='drawArrays')return ()=>{throw stop}
  if(String(k).startsWith('create'))return ()=>({})
  return ()=>{}
 }})as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext,(...args)=>{textures.push(args);return {}as WebGLTexture},()=>({})as WebGLTexture,()=>{},()=>()=>{})
 painter.initGL();painter.prepareStampEffects()
 const buffer={width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){}}as unknown as AccumulationBuffer
 const scratch={getOrCreate:()=>({original:buffer,coverage:buffer}),brushCeiling:()=>buffer,noteBrushEdgePx:()=>0}as unknown as BehaviorScratch
 const dab={x:-20,y:-30,size:dabSize,pressure:.25,opacity:1,angle:.3,aspectRatio:dabAspect,tiltX:0,tiltY:0,t:0}as Dab
 expect(()=>painter.paint({resolveForPaint:()=>[{originX,originY:-64,buffer,contentRect:null}],markContentPainted:()=>{}},[dab],{sizeMultiplier:1}as PencilPreset,brush,{size:true,opacity:true},[1,0,0],scratch,false,undefined,brushExecutionContext({version:1,strokeSeed:123,sequentialSeed:456}))).toThrow(stop)
 return {values,textures}
}

const profiles=()=>[{kind:'gaussian2D',shape:'rectangle',horizontalFade:.25,verticalFade:.75,antialias:true},{kind:'gaussian2D',shape:'ellipse',horizontalFade:.25,verticalFade:.75,antialias:true},curve(),curve(true)]as const
const noisy=(profile:NonNullable<BrushDescriptor['tip']['profile']>)=>{const b=base();b.tip={kind:'procedural',hardness:1,aspect:2,angle:.3,rotation:'fixed',profile,autoNoise:{version:1,density:.5,randomness:1}};return b}
it('admits root-only98 rectangle noise while preserving old profiles and rejecting stale revisions or nested modes',()=>{
 for(const profile of profiles()){const b=noisy(profile),lib=()=>({schemaVersion:1,assets:profile.kind==='gaussian2D'?[]:[{id:profile.lookup,size:8,file:profile.lookup.slice(6)+'.bin'}],skipped:[],brushes:[{name:'Authored rectangle noise',source:'kpp',warnings:[],descriptor:b}]})
  expect(isBrushLibrary(lib())).toBe(true);expect(brushPreparationPlan(b).capabilities).toEqual(['stampEffects'])
  for(const version of [74,78,79,80,97]){b.version=version;expect(isBrushLibrary(lib())).toBe(false);expect(()=>brushPreparationPlan(b)).toThrow('without noise')}b.version=98
  b.tip.autoShape={version:1,spikes:3};expect(isBrushLibrary(lib())).toBe(false);expect(()=>brushPreparationPlan(b)).toThrow('without noise');delete b.tip.autoShape
  const parent=base();parent.behavior={version:2,dual:{brush:structuredClone(b),blendMode:'multiply'}};const child={...lib(),brushes:[{name:'Parent',source:'kpp',warnings:[],descriptor:parent}]};expect(isBrushLibrary(child)).toBe(false);expect(()=>brushPreparationPlan(parent)).toThrow()
  delete b.tip.autoNoise;b.version=profile.kind==='gaussian2D'?78:profile.kind==='curveRectangle'?79:80;expect(isBrushLibrary(lib())).toBe(true)
 }
})
it('uses the same anisotropic rotated mask geometry and full negative world grid across actual tile draws',()=>{
 for(const profile of profiles()){const b=noisy(profile),a=capture(b),tile=capture(b,20,2,-32),plain=structuredClone(b);delete plain.tip.autoNoise;const old=capture(plain)
  expect(a.values.get('u_tipProceduralGeometry')).toEqual(old.values.get('u_tipProceduralGeometry'));expect(a.values.get('u_tipProcedural')).toEqual(old.values.get('u_tipProcedural'))
  expect(a.values.get('u_autoNoiseConfig')).toEqual([32768,255,1,-1]);expect(a.values.get('u_autoNoiseKey')).toBeDefined()
  const g=a.values.get('u_tipProceduralGeometry');if(!g)throw Error('Missing actual source axes');const grid=prepareAutoMaskNoiseGrid(-20,-30,g[0],g[1],false)
  const first=autoMaskNoiseGridUniforms(grid,-64,-64,64),second=autoMaskNoiseGridUniforms(grid,-32,-64,64)
  expect(a.values.get('u_autoNoiseGridX')).toEqual(first.x);expect(tile.values.get('u_autoNoiseGridX')).toEqual(second.x);expect(a.values.get('u_autoNoiseGridY')).toEqual(first.y)
  if(profile.kind==='gaussian2D'&&profile.shape==='rectangle'){const u=gaussianRectangleUniforms(prepareGaussianRectangle(g[0],g[1],.25,.75,true));expect(a.values.get('u_rectangleCoefficients')).toEqual(u.coefficients)}
 }
})
it('preserves captured-seed whole/split geometry and density endpoint effects without changing mask profiles',()=>{
 const b=noisy(profiles()[0]),dab={x:-20,y:-30,size:20,pressure:.5,opacity:1,angle:.3,aspectRatio:2,tiltX:0,tiltY:0,t:0}as Dab,execution=brushExecutionContext({version:1,strokeSeed:123,sequentialSeed:456}),inputs=[dab,{...dab,t:10}]
 const run=(chunks:Dab[][])=>{const state=beginBrushBehavior(dab,execution);return chunks.flatMap(c=>c.flatMap(d=>behaviorStampsForDab(b,d,state,[1,0,0])))};expect(run([inputs])).toEqual(run([[inputs[0]],[inputs[1]]]))
 const key=autoMaskNoiseKey(123,0,0,0);for(const alpha of[0,1,64,128,255]){expect(autoMaskNoiseAlpha(alpha,prepareAutoMaskNoise(0,1),key,-1,-9)).toBe(0);expect(autoMaskNoiseAlpha(alpha,prepareAutoMaskNoise(1,0),key,-1,-9)).toBe(alpha);expect(autoMaskNoiseAlpha(alpha,prepareAutoMaskNoise(1,1),key,-1,-9)).toBeLessThanOrEqual(alpha)}
})
