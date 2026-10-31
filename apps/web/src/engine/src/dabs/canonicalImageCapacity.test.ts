import { describe, expect, it } from 'vitest'
import { sourceImageTransformMetadata, sourcePngRasterShape } from '@grafetto/shared'
import { canonicalImageMaskCapacity, assertCanonicalImageRecipeCapacity } from './canonicalImageCapacity'

const asset = { id: `asset:${'b'.repeat(64)}`, size: 256, x: 53, y: 53, width: 150, height: 150 }
const source = { kind: 'image' as const, asset: asset.id, brushScale: .05, brushAngle: 0 }
function recipe(scale: number, rotation: number, subX: number, subY: number) {
  const m = sourceImageTransformMetadata(asset.width, asset.height,
    sourcePngRasterShape({ width: asset.width, height: asset.height, scale: source.brushScale, angle: source.brushAngle },
      { scale, ratio: 1, rotation }), subX, subY)
  return { asset: asset.id, brushScale: source.brushScale, brushAngle: source.brushAngle,
    scale, ratio: 1, rotation, subX, subY, mirrorH: false, mirrorV: false, width: m.width, height: m.height }
}
describe('original image crop workspace admission', () => {
  it('bounds the Basic6 original crop across pressure, drawing angle and phase without changing geometry', () => {
    const capacity = canonicalImageMaskCapacity(source, asset)
    expect(capacity.slots).toBe(1)
    expect(capacity.width).toBeLessThan(asset.size)
    for (const scale of [.0001, .05, .5, 1]) for (const angle of [-Math.PI, 0, Math.PI / 4, 6.28319])
      for (const phase of [0, .5, 1 - Number.EPSILON]) {
        const r = recipe(scale, angle, phase, phase)
        expect(() => assertCanonicalImageRecipeCapacity(r, source, asset, capacity)).not.toThrow()
      }
  })
  it('does not turn workspace capacity into permission for mismatched source or recipe geometry', () => {
    const c = canonicalImageMaskCapacity(source, asset), r = recipe(1, 0, 0, 0)
    for (const bad of [{ ...r, brushScale: .06 }, { ...r, brushAngle: -0 }, { ...r, scale: 1.01 },
      { ...r, ratio: .5 }, { ...r, mirrorH: true }, { ...r, width: r.width + 1 }, { ...r, asset: `asset:${'c'.repeat(64)}` }])
      expect(() => assertCanonicalImageRecipeCapacity(bad, source, asset, c)).toThrow()
    expect(() => assertCanonicalImageRecipeCapacity(r, source, asset, { ...c, width: 1 })).toThrow()
  })
  it('rejects invalid original pin before planning and refuses a workspace over the existing budget', () => {
    expect(() => canonicalImageMaskCapacity(source, { ...asset, x: 200 })).toThrow()
    expect(() => canonicalImageMaskCapacity({ ...source, brushAngle: -0 }, asset)).toThrow()
    expect(() => canonicalImageMaskCapacity({ ...source, brushScale: 1000 }, asset)).toThrow()
  })
})
it('keeps exact allocation admission at pyramid-selection, fuzzy identity and near-integer phase boundaries',()=>{
  for(const [width,height]of [[3,5],[150,150]] as const)
    for(const brushScale of [.5-1e-6,.5,.5+1e-6,1-5e-13,1,1+5e-13]){
      const a={...asset,x:0,y:0,width,height},s={...source,brushScale},capacity=canonicalImageMaskCapacity(s,a)
      for(const scale of [.5,1-1e-6,1])for(const rotation of [0,1e-12,Math.PI/4,Math.PI])for(const subX of [0,1e-6,1-Number.EPSILON]){
        const m=sourceImageTransformMetadata(width,height,sourcePngRasterShape({width,height,scale:brushScale,angle:0},{scale,ratio:1,rotation}),subX,subX)
        const r={asset:a.id,brushScale,brushAngle:0,scale,ratio:1,rotation,subX,subY:subX,mirrorH:false,mirrorV:false,width:m.width,height:m.height}
        expect(()=>assertCanonicalImageRecipeCapacity(r,s,a,capacity)).not.toThrow()
      }
    }
})
