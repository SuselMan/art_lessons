import {expect,it} from 'vitest'
import fixture from './fixtures/sourceDistanceTiming.json'
import {SourceDistanceTiming,sourceTimingInterval,SOURCE_LONG_TIME} from './sourceDistanceTiming'
it('matches independent compiled pinned distance-first native state fixtures',()=>{
 for(const {input:a,result} of fixture.cases){
  const state=new SourceDistanceTiming();[state.x,state.y,state.time]=a.slice(3,6)
  const factor=state.next({x:0,y:0,t:0},{x:a[6],y:a[7],t:a[8]},{enabled:!!a[0],isotropic:!!a[1],x:4,y:3,angle:a[10],flipped:!!a[11]},a[2]?a[9]:undefined)
  expect([factor,state.x,state.y,state.time,state.spacingElapsed,state.timingElapsed]).toEqual(result)
 }
})
it('preserves state on equal/reversed time and clones refresh counters independently',()=>{
 const state=new SourceDistanceTiming();state.time=3;state.spacingElapsed=20;state.timingElapsed=30
 const fork=state.clone();fork.updateSpacing();fork.updateTiming()
 expect([state.spacingElapsed,state.timingElapsed]).toEqual([20,30])
 expect(fork.next({x:0,y:0,t:5},{x:0,y:0,t:5},{enabled:false,isotropic:true,x:1,y:1,angle:0},10)).toBe(-1)
 expect(fork.time).toBe(3)
 expect(sourceTimingInterval(20,.5)).toBe(100)
 expect(sourceTimingInterval(0)).toBe(Infinity)
 expect(sourceTimingInterval(20,0)).toBe(SOURCE_LONG_TIME)
})
