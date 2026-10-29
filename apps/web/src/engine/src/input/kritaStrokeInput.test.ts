import { describe, expect, it } from 'vitest'
import { createCursorHistory, pushCursorHistory, sourceDrawingDirection, sourceFanRequests, startCursorDirection, type SourcePaintInformation } from './kritaStrokeInput'
const sample=(angle:number,extra:Partial<SourcePaintInformation>={}):SourcePaintInformation=>({x:0,y:0,angle,pressure:.2,tiltX:0,tiltY:10,t:5,...extra})
describe('source cursor history and author-only fan laws',()=>{
  it('uses min image-axis movement, retaining staircase history across horizontal hover',()=>{
    const state=createCursorHistory()
    expect(pushCursorHistory(state,{x:100,y:0},1)).toEqual({x:0,y:0})
    expect(state.second).toEqual({x:0,y:0})
    pushCursorHistory(state,{x:6.999999,y:7},1)
    expect(state.second).toEqual({x:0,y:0})
    pushCursorHistory(state,{x:7,y:7},1)
    expect(state).toEqual({first:{x:0,y:0},second:{x:7,y:7}})
    expect(pushCursorHistory(state,{x:10.5,y:10.5},2)).toEqual({x:7,y:7})
  })
  it('uses retained known prior for a mouse tap, resets only the touch helper',()=>{
    const state={first:{x:20,y:20},second:{x:40,y:40}}
    const angle=startCursorDirection(state,{x:100,y:100},1)
    expect(angle).toBe(Math.fround(Math.PI/4))
    expect(state).toEqual({first:{x:40,y:40},second:{x:100,y:100}})
    expect(startCursorDirection(state,{x:100,y:100},1,true)).toBe(0)
    expect(state.first).toEqual(state.second)
    expect(sourceDrawingDirection({x:100,y:100},{x:100,y:100},.75)).toBe(.75)
  })
  it('keeps the JS atan2f approximation limitation explicit rather than fitting the native value',()=>{
    expect(sourceDrawingDirection({x:0,y:0},{x:82.75,y:85.875},0)).toBe(.8039283156394958)
    expect(sourceDrawingDirection({x:0,y:0},{x:82.75,y:85.875},0)).not.toBe(.8039282560348511)
  })
  it('retains strict threshold and the negative half-turn tie, including a zero-fraction first fan',()=>{
    expect(sourceFanRequests(sample(0),sample(Math.PI/2),90)).toEqual([])
    const over=sourceFanRequests(sample(0),sample(Math.PI/2+1e-10,{x:100,t:105}),90)
    expect(over).toEqual([sample(Math.PI/2)])
    expect(sourceFanRequests(sample(0),sample(Math.PI),90).map(s=>s.angle)).toEqual([-Math.PI/2])
    expect(sourceFanRequests(sample(0),sample(-Math.PI),90).map(s=>s.angle)).toEqual([-Math.PI/2])
    expect(sourceFanRequests(sample(170*Math.PI/180),sample(-170*Math.PI/180),90)).toEqual([])
  })
  it('mixes source pressure, tilt, speed and time by source fan fractions before shaping',()=>{
    const fans=sourceFanRequests(sample(0,{normalizedSpeed:.1}),sample(100*Math.PI/180,{x:100,y:200,pressure:.8,tiltX:20,tiltY:30,t:105,normalizedSpeed:.9}),45)
    expect(fans).toHaveLength(2)
    expect(fans[0]).toEqual(sample(Math.PI/4,{normalizedSpeed:.1}))
    expect(fans[1].angle).toBe(Math.PI/2)
    expect(fans[1].x).toBeCloseTo(45);expect(fans[1].y).toBeCloseTo(90)
    expect(fans[1].pressure).toBeCloseTo(.47);expect(fans[1].t).toBeCloseTo(50)
    expect(fans[1].tiltX).toBeCloseTo(9);expect(fans[1].normalizedSpeed).toBeCloseTo(.46)
  })
  it('rejects unsupported steps rather than clamping or truncating source requests',()=>{
    for(const step of [0,-1,4,6.5,91,NaN,Infinity])expect(()=>sourceFanRequests(sample(0),sample(Math.PI),step)).toThrow()
    expect(sourceFanRequests(sample(0),sample(Math.PI),5).length).toBeGreaterThan(30)
  })
})
