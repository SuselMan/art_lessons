import { expect, it } from 'vitest'
import { radialCurveAlpha, radialCurveTextureSide } from './radialCurve'
import { createBrushStampFragment } from './brushBehaviorShaders'
import { wetTransferFragment } from './wetMixShaders'

function identity(resolution: number) {
  const side=2 ** Math.ceil(Math.log2(Math.max(4,Math.sqrt((resolution+2)*4))))
  const bytes=new Uint8Array(side*side), view=new DataView(bytes.buffer)
  for(let i=0;i<resolution+2;i++)view.setUint32(i*4,Math.round(i/(resolution+1)*4294967295),false)
  return bytes
}
it('keeps authored lookup coordinates independent of placed size and uses transparency truncation',()=>{
  const bytes=identity(4)
  expect(radialCurveTextureSide(bytes,4)).toBe(4)
  expect([0,.25,.5,.75,1].map(q=>radialCurveAlpha(q,bytes,4))).toEqual([0,51,102,153,205])
  expect(radialCurveAlpha(1.01,bytes,4)).toBe(0)
  expect(radialCurveAlpha(NaN,bytes,4)).toBe(0)
  expect(()=>radialCurveTextureSide(new Uint8Array(16),4)).toThrow()
})
it('isolates lookup samplers from every historical compiler input',()=>{
  for(const factory of [createBrushStampFragment,wetTransferFragment]){
    for(const args of [[false,false],[true,false],[true,true]] as const)expect(factory(...args)).not.toContain('brushCurveValue')
    const shader=factory(true,true,true)
    expect(shader).toContain('float brushCurveValue(')
    expect(shader).toMatch(/u_tipProcedural,(u_angle,)?u_tip/)
    expect(shader).toMatch(/u_dualProcedural,(u_dualProceduralAngle,)?u_dual/)
    expect(shader).not.toContain('${')
  }
})
