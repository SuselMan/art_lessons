import{describe,it,expect}from'vitest'
import{isBrushLibrary,hasBrushSourceInputs,brushRequiresRandomContext,type BrushLibrary}from'./brushes.js'
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

it('115 admits sequence dimensions only at115 and randomPolicy IFF random; old flat random has no new seed trait',()=>{
 const c=tensor(),d=c.brushes[0].descriptor;d.version=115;d.tip.animation!.dimensions![0].mode='random';d.tip.animation!.randomPolicy='grafetto-dim-stream-v1'
 expect(isBrushLibrary(c)).toBe(true);expect(brushRequiresRandomContext(d)).toBe(true)
 const flat=structuredClone(d);flat.tip.animation={mode:'random',frames:[c.assets[0].id,c.assets[0].id]};expect(brushRequiresRandomContext(flat)).toBe(false)
 for(const edit of[(b:typeof d)=>{b.version=114},(b:typeof d)=>{delete b.tip.animation!.randomPolicy},(b:typeof d)=>{b.tip.animation!.dimensions![0].mode='incremental'}]){const bad=structuredClone(c);edit(bad.brushes[0].descriptor);expect(isBrushLibrary(bad)).toBe(false)}
 d.tip.animation!.dimensions![0].mode='incremental';delete d.tip.animation!.randomPolicy;expect(isBrushLibrary(c)).toBe(true);d.version=113;expect(isBrushLibrary(c)).toBe(false)
})

it('118 admits original alpha geometry only with canonical rows and no active positional scatter',()=>{
 const c=tensor(),d=c.brushes[0].descriptor,id=c.assets[0].id;c.assets[0].size=8;d.version=118;d.tip.maskBounds={x:.25,y:.25,width:.5,height:.5};d.tip.animation!.frames=[id,id];d.tip.animation!.geometry={version:1,frames:[{sourceWidth:4,sourceHeight:2,maskBounds:d.tip.maskBounds},{sourceWidth:8,sourceHeight:6,maskBounds:{x:0,y:0,width:1,height:1}}]}
 expect(isBrushLibrary(c)).toBe(true)
 d.scatter={count:3,radius:0,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0};d.behavior!.scatter={countJitter:0,bothAxes:true,placement:'xyUniform'};expect(isBrushLibrary(c)).toBe(true)
 const edits:Array<(b:typeof d)=>void>=[b=>{b.version=117},b=>{b.scatter!.radius=.01},b=>{b.tip.animation!.geometry!.frames[1].maskBounds.width=.5},b=>{b.tip.animation!.geometry!.frames.pop()},b=>{b.tip.color={planes:[id,id,id],frames:[[id,id,id],[id,id,id]]}},b=>{b.tip.material={kind:'lightness',gray:id,grayFrames:[id,id],strength:1}},b=>{b.behavior!.rendering!.blendMode='multiply'}]
 for(const edit of edits){const bad=structuredClone(c);edit(bad.brushes[0].descriptor);expect(isBrushLibrary(bad)).toBe(false)}
 for(const mode of['angular','xtilt','ytilt']as const){const other=structuredClone(c),b=other.brushes[0].descriptor;b.tip.animation={mode,rank:8,frames:[id,id],geometry:d.tip.animation!.geometry,...mode==='angular'?{cursorPolicy:'first-request-v1'}:{roundingPolicy:'qt5-half-up-v1'}};expect(isBrushLibrary(other)).toBe(true);b.version=117;expect(isBrushLibrary(other)).toBe(false)}
})

it('accepts up to 1024 multidimensional slots while preserving the flat limit',()=>{
 const c=tensor(),d=c.brushes[0].descriptor,id=c.assets[0].id;d.version=115;d.tip.animation={mode:'dimensions',dimensions:[{mode:'angular',rank:18},{mode:'incremental',rank:41}],frames:Array.from({length:738},()=>id),cursorPolicy:'first-request-v1'}
 expect(isBrushLibrary(c)).toBe(true)
 d.tip.animation.dimensions=[{mode:'angular',rank:33},{mode:'incremental',rank:32}];expect(isBrushLibrary(c)).toBe(false)
})

it('admits Krita surplus cells only within the unchanged-stride bound',()=>{
 const c=tensor(),a=c.brushes[0].descriptor.tip.animation!;a.frames=Array(17).fill(c.assets[0].id);expect(isBrushLibrary(c)).toBe(true)
 a.frames=Array(18).fill(c.assets[0].id);expect(isBrushLibrary(c)).toBe(false)
})
