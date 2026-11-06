import{it,expect}from'vitest'
import{isBrushBehavior,brushRequiresRandomContext,brushRequiresSourceTime,type BrushDynamic,type BrushDescriptor,type Dab}from'@grafetto/shared'
import{beginBrushBehavior,brushDynamicValue}from'./brushBehavior'
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
})
