import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import type{Dab}from'./stroke.js'
export function particle134():BrushDescriptor{return{id:'imported-134134134134134134134134',version:134,model:'stamp',category:'line',tip:{kind:'round',hardness:1,aspect:1,rotation:'fixed',angle:0},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'alphaDarken',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},particle:{version:1,count:65,iterations:15,gravity:.906,weight:.06,scaleX:1,scaleY:1}}}
export const library134=():BrushLibrary=>({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Own Particle134',source:'authored.kpp',warnings:[],descriptor:particle134()}]})
export const dab134=(x=-2,t=0):Dab=>({x,y:-3,size:17,pressure:.25,opacity:.5,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t})
