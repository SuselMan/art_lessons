import{it,expect,vi,afterEach}from'vitest'
import{textureWash180 as textureWash171,mask180 as mask171,gray180 as gray171,alpha180 as alpha171}from'../../../../../../packages/shared/src/textureGradientWash180.testFixture.js'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import{MockGL}from'../../testing/mockGL'
import{TiledLayerBuffer}from'../buffers/TiledLayerBuffer'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{BrushExecutionContext}from'../presets/brushExecutionContext'
import type{PencilPreset}from'../presets/pencilPresets'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{installBrushPixels,clearImportedBrushPixels}from'../presets/importedBrushes'
import{brushPreparationPlan}from'./BrushPreparation'
import{makeBrushGradient,copyBrushSourceContext}from'@grafetto/shared'
const dab171=(opacity=1,t=0):Dab=>({x:17,y:-13,size:12,pressure:opacity,opacity,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t})
afterEach(()=>clearImportedBrushPixels())
function setup(){
 installBrushPixels(mask171,new Uint8Array(16).fill(255));installBrushPixels(gray171,new Uint8Array([0,64,128,255,0,64,128,255,0,64,128,255,0,64,128,255]));installBrushPixels(alpha171,new Uint8Array(16).fill(128));
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),leases:{width:number;height:number;released:boolean}[]=[]
 const buffer=(width=1300,height=900)=>({width,height,texture:gl.createTexture(),beginDraw:vi.fn(),beginReplaceDraw:vi.fn(),endDraw:vi.fn(),clear:vi.fn(),copyRegionInto:vi.fn()})as unknown as AccumulationBuffer
 const acquire=vi.fn((width:number,height:number)=>{const rec={width,height,released:false};leases.push(rec);return{buffer:buffer(width,height),assertCurrent(){if(rec.released)throw Error('retired')},release(){rec.released=true}}})
 const painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1,acquireSprayScratch:acquire}as unknown as BrushContext);painter.initGL()
 const original=buffer(),coverage=buffer(),feedback=buffer(),targetBuffer=buffer(),entry={original,coverage},s={getOrCreate:vi.fn(()=>entry),brushCeiling:vi.fn(()=>feedback),brushCeilingCopy:vi.fn(()=>{throw Error('fourth plane forbidden')}),brushSecondary:vi.fn(()=>{throw Error('secondary forbidden')}),noteBrushEdgePx:()=>0}as unknown as BehaviorScratch
 const target=Object.assign(Object.create(TiledLayerBuffer.prototype)as TiledLayerBuffer,{coarseWorldSize:()=>({w:1300,h:900}),resolveForPaint:()=>[{buffer:targetBuffer,originX:-650,originY:-450,contentRect:null}],markContentPainted:vi.fn()})
 const paint=(b:BrushDescriptor,dabs:Dab[]= [dab171()],execution:BrushExecutionContext|undefined=undefined)=>painter.paint(target,dabs,{sizeMultiplier:1}as PencilPreset,{brush:b,pressure:{size:false,opacity:false}},[1,0,0],s,undefined,execution)
 return{gl,painter,leases,acquire,s,target,coverage,feedback,paint,buffer}
}


const paletteA=makeBrushGradient([0,0,1,128/255],[0,0,1,128/255])
const execution180=(gradient=paletteA):BrushExecutionContext=>({brushSource:copyBrushSourceContext({version:1,gradient})})
const inputs180=():Dab[]=>[.25,.75].map((pressure,i)=>({...dab171(.5,i*10),pressure}))
function descriptor183(control:'dabProgress'|'distance'='dabProgress'){const b=textureWash171();b.version=183;b.texture!.strength=1;b.behavior!.modulations={grainDepth:[{control,period:2,periodic:false,minimum:0,jitter:0,curve:[[0,0],[1,1]]}]};return b}
it('183 actualpreparedBP feedback reuses2request fade/wholechunks/Oonce/warm0',()=>{const a=setup(),b=setup(),d=descriptor183(),ds=inputs180();try{for(const o of[a,b])o.painter.prepareTextureGradient(d,execution180());const up=vi.spyOn(a.gl,'texImage2D'),co=vi.spyOn(a.gl,'createProgram'),u=vi.spyOn(a.gl,'uniform1f');a.paint(d,ds,execution180());b.paint(d,ds.slice(0,1),execution180());b.paint(d,ds.slice(1),execution180());expect(a.s.brushBehavior).toEqual(b.s.brushBehavior);expect(u.mock.calls.filter(([loc])=>loc.name==='u_texStrength').map(([,v])=>v)).toEqual([0,.5]);expect(u.mock.calls.filter(([loc,v])=>loc.name==='u_washMode'&&v>0).every(([,v])=>v===2)).toBe(true);expect(u.mock.calls.some(([loc,v])=>loc.name==='u_opacity'&&v===.5)).toBe(true);expect(up).not.toHaveBeenCalled();expect(co).not.toHaveBeenCalled();expect(a.acquire).not.toHaveBeenCalled();expect(a.s.brushBehavior!.washOpacity!.maximum).toBe(1)}finally{a.painter.destroy();b.painter.destroy()}})
it('183 actualBP combinedconstant .5 sum pressure+worlddistance gives .375→.75, not1',()=>{const o=setup(),d=descriptor183();d.texture!.strength=.5;d.behavior!.modulations!.grainDepth=[{control:'off',minimum:0,jitter:0,combine:{mode:'sum',constant:.5,scaling:[{control:'pressure',minimum:0,jitter:0},{control:'distance',period:4,periodic:false,minimum:0,jitter:0}],additive:[]}}];const ds=[0,3].map((x,i)=>({...dab171(.5,i*10),x:17+x,pressure:.75}));try{o.painter.prepareTextureGradient(d,execution180());const u=vi.spyOn(o.gl,'uniform1f');o.paint(d,ds,execution180());expect(u.mock.calls.filter(([loc])=>loc.name==='u_texStrength').map(([,v])=>v)).toEqual([.375,.75])}finally{o.painter.destroy()}})
it('183 malformedscope/missingpalette/effectiveerase reject before scratchorupload',()=>{const o=setup(),b=descriptor183();try{const up=vi.spyOn(o.gl,'texImage2D');expect(()=>o.paint(b,inputs180())).toThrow('captured canvas gradient');expect(o.s.getOrCreate).not.toHaveBeenCalled();o.painter.prepareTextureGradient(b,execution180());up.mockClear();const bad=structuredClone(b);bad.version=180;expect(()=>o.paint(bad,inputs180(),execution180())).toThrow('Wash180');expect(o.s.getOrCreate).not.toHaveBeenCalled();expect(up).not.toHaveBeenCalled();b.version=183;expect(()=>brushPreparationPlan(b,true)).toThrow('Wash180')}finally{o.painter.destroy()}})
