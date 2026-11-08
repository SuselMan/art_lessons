import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import{bristle135,dab135}from'./bristleWash135.testFixture.js'
export function bristle139():BrushDescriptor {
 const d=bristle135();d.id='imported-139139139139139139139139';d.version=139
 d.behavior!.rendering!.accumulation='directOver'
 d.bristle={...d.bristle!,version:2,hairs:[[-.5,0,.5],[.25,-.25,1]],ink:{depletion:[0,.25,.5,1],useOpacity:true,useSaturation:false,useWeights:true,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:50},soak:{sourcePolicy:'canonical-begin-v1',initialSide:4}}
 return d
}
export const library139=():BrushLibrary=>({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored Soak139',source:'authored-soak.kpp',warnings:[],descriptor:bristle139()}]})
export const dab139=dab135
