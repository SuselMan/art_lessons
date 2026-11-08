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



function tensor(){const c=library(),d=c.brushes[0].descriptor,id=c.assets[0].id;d.version=113;d.category='paint';d.paperInteraction=0;d.tip.rotation='fixed';d.tip.animation={mode:'dimensions',dimensions:[{mode:'pressure',rank:2},{mode:'xtilt',rank:2},{mode:'velocity',rank:2},{mode:'angular',rank:2}],frames:[id],cursorPolicy:'first-request-v1',roundingPolicy:'qt5-half-up-v1'};d.behavior={version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},speedInput:{version:1,space:'view',maximum:30,estimator:'grafettoEMA30ms'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}};return c}
describe('113 closed tensor admission',()=>{
 it('admits single actual EOF frame and rejects shape/product/policy/downgrade',()=>{
  expect(isBrushLibrary(tensor())).toBe(true)
  const edits:Array<(d:BrushLibrary['brushes'][number]['descriptor'])=>void>=[d=>{d.version=112},d=>{d.tip.animation!.dimensions!.pop();d.tip.animation!.dimensions!.pop();d.tip.animation!.dimensions!.pop()},d=>{d.tip.animation!.dimensions![0].rank=256},d=>{d.tip.animation!.rank=8},d=>{delete d.tip.animation!.roundingPolicy},d=>{delete d.tip.animation!.cursorPolicy},d=>{delete d.behavior!.speedInput},d=>{delete d.behavior!.strokeInput},d=>{d.behavior!.erase=true}]
  for(const edit of edits){const c=tensor();edit(c.brushes[0].descriptor);expect(isBrushLibrary(c)).toBe(false)}
 })
 it('rejects tensors as child even when root captures every required channel',()=>{const c=tensor(),d=c.brushes[0].descriptor,child=structuredClone(d);delete d.tip.animation;d.behavior!.dual={brush:child,blendMode:'multiply'};expect(isBrushLibrary(c)).toBe(false)})
 it('requires the union of speed angle and degree tilt channels before any packet',()=>{const d=tensor().brushes[0].descriptor,input={x:0,y:0,size:10,pressure:1,tiltX:-2,tiltY:0,sourceAngle:0,normalizedSpeed:.5,angle:0,aspectRatio:1,opacity:1,t:0};expect(hasBrushSourceInputs(d,[input],input)).toBe(true);expect(hasBrushSourceInputs(d,[{...input,sourceAngle:undefined}])).toBe(false);expect(hasBrushSourceInputs(d,[{...input,normalizedSpeed:undefined}])).toBe(false);expect(hasBrushSourceInputs(d,[{...input,tiltX:NaN}])).toBe(false);expect(hasBrushSourceInputs(d,[{...input,pressure:-1}])).toBe(false)})
})

it('checks each tilt signed product with its own suffix stride before packet admission',()=>{const d=tensor().brushes[0].descriptor,input={x:0,y:0,size:10,pressure:1,tiltX:91.93536376953125,tiltY:0,sourceAngle:0,normalizedSpeed:.5,angle:0,aspectRatio:1,opacity:1,t:0};expect(hasBrushSourceInputs(d,[input],input)).toBe(true);const bad={...input,tiltX:1073741824};expect(hasBrushSourceInputs(d,[bad])).toBe(false);expect(hasBrushSourceInputs(d,[],bad)).toBe(false)})
