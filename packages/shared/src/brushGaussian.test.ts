import { expect,it } from 'vitest'
import { isBrushLibrary,type BrushLibrary,type BrushDescriptor } from './brushes.js'
function fixture():BrushLibrary {
 return {schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored Gaussian',source:'qa',warnings:[],descriptor:{
 id:'imported-1234567890abcdef',version:25,model:'stamp',category:'paint',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'gaussian',fade:1e-6,antialias:true}},
 behavior:{version:2},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],
 }}]}
}
it('accepts opt-in scalar parameters and a recursively validated independent child',()=>{
 const library=fixture();expect(isBrushLibrary(library)).toBe(true)
 library.brushes[0].descriptor.tip.profile!.antialias=false
 expect(isBrushLibrary(library)).toBe(true)
 const child=structuredClone(library.brushes[0].descriptor)
 library.brushes[0].descriptor.behavior={version:2,dual:{brush:child,blendMode:'multiply',sampling:'independent'}}
 expect(isBrushLibrary(library)).toBe(true)
 Object.assign(child.tip.profile!,{fade:0});expect(isBrushLibrary(library)).toBe(false)
})
it('rejects malformed profiles and unsupported wet/bitmap/aspect combinations',()=>{
 const mutations:((d:BrushDescriptor)=>void)[]=[
 d=>Object.assign(d.tip.profile!,{fade:0}),d=>Object.assign(d.tip.profile!,{fade:1}),d=>Object.assign(d.tip.profile!,{fade:NaN}),
 d=>Object.assign(d.tip.profile!,{antialias:1}),d=>Object.assign(d.tip.profile!,{unknown:true}),
 d=>Object.assign(d.tip,{kind:'bitmap'}),d=>d.tip.aspect=2,d=>d.model='mixer',
 d=>d.behavior={version:2,edgeBleed:{pressure:1,tilt:0}},
 ]
 for(const mutate of mutations){const library=fixture();mutate(library.brushes[0].descriptor);expect(isBrushLibrary(library)).toBe(false)}
})
