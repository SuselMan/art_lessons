import { expect,it } from 'vitest'
import fixture from './fixtures/kritaInput.cpp.json'
import { createCursorHistory,pushCursorHistory,sourceDrawingDirection,sourceFanRequests,startCursorDirection,type CursorHistory } from './kritaStrokeInput'
it('matches the independent compiled C++ history/fan receipts, including the previously differing initial direction',()=>{
 let state=createCursorHistory(),saved=structuredClone(state)
 let directions=0,fans=0,formerMismatch=0
 for(const test of fixture.cases){
  const a=test.args,e=test.expected
  if(test.op==='reset')state={first:{x:a[0],y:a[1]},second:{x:a[0],y:a[1]}}
  if(test.op==='save')saved=structuredClone(state)
  if(test.op==='restore')state=structuredClone(saved)
  if(test.op==='hover')expect(Object.values(pushCursorHistory(state,{x:a[0],y:a[1]},a[2]))).toEqual(e.previous)
  if(test.op==='start'){
   const direction=startCursorDirection(state,{x:a[0],y:a[1]},a[2],!!a[3]);directions++
   if(test.id===fixture.provenance.knownDirectionApproximationMismatch){
    expect(direction).not.toBe(.8039283156394958);formerMismatch++
   }
   expect(direction).toBe(e.drawingAngle)
  }
  expect([Object.values(state.first),Object.values(state.second)]).toEqual(e.state)
  if(test.op==='fan'){
   const previous={angle:a[0],x:a[3],y:a[4],pressure:a[7],t:a[9],tiltX:0,tiltY:0}
   const next={angle:a[1],x:a[5],y:a[6],pressure:a[8],t:a[10],tiltX:0,tiltY:0}
   const actual=sourceFanRequests(previous,next,Math.round(a[2]*180/Math.PI)).map(r=>({angle:r.angle,position:[r.x,r.y],pressure:r.pressure,time:r.t}))
   expect(actual).toEqual(e.fans?.map(r=>({angle:r.angle,position:r.position,pressure:r.pressure,time:r.time})));fans++
  }
 }
 expect(fixture.cases).toHaveLength(29);expect(directions).toBeGreaterThan(0);expect(fans).toBeGreaterThan(8);expect(formerMismatch).toBe(1)
 // DTO checkpoint genuinely detaches both history points.
 const copy:CursorHistory=structuredClone(state);copy.first.x++
 expect(copy.first.x).not.toBe(state.first.x)
 expect(sourceDrawingDirection({x:1,y:1},{x:1,y:1},.7)).toBe(.7)
})
