import{copyBrushSourceContext}from'./brushSource.js'
import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import type{Dab}from'./stroke.js'
export function tangent136():BrushDescriptor{return{id:'imported-136136136136136136136136',version:136,model:'stamp',category:'paint',tip:{kind:'procedural',hardness:.855,aspect:1,rotation:'fixed',angle:0,profile:{kind:'standard',shape:'ellipse',horizontalFade:.86,verticalFade:.85,antialias:false}},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,0],[1,1]],behavior:{version:2,speedInput:{version:1,space:'view',maximum:30,estimator:'grafettoEMA30ms'},rendering:{opacityCeiling:'uniform',mode:'buildUp',blendMode:'normal',accumulation:'alphaDarken',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},tangentNormal:{version:1,direction:'tilt',channels:[0,2,4],elevationSensitivity:1,mix:.5}}}
export const library136=():BrushLibrary=>({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Own Tangent136',source:'authored.kpp',warnings:[],descriptor:tangent136()}]})
export const source136=(normalRotation=0)=>copyBrushSourceContext({version:1,normalRotation})
export const dab136=(tiltX=60,t=0,pressure=1):Dab=>({x:-2,y:-3,size:17,pressure,opacity:.5,angle:0,aspectRatio:1,tiltX,tiltY:0,t,sourceAngle:.1})
