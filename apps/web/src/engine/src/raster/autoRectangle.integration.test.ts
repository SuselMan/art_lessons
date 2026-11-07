import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {brushPreparationPlan,brushTipProfileUniforms,brushTipSamplerId,brushUsesStampEffects} from '../dabs/BrushPreparation'
import {BrushBehaviorPainter,type BehaviorScratch} from '../dabs/BrushBehaviorPainter'
import type {AccumulationBuffer} from '/home/suselman/projects/pencil-agents/brush-import/apps/web/src/engine/src/buffers/AccumulationBuffer'
import type {BrushContext} from '../dabs/BrushPainter'
import type {PencilPreset} from '../presets/pencilPresets'
import {createBrushStampFragment} from './brushBehaviorShaders'
import {proceduralMaskAlpha} from './brushProcedural'
import {gaussianMaskAlpha} from './gaussianTip'
import {prepareGaussianRectangle,gaussianRectangleUniforms} from './autoRectangle'
import {digitalBrushFromPreset} from '../presets/digitalBrushPresets'
import {installBrushPixels} from '../presets/importedBrushes'
const base=()=>({...structuredClone(digitalBrushFromPreset('hard-round')),version:80,model:'stamp',flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],sizeByPressure:[[0,1],[1,1]],behavior:{version:2}}as BrushDescriptor)
function curve(affine=false){
 const id=`asset:${(affine?'a':'b').repeat(64)}`as const,bytes=new Uint8Array(64),view=new DataView(bytes.buffer)
 for(let i=0;i<3;i++){if(affine)view.setUint32(i*8+4,0xffffffff);else view.setUint32(i*4,Math.round(i*.5*0xffffffff))}
 installBrushPixels(id,bytes)
 return affine?{kind:'curveRectangleSoftness' as const,lookup:id,resolution:1,encoding:'softness-affine-unorm32be-v1' as const,minimum:0,span:1,antialias:false as const}:{kind:'curveRectangle' as const,lookup:id,resolution:1,encoding:'unorm32be' as const,antialias:false as const}
}
it('prepares all three new profiles using exactly one effects capability and existing CAS lookup',()=>{
 for(const profile of [{kind:'gaussian2D',shape:'ellipse',horizontalFade:.5,verticalFade:.75,antialias:true},{kind:'gaussian2D',shape:'rectangle',horizontalFade:.5,verticalFade:.75,antialias:false},curve(),curve(true)]as const){
  const b=base();b.tip={...b.tip,kind:'procedural',profile}
  expect(brushUsesStampEffects(b)).toBe(true)
  const plan=brushPreparationPlan(b)
  expect(plan.capabilities).toEqual(['stampEffects'])
  if(profile.kind==='gaussian2D'){expect(plan.resources.filter(r=>!r.grain)).toHaveLength(0);expect(brushTipProfileUniforms(b.tip)[0]).toBe(profile.shape==='ellipse'?5:6)}
  else {expect(brushTipSamplerId(b.tip)).toBe(profile.lookup);expect(plan.resources.filter(r=>!r.grain)).toEqual([{painter:'stamp',id:profile.lookup,grain:false,lookup32:true}]);expect(brushTipProfileUniforms(b.tip)[0]).toBe(profile.kind==='curveRectangle'?7:8)}
 }
})
it('keeps noise, children and mixers closed until their actual new-profile rendering is proved',()=>{
 const b=base();b.tip={...b.tip,profile:curve(true)}
 b.tip.autoNoise={version:1,density:.5,randomness:0};expect(()=>brushPreparationPlan(b)).toThrow('without noise');delete b.tip.autoNoise
 b.behavior={version:2,dual:{brush:base(),blendMode:'multiply'}};expect(()=>brushPreparationPlan(b)).toThrow('unpaired');delete b.behavior.dual
 b.model='mixer';expect(()=>brushPreparationPlan(b)).toThrow('unpaired stamp')
 const parent=base();parent.behavior={version:2,dual:{brush:{...b,model:'stamp'},blendMode:'multiply'}};expect(()=>brushPreparationPlan(parent)).toThrow('child profiles')
})
it('extends only the private effects shader and delegates all historical profile kinds unchanged',()=>{
 const ordinary=createBrushStampFragment(true,true,true),effects=createBrushStampFragment(true,true,true,true)
 expect(ordinary).not.toContain('brushEffectsMask(')
 expect(effects).toContain('if(profile.x<4.5)return brushProceduralMaskWithSpikes')
 expect(effects).toContain('floor(a/radii*p.x+0.5)')
 expect(effects).toContain('p.x-ij.x')
 expect(effects).toContain('brushEffectsMask(pixel,brushAutoSpikeFrame(')
 expect((effects.match(/uniform sampler2D/g)??[]).length).toBe((ordinary.match(/uniform sampler2D/g)??[]).length)
 expect(effects.split('void main() {')).toHaveLength(2)
})
function capture(brush:BrushDescriptor,dabSize=20,dabAspect=2){
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
 const dab={x:20,y:20,size:dabSize,pressure:.25,opacity:1,angle:.3,aspectRatio:dabAspect,tiltX:0,tiltY:0,t:0}as Dab
 expect(()=>painter.paint({resolveForPaint:()=>[{originX:0,originY:0,buffer,contentRect:null}],markContentPainted:()=>{}},[dab],{sizeMultiplier:1}as PencilPreset,brush,{size:true,opacity:true},[1,0,0],scratch)).toThrow(stop)
 return {values,textures}
}
it('actual Painter uploads Gaussian rectangle coefficients from source axes, not allocation bbox',()=>{
 const b=base();b.tip={...b.tip,aspect:2,profile:{kind:'gaussian2D',shape:'rectangle',horizontalFade:.25,verticalFade:.75,antialias:false}}
 const {values}=capture(b),geometry=values.get('u_tipProceduralGeometry')
 expect(values.get('u_tipProcedural')).toEqual([6,.25,.75,0])
 if(!geometry)throw Error('No actual geometry')
 const expected=gaussianRectangleUniforms(prepareGaussianRectangle(geometry[0],geometry[1],.25,.75,false))
 expect(values.get('u_rectangleCoefficients')).toEqual(expected.coefficients)
 expect(values.get('u_rectangleGeometry')).toEqual(expected.geometry)
 expect(values.get('u_autoNoiseConfig')).toEqual([65535,0,0,0])
})
it('actual Painter resolves dynamic curve-rectangle softness and reuses the prepared basis sampler',()=>{
 const b=base(),profile=curve(true);b.tip={...b.tip,profile};b.behavior={version:2,softness:.8,modulations:{softness:[{control:'pressure',minimum:0,jitter:0}]}}
 const {values,textures}=capture(b)
 expect(values.get('u_tipProcedural')).toEqual([8,1,4,0])
 expect(values.get('u_tipSoftnessBasis')).toEqual([1,4,0,1])
 expect(values.get('u_tipSoftness')).toEqual([.2])
 expect(textures[0][0]).toBe(profile.lookup);expect(textures[0][4]).toBe(true)
})

it('actual Gaussian ellipse uses physical source ratio and the native post-fold Y coefficient',()=>{
 const b=base(),profile={kind:'gaussian2D' as const,shape:'ellipse' as const,horizontalFade:.25,verticalFade:.75,antialias:false}
 b.tip={...b.tip,aspect:2,profile}
 const {values}=capture(b),axes=values.get('u_tipProceduralGeometry')
 expect(values.get('u_tipProcedural')).toEqual([5,.5,.75,0])
 if(!axes)throw Error('No source axes')
 expect(axes[0]/axes[1]).toBe(2)
 expect(proceduralMaskAlpha(4,1,20,4,profile)).toBe(gaussianMaskAlpha(4,5,20,.5,false))
})
it('actual subpixel rectangle retains negative edge starts and six-by-six native stencil',()=>{
 const b=base();b.tip={...b.tip,aspect:1,profile:{kind:'gaussian2D',shape:'rectangle',horizontalFade:.5,verticalFade:.5,antialias:true}}
 const {values}=capture(b,.5,1),axes=values.get('u_tipProceduralGeometry')
 if(!axes)throw Error('No thin source axes')
 // Captured Dab aspect is explicit; source axes must not be clamped.
 expect(axes[0]).toBe(.25);expect(axes[1]).toBe(.25);expect(axes[2]).toBe(6)
 const g=values.get('u_rectangleGeometry');expect(g?.slice(0,2)).toEqual(axes.slice(0,2));expect(g?.[3]).toBe(1)
 const shader=createBrushStampFragment(true,true,true,true)
 expect(shader).toContain('a.x>radii.x-1.0')
 expect(shader).not.toContain('max(0.0,radii.x-1.0)')
})
