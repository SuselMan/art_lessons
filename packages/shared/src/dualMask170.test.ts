import{it,expect}from'vitest'
import{isBrushLibrary,hasPixelAlphaDual170Scope}from'./brushes.js'
import{isBrushBehavior,BRUSH_BLEND_MODES}from'./brushBehavior.js'
import{library170}from'./dualMask170.testFixture.js'
import{library168}from'./dualMask168.testFixture.js'
import{library151}from'./pixelOriginalDual151.testFixture.js'
it('170 is one dual-only alpha token, preserving old168/151 and global RGB ban',()=>{
 expect(BRUSH_BLEND_MODES).not.toContain('hardMixPhotoshopAlpha')
 expect(isBrushLibrary(library170())).toBe(true);expect(hasPixelAlphaDual170Scope(library170().brushes[0].descriptor)).toBe(true)
 expect(isBrushLibrary(library168())).toBe(true);expect(isBrushLibrary(library151())).toBe(true)
 const rgb=library170();rgb.brushes[0].descriptor.behavior!.dual!.blendMode='hardMixPhotoshop';expect(isBrushLibrary(rgb)).toBe(false)
 expect(isBrushBehavior({version:2,rendering:{mode:'buildUp',blendMode:'hardMixPhotoshopAlpha',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}})).toBe(false)
})
it('whole-library pressure retained, malformed and out-of-scope pairs denied',()=>{
 const good=library170();good.brushes[0].descriptor.behavior!.dual!.brush.sizeByPressure=[[0,.2],[1,.8]];expect(isBrushLibrary(good)).toBe(true)
 for(const kind of['downgrade','inline','erase','timer','childRGB','nested','array','hsv','rootWash','family']){
  const l=library170(),b=l.brushes[0].descriptor,child=b.behavior!.dual!.brush
  if(kind==='downgrade')b.version=168
  else if(kind==='inline')Reflect.set(b.behavior!.dual!,'sampling',undefined)
  else if(kind==='erase')b.behavior!.erase=true
  else if(kind==='timer')b.behavior!.timing={version:1,rate:20,ignoreDistanceSpacing:false}
  else if(kind==='childRGB')child.tip.color=library151().brushes[0].descriptor.tip.color
  else if(kind==='nested')child.behavior!.dual=library170().brushes[0].descriptor.behavior!.dual
  else if(kind==='array'){b.behavior!.modulations={size:[{control:'pressure',minimum:0,jitter:0,curve:[[0,0],[1,1]]}]};Reflect.set(b.behavior!.modulations.size![0],'control',['pressure'])}
  else if(kind==='hsv')child.behavior!.dynamics={hue:{control:'pressure',minimum:0,jitter:0}}
  else if(kind==='rootWash')b.behavior!.rendering!.accumulation='alphaDarken'
  else Reflect.set(b,'mixer',{pickup:.5})
  expect(isBrushLibrary(l),kind).toBe(false)
 }
})
