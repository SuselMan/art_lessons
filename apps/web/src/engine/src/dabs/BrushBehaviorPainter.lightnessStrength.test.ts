import {expect,it} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {BrushBehaviorPainter,type BehaviorScratch} from './BrushBehaviorPainter'
import type {BrushContext} from './BrushPainter'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {PencilPreset} from '../presets/pencilPresets'
import {DIGITAL_BRUSHES} from '../presets/digitalBrushPresets'
it('uploads effective per-dab primary pigment strength and restores static base on switching back; does not upload child strength as alpha',()=>{
 const counts=new Map<string,number>(),values=new Map<string,number[]>(),draws:Map<string,number[]>[]=[],stop=new Error('actual deposition reached')
 const gl=new Proxy({}, {get:(_target,key)=>{if(key==='getUniformLocation')return (_p:unknown,name:string)=>name;if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;if(key==='getAttribLocation')return ()=>0;if(key==='getExtension')return ()=>null;if(String(key).startsWith('uniform'))return (name:string,...args:number[])=>{counts.set(name,(counts.get(name)??0)+1);values.set(name,args)};if(key==='drawArrays')return ()=>{draws.push(new Map(values));throw stop};if(String(key).startsWith('create'))return ()=>({});return ()=>{}}})as WebGLRenderingContext
 const ctx={gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext
 const painter=new BrushBehaviorPainter(ctx,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>()=>{}),id=`asset:${'b'.repeat(64)}`as const
 const base:BrushDescriptor={...DIGITAL_BRUSHES[0],version:90,model:'stamp',tip:{kind:'bitmap',mask:id,material:{kind:'lightness',gray:id,strength:.4},hardness:1,aspect:1,angle:0,rotation:'fixed'},behavior:{version:2},flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]]}
 const active:BrushDescriptor={...base,behavior:{version:2,modulations:{lightnessStrength:[{control:'pressure',minimum:0,jitter:0}]},dual:{brush:{...base,behavior:{version:2,modulations:{lightnessStrength:[{control:'pressure',minimum:0,jitter:0}]}}},blendMode:'multiply'}}}
 painter.initGL()
 const buffer={width:64,height:64,texture:{},beginDraw(){},clear(){},endDraw(){}}as unknown as AccumulationBuffer
 const dab={x:20,y:20,size:20,pressure:.5,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}as Dab
 const run=(brush:BrushDescriptor)=>{const scratch={getOrCreate:()=>({original:buffer,coverage:buffer}),brushCeiling:()=>buffer,noteBrushEdgePx:()=>0}as unknown as BehaviorScratch;expect(()=>painter.paint({resolveForPaint:()=>[{originX:0,originY:0,buffer,contentRect:null}],markContentPainted:()=>{}},[dab],{sizeMultiplier:1}as PencilPreset,brush,{size:true,opacity:true},[.8,.3,.1],scratch)).toThrow(stop)}
 run(base);expect(counts.get('u_lightnessStrength')).toBe(1);run(active);expect(counts.get('u_lightnessStrength')).toBe(3);run(base);expect(counts.get('u_lightnessStrength')).toBe(4)
 expect(draws.map(d=>d.get('u_lightnessStrength'))).toEqual([[.4],[.2],[.4]])
 expect(draws[1].get('u_dualStrength')).toEqual([1]);expect(draws[1].get('u_opacity')).toEqual(draws[0].get('u_opacity'))
})
