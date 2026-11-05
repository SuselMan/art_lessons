import { expect, it } from 'vitest'
import { colorSmudgeRates } from './colorSmudge'
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
