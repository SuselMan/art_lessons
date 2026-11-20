import{it,expect}from'vitest'
import{isBrushLibrary,isIndependentDrawingAnglePair}from'./brushes.js'
import{hasIndependentChildAbsoluteSize187Scope}from'./childAbsoluteSize187.js'
import{childSize187Library}from'./childAbsoluteSize187.testFixture.js'
it('187 whole library admits only its real independent static child Size carrier',()=>{const l=childSize187Library(),d=l.brushes[0].descriptor;expect(hasIndependentChildAbsoluteSize187Scope(d)).toBe(true);expect(isIndependentDrawingAnglePair(d)).toBe(true);expect(isBrushLibrary(l)).toBe(true)})
it('new revision rejects locked/fan/other target/RNG/inline/foreign parent before any renderer',()=>{
 const mutations=[(l:ReturnType<typeof childSize187Library>)=>{l.brushes[0].descriptor.version=120},(l:ReturnType<typeof childSize187Library>)=>{l.brushes[0].descriptor.behavior!.dual!.brush.version=120},(l:ReturnType<typeof childSize187Library>)=>{l.brushes[0].descriptor.behavior!.dual!.sampling='inline'},(l:ReturnType<typeof childSize187Library>)=>{l.brushes[0].descriptor.behavior!.dual!.brush.behavior!.modulations!.size![0].combine!.absolute!.locked=true},(l:ReturnType<typeof childSize187Library>)=>{l.brushes[0].descriptor.behavior!.strokeInput!.fanCorners={stepDegrees:30}},(l:ReturnType<typeof childSize187Library>)=>{delete l.brushes[0].descriptor.behavior!.dual!.brush.behavior!.strokeInput},(l:ReturnType<typeof childSize187Library>)=>{l.brushes[0].descriptor.behavior!.dual!.brush.behavior!.modulations!.size![0].combine!.scaling[0].control='random'},(l:ReturnType<typeof childSize187Library>)=>{Reflect.set(l.brushes[0].descriptor.behavior!.dual!.brush.behavior!.modulations!.size![0],'control',['off'])},(l:ReturnType<typeof childSize187Library>)=>{l.brushes[0].descriptor.behavior!.dual!.brush.behavior!.modulations!.size![0].combine!.absolute!.curve=[[0,0],[.5,.5],[1,1]]}]
 for(const mutate of mutations){const l=childSize187Library();mutate(l);expect(isBrushLibrary(l)).toBe(false);expect(isIndependentDrawingAnglePair(l.brushes[0].descriptor)).toBe(false)}
})
it('old120 complete record remains valid without new fields or promotion',()=>{const l=childSize187Library(),d=l.brushes[0].descriptor;d.version=120;const child=d.behavior!.dual!.brush;child.version=120;delete child.behavior!.modulations;const before=JSON.stringify(l);expect(isBrushLibrary(l)).toBe(true);expect(isIndependentDrawingAnglePair(d)).toBe(true);expect(JSON.stringify(l)).toBe(before)})

it('187 rejects outer sensor sources and unknown control metadata before generic evaluation',()=>{
 for(const patch of[{randomSource:'stroke'},{jitter:.1},{control:'random'},{control:'time'},{minimum:.1},{unexpected:true}]){const l=childSize187Library(),d=l.brushes[0].descriptor;Object.assign(d.behavior!.dual!.brush.behavior!.modulations!.size![0],patch);expect(hasIndependentChildAbsoluteSize187Scope(d)).toBe(false);expect(isBrushLibrary(l)).toBe(false)}
})

it('an orphan child187 cannot enter as a standalone root',()=>{const l=childSize187Library();l.brushes[0].descriptor=l.brushes[0].descriptor.behavior!.dual!.brush;expect(isBrushLibrary(l)).toBe(false)})
