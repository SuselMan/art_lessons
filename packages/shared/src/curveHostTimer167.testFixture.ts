import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import{particle157,dab157}from'./particleTimer157.testFixture.js'
export function curve167():BrushDescriptor{const b=particle157();delete b.particle;b.version=167;b.curveTrace={version:2,history:3,smoothing:true,connect:false,opacity:.5};b.behavior!.timing={version:1,rate:40,ignoreDistanceSpacing:true};return b}
export const library167=():BrushLibrary=>({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored Curve host167',source:'authored.kpp',warnings:[],descriptor:curve167()}]})
export const dab167=dab157
