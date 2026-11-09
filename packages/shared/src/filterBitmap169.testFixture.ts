import{filter147}from'./filterSmudge147.testFixture.js'
import type{AssetId,BrushLibrary}from'./brushes.js'
export const mask169=('asset:'+'a'.repeat(64))as AssetId
export function filter169(){const b=filter147();b.version=169;b.tip={kind:'bitmap',mask:mask169,maskBounds:{x:0,y:0,width:1,height:1},hardness:1,aspect:1,rotation:'fixed',angle:0};b.filter={version:2,kind:'invert',smudgeMode:true,sourcePolicy:'canonical-begin-v1',maskPolicy:'bitmap-alpha-v1'};return b}
export function library169():BrushLibrary{return{schemaVersion:1,assets:[{id:mask169,file:mask169.slice(6)+'.bin',size:2}],skipped:[],brushes:[{name:'Own169',source:'Own169.kpp',warnings:[],descriptor:filter169()}]}}
