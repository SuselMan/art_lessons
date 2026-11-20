import{describe,expect,it}from'vitest'
import{isBrushLibrary,type BrushLibrary}from'./brushes.js'
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

describe('revision91 pipe selector admission',()=>{
  it('gates new modes and pressure-only declared rank without weakening legacy shape',()=>{
    const c=library(),d=c.brushes[0].descriptor,id=c.assets[0].id
    d.version=91;d.tip.animation={mode:'pressure',rank:257,frames:[id,id]}
    expect(isBrushLibrary(c)).toBe(true)
    for(const rank of [1,5,2147483647]){d.tip.animation.rank=rank;expect(isBrushLibrary(c)).toBe(true)}
    for(const rank of [undefined,0,-1,1.5,2147483648,NaN,Infinity]){d.tip.animation.rank=rank;expect(isBrushLibrary(c)).toBe(false)}
    d.tip.animation.rank=257;d.version=90;expect(isBrushLibrary(c)).toBe(false);d.version=91
    for(const mode of ['random','incremental','constant']as const){d.tip.animation.mode=mode;expect(isBrushLibrary(c)).toBe(false);delete d.tip.animation.rank;expect(isBrushLibrary(c)).toBe(true);d.tip.animation.rank=5}
    delete d.tip.animation.rank;d.tip.animation.mode='constant';d.version=90;expect(isBrushLibrary(c)).toBe(false)
  })
})
