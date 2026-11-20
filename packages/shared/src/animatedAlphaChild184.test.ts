import{it,expect}from'vitest'
import{isBrushLibrary,hasAnimatedAlphaChild184Scope}from'./brushes.js'
import{library184}from'./animatedAlphaChild184.testFixture.js'
it('all already-rendered mask modes admit the same closed independent frame inventory',()=>{
 for(const mode of['multiply','subtract','darken','hardMixSofterPhotoshop','hardMixPhotoshopAlpha']as const)for(const selector of['constant','incremental','pressure']as const){const l=library184(selector);l.brushes[0].descriptor.behavior!.dual!.blendMode=mode;expect(hasAnimatedAlphaChild184Scope(l.brushes[0].descriptor)).toBe(true);expect(isBrushLibrary(l)).toBe(true)}
})
it('forged selectors/nesting/RGB/geometry/versions/unequal physical inventory reject',()=>{
 for(const mutate of[(l:ReturnType<typeof library184>)=>{l.brushes[0].descriptor.version=183},(l:ReturnType<typeof library184>)=>{l.brushes[0].descriptor.behavior!.dual!.brush.tip.animation!.mode='random'},(l:ReturnType<typeof library184>)=>{l.brushes[0].descriptor.behavior!.dual!.brush.tip.animation!.mode='angular'},(l:ReturnType<typeof library184>)=>{l.brushes[0].descriptor.behavior!.erase=true},(l:ReturnType<typeof library184>)=>{l.brushes[0].descriptor.behavior!.dual!.sampling=undefined},(l:ReturnType<typeof library184>)=>{l.assets[1].size=1024},(l:ReturnType<typeof library184>)=>{l.assets[2].size=8}]){const l=library184();mutate(l);expect(isBrushLibrary(l)).toBe(false)}
 const p=library184('pressure');p.brushes[0].descriptor.behavior!.dual!.brush.tip.animation!.rank=2.5;expect(isBrushLibrary(p)).toBe(false)
})
