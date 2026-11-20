import{describe,it,expect}from'vitest'
import{isCloneDescriptor}from'./brushClone'
import{copyBrushSourceContext,brushSourceKey,isBrushSourceContext}from'./brushSource'
describe('Clone gesture sources',()=>{
 it('owns the source independently of later picker changes and binds offsets to integrity',()=>{
  const clone={x:100,y:-20,offsetX:40,offsetY:-60},a=copyBrushSourceContext({version:1,clone}),key=brushSourceKey(a)
  clone.offsetX=50
  expect(a.clone?.offsetX).toBe(40)
  expect(brushSourceKey({version:1,clone})).not.toBe(key)
  expect(Object.isFrozen(a.clone)).toBe(true)
 })
 it('rejects incomplete, nonfinite and unbounded sources',()=>{
  for(const clone of [{x:1,y:2},{x:1,y:2,offsetX:NaN,offsetY:0},{x:1e8,y:2,offsetX:0,offsetY:0},{x:1,y:2,offsetX:0,offsetY:0,extra:1}])expect(isBrushSourceContext({version:1,clone})).toBe(false)
  expect(isBrushSourceContext({version:1,clone:{x:0,y:0,offsetX:0,offsetY:0}})).toBe(true)
 })
 it('requires a plain mask preset and rejects mixed paint engines',()=>{
  const d={clone:{version:1,moveSourcePoint:true},model:'stamp',paperInteraction:0,behavior:{version:2,rendering:{accumulation:'directOver',blendMode:'normal',wetEdges:0,burntEdges:0}}}
  expect(isCloneDescriptor(d)).toBe(true)
  expect(isCloneDescriptor({...d,filter:{version:1}})).toBe(false)
  expect(isCloneDescriptor({...d,clone:{version:1,moveSourcePoint:true,healing:true}})).toBe(false)
 })
})
