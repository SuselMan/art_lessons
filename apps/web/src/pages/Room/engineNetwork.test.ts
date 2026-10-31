import { CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_MATERIAL_PROFILE,packCanonicalMaterial, type CanonicalStrokeOperation,type CanonicalStrokeCloseOperation,createBrushRandomStrokeId } from '@grafetto/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { unpackDabs, type Operation,type LayerAddOperation, type StrokeOperation } from '@grafetto/shared'

import { resetRoomStore, useRoomStore } from '../../stores/roomStore'
import { createEngineNetworkCallbacks } from './engineNetwork'
import {Outbox} from './net/outbox'
import {createInMemoryOutboxStorage} from './net/outboxStorage'
import {createOutboxVerdicts} from './net/outboxVerdict'
import { createPendingPreviews } from './net/pendingPreviews'

/** (#493) The engine's side of the network, called the way the engine calls
 *  it: this person's own operations going out, a peer's reveal being
 *  committed, and the live stroke channel. */

function stroke(id: string): StrokeOperation {
  return {
    id, type: 'stroke', userId: 'me', timestamp: 0, layerId: 'layer-1',
    tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
  }
}

function layerAdd(id: string, layerId: string): LayerAddOperation {
  return { id, type: 'layer_add', userId: 'me', timestamp: 0, layerId, name: 'Layer' }
}

function setup() {
  const engine = { dropPendingPreview: vi.fn((_id: string): StrokeOperation | null => null) }
  const deps = {
    engineRef: { current: engine },
    appliedOpIdsRef: { current: new Set<string>() },
    pendingIdsRef: { current: new Set<string>() },
    outbox: { enqueue: vi.fn(async (_op:Operation) => {}) },
    markActive: vi.fn(),
    pendingPreviewsRef: { current: createPendingPreviews() },
    applyRemoteOp: vi.fn(),
    syncFromLog: vi.fn(),
    checkSnapshotBoundary: vi.fn(),
    editingBlockedRef: { current: false },
    sendLive: vi.fn(),
    sendLiveEnd: vi.fn(),
  }
  return { deps, on: createEngineNetworkCallbacks(deps) }
}

beforeEach(() => {
  resetRoomStore()
  useRoomStore.getState().setUserId('me')
})

describe('an operation of this person’s', () => {
  // Marked applied before it is even sent, so its own confirmation arriving
  // later does not paint it twice.
  it('is marked applied, queued in the outbox, and lights this person as drawing', () => {
    const { deps, on } = setup()
    const op = stroke('s1')
    on.onLocalOperation(op)
    expect(deps.appliedOpIdsRef.current.has('s1')).toBe(true)
    expect(deps.outbox.enqueue).toHaveBeenCalledWith(op)
    expect(deps.markActive).toHaveBeenCalledWith('me')
  })

  it('puts a new layer on the local island until the server answers', () => {
    const { deps, on } = setup()
    on.onLocalOperation(layerAdd('a1', 'L-new'))
    expect(deps.pendingIdsRef.current.has('L-new')).toBe(true)
    expect(deps.markActive).not.toHaveBeenCalled()
  })
})

describe('canonical local operations have no optimistic paint claim',()=>{
 it('queues exact frame and close objects without applied IDs, including a real Outbox ACK roundtrip',async()=>{
  const material={assets:[{id:'asset:'+'1'.repeat(64),size:1,x:0,y:0,width:1,height:1}],primaryAsset:'asset:'+'1'.repeat(64),budget:{workUnits:100,outputBytes:100,drawPixels:100},preflightDefinition:()=>({workUnits:1,outputBytes:4})}
  const frame:CanonicalStrokeOperation={type:'canonical_stroke',id:'frame',userId:'me',timestamp:0,layerId:'layer-1',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:'brush:test@1',strokeId:'gesture',frameOrdinal:0,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:packCanonicalMaterial({profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:[]},material)}}
  const close:CanonicalStrokeCloseOperation={type:'canonical_stroke_close',id:'close',userId:'me',timestamp:0,layerId:'layer-1',targetUserId:'me',strokeId:'gesture',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'frame',lastFrameOpId:'frame'}
  const {deps,on}=setup()
  on.onLocalOperation(frame);on.onLocalOperation(close)
  expect(deps.outbox.enqueue.mock.calls.map(([op])=>op)).toEqual([frame,close])
  expect(deps.appliedOpIdsRef.current.size).toBe(0);expect(deps.pendingIdsRef.current.size).toBe(0)
  expect(deps.applyRemoteOp).not.toHaveBeenCalled();expect(deps.syncFromLog).not.toHaveBeenCalled();expect(deps.checkSnapshotBoundary).not.toHaveBeenCalled();expect(deps.markActive).not.toHaveBeenCalled()
  const confirmOperation=vi.fn(),discardOperation=vi.fn(),canonicalVerdicts={onSettled:vi.fn(),onStalled:vi.fn()},latestKnownSeqRef={current:0}
  const verdicts=createOutboxVerdicts({pendingIdsRef:deps.pendingIdsRef,latestKnownSeqRef,confirmOperation,discardOperation,checkSnapshotBoundary:deps.checkSnapshotBoundary,resolveTransformCommit:vi.fn(),scheduleLostWorkRecovery:vi.fn(),setLostWork:vi.fn(),canonicalVerdicts})
  const outbox=new Outbox({roomId:'room',storage:createInMemoryOutboxStorage(),send:async()=>({ok:true,seq:7}),...verdicts})
  try{
   createEngineNetworkCallbacks({...deps,outbox}).onLocalOperation(frame)
   await vi.waitFor(()=>expect(canonicalVerdicts.onSettled).toHaveBeenCalledWith(frame,{ok:true,seq:7}))
   expect(latestKnownSeqRef.current).toBe(7);expect(outbox.pendingCount).toBe(0);expect(deps.appliedOpIdsRef.current.size).toBe(0)
   expect(confirmOperation).not.toHaveBeenCalled();expect(discardOperation).not.toHaveBeenCalled();expect(deps.checkSnapshotBoundary).not.toHaveBeenCalled()
  }finally{outbox.dispose()}

 })
})

describe('a peer’s reveal that has finished', () => {
  it('is committed for real and leaves the pending set', () => {
    const { deps, on } = setup()
    deps.pendingPreviewsRef.current.add('s1', 4)
    const op = stroke('s1')
    on.onPreviewApplied(op)
    expect(deps.pendingPreviewsRef.current.has('s1')).toBe(false)
    expect(deps.applyRemoteOp).toHaveBeenCalledWith(op)
    expect(deps.syncFromLog).toHaveBeenCalledOnce()
    expect(deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
  })

  // (#537) A short stroke can finish revealing before a longer one the room
  // ordered first. The log takes them in the room's order regardless.
  it('commits every reveal the room ordered before it first', () => {
    const { deps, on } = setup()
    const long = stroke('long')
    deps.pendingPreviewsRef.current.add('long', 3)
    deps.pendingPreviewsRef.current.add('short', 4)
    deps.pendingPreviewsRef.current.add('later', 5)
    deps.engineRef.current.dropPendingPreview.mockImplementation(id => (id === 'long' ? long : null))
    on.onPreviewApplied(stroke('short'))
    expect(deps.applyRemoteOp.mock.calls.map(([op]) => op.id)).toEqual(['long', 'short'])
    expect(deps.pendingPreviewsRef.current.has('later')).toBe(true)
    expect(deps.pendingPreviewsRef.current.size).toBe(1)
  })
})

describe('the live stroke channel', () => {
  const packet = {
    strokeId: 'g1', layerId: 'layer-1', tool: 'pencil' as const, preset: 'HB', color: [0, 0, 0] as [number, number, number],
    packetSeq: 0, dabs: [],
  }

  it('sends the packet packed, and the end of the gesture', () => {
    const { deps, on } = setup()
    on.onLiveStrokeDabs(packet)
    on.onLiveStrokeEnd('g1')
    const sent = vi.mocked(deps.sendLive).mock.calls[0][0]
    expect(sent).toMatchObject({ strokeId: 'g1', layerId: 'layer-1', packetSeq: 0 })
    expect(unpackDabs(sent.dabsPacked)).toEqual([])
    expect(sent).not.toHaveProperty('washId')
    expect(deps.sendLiveEnd).toHaveBeenCalledWith({ strokeId: 'g1' })
  })

  it('carries a watercolour wash id when there is one', () => {
    const { deps, on } = setup()
    on.onLiveStrokeDabs({ ...packet, washId: 'w1' })
    expect(vi.mocked(deps.sendLive).mock.calls[0][0].washId).toBe('w1')
  })

  // Streaming ink the server will refuse is drawing into the void.
  it('sends nothing while editing is blocked', () => {
    const { deps, on } = setup()
    deps.editingBlockedRef.current = true
    on.onLiveStrokeDabs(packet)
    on.onLiveStrokeEnd('g1')
    expect(deps.sendLive).not.toHaveBeenCalled()
    expect(deps.sendLiveEnd).not.toHaveBeenCalled()
  })
})


it('derives state after deferred log application without sending or appending again', () => {
  const { deps, on } = setup()
  on.onQueuedOperationApplied(layerAdd('queued', 'L'))
  expect(deps.syncFromLog).toHaveBeenCalledOnce()
  expect(deps.checkSnapshotBoundary).toHaveBeenCalledOnce()
  expect(deps.applyRemoteOp).not.toHaveBeenCalled()
  expect(deps.outbox.enqueue).not.toHaveBeenCalled()
})

it('sends the optional cancellation marker only for a cancelled live tail', () => {
  const { deps, on } = setup()
  on.onLiveStrokeEnd('tail', true)
  on.onLiveStrokeEnd('normal')
  expect(deps.sendLiveEnd.mock.calls).toEqual([[{ strokeId: 'tail', cancelled: true }], [{ strokeId: 'normal' }]])
})

it('sends independent random metadata without changing packed dab payload', () => {
 const {deps,on}=setup(),seeds={version:1 as const,sequentialSeed:0,strokeSeed:0xffffffff}
 on.onLiveStrokeDabs({strokeId:createBrushRandomStrokeId('nonce00000',seeds),layerId:'layer-1',tool:'digitalBrush',preset:'hard-round',color:[0,0,0],packetSeq:0,dabs:[],brushRandom:seeds})
 const sent=vi.mocked(deps.sendLive).mock.calls[0][0]
 expect(sent.brushRandom).toEqual(seeds); expect(sent.brushRandom).not.toBe(seeds)
 expect(unpackDabs(sent.dabsPacked)).toEqual([])
})
