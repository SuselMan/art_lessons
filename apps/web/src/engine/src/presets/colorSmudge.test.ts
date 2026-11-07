import { expect, it, vi } from 'vitest'
import { colorSmudgeRates, resolveColorSmudgeRate } from './colorSmudge'
it('keeps pigment independent from pickup and squares Color Rate after input dynamics',()=>{
 expect(colorSmudgeRates(.5,.6,.7,false)).toEqual({smear:.3,color:.7*.7*.5})
 expect(colorSmudgeRates(.5,0,1,false)).toEqual({smear:0,color:.5})
 expect(colorSmudgeRates(1,1,0,true)).toEqual({smear:.8,color:0})
 expect(colorSmudgeRates(.5,.6,.7,true).smear).toBeCloseTo(.24)
})
it('bounds the two independent composition opacities',()=>{
 expect(colorSmudgeRates(0,1,1,false)).toEqual({smear:0,color:0})
 expect(colorSmudgeRates(2,1,1,false)).toEqual({smear:1,color:1})
})

import type {BrushDynamic,Dab} from '@grafetto/shared'
import {beginBrushBehavior,brushDynamicValue} from './brushBehavior'
const colorRateDab:Dab={x:5,y:10,size:20,pressure:.8,tiltX:0,tiltY:0,angle:0,aspectRatio:1,opacity:1,t:0}
const response=(value:number):BrushDynamic=>({control:'off',minimum:0,jitter:0,curve:[[0,value],[1,value]]})
function combinedRate(constant:number,mode:NonNullable<BrushDynamic['combine']>['mode'],values:number[],additive:number[]=[]){
 const dynamic:BrushDynamic={control:'off',minimum:0,jitter:0,combine:{constant,mode,scaling:values.map(response),additive:additive.map(response)}}
 const state=beginBrushBehavior(colorRateDab)
 const evaluate=vi.fn((control:BrushDynamic)=>brushDynamicValue(control,colorRateDab,state,.4))
 return{rate:resolveColorSmudgeRate(constant,[dynamic],evaluate),evaluate}
}
it('restores nonunit constant before combined response clamp, then squares once for modern ColorRate',()=>{
 // Independent native size-like arithmetic: clamp(.5 * (.8+.7)) = .75.
 // Clamping the response first would give .5; squaring only sensors gives .5625*.5.
 const result=combinedRate(.5,'sum',[.8,.7])
 expect(result.rate).toBe(.75)
 expect(colorSmudgeRates(.4,.3,result.rate,false).color).toBe(.225)
 expect(result.evaluate).toHaveBeenCalledOnce()
 expect(combinedRate(.9,'sum',[.8,.7]).rate).toBe(1)
})
it.each([['product',.5*.8*.2],['sum',.5*(.8+.2)],['max',.5*.8],['min',.5*.2],['difference',.5*(.8-.2)]]as const)('keeps native %s response before the nonlinear colour stage',(mode,expected)=>{
 const {rate}=combinedRate(.5,mode,[.8,.2])
 expect(rate).toBeCloseTo(expected,14)
 expect(colorSmudgeRates(.6,.2,rate,true).color).toBeCloseTo(expected*expected*.6,14)
})
it('combines signed additive response before clamp and handles zero constant without division or sensor requery',()=>{
 // Two .75 additive values sum to signed1, producing unsigned multiplier1.
 expect(combinedRate(.5,'sum',[.8,.7],[.75,.75]).rate).toBe(.75)
 expect(combinedRate(.5,'sum',[.8,.7],[.25,.25]).rate).toBe(0)
 const zero=combinedRate(0,'sum',[.8,.7]);expect(zero.rate).toBe(0);expect(zero.evaluate).toHaveBeenCalledOnce()
 expect(colorSmudgeRates(.6,1,zero.rate,false).color).toBe(0)
})
it('retains historical products and legacy foreground compensation without clamping normalized factors',()=>{
 const evaluate=vi.fn((value:number)=>value)
 expect(resolveColorSmudgeRate(.7,[.2,.8],evaluate)).toBe(.7*(.2*.8))
 expect(evaluate.mock.calls.map(([value])=>value)).toEqual([.2,.8])
 // Legacy foreground coefficient includes max(1-smudge,.2); combine.constant
 // remains ORIGINAL ColorRate C=.5, not the compensated external .1.
 const state=beginBrushBehavior(colorRateDab),dynamic:BrushDynamic={control:'off',minimum:0,jitter:0,combine:{constant:.5,mode:'sum',scaling:[response(.8),response(.7)],additive:[]}}
 expect(resolveColorSmudgeRate(.1,[dynamic],control=>brushDynamicValue(control,colorRateDab,state,.4))).toBeCloseTo(.15,14)
 expect(resolveColorSmudgeRate(.7,undefined,evaluate)).toBe(.7)
})
