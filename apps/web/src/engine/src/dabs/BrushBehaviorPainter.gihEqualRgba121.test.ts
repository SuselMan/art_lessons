import{it,expect,vi}from'vitest'
import{isEqualOriginalRgbaGih121,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{BrushBehaviorPainter,type BehaviorScratch}from'./BrushBehaviorPainter'
import type{BrushContext}from'./BrushPainter'
import type{PencilPreset}from'../presets/pencilPresets'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{brush121,assets121,rgb121}from'../../../../../../packages/shared/src/gihEqualRgba121.testFixture'
vi.mock('../presets/importedBrushes',async original=>({...await original<object>(),importedAssetPixels:(id:string)=>new Uint8Array(id==='asset:'+ 'f'.repeat(64)?64:id==='asset:'+ 'e'.repeat(64)?15:16)}))
it('actual equal121 Painter validates full inventory before lease/state and draws selected RGB owner with ordinary geometry',()=>{
 const prepared:Array<{id:string;planes:readonly string[];bounds:unknown}>=[],release=vi.fn();let retire=false,active=100,bound:unknown;const rgbaTextures:WebGLTexture[]=[]
 const uniforms=new Map<string,number[]>(),draws:Map<string,number[]>[]=[],bounds:unknown[]=[],stop=Error('selected deposition reached');let current:object|undefined;const sources=new WeakMap<object,string>(),programs=new WeakMap<object,string[]>()
 const gl=new Proxy({}, {get:(_t,key)=>{
 if(typeof key==='string'&&/^[A-Z0-9_]+$/.test(key))return /^TEXTURE[0-7]$/.test(key)?100+Number(key.slice(7)):1
 if(key==='activeTexture')return(unit:number)=>{active=unit}
 if(key==='bindTexture')return(_t:unknown,tex:unknown)=>{if(active===101)bound=tex}
 if(key==='createShader'||key==='createProgram')return()=>({})
 if(key==='shaderSource')return(s:object,code:string)=>sources.set(s,code)
 if(key==='attachShader')return(p:object,s:object)=>programs.set(p,[...(programs.get(p)??[]),sources.get(s)??''])
 if(key==='useProgram')return(p:object)=>{current=p}
 if(key==='getUniformLocation')return(_p:unknown,n:string)=>n
 if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true
 if(key==='getAttribLocation')return()=>0
 if(key==='getExtension')return()=>null
 if(String(key).startsWith('uniform'))return(n:string,...v:number[])=>uniforms.set(n,v)
 if(key==='drawArrays')return()=>{if(current&&programs.get(current)?.some(s=>s.includes('vec4 brushGihFrameSample('))&&uniforms.get('u_originalRgbaTip')?.[0]===1){draws.push(new Map(uniforms));expect(bound).toBe(rgbaTextures[1]);throw stop}}
 return()=>{}
 }})as WebGLRenderingContext
 const painter=new BrushBehaviorPainter({gl,quadBuf:()=>({}),paper:{texture:{},worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1}as unknown as BrushContext,()=>({})as WebGLTexture,()=>({})as WebGLTexture,()=>{},()=>release,(id,planes,bounds)=>{prepared.push({id,planes,bounds});const side=assets121.find(a=>a.id===id)!.size,texture={}as WebGLTexture;rgbaTextures.push(texture);return{texture,width:side,height:side,crop:{x:(bounds?.x??0)*side,y:(bounds?.y??0)*side,width:(bounds?.width??1)*side,height:(bounds?.height??1)*side},assertCurrent(){if(retire)throw Error('Retired121 owner')}}});painter.initGL();painter.prepareAutoNoise()
 const brush=brush121()
 const buffer={width:64,height:64,texture:{},beginDraw(){},beginReplaceDraw(){},clear(){},endDraw(){},copyRegionInto(){}}as unknown as AccumulationBuffer,scratch={getOrCreate:()=>({original:buffer,coverage:buffer}),brushCeiling:()=>buffer,brushCeilingCopy:()=>buffer,noteBrushEdgePx:()=>0}as unknown as BehaviorScratch,target={resolveForPaint:(b:unknown)=>{bounds.push(b);return[{originX:0,originY:0,buffer,contentRect:null}]},markContentPainted:()=>{}},dab:Dab={x:10,y:20,size:4,pressure:1,tiltX:-2,tiltY:0,angle:0,aspectRatio:1,opacity:1,t:0}
 const paint=(b:BrushDescriptor,s:BehaviorScratch)=>painter.paint(target,[dab],{sizeMultiplier:1}as PencilPreset,b,{size:true,opacity:true},[1,0,0],s)
 // Equal frames have NO geometry: all full validation must precede prepared callbacks and scratch.
 const changes:Array<(b:BrushDescriptor)=>void>=[b=>{b.version=120},b=>{if(b.tip.color&&'planes'in b.tip.color)b.tip.color.frames!.pop()},b=>{if(b.tip.color&&'planes'in b.tip.color)Reflect.set(b.tip.color.frames![1],0,'not-a-ref')},b=>{if(b.tip.color&&'planes'in b.tip.color)b.tip.color.planes=[...b.tip.color.frames![1]]},b=>{b.tip.animation!.frames[0]=assets121[1].id},b=>{b.tip.animation!.rank=1},b=>{b.tip.animation!.roundingPolicy=undefined},b=>{Reflect.set(b,'clone',null)},b=>{Reflect.set(b,'texture',{})},b=>{b.behavior!.dual={brush:brush121(),blendMode:'normal'}},b=>{if(b.tip.color&&'planes'in b.tip.color)b.tip.color.frames![1][0]=`asset:${'f'.repeat(64)}`},b=>{b.tip.animation!.frames[1]=`asset:${'f'.repeat(64)}`},b=>{b.tip.animation!.frames[1]=`asset:${'e'.repeat(64)}`}]
 for(const change of changes){const invalid=structuredClone(brush);change(invalid);const untouched={}as BehaviorScratch;expect(()=>paint(invalid,untouched)).toThrow();expect(untouched.brushBehavior).toBeUndefined();expect(bounds).toHaveLength(0);expect(prepared).toHaveLength(0);expect(release).not.toHaveBeenCalled()}
 expect(isEqualOriginalRgbaGih121(brush)).toBe(true)
 expect(prepared).toHaveLength(0);expect(release).not.toHaveBeenCalled();retire=true;const emptyRetired={}as BehaviorScratch;expect(()=>paint(brush,emptyRetired)).toThrow('Retired121 owner');expect(emptyRetired.brushBehavior).toBeUndefined();expect(release).toHaveBeenCalledTimes(1);retire=false;prepared.length=0;rgbaTextures.length=0
 expect(()=>paint(brush,scratch)).toThrow(stop);expect(prepared).toHaveLength(3);expect(prepared.map(v=>v.planes)).toEqual(rgb121);expect(prepared.map(v=>v.bounds)).toEqual([brush.tip.maskBounds,brush.tip.maskBounds,brush.tip.maskBounds]);expect(release).toHaveBeenCalledTimes(2);expect(draws).toHaveLength(1);expect(draws[0].get('u_gihFrame')).toEqual([0,0,0,1]);expect(draws[0].get('u_originalRgbaTip')).toEqual([1]);expect(draws[0].get('u_dabCenter')).toEqual([10,20]);expect(draws[0].get('u_dabRadius')).toEqual([2]);expect(draws[0].get('u_aspectRatio')).toEqual([1]);expect(draws[0].get('u_tipBounds')).toEqual([0,0,1,1]);expect(bounds[0]).toEqual({minX:7,minY:17,maxX:13,maxY:23});expect(scratch.brushBehavior?.dabOrdinal).toBe(1)
 painter.destroy()
})
