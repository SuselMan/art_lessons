import{it,expect,vi}from'vitest'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{BrushBehaviorPainter,type BehaviorScratch}from'./BrushBehaviorPainter'
import type{BrushContext}from'./BrushPainter'
import type{PencilPreset}from'../presets/pencilPresets'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{DIGITAL_BRUSHES}from'../presets/digitalBrushPresets'
vi.mock('../presets/importedBrushes',async original=>({...await original<object>(),importedAssetPixels:()=>new Uint8Array(64)}))
it('actual Painter uses selected geometry for target scratch footprint and draw uniforms; forged bounds fail before scratch',()=>{
 const uniforms=new Map<string,number[]>(),draws:Map<string,number[]>[]=[],bounds:unknown[]=[],stop=Error('selected deposition reached');let current:object|undefined;const sources=new WeakMap<object,string>(),programs=new WeakMap<object,string[]>()
 const gl=new Proxy({}, {get:(_t,key)=>{
 if(key==='createShader'||key==='createProgram')return()=>({})
 if(key==='shaderSource')return(s:object,code:string)=>sources.set(s,code)
 if(key==='attachShader')return(p:object,s:object)=>programs.set(p,[...(programs.get(p)??[]),sources.get(s)??''])
 if(key==='useProgram')return(p:object)=>{current=p}
 if(key==='getUniformLocation')return(_p:unknown,n:string)=>n
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true
 if(key==='getAttribLocation')return()=>0
 if(key==='getExtension')return()=>null
 if(String(key).startsWith('uniform'))return(n:string,...v:number[])=>uniforms.set(n,v)
 if(key==='drawArrays')return()=>{if(current&&programs.get(current)?.some(s=>s.includes('vec4 brushGihFrameSample('))&&uniforms.get('u_gihFrame')?.[0]===1){draws.push(new Map(uniforms));throw stop}}
 return()=>{}
 }})as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>()=>{});painter.initGL();painter.prepareAutoNoise()
 const ids=['a','b','c'].map(c=>`asset:${c.repeat(64)}`as const),rows=[{sourceWidth:4,sourceHeight:2,maskBounds:{x:.25,y:.25,width:.5,height:.5}},{sourceWidth:8,sourceHeight:6,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:2,sourceHeight:4,maskBounds:{x:.25,y:.25,width:.5,height:.5}}],brush:BrushDescriptor={...DIGITAL_BRUSHES[0],version:118,scatter:undefined,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],tip:{kind:'bitmap',mask:ids[0],maskBounds:rows[0].maskBounds,hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode:'dimensions',dimensions:[{mode:'pressure',rank:2},{mode:'xtilt',rank:3}],frames:ids,roundingPolicy:'qt5-half-up-v1',geometry:{version:1,frames:rows}}},behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}
 const buffer={width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer,scratch={getOrCreate:()=>({original:buffer,coverage:buffer}),brushCeiling:()=>buffer,brushCeilingCopy:()=>buffer,noteBrushEdgePx:()=>0}as unknown as BehaviorScratch,target={resolveForPaint:(b:unknown)=>{bounds.push(b);return[{originX:0,originY:0,buffer,contentRect:null}]},markContentPainted:()=>{}},dab:Dab={x:10,y:20,size:4,pressure:1,tiltX:-2,tiltY:0,angle:0,aspectRatio:1,opacity:1,t:0}
 const paint=(b:BrushDescriptor,s:BehaviorScratch)=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,b,{size:true,opacity:true},[1,0,0],s)
 const bad=structuredClone(brush);bad.tip.animation!.geometry!.frames[1].maskBounds.width=.5;const empty={}as BehaviorScratch;expect(()=>paint(bad,empty)).toThrow('padding');expect(empty.brushBehavior).toBeUndefined();expect(bounds).toHaveLength(0)
 expect(()=>paint(brush,scratch)).toThrow(stop);expect(draws).toHaveLength(1);expect(draws[0].get('u_gihFrame')).toEqual([1,8,6,8]);expect(draws[0].get('u_dabCenter')).toEqual([12,22]);expect(draws[0].get('u_dabRadius')).toEqual([3]);expect(draws[0].get('u_aspectRatio')).toEqual([8/6]);expect(draws[0].get('u_tipBounds')).toEqual([0,0,1,1]);expect(bounds[0]).toEqual({minX:7,minY:18,maxX:17,maxY:26});expect(scratch.brushBehavior?.dabOrdinal).toBe(1)
 painter.destroy()
})
