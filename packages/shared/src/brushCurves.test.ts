import { describe, expect, it } from 'vitest'
import { evaluateBrushCurve, isBrushCurve, type UniformBrushCurve } from './brushCurves.js'
import { isBrushBehavior } from './brushBehavior.js'

// Independent three-knot natural-spline equation, not an evaluator implementation.
function basic5(x: number): number {
  const knots = [[0,0],[.35,.1],[1,1]]
  const i = x <= .35 ? 0 : 1
  const h = knots[i+1][0] - knots[i][0]
  const a = (knots[i+1][0] - x) / h, b = (x - knots[i][0]) / h
  const middleSecondDerivative = 3 * ((.9/.65) - (.1/.35))
  const left = i === 0 ? 0 : middleSecondDerivative
  const right = i === 0 ? middleSecondDerivative : 0
  return Math.max(0,Math.min(1,a*knots[i][1]+b*knots[i+1][1]+((a**3-a)*left+(b**3-b)*right)*h*h/6))
}
const table: UniformBrushCurve = { kind:'uniform', samples:Array.from({length:256},(_,i)=>basic5(i/255)), endpointEpsilon:1e-6, preserveInputSign:true }

describe('serializable brush transfer curves', () => {
  it('matches the native Basic5 size witness after256-sample interpolation', () => {
    expect(evaluateBrushCurve(table,.5)*40).toBeCloseTo(9.391572849118763,12)
    expect(evaluateBrushCurve(table,.175)*40).toBeCloseTo(.9905032192985442,12)
    expect(evaluateBrushCurve([[0,0],[.35,.1],[1,1]],.5)*40).toBeCloseTo(12.307692307692308,12)
  })
  it('retains sparse endpoint, step and interpolation behavior', () => {
    expect(evaluateBrushCurve([[.2,.3],[.8,.9]],0)).toBe(.3)
    expect(evaluateBrushCurve([[.2,.3],[.8,.9]],1)).toBe(.9)
    expect(evaluateBrushCurve([[0,0],[.5,.2],[.5,.8],[1,1]],.5)).toBe(.2)
    expect(evaluateBrushCurve([[0,0],[1,1]],.25)).toBe(.25)
  })
  it('uses sample snapping, clamped indices and explicit sign handling', () => {
    const curve:UniformBrushCurve={kind:'uniform',samples:[.2,.8],endpointEpsilon:1e-6,preserveInputSign:true}
    expect(evaluateBrushCurve(curve,.0000005)).toBe(.2)
    expect(evaluateBrushCurve(curve,.9999995)).toBe(.8)
    expect(evaluateBrushCurve(curve,-.5)).toBe(-.2)
    expect(evaluateBrushCurve(curve,-0)).toBe(-.2)
    expect(Object.is(evaluateBrushCurve({...curve,samples:[0,1]},-0),-0)).toBe(true)
    expect(evaluateBrushCurve(curve,2)).toBe(.8)
    expect(evaluateBrushCurve({...curve,preserveInputSign:false},-.5)).toBe(.2)
  })
  it('bounds tables, values and optional fields before recursive dynamics', () => {
    expect(isBrushCurve(table)).toBe(true)
    expect(isBrushBehavior({version:2,modulations:{size:[{control:'pressure',minimum:0,jitter:0,curve:table}]}})).toBe(true)
    for (const bad of [ {...table,samples:[1]}, {...table,samples:Array(257).fill(0)}, {...table,samples:[0,NaN]}, {...table,samples:[0,3]}, {...table,endpointEpsilon:1}, {...table,extra:true} ]) expect(isBrushCurve(bad)).toBe(false)
    expect(isBrushCurve({kind:'uniform',samples:[0,8]},8)).toBe(true)
    expect(isBrushCurve({kind:'uniform',samples:[0,8]},2)).toBe(false)
  })
})
