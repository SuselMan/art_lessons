import { describe, expect, it } from 'vitest'
import { isBrushBehavior } from './brushBehavior.js'

describe('source spacing metric contract',()=>{
  const profile={mode:'diameter',coefficient:.14,axisScale:{x:7/32,y:1},angleOffset:Math.PI/2}
  it('accepts independent characteristic bounds including rotated square extents',()=>{
    expect(isBrushBehavior({version:2,spacing:profile})).toBe(true)
    expect(isBrushBehavior({version:2,spacing:{...profile,axisScale:{x:Math.SQRT2,y:Math.SQRT2},angleOffset:-Math.PI}})).toBe(true)
    expect(isBrushBehavior({version:2,spacing:{mode:'diameter',coefficient:.14}})).toBe(true)
  })
  it('fails closed for zero, unbounded, nonfinite or malformed metric fields',()=>{
    for(const axisScale of [{x:0,y:1},{x:-1,y:1},{x:2.01,y:1},{x:NaN,y:1},{x:1,y:Infinity},{x:true,y:1},{x:1},{x:1,y:1,z:0}])
      expect(isBrushBehavior({version:2,spacing:{...profile,axisScale}})).toBe(false)
    for(const angleOffset of [true,NaN,Infinity,Math.PI+.001,-Math.PI-.001])
      expect(isBrushBehavior({version:2,spacing:{...profile,angleOffset}})).toBe(false)
  })
})
