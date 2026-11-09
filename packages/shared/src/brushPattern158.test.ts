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

it('persisted JSONB key order preserves actual A279 source identity on cold admission',()=>{
 const source={"pattern":{"alpha":"asset:c6905194745da7b819695f99f40e330a1597d0537eae16efbb1565c393237d1c","kind":"rgba","planes":["asset:6c60dcd7ac529880217ae28e47539cee71d8707915757947e05c8ede16a366cc","asset:6402cd6f87b9881f0ad3781e9761ffb0325cc56f6d06551ca61419b5077cb236","asset:8b7bf44cc43f24ce5085c991375a9ab6ec6f0437999b4cc41bb444e0eeff0885"],"sampling":"world-repeat-nearest-v1","side":4,"sourceRect":{"height":2,"width":3,"x":0,"y":1},"version":1},"version":1} as Parameters<typeof copyBrushSourceContext>[0]
 const strokeId="br1.bs1_fd1a3e6d9b6a24a1_SG9OKhjyez.b717e377.2a487347"
 const wire=JSON.parse(JSON.stringify({tool:'digitalBrush',strokeId,brushSource:source}))
 expect(brushSourceKey(wire.brushSource)).toBe('fd1a3e6d9b6a24a1')
 expect(hasValidBrushSourceContext(wire)).toBe(true)
 const owned=copyBrushSourceContext(source);expect(Object.isFrozen(owned.pattern)).toBe(true)
 const changed=JSON.parse(JSON.stringify(wire));changed.brushSource.pattern.planes[0]='asset:'+ 'f'.repeat(64);expect(hasValidBrushSourceContext(changed)).toBe(false)
 const rect=JSON.parse(JSON.stringify(wire));rect.brushSource.pattern.sourceRect.width=4;expect(hasValidBrushSourceContext(rect)).toBe(false)
 if(source.pattern?.kind==='rgba')Reflect.set(source.pattern.sourceRect,'width',4)
 expect(brushSourceKey(owned)).toBe('fd1a3e6d9b6a24a1')
})
