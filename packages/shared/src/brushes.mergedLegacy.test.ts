import {expect,it} from 'vitest'
import {isBrushLibrary,type BrushLibrary} from './brushes'
function fixture(mode:'grainMerge'|'grainExtract'|'negation'|'multiply'|'screen',legacy=false){
 const data:BrushLibrary={schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored Smudge',source:'kpp',warnings:[],descriptor:{id:'imported-aaaaaaaaaaaaaaaa',version:legacy?83:82,model:'mixer',category:'wet',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},mixer:{load:0,initialLoad:0,pickup:.6,strength:1,source:'previousCanvas',...(legacy?{}:{algorithm:'krita-mask' as const})}}}]}
 // Tests compile against actual shared only after manager applies the union.
 Object.assign(data.brushes[0].descriptor.mixer!,{colorRateComposite:mode})
 return data
}
it.each(['multiply','screen']as const)('bounds legacy merged %s to85 and retains83 previous layer',(mode)=>{
 const data=fixture(mode,true),d=data.brushes[0].descriptor
 d.mixer!.source='projectionCanvas'
 for(const version of [83,84]){d.version=version;expect(isBrushLibrary(data)).toBe(false)}
 d.version=85;expect(isBrushLibrary(data)).toBe(true)
 d.mixer!.algorithm='krita-mask';expect(isBrushLibrary(data)).toBe(false);delete d.mixer!.algorithm
 d.behavior!.rendering!.blendMode='multiply';expect(isBrushLibrary(data)).toBe(false)
 d.behavior!.rendering!.blendMode='normal';d.version=83;d.mixer!.source='previousCanvas';expect(isBrushLibrary(data)).toBe(true)
})
