import {describe,it,expect} from 'vitest'
import {createBristleInkProfile,createBristleInkState,beginBristleInkLine,advanceBristleInkLine} from './brushBristleInk'
import {advanceBristleInkBulk,bristleInkSpanOpacity} from './brushBristleInkBulk'
const settings={depletion:[0,.1,.7,1,.25],useOpacity:true,useSaturation:false,useWeights:false,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:50}
describe('Bristle bulk opacity trajectory',()=>{
 it('matches sequential reference for signed, fractional and zero-length trajectories and continuation',()=>{
  for(const useWeights of [false,true])for(const useOpacity of [false,true])for(const aa of [false,true]){
   const p=createBristleInkProfile({...settings,useWeights,useOpacity}),bulk=createBristleInkState(1),reference=createBristleInkState(1)
   for(const [start,end]of [[[.3,-.7],[5.8,2.2]],[[5.8,2.2],[-3.1,8.9]],[[1,1],[1,1]]] as const){
    const span=advanceBristleInkBulk(p,bulk,0,start,end,.7,1.2,aa),line=beginBristleInkLine(reference,0,start,end,.7,1.2,[.2,.4,.6],aa)
    const samples=advanceBristleInkLine(p,reference,line,2048).samples
    expect(samples.map(s=>s.opacity)).toEqual(samples.map((_,i)=>bristleInkSpanOpacity(p,span,i)))
    expect(bulk).toEqual(reference)
   }
  }
 })
 it('advances a hundred-million-pixel invisible trajectory in constant space and clones continuation',()=>{
  const p=createBristleInkProfile(settings),state=createBristleInkState(2)
  const span=advanceBristleInkBulk(p,state,0,[0,0],[100000000,2],.8,1,false)
  expect(span.samples).toBe(100000002);expect(state.hairs[0]).toEqual({counter:100000002,inkAmount:.75});expect(state.hairs[1].counter).toBe(0)
  const copy=structuredClone(state)
  expect(advanceBristleInkBulk(p,state,0,[1,1],[2,2],1,1,true)).toEqual(advanceBristleInkBulk(p,copy,0,[1,1],[2,2],1,1,true));expect(state).toEqual(copy)
 })
 it('rejects saturation and counter exhaustion before mutation',()=>{
  const state=createBristleInkState(1),before=structuredClone(state)
  expect(()=>advanceBristleInkBulk(createBristleInkProfile({...settings,useSaturation:true}),state,0,[0,0],[1,1],1,1,false)).toThrow('saturation');expect(state).toEqual(before)
  state.hairs[0].counter=Number.MAX_SAFE_INTEGER
  expect(()=>advanceBristleInkBulk(createBristleInkProfile(settings),state,0,[0,0],[1,1],1,1,false)).toThrow('exhausted');expect(state.hairs[0].counter).toBe(Number.MAX_SAFE_INTEGER)
 })
})
