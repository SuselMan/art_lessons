import {expect,it} from 'vitest'
import {isBrushLibrary,type BrushLibrary} from './brushes'
function fixture(mode:'grainMerge'|'grainExtract'|'negation'|'multiply'|'screen',legacy=false){
 const data:BrushLibrary={schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored Smudge',source:'kpp',warnings:[],descriptor:{id:'imported-aaaaaaaaaaaaaaaa',version:legacy?83:82,model:'mixer',category:'wet',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},mixer:{load:0,initialLoad:0,pickup:.6,strength:1,source:'previousCanvas',...(legacy?{}:{algorithm:'krita-mask' as const})}}}]}
 // Tests compile against actual shared only after manager applies the union.
 Object.assign(data.brushes[0].descriptor.mixer!,{colorRateComposite:mode})
 return data
}
it.each(['grainMerge','grainExtract','negation']as const)('admits %s only in versioned modern foreground and keeps final blend normal',(mode)=>{
 const data=fixture(mode),d=data.brushes[0].descriptor
 expect(isBrushLibrary(data)).toBe(true)
 d.version=81;expect(isBrushLibrary(data)).toBe(false);d.version=82
 delete d.mixer!.algorithm;expect(isBrushLibrary(data)).toBe(false);d.mixer!.algorithm='krita-mask'
 d.behavior!.rendering!.blendMode='multiply';expect(isBrushLibrary(data)).toBe(false)
})
it.each(['multiply','screen']as const)('admits legacy %s without opening modern or projection modes',(mode)=>{
 const data=fixture(mode,true),d=data.brushes[0].descriptor
 expect(isBrushLibrary(data)).toBe(true)
 d.version=82;expect(isBrushLibrary(data)).toBe(false);d.version=83
 d.mixer!.source='projectionCanvas';expect(isBrushLibrary(data)).toBe(false);d.mixer!.source='previousCanvas'
 d.mixer!.algorithm='krita-mask';expect(isBrushLibrary(data)).toBe(false);delete d.mixer!.algorithm
 d.model='stamp';expect(isBrushLibrary(data)).toBe(false)
})
