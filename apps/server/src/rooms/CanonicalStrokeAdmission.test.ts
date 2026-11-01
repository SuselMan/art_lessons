import {verifyCanonicalRecordedPrefix,verifyCanonicalRecordedClose} from '@grafetto/shared'
import {buildCanonicalMaterial,canonicalPrimaryTextureMaterialContext,canonicalMaterialGeometryCost,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,type CanonicalMaterialContextV3} from '@grafetto/shared'
import { describe, expect, it, vi } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE, CANONICAL_STROKE_RASTER_PROFILE, STRAIGHT_ROOM_RASTER_VERSION,
  packCanonicalMaterial, type CanonicalMaterialFrame, type CanonicalStrokeFrameEnvelope } from '@grafetto/shared'
import { CanonicalStrokeAdmission, type TrustedCanonicalGesture, type CanonicalCapabilityResolver } from './CanonicalStrokeAdmission.js'
const identity = { roomId: 'board', userId: 'author' }
function fixture(window = 8, maxGestures = 64) {
  const asset = { id: `asset:${'1'.repeat(64)}`, size: 2, x: 0, y: 0, width: 2, height: 2 }
  const preflight = vi.fn(() => ({ workUnits: 1, outputBytes: 4 }))
  const grant: TrustedCanonicalGesture = { ...identity, layerId: 'layer', boardEpoch: 0, roomRasterVersion: STRAIGHT_ROOM_RASTER_VERSION,
    rasterProfile: CANONICAL_STROKE_RASTER_PROFILE, descriptorSha256: '2'.repeat(64), brush: 'brush:imported-test@1', strokeId: 'gesture',
    pigmentRgb8: [20, 70, 190], composition: { mode: 'wash', alphaDarken: 'creamy', outerResourceOpacity: .7, outerBlend: 'over' },
    material: { assets: [asset], primaryAsset: asset.id, budget: { workUnits: 1000, outputBytes: 1000, drawPixels: 1000 }, preflightDefinition: preflight } }
  const resolve = vi.fn<CanonicalCapabilityResolver>(() => grant)
  const service = new CanonicalStrokeAdmission({ resolve, retainedFrames: window, maxGestures })
  const frame = (ordinal = 0, end = false, entry: CanonicalMaterialFrame['entry'] = ordinal ? { phase: 'primary', group: 0 } : { phase: 'between' }) => {
    const material: CanonicalMaterialFrame = { profile: CANONICAL_MATERIAL_PROFILE, masked: false, entry,
      definitions: [{ asset: asset.id, brushScale: 1, brushAngle: 0, scale: 1, ratio: 1, rotation: 0, subX: 0, subY: 0, width: 2, height: 2, mirrorH: false, mirrorV: false }],
      draws: [{ definition: 0, role: 'primary', x: -3 + ordinal, y: 7, opacity: .4, flow: .7 }],
      fences: [...(entry.phase === 'between' ? [{ kind: 'segmentBegin' as const, at: 0, group: 0 }] : []), ...(end ? [{ kind: 'primaryEnd' as const, at: 1, group: 0 }, { kind: 'segmentEnd' as const, at: 1, group: 0 }, { kind: 'gestureEnd' as const, at: 1 }] : [])] }
    if('version'in grant.material)throw Error('Legacy fixture requires material1')
  const envelope: CanonicalStrokeFrameEnvelope = { version: 1, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE, brush: grant.brush, strokeId: grant.strokeId, frameOrdinal: ordinal,
      pigmentRgb8: grant.pigmentRgb8, composition: grant.composition, materialPacked: packCanonicalMaterial(material, grant.material) }
    return { type: 'canonical_stroke' as const, id: `operation-${ordinal}`, layerId: 'layer', frame: envelope }
  }
  const live = (ordinal = 0, end = false) => { const c = frame(ordinal, end); return { type: 'canonical_stroke_live' as const, layerId: c.layerId, frame: c.frame } }
  return { service, grant, resolve, preflight, frame, live }
}
describe('closed trusted canonical frame admission (no socket activation)', () => {
  it('validates before side effects; abandoned prepare leaves recorded ordinal available', () => {
    const f = fixture(), effects = vi.fn(), candidate = f.frame()
    const abandoned = f.service.prepare(identity, candidate)
    expect(f.service.size).toBe(0); expect(effects).not.toHaveBeenCalled()
    const ticket = f.service.prepare(identity, candidate)
    effects(ticket.value); ticket.commit(); ticket.commit()
    expect(f.service.size).toBe(1); expect(effects).toHaveBeenCalledTimes(1)
    expect(() => abandoned.commit()).toThrow('stale')
    expect(f.service.prepare(identity, candidate).duplicate).toBe(true)
    const retry = f.service.prepare(identity, f.frame(1, true)); retry.commit()
    expect(() => f.service.prepare(identity, f.frame(2))).toThrow()
  })
  it('handles live ahead then same recorded frames without advancing cross-frame fences twice', () => {
    const f = fixture()
    f.service.prepare(identity, f.live()).commit(); f.service.prepare(identity, f.live(1, true)).commit()
    const recorded = f.service.prepare(identity, f.frame()); expect(recorded.duplicate).toBe(false); recorded.commit()
    f.service.prepare(identity, f.frame(1, true)).commit()
    expect(f.service.prepare(identity, f.live(1, true)).duplicate).toBe(true)
    expect(() => f.service.prepare(identity, { ...f.frame(), id: 'different-operation' })).toThrow('conflicts')
  })
  it('reports recorded closure independently of speculative end without reopening unique admission', () => {
    const f=fixture(1)
    f.service.prepare(identity,f.live()).commit()
    f.service.prepare(identity,f.frame()).commit()
    f.service.prepare(identity,f.live(1,true)).commit()
    expect(f.service.cursor(identity,'gesture')).toEqual({liveNext:2,recordedNext:1,ended:false})
    // The unique lane is sealed even though the recorded cursor is still open.
    expect(()=>f.service.prepare(identity,f.live(2))).toThrow()
    expect(()=>f.service.prepare(identity,f.frame(2))).toThrow()
    const end=f.service.prepare(identity,f.frame(1,true))
    expect(f.service.cursor(identity,'gesture').ended).toBe(false)
    end.commit()
    expect(f.service.cursor(identity,'gesture')).toEqual({liveNext:2,recordedNext:2,ended:true})
    // ordinal0 has fallen out of the retained fingerprint window.
    expect(()=>f.service.prepare(identity,f.frame())).toThrow('expired')
    const duplicate=f.service.prepare(identity,f.frame(1,true));expect(duplicate.duplicate).toBe(true);duplicate.commit()
    f.service.prepare(identity,f.live(1,true)).commit()
    expect(f.service.cursor(identity,'gesture').ended).toBe(true)
    expect(()=>f.service.prepare(identity,f.frame(2))).toThrow()
  })
  it('keeps live-only end out of the recorded cursor until both records commit', () => {
    const f=fixture()
    f.service.prepare(identity,f.live()).commit();f.service.prepare(identity,f.live(1,true)).commit()
    expect(f.service.cursor(identity,'gesture')).toEqual({liveNext:2,recordedNext:0,ended:false})
    expect(()=>f.service.prepare(identity,f.live(2))).toThrow('fence prefix')
    f.service.prepare(identity,f.frame()).commit()
    expect(f.service.cursor(identity,'gesture').ended).toBe(false)
    f.service.prepare(identity,f.frame(1,true)).commit()
    expect(f.service.cursor(identity,'gesture').ended).toBe(true)
  })
  it('reconstructs recorded closure from persisted-first replay and preserves it through matching live duplicates', () => {
    const f=fixture(1)
    for(let n=0;n<4;n++) {
      f.service.prepare(identity,f.frame(n,n===3)).commit()
      expect(f.service.cursor(identity,'gesture').ended).toBe(n===3)
    }
    expect(()=>f.service.prepare(identity,f.frame())).toThrow('expired')
    f.service.prepare(identity,f.frame(3,true)).commit()
    expect(f.service.cursor(identity,'gesture')).toEqual({recordedNext:4,liveNext:0,ended:true})
    const g=fixture();g.service.prepare(identity,g.frame(0,true)).commit()
    g.service.prepare(identity,g.live(0,true)).commit()
    expect(g.service.cursor(identity,'gesture')).toEqual({recordedNext:1,liveNext:1,ended:true})
  })
  it('accepts recorded first and then matching live, bounds speculative lead and stale live history', () => {
    const f = fixture(2)
    f.service.prepare(identity, f.live()).commit(); f.service.prepare(identity, f.live(1)).commit()
    expect(() => f.service.prepare(identity, f.live(2))).toThrow('ordinal')
    f.service.prepare(identity, f.frame()).commit(); f.service.prepare(identity, f.live(2)).commit()
    f.service.prepare(identity, f.frame(1)).commit(); f.service.prepare(identity, f.frame(2)).commit()
    const g = fixture(2)
    for (let i = 0; i < 4; i++) g.service.prepare(identity, g.frame(i)).commit()
    expect(() => g.service.prepare(identity, g.live())).toThrow('prefix')
  })
  it('does not turn client profile claims or source metadata into trusted capability', () => {
    const f = fixture(), candidate = f.frame()
    f.resolve.mockReturnValueOnce(undefined)
    f.preflight.mockClear()
    expect(() => f.service.prepare(identity, candidate)).toThrow('capability')
    expect(f.preflight).not.toHaveBeenCalled(); expect(f.service.size).toBe(0)
    for (const patch of [{ roomRasterVersion: 'legacy-pm8-v1' }, { rasterProfile: 'reference-scalar-f32-rne-v1' }, { userId: 'other' }, { roomId: 'lesson-instead-of-board' }, { layerId: 'other' }]) {
      f.resolve.mockReturnValueOnce({ ...f.grant, ...patch } as TrustedCanonicalGesture)
      expect(() => f.service.prepare(identity, candidate)).toThrow('capability')
    }
    for (const extra of [{ dabs: [] }, { userId: 'forged' }, { seq: 3 }, { brushRandom: {} }]) expect(() => f.service.prepare(identity, { ...candidate, ...extra })).toThrow('candidate')
    expect(f.service.size).toBe(0)
  })
  it('pins immutable descriptor/colour/composition/epoch across lanes before decoding another material', () => {
    const f = fixture(); f.service.prepare(identity, f.live()).commit()
    const candidate = f.frame()
    for (const patch of [{ boardEpoch: 1 }, { descriptorSha256: '3'.repeat(64) }, { pigmentRgb8: [21, 70, 190] }, { composition: { ...f.grant.composition, mode: 'buildup' } }]) {
      f.preflight.mockClear(); f.resolve.mockReturnValueOnce({ ...f.grant, ...patch } as TrustedCanonicalGesture)
      expect(() => f.service.prepare(identity, candidate)).toThrow('immutable')
      expect(f.preflight).not.toHaveBeenCalled()
    }
    f.service.prepare(identity, f.frame()).commit()
  })
  it('rejects CAS, budget, ordinal gaps and cross-frame entry discontinuity without consuming state', () => {
    const f = fixture()
    expect(() => f.service.prepare(identity, f.frame(1))).toThrow('prefix')
    const invalid = f.frame(); invalid.frame = { ...invalid.frame, materialPacked: invalid.frame.materialPacked.slice(0, -1) }
    expect(() => f.service.prepare(identity, invalid)).toThrow()
    f.resolve.mockReturnValueOnce({ ...f.grant, material: { ...f.grant.material, assets: [] } })
    expect(() => f.service.prepare(identity, f.frame())).toThrow()
    f.service.prepare(identity, f.frame()).commit()
    expect(() => f.service.prepare(identity, f.frame(2))).toThrow('ordinal')
    expect(() => f.service.prepare(identity, f.frame(1, false, { phase: 'between' }))).toThrow('fence')
    f.service.prepare(identity, f.frame(1, true)).commit()
  })
  it('has bounded gesture lifetime, rejects identity reuse on context drift and invalidates tickets on room clear', () => {
    const f = fixture(8, 1), ticket = f.service.prepare(identity, f.frame())
    f.service.clearRoom(identity.roomId); expect(() => ticket.commit()).toThrow('stale')
    f.service.prepare(identity, f.frame(0, true)).commit()
    const next = { ...f.grant, strokeId: 'second' }
    f.resolve.mockReturnValue(next)
    const candidate = f.frame(); candidate.frame = { ...candidate.frame, strokeId: 'second' }
    expect(() => f.service.prepare(identity, candidate)).toThrow('capacity')
    f.service.clearRoom(identity.roomId); expect(f.service.size).toBe(0)
  })
  it('rejects a rewritten lane frame and reused operation ID, while authenticated users remain independent', () => {
    const f = fixture()
    f.service.prepare(identity, f.live()).commit()
    const rewritten = f.frame(), differentMaterial = f.frame(1)
    rewritten.frame = { ...rewritten.frame, materialPacked: differentMaterial.frame.materialPacked }
    expect(() => f.service.prepare(identity, rewritten)).toThrow('conflicts')
    f.service.prepare(identity, f.frame()).commit()
    expect(() => f.service.prepare(identity, { ...f.frame(1), id: 'operation-0' })).toThrow('ID reused')
    f.resolve.mockImplementation((scope, selector) => ({ ...f.grant, ...scope, layerId: selector.layerId, strokeId: selector.strokeId }))
    const other = { roomId: 'another-board', userId: 'peer' }
    f.service.prepare(other, f.frame()).commit()
    f.service.prepare(identity, f.frame(1, true)).commit()
    expect(f.service.size).toBe(2)
  })

})

function textureAdmission(){
 const f=fixture(),primary={id:'asset:'+'1'.repeat(64),size:8,x:0,y:0,width:8,height:8},pattern={id:'asset:'+'3'.repeat(64),size:8,x:0,y:0,width:4,height:4}
 const material=canonicalPrimaryTextureMaterialContext({version:3,assets:[primary,pattern],primarySource:{kind:'image',asset:primary.id,brushScale:1,brushAngle:0},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},budget:{workUnits:100000,outputBytes:100000,drawPixels:100000}})
 Object.assign(f.grant,{rasterProfile:G,material})
 const recipe={kind:'image'as const,asset:primary.id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:8,mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:1,y:2,opacity:1,flow:1,grainDepth:.5}],fences:[{at:0,kind:'segmentBegin',group:0}]},material).packed
 const candidate={type:'canonical_stroke'as const,id:'texture-frame',layerId:'layer',frame:{version:2 as const,rasterProfile:G,brush:f.grant.brush,strokeId:f.grant.strokeId,frameOrdinal:0,pigmentRgb8:f.grant.pigmentRgb8,composition:f.grant.composition,materialPacked:packed}}
 return{...f,material,recipe,candidate}
}
it('uses explicit3 for actual admission and fingerprints the complete immutable source',()=>{
 const f=textureAdmission(),ticket=f.service.prepare(identity,f.candidate)
 expect(ticket.value.decoded.profile).toBe('canonical-primary-texture-material-v3');ticket.commit()
 expect(f.service.prepare(identity,f.candidate).duplicate).toBe(true)
 const changed={...f.material,primaryTexture:{...f.material.primaryTexture,offsetX:1}}
 Reflect.set(f.grant,'material',changed)
 expect(()=>f.service.prepare(identity,f.candidate)).toThrow(/immutable gesture/)
 expect(f.service.size).toBe(1)
})
it('rejects3 wrong profile and geometry-fitting texture-exceeding budgets before admission state changes',()=>{
 const f=textureAdmission()
 Reflect.set(f.grant,'rasterProfile',CANONICAL_STROKE_RASTER_PROFILE)
 expect(()=>f.service.prepare(identity,f.candidate)).toThrow(/material3 profile/);expect(f.service.size).toBe(0)
 Reflect.set(f.grant,'rasterProfile',G)
 const material:CanonicalMaterialContextV3={...f.material,budget:{...f.material.budget,workUnits:canonicalMaterialGeometryCost(f.recipe,f.material.assets[0]).workUnits}}
 Reflect.set(f.grant,'material',material)
 expect(()=>f.service.prepare(identity,f.candidate)).toThrow();expect(f.service.size).toBe(0)
})

it('seals the actual admitted3 recorded prefix through typed commitPartial without synthesizing an END frame',()=>{
 const f=textureAdmission(),frame=f.service.prepare(identity,f.candidate);frame.commit()
 const summary=verifyCanonicalRecordedPrefix([{operationId:f.candidate.id,sequence:1,frameOrdinal:0,decoded:frame.value.decoded}])
 expect(summary.ended).toBe(false)
 const seal=verifyCanonicalRecordedClose(summary,{userId:'author',layerId:'layer',strokeId:f.grant.strokeId},{type:'canonical_stroke_close',id:'close3',userId:'author',timestamp:2,seq:2,layerId:'layer',targetUserId:'author',strokeId:f.grant.strokeId,disposition:'commitPartial',recordedNext:1,firstFrameOpId:f.candidate.id,lastFrameOpId:f.candidate.id})
 const ticket=f.service.prepareRecordedClose(identity,f.grant.strokeId,seal);ticket.commit()
 expect(f.service.cursor(identity,f.grant.strokeId)).toMatchObject({recordedNext:1,ended:true})
 expect(f.candidate.frame.materialPacked).toBe(frame.value.candidate.frame.materialPacked)
})
