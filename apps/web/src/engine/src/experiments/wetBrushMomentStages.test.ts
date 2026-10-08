import {describe,it,expect} from 'vitest'
import {exchangeMomentStages} from './wetBrushMomentStages'
import {exchangeMomentVector,type MomentVector} from './wetBrushMomentVector'
describe('diagnostic exact mixing/advection decomposition',()=>{
 it('source-fit overlap, near-capacity receiver, last Q8 and zeroPB positiveC',()=>{
  const pairs:[MomentVector,MomentVector][]=[[[170,80,180,60,200],[254,254,255,254,255]],[[0,255,1,127,0],[1,0,254,128,255]],[[255,255,255,255,255],[254,254,254,254,254]],[[1,1,1,1,1],[0,0,0,0,0]]]
  for(const [a,b] of pairs)for(const direction of [-256,0,256])for(const wet of [1,127,255]){
   const flow={wet,mixRate:48,advectionRate:80,direction},stages=exchangeMomentStages(a,b,flow),direct=exchangeMomentVector(a,b,flow)
   expect(stages.final.a).toEqual(direct.a);expect(stages.final.b).toEqual(direct.b)
   for(const stage of [stages.mixed,stages.final])for(let j=0;j<5;j++){expect(stage.a[j]+stage.b[j]).toBe(a[j]+b[j]);expect(stage.a[j]).toBeGreaterThanOrEqual(0);expect(stage.a[j]).toBeLessThanOrEqual(255);expect(stage.b[j]).toBeGreaterThanOrEqual(0);expect(stage.b[j]).toBeLessThanOrEqual(255)}
  }
 })
})
