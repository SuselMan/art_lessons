import { describe, expect, it } from 'vitest'
import { sourceImageTransformMetadata, sourcePngRasterShape, sourcePngPyramid, sourcePngSelectLevel } from '@grafetto/shared'
import { canonicalImageMaskCapacity, assertCanonicalImageRecipeCapacity, canonicalImageRequiredSourceLevels } from './canonicalImageCapacity'

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
it('admits the whole pinned frame union and checks each selected recipe against its exact original crop',()=>{
 const a={...asset,x:0,y:0,width:17,height:31},b={...asset,id:'asset:'+'c'.repeat(64),x:4,y:8,width:201,height:111},frames=[a.id,b.id,a.id],s={...source,brushScale:1.40625,brushAngle:.371,frames}
 const capacity=canonicalImageMaskCapacity(s,[a,b])
 const individual=[a,b].map(frame=>canonicalImageMaskCapacity({...source,asset:frame.id,brushScale:s.brushScale,brushAngle:s.brushAngle},frame))
 expect(capacity.width).toBe(Math.max(...individual.map(c=>c.width)));expect(capacity.height).toBe(capacity.width)
 for(const selected of [a,b])for(const scale of [.0001,.5,1])for(const rotation of [-3.1,0,.7,6.28319]){
  const m=sourceImageTransformMetadata(selected.width,selected.height,sourcePngRasterShape({width:selected.width,height:selected.height,scale:s.brushScale,angle:s.brushAngle},{scale,ratio:1,rotation}),.999,.123)
  const r={asset:selected.id,brushScale:s.brushScale,brushAngle:s.brushAngle,scale,ratio:1,rotation,subX:.999,subY:.123,mirrorH:false,mirrorV:false,width:m.width,height:m.height}
  expect(()=>assertCanonicalImageRecipeCapacity(r,s,[a,b],capacity)).not.toThrow()
  expect(()=>assertCanonicalImageRecipeCapacity({...r,asset:'asset:'+'d'.repeat(64)},s,[a,b],capacity)).toThrow()
  expect(()=>assertCanonicalImageRecipeCapacity({...r,width:r.width+1},s,[a,b],capacity)).toThrow()
 }
 expect(()=>canonicalImageMaskCapacity(s,[a])).toThrow()
 expect(()=>canonicalImageMaskCapacity(s,[a,b,{...b,x:5}])).toThrow()
})
it('keeps single-source geometry unchanged and does not reinterpret the same ID/crop across separate contexts',()=>{
 const first=canonicalImageMaskCapacity(source,asset)
 expect(canonicalImageMaskCapacity(source,[asset])).toEqual(first)
 const other={...asset,x:1,y:1,width:200,height:230},second=canonicalImageMaskCapacity(source,[other])
 expect(second.width).toBeGreaterThan(first.width)
})


it('plans exact original suffixes for native Basic6, Graphite7frames and Mountains4frames',()=>{
 const rows=[{width:150,scale:.05,frames:1,first:5,last:9,bytes:816},{width:128,scale:.125,frames:7,first:5,last:10,bytes:13832},{width:256,scale:1.40625,frames:4,first:0,last:10,bytes:5658656}]
 for(const row of rows){
  const assets=Array.from({length:row.frames},(_,i)=>({id:'asset:'+i.toString(16).repeat(64),size:256,x:0,y:0,width:row.width,height:row.width})),pin={kind:'image' as const,asset:assets[0].id,brushScale:row.scale,brushAngle:0,...row.frames>1?{frames:assets.map(a=>a.id)}:{}}
  const before=JSON.stringify([pin,assets]),requirements=canonicalImageRequiredSourceLevels(pin,assets)
  expect(Object.isFrozen(requirements)).toBe(true);expect(requirements).toHaveLength(row.frames)
  let bytes=0
  for(const [i,required]of requirements.entries()){
   expect(required.asset).toEqual(assets[i]);expect(required.indexes).toEqual(Array.from({length:row.last-row.first+1},(_,j)=>row.first+j));expect(Object.isFrozen(required)).toBe(true);expect(Object.isFrozen(required.asset)).toBe(true);expect(Object.isFrozen(required.indexes)).toBe(true)
   for(const index of required.indexes){const level=sourcePngPyramid(row.width,row.width).levels[index];bytes+=level.storedWidth*level.storedHeight*4}
  }
  expect(bytes).toBe(row.bytes);expect(JSON.stringify([pin,assets])).toBe(before)
 }
})
it('covers the entire accepted scale interval including selector epsilon boundaries and non-square crops',()=>{
 const scales=[Number.MIN_VALUE,1e-12,.0001,.1,.5,1-Number.EPSILON,1]
 for(const [width,height]of [[150,150],[17,31],[1,1],[256,256]] as const){
  const a={...asset,x:0,y:0,width,height},pyramid=sourcePngPyramid(width,height)
  for(const brushScale of [Number.MIN_VALUE,.5-1e-6-Number.EPSILON,.5-1e-6,.5,.5+1e-6,.5+1e-6+Number.EPSILON,1,1.40625,8,1e6]){
   const pin={...source,brushScale},requirements=canonicalImageRequiredSourceLevels(pin,a),indexes=requirements[0].indexes
   expect(indexes[0]).toBe(sourcePngSelectLevel(pyramid,brushScale))
   for(const scale of scales)expect(indexes).toContain(sourcePngSelectLevel(pyramid,scale*brushScale))
  }
 }
})
it('rejects malformed original pin/crop before planning and never weakens the existing recipe scale guard',()=>{
 for(const [pin,a]of [[{...source,brushScale:0},asset],[{...source,brushAngle:-0},asset],[source,{...asset,x:200}]] as const)expect(()=>canonicalImageRequiredSourceLevels(pin,a)).toThrow()
 const requirements=canonicalImageRequiredSourceLevels(source,asset),r=recipe(1.01,0,0,0)
 expect(requirements[0].indexes[0]).toBe(5)
 expect(()=>assertCanonicalImageRecipeCapacity(r,source,asset,canonicalImageMaskCapacity(source,asset))).toThrow('admitted source')
})
