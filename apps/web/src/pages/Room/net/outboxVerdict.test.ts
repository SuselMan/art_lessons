import { describe, expect, it, vi } from 'vitest'

import {CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_MATERIAL_PROFILE,packCanonicalMaterial,type CanonicalStrokeOperation,type CanonicalStrokeCloseOperation,type LayerAddOperation,type StrokeOperation} from '@grafetto/shared'

import { createOutboxVerdicts,type OutboxVerdictDeps } from './outboxVerdict'

/** (#493) What this client does with the outbox's answers. Each rule here
 *  is about a consequence the person can see — a held gizmo preview, a layer
 *  that stops counting as private, work that comes back on a new layer — and
 *  none of them was reachable without a server until they left Room. */

function stroke(id: string): StrokeOperation {
  return {
    id, type: 'stroke', userId: 'me', timestamp: 0, layerId: 'layer-1',
    tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
  }
}

function layerAdd(id: string, layerId: string): LayerAddOperation {
  return { id, type: 'layer_add', userId: 'me', timestamp: 0, layerId, name: 'Layer' }
}

function setup(extra:Pick<OutboxVerdictDeps,'canonicalVerdicts'|'requestFullResync'>={}) {
  const deps = {
    pendingIdsRef: { current: new Set<string>(['L-new']) },
    latestKnownSeqRef: { current: 5 },
    confirmOperation: vi.fn(),
    discardOperation: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
    resolveTransformCommit: vi.fn(),
    scheduleLostWorkRecovery: vi.fn(),
    setLostWork: vi.fn(),
    ...extra,
  }
  return { deps, ...createOutboxVerdicts(deps) }
}

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('a confirmed operation', () => {
  it('advances the watermark, never backwards', () => {
    const { deps, onSettled } = setup()
    onSettled(stroke('s1'), { ok: true, seq: 9 })
    expect(deps.latestKnownSeqRef.current).toBe(9)
    onSettled(stroke('s2'), { ok: true, seq: 3 })
    expect(deps.latestKnownSeqRef.current).toBe(9)
  })

  // (#537) The ack carries the same seq the broadcast does; whichever gets
  // there first puts the operation in its place in the room's order.
  it('confirms the operation at its seq and checks the snapshot boundary', () => {
    const { deps, onSettled } = setup()
    const op = stroke('s1')
    onSettled(op, { ok: true, seq: 9 })
    expect(deps.confirmOperation).toHaveBeenCalledWith(op, 9)
    expect(deps.discardOperation).not.toHaveBeenCalled()
    expect(deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
  })

  // Confirmed means a peer may reference it now: no longer this client's
  // private island, so a later delete of it waits for the server.
  it('takes a confirmed new layer out of the local island', () => {
    const { deps, onSettled } = setup()
    onSettled(layerAdd('a1', 'L-new'), { ok: true, seq: 6 })
    expect(deps.pendingIdsRef.current.has('L-new')).toBe(false)
  })
})

describe('a rejected operation', () => {
  it('lets go of a held gizmo preview and leaves the watermark alone', () => {
    const { deps, onSettled } = setup()
    onSettled(stroke('s1'), { ok: false, reason: 'room_frozen' })
    expect(deps.resolveTransformCommit).toHaveBeenCalledWith('s1')
    expect(deps.latestKnownSeqRef.current).toBe(5)
    expect(deps.checkSnapshotBoundary).not.toHaveBeenCalled()
  })

  // (#537) Nobody else will ever see it, so neither may its author.
  it('is taken back off this client’s canvas', () => {
    const { deps, onSettled } = setup()
    const op = stroke('s1')
    onSettled(op, { ok: false, reason: 'room_frozen' })
    expect(deps.discardOperation).toHaveBeenCalledWith(op)
    expect(deps.confirmOperation).not.toHaveBeenCalled()
  })

  it('drops a rejected new layer out of the local island too', () => {
    const { deps, onSettled } = setup()
    onSettled(layerAdd('a1', 'L-new'), { ok: false, reason: 'room_frozen' })
    expect(deps.pendingIdsRef.current.has('L-new')).toBe(false)
  })

  // (#312) Drawn onto a layer someone deleted meanwhile: the server hands
  // it back, and it is recovered onto a fresh layer rather than lost.
  it('whose layer is gone is queued for recovery when it carries content', () => {
    const { deps, onSettled } = setup()
    const op = stroke('s1')
    onSettled(op, { ok: false, reason: 'target_gone' })
    expect(deps.scheduleLostWorkRecovery).toHaveBeenCalledWith(op)
    expect(deps.setLostWork).not.toHaveBeenCalled()
  })

  it('whose target is gone and carries nothing to recover is still reported', () => {
    const { deps, onSettled } = setup()
    onSettled(layerAdd('a1', 'L-x'), { ok: false, reason: 'target_gone' })
    expect(deps.scheduleLostWorkRecovery).not.toHaveBeenCalled()
    expect(deps.setLostWork).toHaveBeenCalledWith({ layerNames: [], restoredLayerIds: [] })
  })

  it('for any other reason is neither recovered nor reported as lost work', () => {
    const { deps, onSettled } = setup()
    onSettled(stroke('s1'), { ok: false, reason: 'not_owner' })
    expect(deps.scheduleLostWorkRecovery).not.toHaveBeenCalled()
    expect(deps.setLostWork).not.toHaveBeenCalled()
  })
})

describe('a stalled operation', () => {
  it('lets go of a held gizmo preview; the entry stays queued', () => {
    const { deps, onStalled } = setup()
    onStalled(stroke('s1'))
    expect(deps.resolveTransformCommit).toHaveBeenCalledWith('s1')
  })
})

function canonicalOperations(){
 const material={assets:[{id:'asset:'+'1'.repeat(64),size:1,x:0,y:0,width:1,height:1}],primaryAsset:'asset:'+'1'.repeat(64),budget:{workUnits:100,outputBytes:100,drawPixels:100},preflightDefinition:()=>({workUnits:1,outputBytes:4})}
 const frame:CanonicalStrokeOperation={type:'canonical_stroke',id:'frame',userId:'me',timestamp:0,layerId:'layer-1',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:'brush:test@1',strokeId:'gesture',frameOrdinal:0,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:packCanonicalMaterial({profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:[]},material)}}
 const close:CanonicalStrokeCloseOperation={type:'canonical_stroke_close',id:'close',userId:'me',timestamp:0,layerId:'layer-1',targetUserId:'me',strokeId:'gesture',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'frame',lastFrameOpId:'frame'}
 return[frame,close]
}
describe('canonical verdicts are control-only durable receipts',()=>{
 it('updates known watermark and forwards exact success/refusal without legacy paint or snapshot work',()=>{
  const canonicalVerdicts={onSettled:vi.fn(),onStalled:vi.fn()},requestFullResync=vi.fn(),{deps,onSettled}=setup({canonicalVerdicts,requestFullResync}),[frame,close]=canonicalOperations()
  const success={ok:true as const,seq:9,duplicate:true},refusal={ok:false as const,reason:'target_gone' as const}
  onSettled(frame,success);onSettled(close,refusal)
  expect(deps.latestKnownSeqRef.current).toBe(9);expect(canonicalVerdicts.onSettled).toHaveBeenNthCalledWith(1,frame,success);expect(canonicalVerdicts.onSettled).toHaveBeenNthCalledWith(2,close,refusal)
  for(const callback of [deps.confirmOperation,deps.discardOperation,deps.checkSnapshotBoundary,deps.resolveTransformCommit,deps.scheduleLostWorkRecovery,deps.setLostWork,requestFullResync])expect(callback).not.toHaveBeenCalled()
 })
 it('requests existing resync once per unexpected ownerless settlement and still never paints',()=>{
  const requestFullResync=vi.fn(),{deps,onSettled}=setup({requestFullResync}),[frame,close]=canonicalOperations()
  onSettled(frame,{ok:true,seq:9});onSettled(close,{ok:false,reason:'room_frozen'})
  expect(requestFullResync).toHaveBeenCalledTimes(2);expect(deps.latestKnownSeqRef.current).toBe(9)
  expect(deps.confirmOperation).not.toHaveBeenCalled();expect(deps.discardOperation).not.toHaveBeenCalled();expect(deps.checkSnapshotBoundary).not.toHaveBeenCalled()
 })
 it('keeps a definitive ACK terminal when its control owner fails and requests repair',()=>{
  const canonicalVerdicts={onSettled:vi.fn(()=>{throw Error('owner changed')}),onStalled:vi.fn()},requestFullResync=vi.fn(),{deps,onSettled}=setup({canonicalVerdicts,requestFullResync}),[frame]=canonicalOperations()
  expect(()=>onSettled(frame,{ok:true,seq:9})).not.toThrow()
  expect(requestFullResync).toHaveBeenCalledTimes(1);expect(deps.latestKnownSeqRef.current).toBe(9)
  expect(deps.confirmOperation).not.toHaveBeenCalled();expect(deps.discardOperation).not.toHaveBeenCalled()
 })
 it('notifies canonical stalls without discarding persisted work or resolving legacy previews',()=>{
  const canonicalVerdicts={onSettled:vi.fn(),onStalled:vi.fn()},requestFullResync=vi.fn(),{deps,onStalled}=setup({canonicalVerdicts,requestFullResync}),[frame]=canonicalOperations()
  onStalled(frame);expect(canonicalVerdicts.onStalled).toHaveBeenCalledWith(frame)
  expect(deps.resolveTransformCommit).not.toHaveBeenCalled();expect(deps.discardOperation).not.toHaveBeenCalled();expect(requestFullResync).not.toHaveBeenCalled()
 })
})
