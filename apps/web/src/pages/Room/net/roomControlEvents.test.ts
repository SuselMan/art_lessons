import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import type { TFunction } from '../../../i18n'
import { clearNotices, useNoticeStore } from '../../../stores/noticeStore'
import { resetRoomStore, useRoomStore } from '../../../stores/roomStore'
import { applyJoinRequestCreated, applyJoinRequestResolved } from './joinQueue'
import { createRoomControlEventHandlers, type RoomControlEventDeps } from './roomControlEvents'

vi.mock('./joinQueue', () => ({ applyJoinRequestCreated: vi.fn(), applyJoinRequestResolved: vi.fn() }))

/** (#493) What the owner decides, as it reaches this client. The join-queue
 *  half is the part with rules in it — when an answer may restart a join and
 *  when it only updates the owner's list — so that is where most of this is. */

const t: TFunction = key => key

function setup(overrides: Partial<RoomControlEventDeps> = {}) {
  const deps = {
    sessionId: 'L',
    engineRef: { current: { endPeerLiveStroke: vi.fn(() => 0) } },
    requestFullResync: vi.fn(),
    queryClient: new QueryClient(),
    hasJoinedRef: { current: false },
    retryJoinRef: { current: vi.fn() },
    setJoinState: vi.fn(),
    tRef: { current: t },
    ...overrides,
  }
  return { deps, on: createRoomControlEventHandlers(deps) }
}

beforeEach(() => {
  resetRoomStore()
  clearNotices()
  vi.mocked(applyJoinRequestCreated).mockClear()
  vi.mocked(applyJoinRequestResolved).mockClear()
})

describe('join_request_resolved, while waiting at the gate', () => {
  it('finishes the join on approval — no second button to press', () => {
    const { deps, on } = setup()
    on.join_request_resolved({ roomId: 'L', requestId: 'r1', approved: true })
    expect(deps.retryJoinRef.current).toHaveBeenCalledOnce()
    expect(deps.setJoinState).not.toHaveBeenCalled()
  })

  it('shows the denial on refusal', () => {
    const { deps, on } = setup()
    on.join_request_resolved({ roomId: 'L', requestId: 'r1', approved: false })
    expect(deps.setJoinState).toHaveBeenCalledWith('denied')
    expect(deps.retryJoinRef.current).not.toHaveBeenCalled()
  })
})

describe('join_request_resolved, once inside', () => {
  it('never restarts the join — a stale answer after a reconnect must not re-enter', () => {
    const { deps, on } = setup({ hasJoinedRef: { current: true } })
    on.join_request_resolved({ roomId: 'L', requestId: 'r1', approved: true })
    expect(deps.retryJoinRef.current).not.toHaveBeenCalled()
    expect(deps.setJoinState).not.toHaveBeenCalled()
  })

  it('takes the row off the owner’s queue for this lesson', () => {
    const { deps, on } = setup({ hasJoinedRef: { current: true } })
    on.join_request_resolved({ roomId: 'L', requestId: 'r1', approved: true })
    expect(applyJoinRequestResolved).toHaveBeenCalledWith(deps.queryClient, 'L', 'r1')
  })

  it('reads the lesson from the store once room_state has corrected the URL id', () => {
    useRoomStore.getState().setLesson({
      id: 'LESSON', boards: [], activeBoardId: null, assignments: [], activeAssignmentId: null,
      spotlightBoardId: null, classVisibility: 'teacher_only', handsRaised: [],
    })
    const { on } = setup({ hasJoinedRef: { current: true }, sessionId: 'BOARD' })

    on.join_request_resolved({ roomId: 'BOARD', requestId: 'r1', approved: true })
    expect(applyJoinRequestResolved).not.toHaveBeenCalled()

    on.join_request_resolved({ roomId: 'LESSON', requestId: 'r2', approved: true })
    expect(applyJoinRequestResolved).toHaveBeenCalledOnce()
  })
})

describe('kicked', () => {
  it('stops the auto-rejoin and says so, until dismissed', () => {
    const { deps, on } = setup({ hasJoinedRef: { current: true } })
    on.kicked({ roomId: 'L' })
    expect(deps.hasJoinedRef.current).toBe(false)
    const notice = useNoticeStore.getState().notices.find(n => n.message === 'room.kicked')
    expect(notice?.variant).toBe('error')
    // A state, not an event: it never times out, so it must be dismissible.
    expect(notice?.dismissible).toBe(true)
  })
})

describe('the rest are the store', () => {
  it('reflects palette, freeze, tools and closing', () => {
    // Tools and closing are columns of the room, patched in place.
    useRoomStore.getState().setRoomInfo({
      id: 'L', name: 'Cube', paper: 'flat', infinite: false, width: 1024, height: 1024, accessMode: 'anyone_with_link',
    })
    const { on } = setup()
    on.palette_updated({ palette: ['#123456'] })
    on.room_frozen_changed({ frozen: true })
    on.room_tools_changed({ enabledTools: [] })
    on.room_closed_changed({ closedAt: '2026-09-25T00:00:00Z' })
    const s = useRoomStore.getState()
    expect(s.palette).toEqual(['#123456'])
    expect(s.roomFrozen).toBe(true)
    expect(s.room?.enabledTools).toEqual([])
    expect(s.room?.closedAt).toBe('2026-09-25T00:00:00Z')
  })

  it('marks one participant frozen for everyone', () => {
    useRoomStore.getState().applyParticipantAction({
      type: 'room_state',
      participants: [{ userId: 'x', name: 'X', role: 'member', color: '#000', frozen: false, boardId: 'L' }],
    })
    const { on } = setup()
    on.participant_frozen_changed({ userId: 'x', frozen: true })
    expect(useRoomStore.getState().participants[0].frozen).toBe(true)
  })

  it('passes a new join request to the owner’s queue', () => {
    const { deps, on } = setup()
    const request = { id: 'r1', userId: 'u1', name: 'Ann', email: null, requestedAt: '2026-09-25T00:00:00Z' }
    on.join_request_created({ roomId: 'L', request })
    expect(applyJoinRequestCreated).toHaveBeenCalledWith(deps.queryClient, 'L', request)
  })
})


describe('#699 blocking a gesture whose live ink was already painted', () => {
  beforeEach(() => {
    useRoomStore.getState().applyParticipantAction({
      type: 'room_state', participants: ['a', 'b'].map(userId => ({
        userId, name: userId, role: 'member', color: '#000', frozen: false, boardId: 'L',
      })),
    })
  })

  for (const mode of ['room freeze', 'closed lesson', 'point freeze']) {
    it(`repairs orphaned ink after ${mode}`, () => {
      const endPeerLiveStroke = vi.fn((id: string) => id === 'a' ? 12 : 0)
      const { deps, on } = setup({ engineRef: { current: { endPeerLiveStroke } } })
      if (mode === 'room freeze') on.room_frozen_changed({ frozen: true })
      else if (mode === 'closed lesson') on.room_closed_changed({ closedAt: '2026-10-02T13:00:00Z' })
      else on.participant_frozen_changed({ userId: 'a', frozen: true })
      expect(endPeerLiveStroke).toHaveBeenCalledWith('a')
      expect(endPeerLiveStroke).toHaveBeenCalledTimes(mode === 'point freeze' ? 1 : 2)
      expect(deps.requestFullResync).toHaveBeenCalledOnce()
    })
  }

  it('does not resync a room with no unrecorded live ink', () => {
    const { deps, on } = setup()
    on.room_frozen_changed({ frozen: true })
    expect(deps.requestFullResync).not.toHaveBeenCalled()
  })

  it('unblocking does not retire a new, allowed gesture', () => {
    const { deps, on } = setup()
    on.room_frozen_changed({ frozen: false })
    on.participant_frozen_changed({ userId: 'a', frozen: false })
    on.room_closed_changed({ closedAt: null })
    expect(deps.engineRef.current?.endPeerLiveStroke).not.toHaveBeenCalled()
    expect(deps.requestFullResync).not.toHaveBeenCalled()
  })
})
