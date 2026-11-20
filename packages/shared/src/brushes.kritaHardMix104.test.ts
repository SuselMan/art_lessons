import {it,expect} from 'vitest'
import {isBrushLibrary,type BrushLibrary} from './brushes'
import {BRUSH_BLEND_MODES,isBrushBehavior} from './brushBehavior'
function fixture():BrushLibrary{return{schemaVersion:1,assets:[{id:`asset:${'a'.repeat(64)}`,size:4,file:`${'a'.repeat(64)}.bin`}],skipped:[],brushes:[{name:'Authored Pixel Photoshop Hard Mix',source:'kpp',warnings:[],descriptor:{id:'imported-9494949494949494',version:104,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:`asset:${'a'.repeat(64)}`,hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'kritaHardMix',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}]}}
it('appends Krita27 while preserving recorded0..26 and root104 only',()=>{
 const old=['normal','multiply','screen','overlay','darken','lighten','colorBurn','linearBurn','colorDodge','add','subtract','difference','exclusion','softLight','hardLight','divide','linearLight','vividLight','pinLight','hardMix','darkerColor','lighterColor','hue','saturation','color','luminosity','hardMixPhotoshop'];expect(BRUSH_BLEND_MODES.slice(0,27)).toEqual(old);expect(BRUSH_BLEND_MODES[27]).toBe('kritaHardMix')
 const lib=fixture(),d=lib.brushes[0].descriptor;expect(isBrushLibrary(lib)).toBe(true);d.version=103;expect(isBrushLibrary(lib)).toBe(false);d.behavior!.rendering!.blendMode='hardMixPhotoshop';expect(isBrushLibrary(lib)).toBe(true);d.version=27;d.behavior!.rendering!.blendMode='hardMix';expect(isBrushLibrary(lib)).toBe(true)
})
it('keeps new mode out of child and nonrendering channels',()=>{
 const lib=fixture(),d=lib.brushes[0].descriptor,child=structuredClone(d);d.behavior!.rendering!.blendMode='normal';d.behavior!.dual={brush:child,blendMode:'multiply',sampling:'independent'};expect(isBrushLibrary(lib)).toBe(false)
 expect(isBrushBehavior({version:2,rendering:{mode:'buildUp',blendMode:'normal',burntEdgesMode:'kritaHardMix'}})).toBe(false)
})
