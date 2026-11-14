import {describe,it,expect}from'vitest'
import{hasColorSmudge193Scope,COLOR_SMUDGE193_COMPOSITES,isBrushLibrary,hasBrushSourceInputs,type BrushDescriptor}from'./brushes.js'
import{filter147}from'./filterSmudge147.testFixture.js'
import{library192,FILTER192_MASK,FILTER192_FRAME}from'./filterMask192.testFixture.js'
function smudge(modern=false):BrushDescriptor{
 const d=filter147();delete d.filter;d.version=193;d.mixer={load:0,initialLoad:0,strength:1,pickup:.6,smearAlpha:true,source:'previousCanvas',colorRateComposite:'normal',...(modern?{algorithm:'krita-mask' as const}:{})};return d
}
describe('whole Color Smudge193 combinations',()=>{
 it('admits each foreground operation with both strategies, both source choices and dulling',()=>{
  for(const modern of[false,true])for(const mode of COLOR_SMUDGE193_COMPOSITES)for(const source of['previousCanvas','projectionCanvas']as const){
   const d=smudge(modern);d.mixer!.colorRateComposite=mode;d.mixer!.source=source;d.mixer!.sampling={mode:modern?'maskMean':'adaptiveMean',radius:modern?.7:2};d.mixer!.foreground={gradient:{rate:.7,value:.6}};if(mode==='erase')d.behavior!.erase=true
   expect(hasColorSmudge193Scope(d),`${modern}/${mode}/${source}`).toBe(true);expect(isBrushLibrary(library192(d)),`${modern}/${mode}/${source}`).toBe(true)
  }
 })
 it('retains procedural shapes and actual unequal selected-frame resources',()=>{
  const d=smudge(true);d.tip={kind:'procedural',hardness:1,aspect:1.4,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'rectangle',horizontalFade:.2,verticalFade:.7,antialias:true},autoNoise:{version:1,density:.5,randomness:.3},autoShape:{version:1,spikes:5}};expect(isBrushLibrary(library192(d))).toBe(true)
  d.tip={kind:'bitmap',hardness:1,aspect:1,angle:0,rotation:'fixed',mask:FILTER192_MASK,maskBounds:{x:0,y:0,width:1,height:1},animation:{mode:'pressure',rank:2,frames:[FILTER192_MASK,FILTER192_FRAME],geometry:{version:1,frames:[{sourceWidth:4,sourceHeight:4,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:2,sourceHeight:4,maskBounds:{x:0,y:0,width:1,height:1}}]}}};expect(isBrushLibrary(library192(d))).toBe(true)
  d.mixer!.algorithm='krita-stamp';d.tip.color={planes:[FILTER192_MASK,FILTER192_MASK,FILTER192_MASK],frames:[[FILTER192_MASK,FILTER192_MASK,FILTER192_MASK],[FILTER192_FRAME,FILTER192_FRAME,FILTER192_FRAME]]};expect(isBrushLibrary(library192(d))).toBe(true)
  d.tip.color={gradient:{gray:FILTER192_MASK,grayFrames:[FILTER192_MASK,FILTER192_FRAME]}};expect(isBrushLibrary(library192(d))).toBe(true)
  d.tip.animation!.frames[1]=`asset:${'f'.repeat(64)}`;expect(isBrushLibrary(library192(d))).toBe(false)
 })
 it('keeps the native Lightness unshaded source and foreground erasing',()=>{
  const d=smudge(true);d.tip={kind:'bitmap',mask:FILTER192_MASK,hardness:1,aspect:1,angle:0,rotation:'fixed',material:{kind:'lightness',gray:FILTER192_MASK,strength:1}};d.mixer!.paintThickness={value:.5,mode:'overlay'};d.mixer!.colorRateComposite='erase';d.behavior!.erase=true
  expect(isBrushLibrary(library192(d))).toBe(true);d.mixer!.source='projectionCanvas';expect(isBrushLibrary(library192(d))).toBe(false)
 })
 it('rejects reservoir, foreign engine, unknown composite, Pixel flow and stationary timer',()=>{
  for(const edit of[(d:BrushDescriptor)=>{d.mixer!.load=.1},(d:BrushDescriptor)=>{d.flow=.3},(d:BrushDescriptor)=>{d.behavior!.timing={version:1,rate:10,ignoreDistanceSpacing:true}},(d:BrushDescriptor)=>{Object.assign(d.mixer!,{colorRateComposite:'unregistered'})},(d:BrushDescriptor)=>{d.filter=filter147().filter}]){const d=smudge();edit(d);expect(isBrushLibrary(library192(d))).toBe(false)}
 })
 it('requires captured source geometry for the new whole role and preserves old admission',()=>{
  const d=smudge(),dab={x:0,y:0,size:16,pressure:1,tiltX:0,tiltY:0,aspectRatio:1,angle:0,opacity:1,t:0,sourceSize:16,sourceScale:1,sourceAngle:Math.PI/7};expect(hasBrushSourceInputs(d,[dab])).toBe(true);expect(hasBrushSourceInputs(d,[{...dab,sourceSize:undefined}])).toBe(false)
  d.version=176;d.mixer!.colorRateComposite='softLight';expect(isBrushLibrary(library192(d))).toBe(false)
 })
})
