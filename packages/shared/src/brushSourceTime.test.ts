import{it,expect}from'vitest'
import{isBrushBehavior}from'./brushBehavior'
import{brushRequiresSourceTime,brushRequiresRandomContext,type BrushDescriptor}from'./brushes'
const control={control:'random' as const,minimum:0,jitter:0,randomSource:{kind:'grafettoSourceTime-v1' as const,key:'behavior/size/0'}}
it('admits explicit keyed source-time random only on per-input random controls',()=>{
 expect(isBrushBehavior({version:2,modulations:{size:[control]}})).toBe(true)
 for(const bad of [{...control,control:'pressure'},{...control,control:'strokeRandom'},{...control,randomStream:1},{...control,randomSource:{...control.randomSource,key:''}},{...control,randomSource:{...control.randomSource,key:'x'.repeat(129)}}])expect(isBrushBehavior({version:2,modulations:{size:[bad]}})).toBe(false)
})
it('requires both recorded source time and captured random context for refresh controls',()=>{
 const b:BrushDescriptor={id:'imported-aaaaaaaaaaaaaaaa',version:81,model:'stamp',category:'line',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,modulations:{size:[control]}}}
 expect(brushRequiresSourceTime(b)).toBe(true);expect(brushRequiresRandomContext(b)).toBe(true)
 delete b.behavior!.modulations
 expect(brushRequiresSourceTime(b)).toBe(false);expect(brushRequiresRandomContext(b)).toBe(false)
})

it('admits refresh Rate using explicit source-time random and rejects old per-query random',()=>{
 const timing={version:1,rate:20,ignoreDistanceSpacing:false,rateDynamics:[control]}
 expect(isBrushBehavior({version:2,timing})).toBe(true)
 expect(isBrushBehavior({version:2,timing:{...timing,rateDynamics:[{control:'random',minimum:0,jitter:0}]}})).toBe(false)
})
