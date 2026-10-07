import { describe, expect, it, vi } from 'vitest'

import { openParkedRoomState, type ParkedRoomState } from './engineWiring'
import type { RoomStatePayload } from './restoreRoomState'

const engine = { name: 'engine' }
const parked: RoomStatePayload = {
  latestSnapshotSeq: 40, tailOperations: [], participants: [], palette: [], frozen: false,
}

function deps(patch: Partial<ParkedRoomState<typeof engine>> = {}) {
  const base = {
    pendingSnapshotRef: { current: null as RoomStatePayload | null },
    isCreator: false,
    openTimerRef: { current: null },
    latestKnownSeqRef: { current: 0 },
    awaitPaper: vi.fn(async () => true),
    restore: vi.fn(async () => {}),
    setRoomContentReady: vi.fn(),
    finishOpenTimer: vi.fn(),
  }
  return { ...base, ...patch }
}

describe('openParkedRoomState (#493)', () => {
  it('restores the parked room_state once the paper is in, and consumes it', async () => {
    const d = deps({ pendingSnapshotRef: { current: parked } })
    await openParkedRoomState(engine, d)
    expect(d.awaitPaper).toHaveBeenCalledWith(engine)
    expect(d.restore).toHaveBeenCalledWith(parked)
    expect(d.pendingSnapshotRef.current).toBeNull()
    // The restore itself decides when the room is open.
    expect(d.setRoomContentReady).not.toHaveBeenCalled()
  })

  it('abandons the restore when the paper never arrives', async () => {
    const d = deps({ pendingSnapshotRef: { current: parked }, awaitPaper: vi.fn(async () => false) })
    await openParkedRoomState(engine, d)
    expect(d.restore).not.toHaveBeenCalled()
  })

  it('opens a joiner remount with nothing parked — after the paper, not before', async () => {
    const d = deps()
    await openParkedRoomState(engine, d)
    expect(d.setRoomContentReady).toHaveBeenCalledWith(true)
    expect(d.finishOpenTimer).toHaveBeenCalledWith(engine)

    const noPaper = deps({ awaitPaper: vi.fn(async () => false) })
    await openParkedRoomState(engine, noPaper)
    expect(noPaper.setRoomContentReady).not.toHaveBeenCalled()
  })

  it('leaves a creator with nothing parked for the first room_state to decide', async () => {
    const d = deps({ isCreator: true })
    await openParkedRoomState(engine, d)
    expect(d.awaitPaper).not.toHaveBeenCalled()
    expect(d.setRoomContentReady).not.toHaveBeenCalled()
  })
})

it.each([
  { snapshot: null, tail: [1, 47], before: 0, head: 47 },
  { snapshot: 47, tail: [], before: 0, head: 47 },
  { snapshot: 45, tail: [46, 47], before: 0, head: 47 },
  { snapshot: null, tail: [], before: 0, head: 0 },
  { snapshot: null, tail: [47], before: 48, head: 48 },
])('parked authoritative head before paper: $snapshot/$tail/current$before', async ({ snapshot, tail, before, head }) => {
  const payload: RoomStatePayload = {
    latestSnapshotSeq: snapshot,
    tailOperations: tail.map(seq => ({ type: 'paper_dry' as const, id: 'dry-' + seq, userId: 'A', timestamp: seq, seq })),
    participants: [], palette: [], frozen: false,
  }
  const d = deps({ pendingSnapshotRef: { current: payload }, latestKnownSeqRef: { current: before } })
  vi.mocked(d.awaitPaper).mockImplementation(async () => {
    expect(d.latestKnownSeqRef.current).toBe(head)
    return true
  })
  vi.mocked(d.restore).mockImplementation(async () => { expect(d.latestKnownSeqRef.current).toBe(head) })
  await openParkedRoomState(engine, d)
  expect(d.latestKnownSeqRef.current).toBe(head)
})

it('keeps peer48 arriving during the paper wait instead of replacing it with parked47', async () => {
  const payload: RoomStatePayload = {
    latestSnapshotSeq: null,
    tailOperations: [{ type: 'paper_dry', id: 'd47', userId: 'A', timestamp: 47, seq: 47 }],
    participants: [], palette: [], frozen: false,
  }
  const d = deps({ pendingSnapshotRef: { current: payload } })
  vi.mocked(d.awaitPaper).mockImplementation(async () => {
    expect(d.latestKnownSeqRef.current).toBe(47)
    d.latestKnownSeqRef.current = 48
    return true
  })
  vi.mocked(d.restore).mockImplementation(async () => {
    expect(d.latestKnownSeqRef.current).toBe(48)
    // Existing clear-prefix equality stays false; this tail is not the known head.
    expect(payload.tailOperations.at(-1)?.seq === d.latestKnownSeqRef.current).toBe(false)
  })
  await openParkedRoomState(engine, d)
  expect(d.latestKnownSeqRef.current).toBe(48)
})
