import {expect,it} from 'vitest'
import {DabSystem} from './DabSystem'
import {brushDynamicValue,beginBrushBehavior} from '../presets/brushBehavior'
import fixture from './fixtures/sourceDistanceTiming.json'
import {codecDab} from './codecDab'
function timed(rate=20){const d=new DabSystem();d.captureSourceTime=true;d.timing={version:1,rate,ignoreDistanceSpacing:false};return d}
it('authors stationary requests from elapsed input rather than distance deadband',()=>{
 const d=timed();expect(d.startStroke(10,20,1,0,0,24)[0].sourceTime).toBe(0)
 const hold=d.continueStroke(10,20,1,0,0,24,0,0,1000)
 expect(hold.map(v=>v.sourceTime)).toEqual(fixture.holds[0].times)
 expect(hold.map(v=>[v.x,v.y,v.sourceTime])).toEqual(fixture.holds[0].positions)
 expect(d.endStroke(24)).toEqual([])
 expect(d.peekEndSample(24)?.sourceTime).toBe(1000)
})
it('keeps timing forks independent and does not add a request for equal-time input',()=>{
 const d=timed();d.startStroke(0,0,1,0,0,24)
 expect(d.continueStroke(0,0,1,0,0,24,0,0,49)).toEqual([])
 const fork=d.forkForPreview()
 expect(fork.continueStroke(0,0,1,0,0,24,0,0,50)).toHaveLength(1)
 expect(d.continueStroke(0,0,1,0,0,24,0,0,49)).toEqual([])
 expect(d.continueStroke(0,0,1,0,0,24,0,0,50)).toHaveLength(1)
 expect(()=>d.continueStroke(0,0,1,0,0,24,0,0,40)).toThrow('backwards')
})
it('refreshes dynamic Rate after 50ms without a paint request and retains factor-zero requests',()=>{
 const d=timed();d.timing!.rateDynamics=[{control:'pressure',minimum:0,jitter:0,curve:[[0,0],[1,1]]}]
 d.startStroke(0,0,0,0,0,24)
 expect(d.continueStroke(0,0,1,0,0,24,0,0,25)).toEqual([])
 expect(d.continueStroke(0,0,1,0,0,24,0,0,50)).toEqual([])
 const request=d.continueStroke(0,0,1,0,0,24,0,0,51)
 expect(request).toHaveLength(1);expect(request[0].sourceTime).toBe(50)
})
it('keeps zero rate spatial opportunities, while time-only zero rate emits nothing',()=>{
 const d=timed(0);d.startStroke(0,0,1,0,0,24)
 expect(d.continueStroke(100,0,1,0,0,24,0,0,100)).not.toHaveLength(0)
 const held=timed(0);held.timing!.ignoreDistanceSpacing=true;held.startStroke(0,0,1,0,0,24)
 expect(held.continueStroke(100,0,1,0,0,24,0,0,100)).toEqual([])
})
it('evaluates time from source F64 across the periodic discontinuity and preserves it in codecDab',()=>{
 const input={x:0,y:0,pressure:1,tiltX:0,tiltY:0,size:24,aspectRatio:1,angle:0,opacity:1,t:1469.99999,sourceTime:1469.99999}
 const canonical=codecDab(input),state=beginBrushBehavior(input)
 expect(canonical.t).toBe(1470);expect(canonical.sourceTime).toBe(input.sourceTime)
 expect(brushDynamicValue({control:'time',period:1470,periodic:true,minimum:0,jitter:0},canonical,state,0)).toBe(input.sourceTime/1470)
 expect(brushDynamicValue({control:'time',period:1470,periodic:false,minimum:0,jitter:0},{...canonical,sourceTime:2000},state,0)).toBe(1)
})

it('keeps raw direction stable when a turn is followed by stationary time inputs',()=>{
 const d=timed();d.strokeInput={version:1,initialDirection:'cursorHistory',fanCorners:{stepDegrees:30}}
 d.startStroke(0,0,1,0,0,24)
 d.continueStroke(20,0,1,0,0,24,0,0,10)
 const turn=d.continueStroke(20,20,1,0,0,24,0,0,20)
 const direction=turn.at(-1)!.sourceAngle
 const held=d.continueStroke(20,20,1,0,0,24,0,0,120)
 expect(held.map(v=>v.sourceAngle)).toEqual([direction,direction])
 expect(held.every(v=>v.x===20&&v.y===20)).toBe(true)
})

it('matches native compiled stationary time mixtures at all stock rate extremes',()=>{
 for(const reference of fixture.holds){
  const d=timed(reference.rate)
  if(reference.factor!==1)d.timing!.rateDynamics=[{control:'off',minimum:0,jitter:0,curve:[[0,reference.factor],[1,reference.factor]]}]
  d.startStroke(0,0,1,0,0,24)
  expect(d.continueStroke(0,0,1,0,0,24,0,0,reference.end).map(v=>v.sourceTime)).toEqual(reference.times)
 }
})

it('yields large foreground catch-up incrementally without losing requests or permitting interleaving',()=>{
 const d=timed(1000);d.startStroke(0,0,1,0,0,24)
 const stream=d.continueTimedStroke(0,0,1,0,0,24,0,0,10000)
 const first=stream.next();expect(first.done).toBe(false);if(first.done)return
 expect(first.value.sourceTime).toBe(1)
 expect(()=>d.continueTimedStroke(0,0,1,0,0,24,0,0,10001).next()).toThrow('interleave')
 expect(()=>d.forkForPreview()).toThrow('incomplete')
 let count=1,last=first.value.sourceTime
 for(const request of stream){count++;last=request.sourceTime}
 expect(count).toBe(fixture.catchup.count);expect(last).toBe(fixture.catchup.last)
 expect(()=>d.forkForPreview()).not.toThrow()
})
