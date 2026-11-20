import{describe,expect,it}from'vitest'
import{isBrushLibrary,hasBrushSourceInputs,type BrushLibrary}from'./brushes.js'
import type{Dab}from'./stroke.js'
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


const speedInput={version:1 as const,space:'view' as const,maximum:30,estimator:'grafettoEMA30ms' as const}
describe('GIH92 bounded capture admission',()=>{
 it('admits bounded declared velocity rank only at92 with compatible source capture',()=>{
  const c=library(),d=c.brushes[0].descriptor,id=c.assets[0].id;d.version=92;d.behavior={version:2,speedInput};d.tip.animation={mode:'velocity',rank:5,frames:[id,id]}
  expect(isBrushLibrary(c)).toBe(true)
  for(const rank of[1,2,256]){d.tip.animation.rank=rank;expect(isBrushLibrary(c)).toBe(true)}
  for(const rank of[undefined,0,-1,257,1.5,Infinity,NaN]){d.tip.animation.rank=rank;expect(isBrushLibrary(c)).toBe(false)}
  d.tip.animation.rank=5;d.version=91;expect(isBrushLibrary(c)).toBe(false);d.version=92
  delete d.behavior.speedInput;expect(isBrushLibrary(c)).toBe(false);d.behavior.speedInput={...speedInput,maximum:60};expect(isBrushLibrary(c)).toBe(false)
  d.behavior.speedInput=speedInput;d.tip.animation.mode='pressure';d.tip.animation.rank=2147483647;d.version=91;expect(isBrushLibrary(c)).toBe(true)
 })
 it('rejects parent capture missing or mismatched even if child is valid standalone',()=>{
  for(const sampling of['independent',undefined]as const){const c=library(),parent=c.brushes[0].descriptor,id=c.assets[0].id;const child=structuredClone(parent);child.version=92;child.behavior={version:2,speedInput};child.tip.animation={mode:'velocity',rank:5,frames:[id,id]}
   expect(isBrushLibrary({...c,brushes:[{...c.brushes[0],descriptor:child}]})).toBe(true)
   parent.version=92;parent.behavior={version:2,dual:{brush:child,blendMode:'multiply',sampling}};expect(isBrushLibrary(c)).toBe(false)
   parent.behavior.speedInput={...speedInput,maximum:60};expect(isBrushLibrary(c)).toBe(false)
   parent.behavior.speedInput=speedInput;expect(isBrushLibrary(c)).toBe(true)
   parent.version=91;expect(isBrushLibrary(c)).toBe(false);parent.version=92
   child.behavior.speedInput={...speedInput,maximum:60};expect(isBrushLibrary(c)).toBe(false)
  }
 })
 it('requires captured speed on every batch input and endpoint, including child-only requests',()=>{
  const c=library(),d=c.brushes[0].descriptor;d.version=92;d.behavior={version:2,speedInput};d.tip.animation={mode:'velocity',rank:5,frames:[c.assets[0].id,c.assets[0].id]}
  const input:Dab={x:1,y:2,pressure:1,normalizedSpeed:0,tiltX:0,tiltY:0,size:10,aspectRatio:1,angle:0,opacity:1,t:0}
  expect(hasBrushSourceInputs(d,[input],input)).toBe(true);expect(hasBrushSourceInputs(d,[])).toBe(true)
  for(const speed of[undefined,NaN,Infinity,-.01,1.01]){const bad={...input,normalizedSpeed:speed};expect(hasBrushSourceInputs(d,[input,bad])).toBe(false);expect(hasBrushSourceInputs(d,[],bad)).toBe(false)}
  const child=structuredClone(d);d.tip.animation=undefined;d.behavior.dual={brush:child,blendMode:'multiply',sampling:'independent'};expect(hasBrushSourceInputs(d,[{...input,normalizedSpeed:undefined}])).toBe(false)
  delete d.behavior.dual;expect(hasBrushSourceInputs(d,[{...input,normalizedSpeed:undefined}])).toBe(true)
 })
})
