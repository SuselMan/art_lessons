import fs from'node:fs'
import{mask190RootExecution}from'../presets/independentMask190'
import{SketchLineBatch}from'./SketchLineBatch'
import{it,expect,vi}from'vitest'
import{tangent136,dab136,source136}from'../../../../../../packages/shared/src/tangentWash136.testFixture.js'
import{BrushPainter,type BrushContext}from'./BrushPainter'
import{MockGL}from'../../testing/mockGL'
import{TiledLayerBuffer}from'../buffers/TiledLayerBuffer'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{BehaviorScratch}from'./BrushBehaviorPainter'
import type{BrushExecutionContext}from'../presets/brushExecutionContext'
import type{PencilPreset}from'../presets/pencilPresets'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
function setup(){
 const gl=Object.assign(new MockGL(),{blendColor:vi.fn()}),leases:{width:number;height:number;released:boolean}[]=[]
 const buffer=(width=1300,height=900)=>({width,height,texture:gl.createTexture(),beginDraw:vi.fn(),beginReplaceDraw:vi.fn(),endDraw:vi.fn(),clear:vi.fn(),copyRegionInto:vi.fn()})as unknown as AccumulationBuffer
 const acquire=vi.fn((width:number,height:number)=>{const rec={width,height,released:false};leases.push(rec);return{buffer:buffer(width,height),assertCurrent(){if(rec.released)throw Error('retired')},release(){rec.released=true}}})
 const painter=new BrushPainter({gl,quadBuf:()=>gl.createBuffer(),paper:{texture:gl.createTexture(),worldSize:()=>({w:64,h:64}),scale:1},segmentLength:()=>1,acquireSprayScratch:acquire}as unknown as BrushContext);painter.initGL()
 const original=buffer(),coverage=buffer(),feedback=buffer(),targetBuffer=buffer(),entry={original,coverage},s={getOrCreate:vi.fn(()=>entry),brushCeiling:vi.fn(()=>feedback),brushCeilingCopy:vi.fn(()=>{throw Error('fourth plane forbidden')}),brushSecondary:vi.fn(()=>{throw Error('secondary forbidden')}),noteBrushEdgePx:()=>0}as unknown as BehaviorScratch
 const target=Object.assign(Object.create(TiledLayerBuffer.prototype)as TiledLayerBuffer,{coarseWorldSize:()=>({w:1300,h:900}),resolveForPaint:()=>[{buffer:targetBuffer,originX:-650,originY:-450,contentRect:null}],markContentPainted:vi.fn()})
 const paint=(b:BrushDescriptor,dabs:Dab[]= [dab136()],execution:BrushExecutionContext|undefined={brushSource:source136()})=>painter.paint(target,dabs,{sizeMultiplier:1}as PencilPreset,{brush:b,pressure:{size:true,opacity:true}},[.8,.2,.1],s,undefined,execution)
 return{gl,painter,leases,acquire,s,target,coverage,feedback,paint,buffer}
}

it('new ordinary136 prewarm has no unborn gesture context; malformed metadata fails before scope/resource/program/state',()=>{const o=setup();try{const b=tangent136(),draw=vi.spyOn(o.gl,'drawArrays');expect(()=>o.paint(b)).toThrow('not prepared');expect(o.s.brushBehavior).toBeUndefined();expect(draw).not.toHaveBeenCalled();b.flow=.5;expect(()=>o.painter.prepareRecordedStampResources(b)).toThrow('scope');expect(o.s.getOrCreate).not.toHaveBeenCalled();b.flow=1;expect(()=>o.painter.prepareRecordedStampResources(b)).not.toThrow();expect(o.s.brushBehavior).toBeUndefined()}finally{o.painter.destroy()}})
it('actual computed normals force feedback/mode2 even with unchanged foreground and rising opacity, external opacity once',()=>{const o=setup();try{const b=tangent136();o.painter.prepareRecordedStampResources(b);const mode=vi.spyOn(o.gl,'uniform1f'),rgb=vi.spyOn(o.gl,'uniform3fv'),compile=vi.spyOn(o.gl,'createProgram'),upload=vi.spyOn(o.gl,'texImage2D');o.paint(b,[dab136(60,0,1),dab136(-60,10,.5)]);expect(mode.mock.calls.filter(([loc,v])=>loc.name==='u_washMode'&&v>0).every(([,v])=>v===2)).toBe(true);expect(mode.mock.calls.filter(([loc,v])=>loc.name==='u_washMode'&&v===2).length).toBeGreaterThan(0);expect(rgb.mock.calls.some(([loc,v])=>loc.name==='u_color'&&JSON.stringify(v)==='[1,0.5019607843137255,0]')).toBe(true);expect(rgb.mock.calls.some(([loc,v])=>loc.name==='u_color'&&JSON.stringify(v)==='[0,0.4980392156862745,0]')).toBe(true);expect(o.coverage.copyRegionInto).toHaveBeenCalledTimes(2);expect(o.s.brushBehavior!.washOpacity!.average).toBeCloseTo(.95,14);expect(o.s.brushBehavior!.washOpacity!.maximum).toBe(1);expect(mode.mock.calls.filter(([loc])=>loc.name==='u_opacity').every(([,v])=>v===1||v===.5)).toBe(true);expect(o.acquire).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled()}finally{o.painter.destroy()}})
it('captured normalRotation/sourceAngle requiredbefore state and live continuation preserves accepted prefix on changed source',()=>{const o=setup();try{const b=tangent136();o.painter.prepareRecordedStampResources(b);const d=dab136();Reflect.deleteProperty(d,'sourceAngle');expect(()=>o.paint(b,[d])).toThrow();expect(o.s.brushBehavior).toBeUndefined();expect(o.s.getOrCreate).not.toHaveBeenCalled();expect(()=>o.paint(b,[dab136()],{})).toThrow('viewport rotation');expect(o.s.brushBehavior).toBeUndefined();o.paint(b,[dab136(60,0)]);const prefix=structuredClone(o.s.brushBehavior);expect(()=>o.paint(b,[dab136(-60,10)],{brushSource:source136(.5)})).toThrow();expect(o.s.brushBehavior).toEqual(prefix)}finally{o.painter.destroy()}})
it('whole versus chunks preserves actual Wash history/feedback and old56 mode4 remains a directOver control',()=>{const a=setup(),b=setup();try{const brush=tangent136(),d=[dab136(60,0,1),dab136(-60,10,.5)];a.painter.prepareRecordedStampResources(brush);b.painter.prepareRecordedStampResources(brush);a.paint(brush,d);b.paint(brush,d.slice(0,1));b.paint(brush,d.slice(1));expect(a.s.brushBehavior).toEqual(b.s.brushBehavior);expect(a.coverage.copyRegionInto).toHaveBeenCalledTimes(2);expect(b.coverage.copyRegionInto).toHaveBeenCalledTimes(2);const old=tangent136();old.version=56;old.behavior!.rendering!.accumulation='directOver';const c=setup();try{c.painter.prepareProcedural();const modes=vi.spyOn(c.gl,'uniform1f');c.paint(old,d);expect(c.coverage.copyRegionInto).not.toHaveBeenCalled();expect(modes.mock.calls.some(([loc,v])=>loc.name==='u_washMode'&&v===4)).toBe(true)}finally{c.painter.destroy()}}finally{a.painter.destroy();b.painter.destroy()}})

it('explicit internal effectiveErase override rejects valid136 before scratch, resource lease or draw',()=>{const o=setup();try{const b=tangent136();o.painter.prepareRecordedStampResources(b);const draw=vi.spyOn(o.gl,'drawArrays');expect(()=>o.painter['behavior'].paint(o.target,[dab136()],{sizeMultiplier:1}as PencilPreset,b,{size:true,opacity:true},[.8,.2,.1],o.s,false,undefined,{brushSource:source136()},true)).toThrow('Invalid Tangent Wash136 scope');expect(o.s.brushBehavior).toBeUndefined();expect(o.s.getOrCreate).not.toHaveBeenCalled();expect(o.acquire).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled()}finally{o.painter.destroy()}})

it.skipIf(!process.env.NATIVE195_LIBRARY)('195 checked constructor1x1 uses a prewarmed continuous aliased line after its initial stamp, whole/chunks agree',()=>{
 const library=JSON.parse(fs.readFileSync(process.env.NATIVE195_LIBRARY!,'utf8'))
 const brush=library.brushes.map((entry:{descriptor:BrushDescriptor})=>entry.descriptor).find((b:BrushDescriptor)=>b.tangentNormal?.sharpnessChecked) as BrushDescriptor
 expect(brush).toBeDefined()
 const a=setup(),b=setup(),line=vi.spyOn(SketchLineBatch.prototype,'paint').mockImplementation(()=>{})
 const d=[{...dab136(0,.5,1),x:.5,y:.5,size:1,sourceSize:1,sourceScale:1,sourceTime:0,sourceTwist:0,sourceTangentialPressure:0},{...dab136(0,4.5,1),x:4.5,y:.5,size:1,sourceSize:1,sourceScale:1,sourceTime:40,sourceTwist:0,sourceTangentialPressure:0}]
 const execution=mask190RootExecution(brush,{brushSource:source136()})
 try{
  a.painter.prepareRecordedStampResources(brush);b.painter.prepareRecordedStampResources(brush)
  const compile=vi.spyOn(a.gl,'createProgram'),upload=vi.spyOn(a.gl,'texImage2D')
  a.paint(brush,d,execution)
  expect(line).toHaveBeenCalledTimes(1)
  const args=line.mock.calls[0]
  expect(args[0]).toHaveLength(1)
  expect(args[0][0]).toMatchObject({x:2.5,y:.5,segmentLength:4,radius:.5,angle:0})
  expect(args[5]).toBe(false)
  expect(compile).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled()
  b.paint(brush,d.slice(0,1),execution);b.paint(brush,d.slice(1),execution)
  expect(a.s.brushBehavior).toEqual(b.s.brushBehavior)
  expect(a.s.brushBehavior!.genericDabSequence195).toBe(1)
  const c=setup();try{c.painter.prepareRecordedStampResources(brush);line.mockClear();c.paint(brush,d.map(x=>({...x,sourceSize:16})),execution);expect(line).not.toHaveBeenCalled()}finally{c.painter.destroy()}
 }finally{line.mockRestore();a.painter.destroy();b.painter.destroy()}
})
