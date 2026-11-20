import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import{sketch161}from'./sketchTimer161.testFixture.js'
export const mask162=`asset:${'a162'.padEnd(64,'0')}`as const
export function sketch162():BrushDescriptor{const b=sketch161();b.id='imported-162162162162162162162162';b.version=162;delete b.behavior!.timing;b.tip={kind:'bitmap',mask:mask162,maskBounds:{x:0,y:0,width:1,height:1},hardness:1,aspect:1,angle:0,rotation:'fixed'};Object.assign(b.sketch!,{mode:'mask',maskSize:[4,4],maskSignal:'image-alpha-v1',distanceDensity:false,distanceOpacity:false,connect:false,offset:0});return b}
export const library162=():BrushLibrary=>({schemaVersion:1,assets:[{id:mask162,size:4,file:mask162.slice(6)+'.bin'}],skipped:[],brushes:[{name:'Authored Sketch IMAGESTAMP alpha',source:'authored162.kpp',warnings:[],descriptor:sketch162()}]})
