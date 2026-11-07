import {expect,it} from 'vitest'
import {createBristleInkProfile,createBristleInkState,beginBristleInkLine,advanceBristleInkLine} from './brushBristleInk'
import {advanceBristleInkBulk} from './brushBristleInkBulk'
import {beginBristleSaturation,advanceBristleSaturationReference,prepareBristleSaturationPrefix,bristleSaturationAnalytic,bristleSaturationFactor} from './brushBristleSaturation'
const settings={depletion:[.125,.25,.5,.75],useOpacity:true,useSaturation:true,useWeights:false,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:.25}
function spanFor(profile:ReturnType<typeof createBristleInkProfile>,pressure=.7){const state=createBristleInkState(1);state.hairs[0]={counter:1,inkAmount:.8};return advanceBristleInkBulk({...profile,useSaturation:false},state,0,[.3,-.7],[12.4,3.2],.8,pressure,false)}
it('matches existing sequential reference with weighted/unweighted transparent deposits and cloned continuation',()=>{
 for(const useWeights of [false,true]){
  const profile=createBristleInkProfile({...settings,useWeights}),span=spanFor(profile),cursor=beginBristleSaturation([1,.2,.6]),state=createBristleInkState(1)
  state.hairs[0]={counter:span.counter,inkAmount:span.initialInk}
  const line=beginBristleInkLine(state,0,span.start,span.end,span.length,span.pressure,[1,.2,.6],false)
  advanceBristleSaturationReference(profile,span,cursor,3);const copy=structuredClone(cursor)
  advanceBristleSaturationReference(profile,span,cursor,2048);advanceBristleSaturationReference(profile,span,copy,2048)
  advanceBristleInkLine(profile,state,line,2048)
  expect(cursor).toEqual(copy);expect(cursor.color).toEqual(line.color)
 }
 const p=createBristleInkProfile(settings),span={...spanFor(p),initialInk:0},c=beginBristleSaturation([1,0,0]);advanceBristleSaturationReference(p,span,c,1);expect(c.color[0]).toBe(c.color[1]);expect(c.color[1]).toBe(c.color[2])
})
it('resets each trajectory source color and bounds a huge line to requested work',()=>{
 const p=createBristleInkProfile(settings),span={...spanFor(p),samples:100000002},first=beginBristleSaturation([1,0,0])
 expect(advanceBristleSaturationReference(p,span,first,2048)).toEqual({steps:2048,done:false});expect(first.index).toBe(2048)
 const next=beginBristleSaturation([1,0,0]);expect(next.index).toBe(0);expect(next.color).toEqual([1,0,0])
 expect(()=>advanceBristleSaturationReference(p,span,next,2049)).toThrow('continuation')
})
it('evaluates the nonexpanding analytic product with constant prefix reads, including zero/tail',()=>{
 for(const depletion of [[.125,.25,.5,.75],[0,1,.5],[0]]){
  const p=createBristleInkProfile({...settings,depletion}),prefix=prepareBristleSaturationPrefix(p),span=spanFor(p),source=[1,.2,.6]as const
  let factor=1
  for(let k=0;k<span.samples;k++){
   // Analytic model omits repeated F32/RGB8 feedback deliberately.
   const old=k===0?span.initialInk:1-p.depletion[Math.min(p.amount-1,span.counter+k-1)],remaining=1-p.depletion[Math.min(p.amount-1,span.counter+k)]
   factor*=span.pressure*span.length*old*remaining
   const actual=bristleSaturationAnalytic(prefix,p,span,k,source),light=.6
   for(let c=0;c<3;c++)expect(actual[c]).toBeCloseTo(light+(source[c]-light)*factor,13)
  }
  expect(bristleSaturationAnalytic(prefix,p,{...span,samples:100000002},100000000,source)).toHaveLength(3)
 }
})
it('rejects expanding/weighted analytic shortcuts and foreign prefixes; preserves raw depletion weight',()=>{
 const p=createBristleInkProfile(settings),prefix=prepareBristleSaturationPrefix(p),span=spanFor(p)
 expect(()=>bristleSaturationAnalytic(prefix,p,{...span,pressure:2},0,[1,0,0])).toThrow('nonexpanding')
 const weighted=createBristleInkProfile({...settings,useWeights:true,inkDepletionWeight:50}),ws=spanFor(weighted)
 expect(bristleSaturationFactor(weighted,ws,0)).toBeGreaterThan(1)
 expect(()=>bristleSaturationAnalytic(prepareBristleSaturationPrefix(weighted),weighted,ws,0,[1,0,0])).toThrow('unweighted')
 expect(()=>bristleSaturationAnalytic(structuredClone(prefix),p,span,0,[1,0,0])).toThrow('matching')
})


it('clamps HSL saturation before RGB quantization and preserves lightness at expanding factors',async()=>{
 const {bristleHslSaturationRgb8}=await import('./brushBristleInk')
 // S is already one at L=.6. RGB channel clipping would incorrectly lower L.
 expect(bristleHslSaturationRgb8([1,.2,.6],2)).toEqual([1,.2,.6])
 expect(bristleHslSaturationRgb8([.8,.4,.6],3)).toEqual([1,.2,.6])
 expect(bristleHslSaturationRgb8([.8,.4,.6],0)).toEqual([.6,.6,.6])
})
