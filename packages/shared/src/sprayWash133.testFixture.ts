import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import type{Dab}from'./index.js'
export const mask133='asset:5ac6a5945f16500911219129984ba8b387a06f24fe383ce4e81a73294065461b'as const
export const pixels133=()=>new Uint8Array(16).fill(255)
export function spray133(tip=false):BrushDescriptor{
 const lut=Array.from({length:257},(_,i)=>Math.round(i/256*65535).toString(16).padStart(4,'0')).join('')
 return{id:'imported-133133133133133133133133',version:133,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:mask133,hardness:1,aspect:1,angle:0,rotation:'fixed',...(tip?{animation:{mode:'random' as const,frames:Array.from({length:7},()=>mask133)}}:{})},paperInteraction:0,spacing:.5,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'alphaDarken',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},spray:{version:1,diameter:500,scale:1,aspect:1,angle:0,count:2,jitter:0,radial:{maximum:1,samples:lut},angular:lut,particle:{shape:tip?'tip':'ellipse',width:100,height:100,proportional:false},dynamics:{randomSize:false,fixedAngle:0,randomAngle:0,radialAngle:0,pathAngle:0},color:{perParticle:true,hue:0,saturation:0,value:0,randomOpacity:false}}}
}
export const library133=(tip=false):BrushLibrary=>({schemaVersion:1,assets:[{id:mask133,size:4,file:mask133.slice(6)+'.bin'}],skipped:[],brushes:[{name:'Own133',source:'authored.kpp',warnings:[],descriptor:spray133(tip)}]})
export const dab133=(x=-2,t=0):Dab=>({x,y:-3,size:8,pressure:1,opacity:.5,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t})
