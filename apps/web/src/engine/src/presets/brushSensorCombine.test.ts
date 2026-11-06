import{it,expect}from'vitest'
import{isBrushBehavior,brushRequiresRandomContext,brushRequiresSourceTime,type BrushDynamic,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{beginBrushBehavior,brushDynamicValue,brushRotationOffset}from'./brushBehavior'
import{digitalBrushFromPreset,digitalBrushPreset,DIGITAL_BRUSHES}from'./digitalBrushPresets'
import{installBrushLibrary}from'./importedBrushes'
const dab:Dab={x:5,y:10,size:20,pressure:.8,tiltX:0,tiltY:0,angle:0,aspectRatio:1,opacity:1,t:0,sourceTime:250}
const constant=(value:number):BrushDynamic=>({control:'off',minimum:0,jitter:0,curve:[[0,value],[1,value]]})
const combined=(mode:NonNullable<BrushDynamic['combine']>['mode'],scaling:BrushDynamic[],additive:BrushDynamic[]=[]):BrushDynamic=>({control:'off',minimum:0,jitter:0,combine:{mode,scaling,additive}})
const evaluate=(d:BrushDynamic)=>brushDynamicValue(d,dab,beginBrushBehavior(dab),.4)
it('combines scaling before the final size-like clamp',()=>{
 const values=[constant(.2),constant(.8)]
 for(const[mode,expected]of [['product',.16],['sum',1],['max',.8],['min',.2],['difference',.6]]as const)expect(evaluate(combined(mode,values))).toBeCloseTo(expected,12)
 // Clamping the sum before multiplying by additive would incorrectly yield .5.
 expect(evaluate(combined('sum',[constant(.8),constant(.7)],[constant(.5)]))).toBeCloseTo(.75,12)
 expect(evaluate(combined('difference',[constant(.8)]))).toBe(.8)
 const scaled=combined('sum',[constant(.8),constant(.7)])
 scaled.combine!.constant=.5
 expect(.5*evaluate(scaled)).toBeCloseTo(.75,12)
 scaled.combine!.constant=0
 expect(evaluate(scaled)).toBe(0)
})
it('sums additive sensors in signed space, with absence neutral',()=>{
 expect(evaluate(combined('product',[],[constant(.75),constant(.75)]))).toBe(1)
 expect(evaluate(combined('product',[constant(.4)],[constant(.25),constant(.25)]))).toBe(0)
 expect(evaluate(combined('product',[constant(.4)],[]))).toBeCloseTo(.4,12)
})
it('keeps rotation scaling unbounded before converting to signed angle',()=>{
 const state=beginBrushBehavior(dab),profile={strength:.5,additive:[constant(.75)],scaling:[constant(.8),constant(.7)]}
 // sum1.5 -> signed2; additive.5; angle = pi*(-1 + .5*(.5-2)).
 expect(brushRotationOffset({...profile,scalingMode:'sum'},dab,state)).toBeCloseTo(-1.75*Math.PI,12)
 for(const[mode,value]of [['max',.8],['min',.7],['difference',.1],['product',.56]]as const){
  expect(brushRotationOffset({...profile,scalingMode:mode},dab,state)).toBeCloseTo(Math.PI*(-1+.5*(.5-(2*value-1))),12)
 }
 expect(isBrushBehavior({version:2,rotation:{follow:0,random:'none',composition:{...profile,scalingMode:'sum'}}})).toBe(true)
})
it('curves absolute direction, locks its initial angle, and keeps offset separate from strength',()=>{
 const state=beginBrushBehavior({...dab,angle:.3}),profile={strength:.5,additive:[],absolute:{locked:false,angleOffset:90,curve:[[0,0],[1,1]]as [number,number][]}}
 const next={...dab,sourceAngle:1.2}
 const angle=brushRotationOffset(profile,next,state)
 expect(Math.cos(angle)).toBeCloseTo(Math.cos(1.2+Math.PI/2),12)
 profile.absolute.locked=true
 const locked=brushRotationOffset(profile,next,state)
 expect(Math.cos(locked)).toBeCloseTo(Math.cos(.3+Math.PI/2),12)
 expect(Math.sin(locked)).toBeCloseTo(Math.sin(.3+Math.PI/2),12)
 profile.absolute.curve=[[0,.2],[1,.2]]
 expect(brushRotationOffset(profile,next,state)).toBeCloseTo(.4*Math.PI,12)
})
it('retains absolute angle as an offset for size-like controls',()=>{
 const c=combined('product',[])
 c.combine!.absolute={locked:false,angleOffset:0,curve:[[0,0],[1,1]]}
 expect(evaluate(c)).toBe(.5)
 expect(brushDynamicValue(c,{...dab,sourceAngle:Math.PI/2},beginBrushBehavior(dab),.4)).toBe(.75)
 c.combine!.absolute.locked=true
 const state=beginBrushBehavior({...dab,angle:Math.PI/4})
 expect(brushDynamicValue(c,{...dab,sourceAngle:Math.PI},state,.4)).toBeCloseTo(.625,12)
 expect(isBrushBehavior({version:2,modulations:{size:[c]}})).toBe(true)
})
it('validates bounded, flat expressions and rejects hidden timer randomness',()=>{
 const c=combined('max',[constant(.2),constant(.5)])
 expect(isBrushBehavior({version:2,modulations:{size:[c]}})).toBe(true)
 for(const invalid of [combined('max',[]),combined('max',[c]),combined('max',Array(17).fill(constant(.5))),{...c,curve:[[0,0],[1,1]]}])expect(isBrushBehavior({version:2,modulations:{size:[invalid]}})).toBe(false)
 expect(isBrushBehavior({version:2,timing:{version:1,rate:10,ignoreDistanceSpacing:false,rateDynamics:[c]}})).toBe(false)
})
it('discovers nested canonical time and keyed random sources',()=>{
 const c=combined('max',[{control:'time',period:1000,periodic:false,minimum:0,jitter:0}],[{control:'strokeRandom',randomSource:{kind:'qt5Taus88',key:'SizeFuzzyStroke'},minimum:0,jitter:0}])
 const brush:BrushDescriptor={...DIGITAL_BRUSHES[0],behavior:{version:2,modulations:{size:[c]}}}
 expect(brushRequiresSourceTime(brush)).toBe(true);expect(brushRequiresRandomContext(brush)).toBe(true)
 const state=beginBrushBehavior(dab,{brushRandom:{version:1,strokeSeed:123,sequentialSeed:456}})
 expect(brushDynamicValue(c,dab,state,.5)).toBe(brushDynamicValue(c,dab,beginBrushBehavior(dab,{brushRandom:{version:1,strokeSeed:123,sequentialSeed:456}}),.5))
 expect(()=>brushDynamicValue(c,{...dab,sourceTime:undefined},state,.5)).toThrow('sourceTime')
})
it('preserves user pressure switches in author spacing and replay resolution',()=>{
 const c=combined('min',[{control:'pressure',minimum:0,jitter:0},constant(.6)])
 const descriptor:BrushDescriptor={...DIGITAL_BRUSHES[0],id:'imported-0123456789abcdef',version:57,behavior:{version:2,modulations:{size:[c],opacity:[c]}}}
 installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{descriptor,name:'Combined pressure QA',source:'self-authored',warnings:[]}]})
 const active=digitalBrushFromPreset(digitalBrushPreset(descriptor.id,57)),fixed=digitalBrushFromPreset(digitalBrushPreset(descriptor.id,57,{size:false,opacity:false}))
 expect(evaluate(active.behavior!.modulations!.size![0])).toBeCloseTo(.6,12)
 const low={...dab,pressure:.1}
 expect(brushDynamicValue(active.behavior!.modulations!.size![0],low,beginBrushBehavior(low),.4)).toBeCloseTo(.1,12)
 expect(brushDynamicValue(fixed.behavior!.modulations!.size![0],low,beginBrushBehavior(low),.4)).toBeCloseTo(.6,12)
 expect(fixed).toBe(digitalBrushFromPreset(digitalBrushPreset(descriptor.id,57,{size:false,opacity:false})))
 expect(active.behavior!.modulations!.size![0].combine!.scaling[0].control).toBe('pressure')
 const scaled=combined('sum',[{control:'pressure',minimum:0,jitter:0},constant(.6)])
 scaled.combine!.constant=.5
 const second={...descriptor,id:'imported-fedcba9876543210',behavior:{version:2 as const,modulations:{size:[scaled]}}}
 installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{descriptor:second,name:'Scaled compound QA',source:'self-authored',warnings:[]}]})
 const resolved=digitalBrushFromPreset(digitalBrushPreset(second.id,57,{size:false}))
 // Fixed size already bypasses the canonical .5 SizeValue curve; do not
 // retain its inverse compensation and grow the tip to twice the slider.
 expect(brushDynamicValue(resolved.behavior!.modulations!.size![0],low,beginBrushBehavior(low),.4)).toBe(1)
})
