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
