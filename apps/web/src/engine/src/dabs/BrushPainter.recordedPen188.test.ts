import{expect,it}from'vitest'
import{BrushPainter}from'./BrushPainter'
import{BrushBehaviorPainter,type BehaviorScratch}from'./BrushBehaviorPainter'
import type{ILayerBuffer}from'../buffers/ILayerBuffer'
import{recordedPen188}from'../../../../../../packages/shared/src/recordedPen188.testFixture.js'
const d={x:0,y:0,pressure:1,tiltX:0,tiltY:0,size:16,aspectRatio:1,angle:0,opacity:1,t:0}
it('both real public paint entries reject missing188 fields and malformedlegacy newcontrols before context/state/GL',()=>{const primary=Object.create(BrushPainter.prototype)as BrushPainter,behavior=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter;const target={resolveForPaint(){throw Error('target reached')}}as unknown as ILayerBuffer;const scratch={}as BehaviorScratch;for(const brush of [recordedPen188(),{...recordedPen188(),version:187}]){expect(()=>primary.paint(target,[d],{opacity:1,hardness:1,sizeMultiplier:1},{brush,pressure:{size:true,opacity:true}},[1,1,1],scratch,undefined)).toThrow(/pen188/);expect(()=>behavior.paint(target,[d],{opacity:1,hardness:1,sizeMultiplier:1},brush,{size:true,opacity:true},[1,1,1],scratch)).toThrow(/pen188/);expect(Object.keys(scratch)).toEqual([])}})
