import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import type{Dab}from'./index.js'
export const alpha128=`asset:${'128a'.padEnd(64,'0')}`as const,gray128=`asset:${'128b'.padEnd(64,'0')}`as const,mask128=`asset:${'128c'.padEnd(64,'0')}`as const
export const assets128=[alpha128,gray128,mask128].map(id=>({id,size:4,file:id.slice(6)+'.bin'}))
export function pair128():BrushDescriptor{
 const part=():BrushDescriptor=>({id:'imported-128128128128128128128128',version:128,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:alpha128,maskBounds:{x:0,y:0,width:1,height:1},hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.5,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},rotation:{follow:1,random:'none'},spacing:{mode:'diameter',coefficient:.5,isotropic:true},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'alphaDarken',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}})
 const root=part(),child=part();child.id='imported-128128128128128128128129';child.tip.mask=mask128;child.tip.imageSampling={kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:0,y:0,width:4,height:4}};root.tip.material={kind:'lightness',gray:gray128,strength:1};root.behavior!.dual={brush:child,sampling:'independent',blendMode:'darken'};return root
}
export function pixels128(id:string){if(id===alpha128)return new Uint8Array(16).fill(255);if(id===gray128)return new Uint8Array([0,85,170,255,0,85,170,255,0,85,170,255,0,85,170,255]);if(id===mask128)return new Uint8Array([255,0,0,0,128,0,0,0,255,255,0,0,0,0,0,0]);throw Error('Unknown128 fixture')}
export const dab128:Dab={x:-2.25,y:-3.25,size:4,pressure:1,angle:0,sourceAngle:Math.PI/2,tiltX:0,tiltY:0,aspectRatio:1,opacity:1,t:0}
export const library128=():BrushLibrary=>({schemaVersion:1,assets:structuredClone(assets128),skipped:[],brushes:[{name:'Own128',source:'authored.kpp',warnings:[],descriptor:pair128()}]})
