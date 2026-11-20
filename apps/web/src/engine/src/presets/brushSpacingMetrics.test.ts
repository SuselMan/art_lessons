import { describe,expect,it } from 'vitest'
import type { BrushDescriptor,Dab } from '@grafetto/shared'
import { DIGITAL_BRUSHES } from './digitalBrushPresets'
import { beginBrushBehavior,brushSourceSpacingAxes,brushSpacingStep } from './brushBehavior'

const dab:Dab={x:0,y:0,size:48,pressure:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0}
const brush:BrushDescriptor={...DIGITAL_BRUSHES[0],tip:{...DIGITAL_BRUSHES[0].tip,aspect:1,angle:0,rotation:'fixed'},scatter:undefined,behavior:{version:2},sizeByPressure:[[0,1],[1,1]]}
describe('spacing characteristic bounds independent of padded bitmap geometry',()=>{
  it('uses narrow native width before fixed/auto laws and preserves legacy defaults',()=>{
    const fixed={mode:'diameter' as const,coefficient:.14,axisScale:{x:7/32,y:1}}
    const axes=brushSourceSpacingAxes(brush,dab,beginBrushBehavior(dab),fixed,1,0)
    expect(axes.x).toBeCloseTo(1.47,12);expect(axes.y).toBeCloseTo(6.72,12)
    expect(brushSpacingStep(axes,0)).toBeCloseTo(1.47,12)
    const old=brushSourceSpacingAxes(brush,dab,beginBrushBehavior(dab),{mode:'diameter',coefficient:.14},1,0)
    expect(old).toEqual({x:6.720000000000001,y:6.720000000000001,angle:0})
    const auto=brushSourceSpacingAxes(brush,dab,beginBrushBehavior(dab),{...fixed,mode:'kritaAuto',coefficient:.8},1,0)
    expect(auto.x).toBeCloseTo(.8*Math.sqrt(10.5),12)
    expect(auto.y).toBeCloseTo(.8*Math.sqrt(48),12)
  })
  it('removes static angle already baked in bounds while preserving dynamic direction',()=>{
    const rotated={...brush,tip:{...brush.tip,angle:-Math.PI/2},behavior:{version:2 as const,rotation:{follow:1,random:'none' as const}}}
    const profile={mode:'diameter' as const,coefficient:.14,axisScale:{x:1,y:7/32},angleOffset:Math.PI/2}
    const axes=brushSourceSpacingAxes(rotated,dab,beginBrushBehavior(dab),profile,1,0)
    expect(axes.angle).toBeCloseTo(0,12);expect(axes.x).toBeCloseTo(6.72,12);expect(axes.y).toBeCloseTo(1.47,12)
    const diagonal={...dab,angle:Math.PI/4}
    const moved=brushSourceSpacingAxes(rotated,diagonal,beginBrushBehavior(diagonal),profile,1,Math.PI/4)
    expect(moved.angle).toBeCloseTo(Math.PI/4,12)
    expect(brushSpacingStep(moved,Math.PI/4)).toBeCloseTo(6.72,12)
  })
  it('applies floor after the axis law and isotropic maximum after both axes',()=>{
    const profile={mode:'diameter' as const,coefficient:.14,axisScale:{x:7/32,y:1}}
    const small={...dab,size:1}
    expect(brushSourceSpacingAxes(brush,small,beginBrushBehavior(small),profile,1,0)).toEqual({x:.5,y:.5,angle:0})
    const isotropic=brushSourceSpacingAxes(brush,dab,beginBrushBehavior(dab),{...profile,isotropic:true},1,1)
    expect(isotropic).toEqual({x:6.720000000000001,y:6.720000000000001,angle:0})
  })
})
