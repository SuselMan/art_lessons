import{it,expect}from'vitest'
import{isBrushBehavior,brushRequiresSourceTime,brushUsesDistanceControl,type BrushDescriptor,type BrushDynamic,type Dab}from'@grafetto/shared'
import{beginBrushBehavior,brushDynamicValue,behaviorStampsForDab}from'./brushBehavior'
import{DIGITAL_BRUSHES}from'./digitalBrushPresets'
const sensor:BrushDynamic={control:'distance',period:10,periodic:false,minimum:0,jitter:0}
const brush:BrushDescriptor={...DIGITAL_BRUSHES[0],scatter:undefined,behavior:{version:2,modulations:{opacity:[sensor]}}}
const point=(x:number,y:number):Dab=>({x,y,size:20,pressure:1,tiltX:0,tiltY:0,angle:0,aspectRatio:1,opacity:1,t:0})
it('evaluates the current world length consistently before and after stamp admission',()=>{
 const a=point(100,200),state=beginBrushBehavior(a)
 expect(brushDynamicValue(sensor,a,state,.4)).toBe(0)
 behaviorStampsForDab(brush,a,state,[0,0,0])
 const b=point(103,204)
 expect(brushDynamicValue(sensor,b,state,.4)).toBe(.5)
 behaviorStampsForDab(brush,b,state,[0,0,0])
 expect(brushDynamicValue(sensor,b,state,.4)).toBe(.5)
 expect(brushDynamicValue(sensor,point(109,212),state,.4)).toBe(1)
 expect(brushDynamicValue({...sensor,periodic:true},point(109,212),state,.4)).toBe(.5)
})
it('preserves phase through packet boundaries and scratch snapshots',()=>{
 const dabs=[point(50,50),point(53,54),point(56,58),point(59,62)]
 const run=(split:boolean)=>{let state=beginBrushBehavior(dabs[0]);return dabs.map((dab,i)=>{if(split&&i===2)state=structuredClone(state);return behaviorStampsForDab(brush,dab,state,[0,0,0])[0].opacityScale})}
 expect(run(false)).toEqual([0,.5,1,1]);expect(run(true)).toEqual(run(false))
})
it('is a geometry sensor without a clock or legacy allocation overhead',()=>{
 expect(brushUsesDistanceControl(brush)).toBe(true);expect(brushRequiresSourceTime(brush)).toBe(false)
 const plain={...brush,behavior:{version:2 as const}},state=beginBrushBehavior(point(0,0))
 behaviorStampsForDab(plain,point(0,0),state,[0,0,0])
 expect(state.worldDistancePoint).toBeUndefined()
 expect(isBrushBehavior(brush.behavior)).toBe(true)
 expect(isBrushBehavior({version:2,modulations:{flow:[{...sensor,period:0}]}})).toBe(false)
})
