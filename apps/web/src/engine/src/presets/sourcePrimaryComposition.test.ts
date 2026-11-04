import {canonicalSourceMaterialContext,canonicalSourceStrokeSnapshotV2,decodeCanonicalRecordedSnapshotFrameV8,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B} from '@grafetto/shared'
import {buildCanonicalMaterial,canonicalPrimaryTexturePin,type CanonicalMaterialContextV3} from '@grafetto/shared'
import { describe, expect, it } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE as profile, packCanonicalMaterial, unpackCanonicalMaterial,
  type CanonicalMaterialContext, type CanonicalMaterialFrame, type CanonicalMaterialEntry } from '@grafetto/shared'
import { advanceSourcePrimaryComposition as advance, sealSourcePrimaryComposition as seal, createSourcePrimaryComposition as create,
  type SourcePrimaryCompositionContext, type SourcePrimaryCompositionState } from './sourcePrimaryComposition'
import { sourceBlendAverageOpacity } from './brushWash'
import { normalizeSourcePainterOpacity } from './sourcePainterOpacity'
const asset = 'asset:' + '1'.repeat(64)
const codec: CanonicalMaterialContext = { assets: [{ id: asset, size: 1, x: 0, y: 0, width: 1, height: 1 }], primaryAsset: asset,
  budget: { workUnits: 100, outputBytes: 100, drawPixels: 100 }, preflightDefinition: () => ({ workUnits: 1, outputBytes: 1 }) }
const recipe = { asset, brushScale: 1, brushAngle: 0, scale: 1, ratio: 1, rotation: 0, subX: 0, subY: 0,
  width: 1, height: 1, mirrorH: false, mirrorV: false }
const wash: SourcePrimaryCompositionContext = { mode: 'wash', alphaDarken: 'creamy', outerResourceOpacity: .27, outerBlend: 'over' }
function frame(opacities: number[], entry: CanonicalMaterialEntry, fences: CanonicalMaterialFrame['fences'], flow = .4): CanonicalMaterialFrame {
  const f: CanonicalMaterialFrame = { profile, masked: false, entry, definitions: opacities.length ? [recipe] : [],
    draws: opacities.map((opacity, x) => ({ definition: 0, role: 'primary', x, y: 0, opacity, flow })), fences }
  return unpackCanonicalMaterial(packCanonicalMaterial(f, codec), codec)
}
const begin = { kind: 'segmentBegin' as const, at: 0, group: 0 }
const finish = (at: number) => [{ kind: 'primaryEnd' as const, at, group: 0 }, { kind: 'segmentEnd' as const, at, group: 0 }]
const end = (at: number) => ({ kind: 'gestureEnd' as const, at })
const whole = (values: number[]) => frame(values, { phase: 'between' }, [begin, ...finish(values.length), end(values.length)])
const step = (s: SourcePrimaryCompositionState, f: CanonicalMaterialFrame) => advance(s, { ordinal: s.nextFrameOrdinal, frame: f })

describe('decoded single-primary composition session (no renderer activation)', () => {
  it('creates one fresh wash target, previews against fixed original, commits once on empty tail', () => {
    const initial = create(wash)
    expect(initial.commands).toEqual([{ kind: 'beginWash', target: 'freshTransparentStroke' }])
    const first = step(initial.state, frame([.8], { phase: 'between' }, [begin, ...finish(1)]))
    expect(first.commands).toEqual([{ kind: 'presentWash', source: 'stroke', destination: 'originalLayer', originalLayer: 'preStrokeSnapshot', opacity: .27, blend: 'over' }])
    const tail = step(first.state, frame([], { phase: 'between' }, [end(0)]))
    expect(tail.draws).toEqual([]); expect(tail.state.drawCount).toBe(1)
    expect(tail.state.averageQreal).toBe(first.state.averageQreal)
    expect(tail.commands[0]?.kind).toBe('commitWash'); expect(tail.state.ended).toBe(true)
    expect(() => step(tail.state, frame([], { phase: 'between' }, [end(0)]))).toThrow()
  })
  it('preserves qreal history and normalized controls through JSON resume and arbitrary frame splits', () => {
    const values = [.934567891234, .12345678912, 0, .12345679, .9, .1]
    const one = step(create(wash).state, whole(values))
    let s = create(wash).state
    const controls = []
    for (let i = 0; i < values.length; i++) {
      s = JSON.parse(JSON.stringify(s))
      const f = frame([values[i]!], i === 0 ? { phase: 'between' } : { phase: 'primary', group: 0 },
        [...(i === 0 ? [begin] : []), ...(i === values.length - 1 ? [...finish(1), end(1)] : [])])
      const r = step(s, f); controls.push(r.draws[0]!.controls); s = r.state
    }
    expect(controls).toEqual(one.draws.map(d => d.controls))
    expect(s.averageQreal).toBe(one.state.averageQreal)
    expect(s.drawCount).toBe(values.length)
    let average = 0
    for (const opacity of values) average = sourceBlendAverageOpacity(opacity, average)
    expect(s.averageQreal).toBe(average)
    expect(s.averageQreal).not.toBe(Math.fround(average))
  })
  it('counts zero-valued actual draws, never invents an endpoint dab or resets on source fences', () => {
    const first = step(create(wash).state, frame([1], { phase: 'between' }, [begin, ...finish(1)]))
    const next = frame([0], { phase: 'between' }, [{ kind: 'segmentBegin', at: 0, group: 1 },
      { kind: 'primaryEnd', at: 1, group: 1 }, { kind: 'segmentEnd', at: 1, group: 1 }, end(1)])
    const result = step(first.state, next)
    expect(result.state.averageQreal).toBe(sourceBlendAverageOpacity(0, 1))
    expect(result.draws).toHaveLength(1); expect(result.draws[0]?.drawOrdinal).toBe(1)
    expect(result.state.drawCount).toBe(2)
  })
  it('keeps empty after-primary framing across chunks without masked execution', () => {
    const first = step(create(wash).state, frame([.7], { phase: 'between' }, [begin, { kind: 'primaryEnd', at: 1, group: 0 }]))
    expect(first.state.entry).toEqual({ phase: 'mask', group: 0 })
    const tail = step(first.state, frame([], { phase: 'mask', group: 0 }, [{ kind: 'segmentEnd', at: 0, group: 0 }, end(0)]))
    expect(tail.draws).toHaveLength(0); expect(tail.commands[0]?.kind).toBe('commitWash')
  })
  it('keeps raw F32 controls for hard/creamy: no hard flow fold at session boundary', () => {
    for (const alphaDarken of ['hard', 'creamy'] as const) {
      const result = step(create({ ...wash, alphaDarken }).state, whole([.8, .2]))
      const average = sourceBlendAverageOpacity(.2, .8)
      expect(result.draws[1]!.controls).toEqual({ kind: 'localAlphaDarken', variant: alphaDarken,
        ...normalizeSourcePainterOpacity({ opacity: .2, averageOpacity: average, flow: .4 }) })
    }
  })
  it('retains Qt average aliasing after F32 narrowing without narrowing qreal history', () => {
    const result = step(create(wash).state, whole([.50000001, .5]))
    const p = result.draws[1]!.controls
    expect(p.kind).toBe('localAlphaDarken')
    if (p.kind !== 'localAlphaDarken') throw Error('wrong path')
    expect(p.averageAliased).toBe(true); expect(p.averageOpacity).toBe(p.opacity)
    expect(result.state.averageQreal).toBeGreaterThan(.5)
  })
  it('direct Over exposes opacity only, never flow or another outer opacity application', () => {
    const initial = create({ ...wash, mode: 'buildup' })
    expect(initial.commands).toEqual([])
    const result = step(initial.state, whole([.8, .2]))
    expect(result.draws.map(d => d.controls)).toEqual([.8, .2].map(opacity => ({ kind: 'directOver', opacity: Math.fround(opacity) })))
    expect(result.commands).toEqual([])
  })
  it('rejects duplicate/gapped packet ordinals, entry mismatch and regressing groups atomically', () => {
    const initial = create(wash).state
    const first = step(initial, frame([.8], { phase: 'between' }, [begin, ...finish(1)]))
    const snapshot = JSON.stringify(first.state)
    for (const ordinal of [0, 2, NaN]) expect(() => advance(first.state, { ordinal, frame: whole([.2]) })).toThrow()
    expect(() => step(first.state, frame([.2], { phase: 'primary', group: 0 }, []))).toThrow()
    expect(() => step(first.state, whole([.2]))).toThrow()
    expect(JSON.stringify(first.state)).toBe(snapshot)
    expect(initial.drawCount).toBe(0)
  })
  it('requires every input group including empty inputs, starting at zero without gaps', () => {
    const initial = create(wash).state
    const arbitrary = frame([], { phase: 'between' }, [{ kind: 'segmentBegin', at: 0, group: 7 },
      { kind: 'primaryEnd', at: 0, group: 7 }, { kind: 'segmentEnd', at: 0, group: 7 }])
    expect(() => step(initial, arbitrary)).toThrow()
    const empty = frame([], { phase: 'between' }, [begin, ...finish(0)])
    const first = step(initial, empty)
    expect(first.state.lastGroup).toBe(0); expect(first.draws).toEqual([]); expect(first.commands).toEqual([])
    const missing = frame([], { phase: 'between' }, [{ kind: 'segmentBegin', at: 0, group: 2 },
      { kind: 'primaryEnd', at: 0, group: 2 }, { kind: 'segmentEnd', at: 0, group: 2 }])
    expect(() => step(first.state, missing)).toThrow()
    const resumed: SourcePrimaryCompositionState = JSON.parse(JSON.stringify(first.state))
    const next = frame([], { phase: 'between' }, [{ kind: 'segmentBegin', at: 0, group: 1 },
      { kind: 'primaryEnd', at: 0, group: 1 }, { kind: 'segmentEnd', at: 0, group: 1 }, end(0)])
    const final = step(resumed, next)
    expect(final.state.lastGroup).toBe(1); expect(final.state.drawCount).toBe(0)
    expect(final.commands[0]?.kind).toBe('commitWash')
    expect(first.state.lastGroup).toBe(0)
  })
  it('rejects a late bad fence without changing previously consumed source state', () => {
    const s = create(wash).state, f = whole([.8, .2])
    const bad = { ...f, fences: [...f.fences, end(2)] }
    expect(() => step(s, bad)).toThrow(); expect(s.averageQreal).toBe(0); expect(s.drawCount).toBe(0)
    expect(step(s, f).draws).toHaveLength(2)
  })
  it('rejects unsupported policy, malformed checkpoint, mask and masked frames', () => {
    for (const patch of [{ mode: 'other' }, { alphaDarken: 'other' }, { outerBlend: 'unknown-blend' }, { outerResourceOpacity: NaN }]) {
      expect(() => create({ ...wash, ...patch } as SourcePrimaryCompositionContext)).toThrow()
    }
    const initial = create(wash).state
    for (const patch of [{ version: 2 }, { averageQreal: NaN }, { drawCount: -1 }, { nextFrameOrdinal: .5 }, { entry: { phase: 'primary', group: 3 } }]) {
      expect(() => step({ ...initial, ...patch } as SourcePrimaryCompositionState, whole([.8]))).toThrow()
    }
    expect(() => step(initial, { ...whole([.8]), masked: true })).toThrow()
    const f = whole([.8])
    expect(() => step(initial, { ...f, draws: [{ ...f.draws[0]!, role: 'mask' }] })).toThrow()
  })
  it('copies and freezes context/state/outputs so later caller changes cannot leak policy', () => {
    const c = { ...wash }, initial = create(c)
    c.outerResourceOpacity = .9
    expect(initial.state.context.outerResourceOpacity).toBe(.27)
    expect(Object.isFrozen(initial.state.context)).toBe(true)
    const result = step(initial.state, whole([.8]))
    expect(result.commands[0]).toMatchObject({ opacity: .27 })
    expect(Object.isFrozen(result.draws[0]!.controls)).toBe(true)
    expect(Object.isFrozen(result.state.entry)).toBe(true)
  })
})

for(const outerBlend of ['multiply','lighten','colorDodge','overlay'] as const) it(`carries ${outerBlend} through wash previews and terminal commit without changing deposition history`,()=>{
 const original=whole([.8,.2]), initial=create({...wash,outerBlend})
 const preview=step(initial.state,frame([.8],{phase:'between'},[begin,...finish(1)]))
 const commit=step(preview.state,frame([],{phase:'between'},[end(0)]))
 expect(preview.commands[0]).toMatchObject({kind:'presentWash',blend:outerBlend,opacity:.27})
 expect(commit.commands[0]).toMatchObject({kind:'commitWash',blend:outerBlend,opacity:.27})
 expect(step(initial.state,original).draws).toEqual(step(create(wash).state,original).draws)
 const direct=create({...wash,mode:'buildup',outerBlend}),paint=step(direct.state,original)
 expect(direct.commands).toEqual([]);expect(paint.commands).toEqual([])
 expect(paint.draws.map(d=>d.controls)).toEqual([.8,.2].map(opacity=>({kind:'directBlend',blend:outerBlend,opacity:Math.fround(opacity)})))
 expect(paint.state.ended).toBe(true)
})


describe('explicit recorded metadata closure (pure state only, no renderer authority)',()=>{
 it.each(['primary','mask','between'] as const)('closes %s without inventing an authored frame or draw',phase=>{
  const fences=[begin,...phase==='primary'?[]:phase==='mask'?[{kind:'primaryEnd' as const,at:1,group:0}]:finish(1)]
  const open=step(create(wash).state,frame([.8],{phase:'between'},fences)).state
  const result=seal(open,open.nextFrameOrdinal)
  expect(result.state).toEqual({...open,entry:{phase:'between'},ended:true})
  expect(open.ended).toBe(false);expect(open.entry.phase).toBe(phase)
  expect(result.draws).toEqual([])
  expect(result.commands).toEqual([{kind:'commitWash',source:'stroke',destination:'originalLayer',originalLayer:'preStrokeSnapshot',opacity:.27,blend:'over'}])
  expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.state.entry)).toBe(true)
  expect(()=>seal(result.state,result.state.nextFrameOrdinal)).toThrow()
 })
 it('rejects a begin-only session, mismatched recorded count and invalid state without advancing the prefix',()=>{
  const initial=create(wash).state
  expect(()=>seal(initial,0)).toThrow();expect(()=>seal(initial,1)).toThrow()
  const open=step(initial,frame([.5],{phase:'between'},[begin])).state
  for(const n of [0,2,NaN,Infinity,1.5])expect(()=>seal(open,n)).toThrow()
  expect(()=>seal({...open,averageQreal:2},1)).toThrow()
  expect(open.nextFrameOrdinal).toBe(1);expect(open.ended).toBe(false)
 })
 it('preserves an empty recorded prefix and emits no pigment command for buildup',()=>{
  const buildup={...wash,mode:'buildup' as const}
  const open=step(create(buildup).state,frame([],{phase:'between'},[])).state
  const result=seal(open,1)
  expect(result.state.nextFrameOrdinal).toBe(1);expect(result.state.drawCount).toBe(0)
  expect(result.state.averageQreal).toBe(0);expect(result.state.lastGroup).toBe(-1)
  expect(result.state.ended).toBe(true);expect(result.commands).toEqual([])
 })
})

it('accepts actual decoded V3 in the same phase2/ordinal state machine and refuses invalid grain',()=>{
 const primary={id:asset,size:1,x:0,y:0,width:1,height:1},pattern={...primary,id:'asset:'+'2'.repeat(64)}
 const c:CanonicalMaterialContextV3={version:3,assets:[primary,pattern],primarySource:{kind:'image',asset,brushScale:1,brushAngle:0},
  primaryTexture:canonicalPrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:1,height:1,periodX:1,periodY:1,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},pattern),budget:{workUnits:1000,outputBytes:1000,drawPixels:1000}}
 const first=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:{...recipe,kind:'image'},role:'primary',x:0,y:0,opacity:.7,flow:.4,grainDepth:-0}],fences:[begin,finish(1)[0]]},c).frame
 const result=advance(create(wash).state,{ordinal:0,frame:first})
 expect(result.state.entry).toEqual({phase:'mask',group:0});expect(result.draws[0].frameDrawIndex).toBe(0)
 const tail=buildCanonicalMaterial({masked:false,entry:{phase:'mask',group:0},draws:[],fences:[{kind:'segmentEnd',group:0,at:0},end(0)]},c).frame
 expect(advance(result.state,{ordinal:1,frame:tail}).state.ended).toBe(true)
 for(const grainDepth of [NaN,Infinity,-.01,1.01]){
  const malformed={...first,draws:[{...first.draws[0],grainDepth}]}
  expect(()=>advance(create(wash).state,{ordinal:0,frame:malformed})).toThrow()
 }
})

it('folds an original READ SOURCE2 direct-law frame into per-dab blend controls without wash publication',()=>{
 const material=canonicalSourceMaterialContext({version:2,outerCompositionLaw:'pixel-direct-composite-browser-v1',assets:[{id:asset,size:1,x:0,y:0,width:1,height:1}],primarySource:{kind:'image',asset,brushScale:1,brushAngle:0},budget:{workUnits:1000,outputBytes:1000,drawPixels:1000}})
 const composition={...wash,mode:'buildup' as const,outerBlend:'screen' as const},built=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:{...recipe,kind:'image'},role:'primary',x:0,y:0,opacity:.8,flow:.4}],fences:[begin,...finish(1),end(1)]},material)
 const snapshot=canonicalSourceStrokeSnapshotV2({layerId:'layer',brush:'brush:fixture@1',strokeId:'direct-read',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:B,pigmentRgb8:[31,79,151],composition,assets:material.assets,materialVersion:2,material},2,B)
 const accepted=decodeCanonicalRecordedSnapshotFrameV8({version:2,rasterProfile:B,brush:snapshot.brush,strokeId:snapshot.strokeId,frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition,materialPacked:built.packed},snapshot,0)
 const initial=create(snapshot.composition),result=advance(initial.state,{ordinal:0,frame:accepted.frame})
 expect(initial.commands).toEqual([]);expect(result.commands).toEqual([])
 expect(result.draws[0].controls).toEqual({kind:'directBlend',blend:'screen',opacity:Math.fround(.8)})
 expect(result.state.ended).toBe(true);expect(result.state.drawCount).toBe(1)
})

it('retains all new channel blends in direct recorded control flow and both masked roles',()=>{
 const modes=['equivalence','additiveSubtractive','arcTangent','negation','inverseSubtract','grainMerge','grainExtract','allanon','geometricMean','parallel','reflect','glow','freeze','heat','glowHeat','heatGlow','reflectFreeze','freezeReflect','heatGlowFreezeReflectHybrid'] as const
 for(const blend of modes)for(const masked of [false,true]){
  const composition={...wash,mode:'buildup' as const,outerBlend:blend}
  const material=canonicalSourceMaterialContext({version:2,outerCompositionLaw:'pixel-direct-composite-browser-v1',assets:[{id:asset,size:1,x:0,y:0,width:1,height:1}],primarySource:{kind:'image',asset,brushScale:1,brushAngle:0},...masked?{maskSource:{kind:'image',asset,brushScale:1,brushAngle:0},maskingBlend:'multiply'}:{},budget:{workUnits:10000,outputBytes:10000,drawPixels:10000}})
  const draws=[{recipe:{...recipe,kind:'image' as const},role:'primary' as const,x:0,y:0,opacity:.8,flow:.4},...masked?[{recipe:{...recipe,kind:'image' as const},role:'mask' as const,x:0,y:0,opacity:.5,flow:.7}]:[]]
  const built=buildCanonicalMaterial({masked,entry:{phase:'between'},draws,fences:[begin,{kind:'primaryEnd',group:0,at:1},{kind:'segmentEnd',group:0,at:draws.length},end(draws.length)]},material)
  const result=advance(create(composition).state,{ordinal:0,frame:built.frame,masked})
  expect(result.draws.map(d=>d.role)).toEqual(masked?['primary','mask']:['primary'])
  expect(result.draws.every(d=>d.controls.kind==='directBlend'&&d.controls.blend===blend)).toBe(true)
  expect(result.state.ended).toBe(true);expect(result.segments).toHaveLength(masked?1:0)
 }
})
