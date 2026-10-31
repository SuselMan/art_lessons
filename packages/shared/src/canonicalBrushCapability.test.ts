import {canonicalSourceComposition,canonicalSourceEffectReject,extractCanonicalIncrementalImagePipeCapability,extractCanonicalRandomImagePipeCapability} from './canonicalBrushCapability.js'
import {CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import { describe, expect, it } from 'vitest'
import type { BrushDescriptor } from './brushes.js'
import type { SourceStampData } from './sourceStampData.js'
import { SOURCE_STAMP_OPTIONS, SOURCE_STAMP_COMPILER_PROFILE } from './sourceStampData.js'
import { extractCanonicalSinglePngCapability, hasCanonicalSourceCurvePrograms, sourceStampPaintingMode } from './canonicalBrushCapability.js'
const asset = { id: `asset:${'a'.repeat(64)}` as const, size: 8 }
function descriptor(): BrushDescriptor {
  const curve = { text: '0,0;1,1;', points: [{ x: 0, y: 0, corner: false }, { x: 1, y: 1, corner: false }] }
  const data: SourceStampData = { version: 1, reader: 'krita-bd6e8d0-v1', role: 'primary', settings: { PaintOpAction: '2' },
    brush: { width: 3, height: 5, scale: .7, angle: .25 }, spacing: { value: .375, automatic: false, coefficient: 1, isotropic: false },
    timing: { enabled: false, rate: 20, ignoreDistance: false }, flags: { scatterX: true, scatterY: true, mirrorX: false, mirrorY: false, indirectPainting: true, materialFixed1: true, textureEnabled: false },
    precision: { level: 5, automatic: false }, unsupported: [], options: SOURCE_STAMP_OPTIONS.map(id => ({ id, checkable: true,
      checked: true, useCurve: true, useSameCurve: true, curveMode: 0, commonCurve: curve, strength: 1, min: 0, max: 1,
      sensors: [{ id: 'pressure', sourceId: 'pressure', sourceSlot: 0, curve }] })) }
  return { id: 'imported-test', version: 1, model: 'stamp', category: 'paint', tip: { kind: 'bitmap', mask: asset.id,
    imageSampling: { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 1, y: 2, width: 3, height: 5 } }, hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
    paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'stamp', pressureSmoothingPx: 0, opacity: 1,
    sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]], sourceStamp: data }
}
describe('shared single PNG execution material class, no permission or author execution', () => {
  it('keeps new tagged image v2 and legacy image v1 capabilities identical', () => {
    const d = descriptor(), legacy = extractCanonicalSinglePngCapability(d, asset)
    Object.assign(d, { sourceStamp: { ...d.sourceStamp!, version: 2, source: { kind: 'image' } } })
    expect(extractCanonicalSinglePngCapability(d, asset)).toEqual(legacy)
    Object.assign(d.sourceStamp!, { version: 1 })
    expect(extractCanonicalSinglePngCapability(d, asset).supported).toBe(false)
  })
  it('copies exact source CAS crop, static geometry and native saved painting mode without mutating descriptors', () => {
    const d = descriptor(), before = structuredClone(d), result = extractCanonicalSinglePngCapability(d, asset)
    expect(result).toEqual({ supported: true, capability: { kind: 'single-inverse-gray-png-v1', brushId: d.id, brushVersion: 1,
      brushScale: .7, brushAngle: .25, asset: { ...asset, x: 1, y: 2, width: 3, height: 5 }, mode: 'wash' } })
    expect(d).toEqual(before)
    expect(Object.isFrozen(result.supported && result.capability.asset)).toBe(true)
    const missing = structuredClone(d)
    const data = missing.sourceStamp!
    delete (data.settings as Record<string, string>).PaintOpAction
    Object.assign(data.flags, { indirectPainting: false })
    expect(extractCanonicalSinglePngCapability(missing, asset)).toMatchObject({ supported: true, capability: { mode: 'buildup' } })
    Object.assign(data.settings, { PaintOpAction: '1' })
    expect(extractCanonicalSinglePngCapability(missing, asset).supported).toBe(true)
  })
  it('does not turn sourceStamp presence into support for other materials, grids or inconsistent source readers', () => {
    const edits: ((d: BrushDescriptor) => void)[] = [d => { delete d.tip.imageSampling }, d => { d.tip.material = { kind: 'lightness', gray: asset.id, strength: 1 } },
      d => { d.tip.mask = `asset:${'b'.repeat(64)}` }, d => { d.tip.imageSampling!.sourceRect.width = 4 },
      d => { d.tip.imageSampling!.sourceRect.y = 7 }, d => { Object.assign(d.sourceStamp!.flags, { textureEnabled: true }) },
      d => { Object.assign(d.sourceStamp!, { role: 'mask' }) }, d => { Object.assign(d.sourceStamp!.settings, { PaintOpAction: 'NaN' }) },
      d => { Object.assign(d.sourceStamp!.flags, { indirectPainting: false }) }, d => { Object.assign(d.sourceStamp!, { unsupported: ['unknown-policy'] }) }]
    for (const edit of edits) { const d = descriptor(); edit(d); expect(extractCanonicalSinglePngCapability(d, asset).supported).toBe(false) }
    expect(extractCanonicalSinglePngCapability(descriptor(), { ...asset, size: 4 }).supported).toBe(false)
  })
  it('distinguishes local compiler availability from retained server-ready coefficient data', () => {
    const d = descriptor(), data = d.sourceStamp!
    expect(hasCanonicalSourceCurvePrograms(data)).toBe(true)
    const curve = { text: '0,0;1,0.5;', points: [{ x: 0, y: 0, corner: false }, { x: 1, y: .5, corner: false }] }
    Object.assign(data.options[0], { commonCurve: curve, sensors: [{ id: 'pressure', sourceId: 'pressure', sourceSlot: 0, curve }] })
    expect(extractCanonicalSinglePngCapability(d, asset).supported).toBe(true)
    expect(hasCanonicalSourceCurvePrograms(data)).toBe(false)
    Object.assign(data, { compiled: { version: 1, reader: data.reader, profile: SOURCE_STAMP_COMPILER_PROFILE,
      curves: [{ source: curve, coefficients: [[0, 0, .5, 0]] }] } })
    expect(extractCanonicalSinglePngCapability(d, asset).supported).toBe(true)
    expect(hasCanonicalSourceCurvePrograms(data)).toBe(true)
  })
})

it('uses one saved PaintOpAction law: absent is incremental and inconsistent flags never confer a mode',()=>{
 const data=descriptor().sourceStamp!
 for(const [action,flag,expected]of [[undefined,false,'buildup'],['1',false,'buildup'],['2',true,'wash'],['0',true,'wash'],['+01',false,'buildup'],['1.0',false,undefined],['bad',true,undefined],['1',true,undefined],[undefined,true,undefined],['9007199254740992',true,undefined]] as const){
  const settings={...data.settings};if(action===undefined)delete settings.PaintOpAction;else settings.PaintOpAction=action
  expect(sourceStampPaintingMode({...data,settings,flags:{...data.flags,indirectPainting:flag}})).toBe(expected)
 }
})

it.each(['multiply','lighten','colorDodge','overlay'] as const)('selects native %s only for explicitly requested V2 wash',blendMode=>{
 const d=descriptor();Object.assign(d,{behavior:{rendering:{blendMode}}})
 expect(canonicalSourceComposition(d)).toBeUndefined()
 expect(canonicalSourceComposition(d,CANONICAL_STROKE_RASTER_PROFILE)).toBeUndefined()
 const selected=canonicalSourceComposition(d,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
 expect(selected).toEqual({mode:'wash',outerBlend:blendMode});expect(Object.isFrozen(selected)).toBe(true)
 Object.assign(d.sourceStamp!.settings,{PaintOpAction:'1'});Object.assign(d.sourceStamp!.flags,{indirectPainting:false})
 expect(canonicalSourceComposition(d,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toBeUndefined()
})
it('keeps unsupported native effects/color and malformed/unknown profile outside the composition selector',()=>{
 for(const behavior of [{erase:true,rendering:{blendMode:'normal'}},{rendering:{blendMode:'multiply',wetEdges:.2}},{rendering:{blendMode:'overlay',burntEdges:.1}},{rendering:{blendMode:'color'}},{rendering:{blendMode:'screen'}}]){
  const d=descriptor();Object.assign(d,{behavior});expect(canonicalSourceComposition(d,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toBeUndefined()
 }
 const d=descriptor();Object.defineProperty(d,'sourceStamp',{get(){throw Error('profile must reject before source read')}})
 for(const profile of ['foreign',null])expect(canonicalSourceComposition(d,profile as never)).toBeUndefined()
})


describe('incremental image pipe material support',()=>{
 const second={id:`asset:${'b'.repeat(64)}` as const,size:8}
 const pipe=()=>{const d=descriptor();d.tip.animation={mode:'incremental',frames:[asset.id,second.id,asset.id]};return d}
 it('preserves ordered repeated frames and shares the unchanged image crop/material checks',()=>{
  const d=pipe(),before=structuredClone(d),result=extractCanonicalIncrementalImagePipeCapability(d,[second,asset])
  expect(result.supported).toBe(true)
  if(!result.supported)throw Error('Pipe unavailable')
  expect(result.capability).toEqual({kind:'incremental-inverse-gray-pipe-v1',brushId:d.id,brushVersion:1,assets:[{...asset,x:1,y:2,width:3,height:5},{...second,x:1,y:2,width:3,height:5},{...asset,x:1,y:2,width:3,height:5}],mode:'wash',brushScale:.7,brushAngle:.25})
  expect(Object.isFrozen(result.capability.assets)).toBe(true);expect(result.capability.assets.every(Object.isFrozen)).toBe(true)
  expect(d).toEqual(before);expect(extractCanonicalSinglePngCapability(d,asset).supported).toBe(false)
 })
 it('rejects missing or ambiguous assets, unequal grids, unsupported selection and material consumers',()=>{
  for(const assets of [[asset],[asset,second,second],[asset,{...second,size:16}]])expect(extractCanonicalIncrementalImagePipeCapability(pipe(),assets).supported).toBe(false)
  const edits:((d:BrushDescriptor)=>void)[]=[d=>{d.tip.animation!.mode='random'},d=>{d.tip.animation!.frames=[asset.id]},d=>{d.tip.animation!.frames=Array(257).fill(asset.id)},d=>{d.tip.mask=second.id},d=>{Object.assign(d.sourceStamp!.flags,{textureEnabled:true})},d=>{d.tip.imageSampling!.sourceRect.y=7}]
  for(const edit of edits){const d=pipe();edit(d);expect(extractCanonicalIncrementalImagePipeCapability(d,[asset,second]).supported).toBe(false)}
  expect(extractCanonicalIncrementalImagePipeCapability(descriptor(),[asset,second]).supported).toBe(false)
 })
})

it('distinguishes random image pipe material support without granting selection or changing incremental support',()=>{
 const d=descriptor(),second={id:`asset:${'b'.repeat(64)}` as const,size:8}
 d.tip.animation={mode:'random',frames:[asset.id,second.id]}
 expect(extractCanonicalIncrementalImagePipeCapability(d,[asset,second]).supported).toBe(false)
 const result=extractCanonicalRandomImagePipeCapability(d,[asset,second])
 expect(result).toMatchObject({supported:true,capability:{kind:'random-inverse-gray-pipe-v1',assets:[{id:asset.id},{id:second.id}]}})
 expect(extractCanonicalRandomImagePipeCapability(d,[asset]).supported).toBe(false)
 d.tip.animation.mode='incremental'
 expect(extractCanonicalRandomImagePipeCapability(d,[asset,second]).supported).toBe(false)
 expect(extractCanonicalIncrementalImagePipeCapability(d,[asset,second]).supported).toBe(true)
})

it('shares outer effect rejection between local preparation and server binding without granting room execution',()=>{
 const d=descriptor();expect(canonicalSourceEffectReject(d,CANONICAL_STROKE_RASTER_PROFILE)).toBeUndefined()
 d.tip.alphaThreshold={value:.5,softness:0};expect(canonicalSourceEffectReject(d,CANONICAL_STROKE_RASTER_PROFILE)).toBe('mask-threshold')
 delete d.tip.alphaThreshold;Object.assign(d,{behavior:{rendering:{mode:'buildUp',opacityCeiling:'shape'}}})
 expect(canonicalSourceEffectReject(d,CANONICAL_STROKE_RASTER_PROFILE)).toBe('stroke-rendering-mode')
})
