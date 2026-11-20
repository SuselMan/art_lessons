import type{BrushDescriptor,BrushLibrary}from'./brushes'
import type{BrushDynamic}from'./brushBehavior'
export function scatter148():BrushDescriptor{
 const leaf=(value:number):BrushDynamic=>({control:'pressure',minimum:0,jitter:0,curve:[[0,value],[1,value]]})
 return{id:'imported-148148148148148148148148',version:148,model:'stamp',category:'paint',tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],scatter:{count:1,radius:4,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0},behavior:{version:2,scatter:{countJitter:0,bothAxes:true,placement:'xyUniform'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'},modulations:{scatter:[{control:'off',minimum:0,jitter:0,combine:{policy:'native-scatter-v1',mode:'sum',constant:4,scaling:[leaf(.75),leaf(.75)],additive:[]}}]}}}
}
export function scatterLibrary148():BrushLibrary{return{schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored Scatter148',source:'authored.kpp',warnings:[],descriptor:scatter148()}]}}
