import { describe,expect,it } from 'vitest'
import { DabSystem } from './DabSystem'
import { PENCIL_DAB_SHAPING } from '../presets/dabShaping'
const system=(enabled=true)=>{
  const s=new DabSystem({spacingFactor:.2,shaping:{...PENCIL_DAB_SHAPING,size:()=>1,angle:()=>0,aspect:()=>1,pressureSmoothingPx:0,tiltSmoothingPx:0}})
  if(enabled)s.strokeInput={version:1,initialDirection:'cursorHistory',fanCorners:{stepDegrees:90}}
  s.initialDirection=Math.PI;s.captureSourceSize=enabled
  return s
}
function author(s:DabSystem){
  return [...s.startStroke(0,0,.2,0,10,10,0,.1,5),...s.continueStroke(20,0,.5,10,0,10,1,.5,105),...s.continueStroke(40,0,.8,20,30,10,1,.9,205),...s.endStroke(10)]
}
describe('opt-in source request authoring',()=>{
  it('keeps initial raw direction and emits a real t0 fan before the first normal request',()=>{
    const dabs=author(system())
    expect(dabs[0].angle).toBe(Math.PI)
    expect(dabs[1]).toMatchObject({x:0,y:0,angle:Math.PI/2,t:5,pressure:.2,sourceSize:10,sourceScale:1})
    expect(dabs[2].x).toBeGreaterThan(0);expect(dabs[2].angle).toBe(0)
    expect(dabs[2].t).toBeGreaterThan(5);expect(dabs[2].t).toBeLessThan(105)
    expect(dabs.every(d=>d.sourceSize===10&&d.sourceScale===1)).toBe(true)
  })
  it('clones all fan/last-info/time state for prediction and peeks without changing the real continuation',()=>{
    const a=system(),b=system()
    for(const s of[a,b]){s.startStroke(0,0,.2,0,10,10,0,.1,5);s.continueStroke(20,0,.5,10,0,10,1,.5,105)}
    const before=structuredClone(a['_sourcePrevious'])
    a.peekTipDabs(10);a.peekTipDabs(10);a.peekEndSample(10)
    expect(a['_sourcePrevious']).toEqual(before)
    const fork=a.forkForPreview();fork.continueStroke(40,40,.8,20,30,10,1,.9,205)
    expect(a['_sourcePrevious']).toEqual(before)
    expect(a.continueStroke(40,0,.8,20,30,10,1,.9,205)).toEqual(b.continueStroke(40,0,.8,20,30,10,1,.9,205))
    expect(a.endStroke(10)).toEqual(b.endStroke(10))
  })
  it('does not make a second tap or a fan from endpoint metadata',()=>{
    const s=system();const first=s.startStroke(20,0,.2,0,0,10,0,0,5)
    expect(first).toHaveLength(1);expect(s.peekEndSample(10)?.angle).toBe(Math.PI)
    expect(s.endStroke(10)).toEqual([])
  })
  it('leaves fixed legacy angle, empty source channels and legacy batch-time placeholders unchanged',()=>{
    const dabs=author(system(false))
    expect(dabs.every(d=>d.angle===0&&d.t===0&&d.sourceSize===undefined)).toBe(true)
    expect(dabs.filter(d=>d.x===0)).toHaveLength(1)
  })
})
