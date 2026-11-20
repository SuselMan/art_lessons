import {expect,it} from 'vitest'
import {isBrushLibrary,type BrushLibrary} from './brushes'
function fixture(mode:'grainMerge'|'grainExtract'|'negation'|'multiply'|'screen',legacy=false){
 const data:BrushLibrary={schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored Smudge',source:'kpp',warnings:[],descriptor:{id:'imported-aaaaaaaaaaaaaaaa',version:legacy?83:82,model:'mixer',category:'wet',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},mixer:{load:0,initialLoad:0,pickup:.6,strength:1,source:'previousCanvas',...(legacy?{}:{algorithm:'krita-mask' as const})}}}]}
 // Tests compile against actual shared only after manager applies the union.
 Object.assign(data.brushes[0].descriptor.mixer!,{colorRateComposite:mode})
 return data
}
it.each([false,true])('admits erase88 only as actual versioned canvas mixer, modern=%s',(modern)=>{
 const data=fixture('multiply',true),d=data.brushes[0].descriptor;d.version=88
 d.behavior!.erase=true;Object.assign(d.mixer!,{colorRateComposite:'erase'});if(modern)d.mixer!.algorithm='krita-mask'
 expect(isBrushLibrary(data)).toBe(true)
 d.version=87;expect(isBrushLibrary(data)).toBe(false);d.version=88
 d.behavior!.erase=false;expect(isBrushLibrary(data)).toBe(false);d.behavior!.erase=true
 delete d.mixer!.source;expect(isBrushLibrary(data)).toBe(false);d.mixer!.source='projectionCanvas';expect(isBrushLibrary(data)).toBe(true)
 d.behavior!.rendering!.blendMode='multiply';expect(isBrushLibrary(data)).toBe(false);d.behavior!.rendering!.blendMode='normal'
 d.model='stamp';expect(isBrushLibrary(data)).toBe(false)
})
