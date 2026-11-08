import{bristle141}from'./bristleInitialization141.testFixture.js'
import type{BrushLibrary,AssetId}from'./brushes.js'
export const source143=('asset:'+'1430'.repeat(16))as AssetId
export function bristle143(){const b=bristle141();b.version=143;if(b.bristle!.version!==1)throw Error('fixture');b.bristle!.initialization={resizePolicy:'source-area143-v1',sourceSide:4,sourceMask:source143,sourceBounds:{x:0,y:1,width:4,height:2},rotation:[0,65536]};return b}
export const library143=():BrushLibrary=>({schemaVersion:1,assets:[{id:source143,size:4,file:source143.slice(6)+'.bin'}],skipped:[],brushes:[{name:'Original mask143',source:'authored.kpp',warnings:[],descriptor:bristle143()}]})
