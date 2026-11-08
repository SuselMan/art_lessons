import{describe,it,expect}from'vitest'
import{isBrushLibrary,hasBrushSourceInputs,type BrushLibrary}from'./brushes.js'
function library(): BrushLibrary {
  const hash = 'a'.repeat(64)
  return {
    schemaVersion: 1, assets: [{ id: `asset:${hash}`, size: 2, file: `${hash}.bin` }], skipped: [],
    brushes: [{ name: 'Watercolour', source: 'abr', warnings: [], descriptor: {
      id: 'imported-' + 'a'.repeat(16), version: 1, model: 'stamp', category: 'wet',
      tip: { kind: 'bitmap', mask: `asset:${hash}`, hardness: 1, aspect: 1, angle: 0, rotation: 'path' },
      paperInteraction: 0.5, spacing: 0.1, flow: 0.6, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 0], [1, 1]], opacityByPressure: [[0, 0], [1, 1]],
    } }],
  }
}



function angular(){const c=library(),d=c.brushes[0].descriptor,id=c.assets[0].id;d.version=110;d.category='paint';d.paperInteraction=0;d.tip.rotation='fixed';d.tip.animation={mode:'angular',rank:8,cursorPolicy:'first-request-v1',frames:[id]};d.behavior={version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}};return c}
describe('angular110 closed admission',()=>{
 it('admits one actual alpha frame with declared rank and requires explicit policy',()=>{const c=angular(),d=c.brushes[0].descriptor;expect(isBrushLibrary(c)).toBe(true);d.version=109;expect(isBrushLibrary(c)).toBe(false);d.version=110;delete d.tip.animation!.cursorPolicy;expect(isBrushLibrary(c)).toBe(false)})
 it('rejects rank1, missing capture, timer, erase, child and other families',()=>{
  const mutations:Array<(d:BrushLibrary['brushes'][number]['descriptor'])=>void>=[d=>{d.tip.animation!.rank=1},d=>{delete d.behavior!.strokeInput},d=>{d.behavior!.erase=true},d=>{d.behavior!.strokeInput!.fanCorners={stepDegrees:30}},d=>{d.model='mixer'},d=>{d.behavior!.rendering!.blendMode='multiply'}]
  for(const edit of mutations){const c=angular();edit(c.brushes[0].descriptor);expect(isBrushLibrary(c)).toBe(false)}
  const c=angular(),d=c.brushes[0].descriptor,child=structuredClone(d);delete d.tip.animation;delete d.behavior!.strokeInput;d.behavior!.dual={brush:child,blendMode:'multiply'};expect(isBrushLibrary(c)).toBe(false)
 })
 it('requires finite captured sourceAngle on every input',()=>{const c=angular(),d=c.brushes[0].descriptor;const input={x:0,y:0,pressure:1,size:10,tiltX:0,tiltY:0,aspectRatio:1,angle:0,opacity:1,t:0,sourceAngle:.123456789012345};expect(hasBrushSourceInputs(d,[input])).toBe(true);expect(hasBrushSourceInputs(d,[{...input,sourceAngle:undefined}])).toBe(false)})
})
