import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import type{Dab}from'./index.js'
export const mask132='asset:5ac6a5945f16500911219129984ba8b387a06f24fe383ce4e81a73294065461b'as const
export const pixels132=()=>new Uint8Array(16).fill(255)
export function pair132(integer=false):BrushDescriptor{
 const part=():BrushDescriptor=>({id:'imported-132132132132132132132132',version:132,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:mask132,hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.5,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'alphaDarken',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}})
 const root=part(),child=part();child.id='imported-132132132132132132132133';root.behavior!.timing={version:1,rate:20,ignoreDistanceSpacing:false};child.behavior!.clockRead={version:1,source:'primary'};child.behavior!.modulations={size:[{control:'time',minimum:0,jitter:0,period:200,periodic:true,curve:[[0,.25],[1,1]]}]};if(integer){for(const d of[root,child])d.tip.imageSampling={kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:0,y:0,width:4,height:4}}}root.behavior!.dual={brush:child,sampling:'independent',blendMode:'subtract'};return root
}
export const library132=():BrushLibrary=>({schemaVersion:1,assets:[{id:mask132,size:4,file:mask132.slice(6)+'.bin'}],skipped:[],brushes:[{name:'Own132',source:'authored.kpp',warnings:[],descriptor:pair132()}]})
export const dab132=(sourceTime=0):Dab=>({x:-2,y:-3,size:8,pressure:1,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:sourceTime,sourceTime})
