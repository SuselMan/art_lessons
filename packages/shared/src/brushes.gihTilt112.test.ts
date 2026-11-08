import{describe,it,expect}from'vitest'
import{isBrushLibrary,hasBrushSourceInputs,brushRequiresSourceInputs,type BrushLibrary}from'./brushes.js'
import type{Dab}from'./stroke.js'
function library(mode:'xtilt'|'ytilt'='xtilt'):BrushLibrary{const a='a'.repeat(64),b='b'.repeat(64);return{schemaVersion:1,assets:[a,b].map(h=>({id:`asset:${h}`as const,size:2,file:h+'.bin'})),skipped:[],brushes:[{name:'Authored Tilt112',source:'Own.kpp',warnings:[],descriptor:{id:'imported-121212121212121212121212',version:112,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:`asset:${a}`,animation:{mode,rank:5,roundingPolicy:'qt5-half-up-v1',frames:[`asset:${a}`,`asset:${b}`]},hardness:1,aspect:1,angle:0,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'pass',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}]}}
const input:Dab={x:0,y:0,pressure:1,size:10,tiltX:-1,tiltY:1,aspectRatio:1,angle:0,opacity:1,t:0}
describe('GIH tilt112 narrow shared contract',()=>{
 it('admits both degree selectors with declared rank distinct from actual frames, without Angular cursor/sourceAngle',()=>{for(const mode of['xtilt','ytilt']as const){const c=library(mode),d=c.brushes[0].descriptor;expect(isBrushLibrary(c)).toBe(true);expect(brushRequiresSourceInputs(d)).toBe(true);expect(hasBrushSourceInputs(d,[input])).toBe(true);expect(hasBrushSourceInputs(d,[],input)).toBe(true);expect(hasBrushSourceInputs(d,[])).toBe(true)}})
 it('closes revision/policy/rank/cursor/geometry/child/image/otherengine and oldmode-policy aliases',()=>{
  const mutations:Array<(d:BrushLibrary['brushes'][number]['descriptor'])=>void>=[d=>{d.version=111},d=>{if(!d.tip.animation)throw Error('fixture');delete d.tip.animation.roundingPolicy},d=>{if(!d.tip.animation)throw Error('fixture');Reflect.set(d.tip.animation,'roundingPolicy','qt6-away-v1')},d=>{if(!d.tip.animation)throw Error('fixture');d.tip.animation.rank=1},d=>{if(!d.tip.animation)throw Error('fixture');d.tip.animation.rank=257},d=>{if(!d.tip.animation)throw Error('fixture');d.tip.animation.cursorPolicy='first-request-v1'},d=>{const id=library().assets[0].id;d.tip.color={planes:[id,id,id]}},d=>{d.model='mixer'},d=>{if(!d.behavior)throw Error('fixture');d.behavior.erase=true},d=>{if(!d.tip.animation)throw Error('fixture');d.tip.animation.mode='pressure'}]
  for(const mutate of mutations){const c=library();mutate(c.brushes[0].descriptor);expect(isBrushLibrary(c)).toBe(false)}
  const c=library(),d=c.brushes[0].descriptor,child=structuredClone(d);delete d.tip.animation;if(!d.behavior)throw Error('fixture');d.behavior.dual={brush:child,blendMode:'normal',sampling:'independent'};expect(isBrushLibrary(c)).toBe(false)
  const one=library();if(!one.brushes[0].descriptor.tip.animation)throw Error('fixture');one.brushes[0].descriptor.tip.animation.frames.pop();expect(isBrushLibrary(one)).toBe(false)
 })
 it('requires selected-axis finite captured F32[-90,90] on every raw dab/endpoint but preserves valid zero/default/no-wire',()=>{
  const d=library().brushes[0].descriptor;for(const tiltX of[0,-90,90,-.500000001])expect(hasBrushSourceInputs(d,[{...input,tiltX}])).toBe(true)
  for(const tiltX of[NaN,Infinity,-Infinity,90.01,-90.01]){expect(hasBrushSourceInputs(d,[{...input,tiltX}])).toBe(false);expect(hasBrushSourceInputs(d,[],{...input,tiltX})).toBe(false)}
  const missing={...input};Reflect.deleteProperty(missing,'tiltX');expect(hasBrushSourceInputs(d,[missing])).toBe(false)
  const y=library('ytilt').brushes[0].descriptor;expect(hasBrushSourceInputs(y,[{...input,tiltY:90.01}])).toBe(false);expect(hasBrushSourceInputs(y,[input])).toBe(true)
 })
})
