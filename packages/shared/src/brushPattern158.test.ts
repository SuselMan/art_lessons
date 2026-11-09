import{it,expect}from'vitest'
import{isBrushLibrary,hasExperimentCurrentPattern158Scope}from'./brushes.js'
import{isBrushPattern,copyBrushPattern,brushPatternAssetIds}from'./brushPattern.js'
import{copyBrushSourceContext,createBrushSourceNonce,hasValidBrushSourceContext,brushSourceKey}from'./brushSource.js'
import{library158,pattern158}from'./experimentPattern158.testFixture.js'
it('whole library admits only versioned root Experiment requirement, old foreground50 unchanged',()=>{
 expect(isBrushLibrary(library158())).toBe(true)
 for(const mutate of[(b:ReturnType<typeof library158>)=>b.brushes[0].descriptor.version=157,(b:ReturnType<typeof library158>)=>b.brushes[0].descriptor.model='mixer',(b:ReturnType<typeof library158>)=>b.brushes[0].descriptor.behavior!.erase=true]){const l=library158();mutate(l);expect(isBrushLibrary(l)).toBe(false)}
 const old=library158();old.brushes[0].descriptor.version=50;delete old.brushes[0].descriptor.experiment!.fill;delete old.brushes[0].descriptor.experiment!.patternPolicy;expect(isBrushLibrary(old)).toBe(true);expect(hasExperimentCurrentPattern158Scope(old.brushes[0].descriptor)).toBe(false)
})
it('full non-square immutable metadata binds exact period/CAS and explicit none, no receiver fallback',()=>{
 const pattern=pattern158();expect(isBrushPattern(pattern)).toBe(true);expect(brushPatternAssetIds(pattern)).toHaveLength(4)
 const source=copyBrushSourceContext({version:1,pattern}),strokeId=createBrushSourceNonce('ownPattern158',source)
 expect(hasValidBrushSourceContext({tool:'digitalBrush',strokeId,brushSource:source})).toBe(true)
 const altered=pattern158();if(altered.kind==='rgba')Reflect.set(altered.sourceRect,'width',4)
 expect(isBrushPattern(altered)).toBe(true)
 expect(hasValidBrushSourceContext({tool:'digitalBrush',strokeId,brushSource:{version:1,pattern:altered}})).toBe(false)
 expect(brushSourceKey(source)).not.toBe(brushSourceKey({version:1,pattern:{version:1,kind:'none'}}))
 const frozen=copyBrushPattern(pattern);expect(Object.isFrozen(frozen)).toBe(true);if(frozen.kind==='rgba'){expect(Object.isFrozen(frozen.planes)).toBe(true);expect(Object.isFrozen(frozen.sourceRect)).toBe(true)}
 for(const malformed of[{version:1,kind:'none',extra:true},{...pattern,side:3},{...pattern,sampling:'receiver-current'},{...pattern,sourceRect:{x:1,y:1,width:3,height:2}},{...pattern,planes:[]}])expect(isBrushPattern(malformed)).toBe(false)
})
