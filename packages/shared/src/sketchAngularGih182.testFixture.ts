import type{AssetId,BrushLibrary}from'./brushes.js'
import type{Dab}from'./stroke.js'
import{sketch174}from'./sketchGih174.testFixture.js'
export const frames182=["asset:d349d24f97678f2f35d766033c4349492e752cb2e9475b78dad72e2bd4f6c6fa", "asset:e189ec6035502afb09020eb7d469829c2049b1d317a3738fb8cd0da9406750cd", "asset:069cc82a3752a51f2ba69c29dac6725b1ab304e96fae5ee37be45330bae6cb51", "asset:cc0fa51d4d0a97b664030be5052f3b2b69a1267f89ace4c9bbc65007566725df"] as AssetId[]
export const alpha182=(frame:number)=>Uint8Array.from({length:16},(_,i)=>i%4===frame?255:0)
export function sketch182(){const b=sketch174();b.id='imported-182182182182182182182182';b.version=182;b.tip.mask=frames182[0];b.tip.animation={mode:'angular',rank:4,cursorPolicy:'first-request-v1',frames:[...frames182]};b.behavior!.strokeInput={version:1,initialDirection:'cursorHistory'};return b}
export function library182():BrushLibrary{return{schemaVersion:1,assets:frames182.map(id=>({id,file:id.slice(6)+'.bin',size:4})),skipped:[],brushes:[{name:'Own182 angular alpha Sketch',source:'Own182.kpp',warnings:[],descriptor:sketch182()}]}}
export function dab182(sourceAngle=0,x=0,pressure=1,size=4):Dab{return{x,y:0,sourceAngle,angle:0,size,pressure,aspectRatio:1,tiltX:0,tiltY:0,t:0,opacity:1}}
