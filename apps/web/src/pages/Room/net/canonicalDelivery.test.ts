import { expect, it, vi } from 'vitest'
import {
  CANONICAL_MATERIAL_PROFILE, CANONICAL_STROKE_RASTER_PROFILE,
  decodeCanonicalStrokeFrame, packCanonicalMaterial,
  type CanonicalStrokeOperation, type Operation,
} from '@grafetto/shared'
import { Outbox } from './outbox'
import { createInMemoryOutboxStorage } from './outboxStorage'
import { createConfirmedStreamHandler } from './confirmedStream'
import { createPendingPreviews } from './pendingPreviews'

vi.mock('../../../lib/observability/reportInvariant', () => ({ reportInvariant: vi.fn() }))

function canonical(): CanonicalStrokeOperation {
  const asset = { id: `asset:${'1'.repeat(64)}`, size: 2, x: 0, y: 0, width: 2, height: 2 }
  const material = { assets: [asset], primaryAsset: asset.id,
    budget: { workUnits: 1000, outputBytes: 1000, drawPixels: 1000 },
    preflightDefinition: () => ({ workUnits: 100, outputBytes: 16 }) }
  const packed = packCanonicalMaterial({ profile: CANONICAL_MATERIAL_PROFILE, masked: false, entry: { phase: 'between' },
    definitions: [{ asset: asset.id, brushScale: 1, brushAngle: 0, scale: 1, ratio: 1, rotation: -0, subX: -0, subY: 0, width: 2, height: 2, mirrorH: false, mirrorV: false }],
    draws: [{ definition: 0, role: 'primary', x: -3, y: 7, opacity: .7567890123456789, flow: .4 }],
    fences: [{ kind: 'segmentBegin', at: 0, group: 0 }, { kind: 'primaryEnd', at: 1, group: 0 }, { kind: 'segmentEnd', at: 1, group: 0 }, { kind: 'gestureEnd', at: 1 }] }, material)
  const context = { brush: 'brush:delivery-fixture@1', strokeId: 'gesture', frameOrdinal: 0, pigmentRgb8: [17, 29, 41] as const,
    composition: { mode: 'wash' as const, alphaDarken: 'hard' as const, outerResourceOpacity: .73, outerBlend: 'over' as const }, material }
  const accepted = decodeCanonicalStrokeFrame({ version: 1, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
    brush: context.brush, strokeId: context.strokeId, frameOrdinal: 0, pigmentRgb8: context.pigmentRgb8,
    composition: context.composition, materialPacked: packed }, context)
  expect(Object.is(accepted.frame.definitions[0].rotation, -0)).toBe(true)
  return { type: 'canonical_stroke', id: 'canonical-A', userId: 'peer', timestamp: 0, layerId: 'layer', frame: accepted.envelope }
}

it('retains a repair-required packed frame across outbox retirement and JSON rehydration until its original ID is confirmed', async () => {
  const memory = createInMemoryOutboxStorage()
  // Serialized persistence seam, not a real IndexedDB durability claim.
  const storage = { ...memory, put: async (entry: Parameters<typeof memory.put>[0]) => memory.put(JSON.parse(JSON.stringify(entry))) }
  const scheduled: (() => void)[] = [], settled = vi.fn(), input = canonical(), attempts: Operation[] = []
  const old = new Outbox({ roomId: 'board', storage, schedule: fn => scheduled.push(fn), now: () => 0,
    send: async op => { attempts.push(op); return { ok: false, reason: 'canonical_repair_required' } }, onSettled: settled })
  await old.enqueue(input)
  await vi.waitFor(() => expect(scheduled).toHaveLength(1))
  expect(old.pendingCount).toBe(1); expect(settled).not.toHaveBeenCalled()
  expect((await memory.getAll('board'))[0].op).toEqual(input)
  old.dispose(); scheduled[0]()
  expect(attempts).toHaveLength(1)
  const current = new Outbox({ roomId: 'board', storage, now: () => 0,
    send: async op => { attempts.push(op); return { ok: true, seq: 7, duplicate: true } }, onSettled: settled })
  try {
    await current.hydrate(); expect(current.pendingCount).toBe(1)
    await current.resendAll()
    await vi.waitFor(() => expect(settled).toHaveBeenCalledOnce())
    expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(input)
    expect(attempts[1].type === 'canonical_stroke' && attempts[1].frame.materialPacked).toBe(input.frame.materialPacked)
    expect(settled).toHaveBeenCalledWith(input, { ok: true, seq: 7, duplicate: true })
    expect(await memory.getAll()).toEqual([]); expect(current.pendingCount).toBe(0)
  } finally { current.dispose() }
})

it('applies a repaired canonical confirmation once when its old sequence is broadcast again after a newer operation', () => {
  const applied = new Set<string>(), apply = vi.fn((op: Operation) => { applied.add(op.id) })
  const confirmOwnOperation = vi.fn(), requestFullResync = vi.fn()
  const lastConfirmedSeqRef = { current: 0 }, latestKnownSeqRef = { current: 0 }
  const confirm = createConfirmedStreamHandler({
    engineRef: { current: { previewOperation: vi.fn(), dropPendingPreview: vi.fn(() => null) } },
    lastConfirmedSeqRef, latestKnownSeqRef, appliedOpIdsRef: { current: applied },
    pendingPreviewsRef: { current: createPendingPreviews() }, catchingUpRef: { current: false },
    streamedStrokeIdsRef: { current: new Set<string>() }, deferredOpsQueueRef: { current: [] },
    previewScheduleRef: { current: null }, confirmOwnOperation, markLayerActive: vi.fn(),
    applyRemoteOp: apply, syncFromLog: vi.fn(), checkSnapshotBoundary: vi.fn(), requestFullResync,
  })
  const op = canonical(), newer: Operation = { type: 'layer_clear', id: 'B', userId: 'peer', timestamp: 1, layerId: 'layer' }
  confirm({ seq: 1, operation: op }); confirm({ seq: 2, operation: newer })
  confirm({ seq: 1, operation: JSON.parse(JSON.stringify({ ...op, seq: 1 })) })
  expect(apply.mock.calls.map(([value]) => value.id)).toEqual(['canonical-A', 'B'])
  expect(confirmOwnOperation).toHaveBeenCalledOnce(); expect(confirmOwnOperation).toHaveBeenCalledWith({ ...op, seq: 1 }, 1)
  expect(lastConfirmedSeqRef.current).toBe(2); expect(latestKnownSeqRef.current).toBe(2)
  expect(requestFullResync).not.toHaveBeenCalled()
})
