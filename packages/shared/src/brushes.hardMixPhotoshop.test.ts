import {it,expect} from 'vitest'
import {isBrushLibrary,type BrushLibrary} from './brushes'
import {BRUSH_BLEND_MODES,isBrushBehavior} from './brushBehavior'
function fixture():BrushLibrary{return{schemaVersion:1,assets:[{id:`asset:${'a'.repeat(64)}`,size:4,file:`${'a'.repeat(64)}.bin`}],skipped:[],brushes:[{name:'Authored Pixel Photoshop Hard Mix',source:'kpp',warnings:[],descriptor:{id:'imported-9494949494949494',version:102,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:`asset:${'a'.repeat(64)}`,hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'hardMixPhotoshop',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}]}}
it('appends Photoshop Hard Mix26 without moving any old mode and gates root Pixel102',()=>{
 expect(BRUSH_BLEND_MODES.indexOf('hardMix')).toBe(19);expect(BRUSH_BLEND_MODES.indexOf('luminosity')).toBe(25);expect(BRUSH_BLEND_MODES.indexOf('hardMixPhotoshop')).toBe(26)
 const lib=fixture(),d=lib.brushes[0].descriptor;expect(isBrushLibrary(lib)).toBe(true)
 d.version=101;expect(isBrushLibrary(lib)).toBe(false);d.behavior!.rendering!.blendMode='hardMix';expect(isBrushLibrary(lib)).toBe(true)
})
it('closes mixer, child, grain and special-family reuse of the appended mode',()=>{
 const lib=fixture(),d=lib.brushes[0].descriptor
 d.model='mixer';expect(isBrushLibrary(lib)).toBe(false);d.model='stamp'
 const child=structuredClone(d);d.behavior!.rendering!.blendMode='normal';d.behavior!.dual={brush:child,blendMode:'multiply',sampling:'independent'};expect(isBrushLibrary(lib)).toBe(false)
 expect(isBrushBehavior({version:2,rendering:{mode:'buildUp',blendMode:'normal',burntEdgesMode:'hardMixPhotoshop'}})).toBe(false)
})
