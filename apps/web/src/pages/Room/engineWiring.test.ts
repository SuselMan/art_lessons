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

describe('afterBoardPaint (#850)', () => {
  it('cancels a replaced board before GPU setup and retires only the started board', async () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    try {
      const { afterBoardPaint } = await import('./engineWiring')
      const oldStart = vi.fn(() => vi.fn())
      const cancelOld = afterBoardPaint(oldStart)
      frames[0](0) // A paint happened, but its deferred GPU setup has not run.
      cancelOld()
      const retire = vi.fn()
      const start = vi.fn(() => retire)
      const cancelCurrent = afterBoardPaint(start)
      expect(start).not.toHaveBeenCalled()
      frames[1](0)
      expect(start).not.toHaveBeenCalled()
      vi.runAllTimers()
      expect(oldStart).not.toHaveBeenCalled()
      expect(start).toHaveBeenCalledTimes(1)
      cancelCurrent()
      cancelCurrent()
      expect(retire).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
  })
})
