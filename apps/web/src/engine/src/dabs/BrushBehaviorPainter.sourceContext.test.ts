import{it,expect}from'vitest'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import{BrushBehaviorPainter,type BehaviorScratch}from'./BrushBehaviorPainter'
import type{BrushContext}from'./BrushPainter'
import type{PencilPreset}from'../presets/pencilPresets'
import{beginBrushBehavior}from'../presets/brushBehavior'
import{brushExecutionContext}from'../presets/brushExecutionContext'
it('admits a captured source on first paint and rejects replacing it mid-gesture before GL',()=>{
 const context=brushExecutionContext(undefined,{version:1,clone:{x:1,y:2,offsetX:3,offsetY:4}}),dab={x:0,y:0,pressure:1,opacity:1,angle:0}as Dab
 const painter=new BrushBehaviorPainter({}as BrushContext,()=>{throw Error('unused')},()=>{throw Error('unused')},()=>{},()=>{throw Error('admitted-before-GL')})
 const brush={tip:{kind:'round'},clone:{version:1,moveSourcePoint:true},behavior:{version:2}}as BrushDescriptor,scratch={}as BehaviorScratch
 const paint=()=>painter.paint({resolveForPaint:()=>[],markContentPainted:()=>{}},[dab],{}as PencilPreset,brush,{size:true,opacity:true},[0,0,0],scratch,false,undefined,context)
 expect(paint).toThrow('admitted-before-GL')
 scratch.brushBehavior=beginBrushBehavior(dab)
 expect(paint).toThrow('sources changed')
 scratch.brushBehavior=beginBrushBehavior(dab,context)
 expect(paint).toThrow('admitted-before-GL')
})
