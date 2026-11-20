import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import{brush129}from'./legacySmudgeTiming129.testFixture.js'
export const mask131=('asset:'+'d131'.repeat(16))as`asset:${string}`
export const normal131=('asset:'+'b131'.repeat(16))as`asset:${string}`
export const erase131=('asset:'+'c131'.repeat(16))as`asset:${string}`
export function brush131():BrushDescriptor{const d=brush129();d.version=131;if(d.tip.kind==='bitmap')d.tip.mask=mask131;delete d.behavior!.timing;delete d.behavior!.dynamics;d.behavior!.erase=true;d.mixer!.algorithm='krita-mask';d.mixer!.colorRateComposite='erase';d.mixer!.foreground={rate:.7};d.texture={id:normal131,eraseId:erase131,periodPx:3,strength:1,patternSize:{width:3,height:2},application:{mode:'multiply',soft:false}};return d}
export function library131(d=brush131()):BrushLibrary{return{schemaVersion:1,assets:[{id:mask131,size:4,file:mask131.slice(6)+'.bin'},{id:normal131,size:4,file:normal131.slice(6)+'.bin'},{id:erase131,size:4,file:erase131.slice(6)+'.bin'}],skipped:[],brushes:[{name:'Authored131',source:'own131.kpp',warnings:[],descriptor:d}]}}
