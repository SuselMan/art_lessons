import { describe, expect, it } from 'vitest'
import { DabSystem } from './DabSystem'
import { codecDab } from './codecDab'
import { PENCIL_DAB_SHAPING } from '../presets/dabShaping'
import { packDabs, unpackDabs } from '@grafetto/shared'
function system(capture=true,scale=(p:number)=>.485944+(1-.485944)*p):DabSystem {
  const s=new DabSystem({spacingFactor:.1,shaping:{...PENCIL_DAB_SHAPING,size:scale,aspect:()=>1,pressureSmoothingPx:0,tiltSmoothingPx:0}})
  s.captureSourceSize=capture
  return s
}
describe('canonical source request capture',()=>{
  it('records constructor extent and sensor response independently of continuous rendered size',()=>{
    const s=system()
    const d=s.startStroke(0,20,0,0,0,2.3)[0]
    expect(d.sourceSize).toBe(2)
    expect(d.sourceScale).toBe(Math.fround(.485944))
    expect(d.size).toBeCloseTo(2.3*.485944)
    const decoded=unpackDabs(packDabs([d]))[0]
    expect(decoded).toEqual(codecDab(d))
    const zero=system(true,()=>0).startStroke(0,20,1,0,0,24)[0]
    expect(zero.sourceSize).toBe(24)
    expect(zero.sourceScale).toBe(0)
  })
  it('quantizes before F32 and retains tiny allocation without widening coverage',()=>{
    const d=system().startStroke(0,20,1,0,0,24-1e-7)[0]
    expect(Math.fround(d.size)).toBe(24)
    expect(d.sourceSize).toBe(23)
    const tiny=system().startStroke(0,20,1,0,0,.5)[0]
    expect(tiny.sourceSize).toBe(1)
    expect(tiny.size).toBe(.5)
  })
  it('copies capture policy into prediction and preserves source fields at the final input',()=>{
    const s=system();s.startStroke(0,20,.5,0,0,24)
    s.continueStroke(30,20,.5,0,0,24)
    const preview=s.forkForPreview().continueStroke(60,20,.5,0,0,2.3)
    expect(preview.length).toBeGreaterThan(0)
    expect(preview.every(d=>d.sourceSize===2)).toBe(true)
    const end=s.peekEndSample(24)!
    expect(end.sourceSize).toBe(24)
    expect(end.sourceScale).toBe(Math.fround(.742972))
    const real=s.continueStroke(60,20,.5,0,0,24)
    expect(real.every(d=>d.sourceSize===24)).toBe(true)
  })
  it('records the disabled pressure response and leaves historical dabs without new fields',()=>{
    const off=system(true,()=>1).startStroke(0,20,0,0,0,24)[0]
    expect(off.sourceScale).toBe(1)
    const old=system(false).startStroke(0,20,0,0,0,24)[0]
    expect(old).not.toHaveProperty('sourceSize')
    expect(old).not.toHaveProperty('sourceScale')
    expect(packDabs([old]).startsWith('1:')).toBe(true)
  })
})
