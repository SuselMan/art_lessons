import { expect,it } from 'vitest'
import type { Dab,BrushDescriptor } from '@grafetto/shared'
import { digitalBrushFromPreset } from './digitalBrushPresets'
import { secondaryBrushDabs,brushDynamicValue,beginBrushBehavior,type SecondarySamplingState } from './brushBehavior'
const base={...digitalBrushFromPreset('hard-round'),scatter:undefined,tip:{kind:'round' as const,hardness:1,aspect:1,angle:0,rotation:'fixed' as const},sizeByPressure:[[0,1],[1,1]] as [number,number][]}
const primary:BrushDescriptor={...base,behavior:{version:2}}
const child:BrushDescriptor={...base,spacing:1,behavior:{version:2,spacing:{mode:'diameter',coefficient:1}}}
const sample=(x:number,pressure=1):Dab=>({x,y:4,pressure,size:1,aspectRatio:1,angle:0,tiltX:0,tiltY:0,opacity:1,t:x})
it('extends only the independent child to9.5 when primary ends9 and input ends10',()=>{
 const state:SecondarySamplingState={remaining:0}
 secondaryBrushDabs(primary,child,[sample(8.5),sample(9)],state)
 const tail=secondaryBrushDabs(primary,child,[],state,true,{...sample(10),baseSize:1})
 expect(tail.map(d=>d.x)).toEqual([9.5])
 expect(state.remaining).toBeCloseTo(.5)
 expect(secondaryBrushDabs(primary,child,[],state,true,{...sample(10),baseSize:1})).toEqual([])
})
it('preserves old no-endpoint semantics and does not manufacture an endpoint stamp',()=>{
 const state:SecondarySamplingState={remaining:0}
 secondaryBrushDabs(primary,child,[sample(8.5),sample(9)],state)
 expect(secondaryBrushDabs(primary,child,[],state)).toEqual([])
 expect(secondaryBrushDabs(primary,child,[],state,true,{...sample(9.4),baseSize:1})).toEqual([])
})
it('retains nominal endpoint size when pressure reduces the primary to zero',()=>{
 const state:SecondarySamplingState={remaining:0}
 secondaryBrushDabs(primary,child,[sample(8.5),sample(9)],state)
 const tail=secondaryBrushDabs({...primary,sizeByPressure:[[0,0],[1,1]]},child,[],state,true,{...sample(10,0),size:0,baseSize:1})
 expect(tail).toHaveLength(1);expect(tail[0].size).toBe(1)
})
it('uses the logged constant gesture size even if the previous primary also had zero size',()=>{
 const state:SecondarySamplingState={remaining:.5,previous:{...sample(9,0),size:0}}
 const tail=secondaryBrushDabs({...primary,sizeByPressure:[[0,0],[1,1]]},child,[],state,true,{...sample(10,0),size:0,baseSize:1})
 expect(tail).toHaveLength(1);expect(tail[0].size).toBe(1)
})

it('interpolates independent child sourceTime in F64 with its own period',()=>{
 const state:SecondarySamplingState={remaining:0}
 const start={...sample(0),sourceTime:1469.99998},end={...sample(2),sourceTime:1470}
 const timedChild:BrushDescriptor={...child,behavior:{...child.behavior!,modulations:{size:[{control:'time',period:6340,periodic:true,minimum:0,jitter:0}]}}}
 const points=secondaryBrushDabs(primary,timedChild,[start,end],state)
 expect(points.length).toBeGreaterThan(1)
 const interpolated=points[1]
 expect(interpolated.sourceTime).toBeGreaterThan(start.sourceTime)
 expect(interpolated.sourceTime).toBeLessThan(end.sourceTime)
 expect(interpolated.sourceTime).not.toBe(Math.fround(interpolated.sourceTime!))
 expect(brushDynamicValue({control:'time',period:6340,periodic:true,minimum:0,jitter:0},interpolated,beginBrushBehavior(interpolated),0)).toBe(interpolated.sourceTime!/6340)
})
