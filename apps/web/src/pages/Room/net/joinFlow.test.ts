import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { JoinResult } from '@grafetto/shared'

import type { TFunction } from '../../../i18n'
import { addRoomInvite, moveRoomToFolder } from '../../../lib/api/api'
import { clearNotices, useNoticeStore } from '../../../stores/noticeStore'
import { resetRoomStore } from '../../../stores/roomStore'
import { createJoinFlow, type CreatorNavState, type JoinFlowDeps } from './joinFlow'

vi.mock('../../../lib/api/api', () => ({ addRoomInvite: vi.fn(), moveRoomToFolder: vi.fn() }))

/** (#493) Getting into a lesson and staying in it, driven through the two
 *  joining emits. Each test answers them the way the server would and checks
 *  what the client did about it — the paths that until now only a live
 *  socket (and, for most of them, a dropped one) could reach. */

const t: TFunction = key => key

const CREATOR: CreatorNavState = {
  room: {
    id: 'L', name: 'Cube', paper: 'flat', paperColor: undefined, infinite: false,
    canvasWidth: 1024, canvasHeight: 1024, enabledTools: undefined, classVisibility: 'teacher_only',
  },
  password: 'pw',
}

type Emit<P> = { data: P; ack: (result: JoinResult) => void }

function setup(patch: Partial<JoinFlowDeps> = {}) {
  const joins: Emit<Parameters<JoinFlowDeps['joinRoom']>[0]>[] = []
  const creates: Emit<Parameters<JoinFlowDeps['createRoom']>[0]>[] = []
  let releaseIdle: () => void = () => {}
  const deps: JoinFlowDeps = {
    id: 'L', isCreator: false, creatorDraft: undefined,
    joinRoom: (data, ack) => { joins.push({ data, ack }) },
    createRoom: (data, ack) => { creates.push({ data, ack }) },
    isCurrentSocket: () => true,
    noteConnected: vi.fn(),
    applyIdentity: vi.fn(),
    setRoomContentReady: vi.fn(),
    hasJoinedRef: { current: false },
    lastJoinAttemptRef: { current: null },
    myDisplayNameRef: { current: 'Ann' },
    latestKnownSeqRef: { current: 0 },
    lastConfirmedSeqRef: { current: 0 },
    outboxRef: {
      current: {
        resendAll: vi.fn(async () => {}),
        whenIdle: vi.fn(() => new Promise<void>(resolve => { releaseIdle = resolve })),
      },
    },
    wantedBoardRef: { current: null },
    boardIdRef: { current: 'L' },
    socketBoardRef: { current: 'L' },
    isOwnerRef: { current: false },
    engineRef: { current: { resetPeerLiveStrokes: vi.fn() } },
    streamedStrokeIdsRef: { current: new Set(['g1']) },
    tRef: { current: t },
    ...patch,
  }
  return { deps, joins, creates, flow: createJoinFlow(deps), idle: () => releaseIdle() }
}

const notices = () => useNoticeStore.getState().notices.map(n => n.message)

beforeEach(() => {
  resetRoomStore()
  clearNotices()
  vi.mocked(moveRoomToFolder).mockReset().mockResolvedValue({ ok: true })
  vi.mocked(addRoomInvite).mockReset().mockResolvedValue({ email: 'a@b.c', invitedAt: '2026-09-25T00:00:00Z' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the creator', () => {
  it('creates the room on the first connect, and only then drains the outbox', () => {
    const { deps, creates, joins, flow } = setup({ isCreator: true, creatorDraft: CREATOR })
    flow.handleConnect()
    expect(deps.noteConnected).toHaveBeenCalled()
    expect(joins).toHaveLength(0)
    expect(creates).toHaveLength(1)
    expect(creates[0].data).toMatchObject({ room: CREATOR.room, password: 'pw', name: 'Ann', lastKnownSeq: undefined })
    expect(deps.outboxRef.current.resendAll).not.toHaveBeenCalled()

    creates[0].ack({ ok: true, userId: 'u1' })
    expect(deps.hasJoinedRef.current).toBe(true)
    expect(deps.applyIdentity).toHaveBeenCalledWith('u1')
    expect(deps.outboxRef.current.resendAll).toHaveBeenCalledOnce()
  })

  it('files the new room into the folder it was created from, and sends the invites', () => {
    const { creates, flow } = setup({
      isCreator: true, creatorDraft: { ...CREATOR, folderId: 'F', invites: ['a@b.c', 'd@e.f'] },
    })
    flow.handleConnect()
    creates[0].ack({ ok: true, userId: 'u1' })
    expect(moveRoomToFolder).toHaveBeenCalledWith('L', 'F')
    expect(addRoomInvite).toHaveBeenCalledTimes(2)
  })

  it('says so when an invite did not land — the room is already invite-only', async () => {
    vi.mocked(addRoomInvite).mockRejectedValueOnce(new Error('nope'))
    const { creates, flow } = setup({ isCreator: true, creatorDraft: { ...CREATOR, invites: ['a@b.c', 'd@e.f'] } })
    flow.handleConnect()
    creates[0].ack({ ok: true, userId: 'u1' })
    await vi.waitFor(() => expect(notices()).toContain('room.invitesFailed'))
  })

  // A reconnect must not turn the page, nor re-create the room.
  it('rejoins the board it was on after a drop, rather than creating again', () => {
    const { creates, joins, flow } = setup({
      isCreator: true, creatorDraft: CREATOR,
      hasJoinedRef: { current: true }, boardIdRef: { current: 'B2' }, latestKnownSeqRef: { current: 40 },
    })
    flow.handleConnect()
    expect(creates).toHaveLength(0)
    expect(joins[0].data).toEqual({ roomId: 'B2', name: 'Ann', password: 'pw', lastKnownSeq: 40 })
  })
})

describe('a joiner', () => {
  // The first join waits for the gate's form.
  it('joins nothing on the first connect', () => {
    const { joins, creates, flow } = setup()
    flow.handleConnect()
    expect(joins).toHaveLength(0)
    expect(creates).toHaveLength(0)
  })

  it('rejoins with the credentials it last used after a drop, and then drains the outbox', () => {
    const { deps, joins, flow } = setup({
      hasJoinedRef: { current: true }, lastJoinAttemptRef: { current: { name: 'Bob', password: 'x' } },
      latestKnownSeqRef: { current: 12 },
    })
    flow.handleConnect()
    expect(joins[0].data).toEqual({ roomId: 'L', name: 'Bob', password: 'x', lastKnownSeq: 12 })
    joins[0].ack({ ok: true, userId: 'u2' })
    expect(deps.outboxRef.current.resendAll).toHaveBeenCalledOnce()
  })
})

describe('a refused join the gate cannot show', () => {
  it('is said out loud, and a final refusal stops the automatic rejoin', () => {
    const { deps, joins, flow } = setup({
      hasJoinedRef: { current: true }, lastJoinAttemptRef: { current: { name: 'Bob' } },
    })
    flow.handleConnect()
    joins[0].ack({ ok: false, error: 'access_revoked' })
    expect(deps.hasJoinedRef.current).toBe(false)
    expect(notices()).toHaveLength(1)
  })

  // Busy is worth asking again on the next reconnect.
  it('keeps the rejoin armed when the server was only busy', () => {
    const { deps, joins, flow } = setup({
      hasJoinedRef: { current: true }, lastJoinAttemptRef: { current: { name: 'Bob' } },
    })
    flow.handleConnect()
    joins[0].ack({ ok: false, error: 'server_busy' })
    expect(deps.hasJoinedRef.current).toBe(true)
  })
})

describe('turning the page', () => {
  it('does nothing before the join, or towards the board already shown', async () => {
    const before = setup()
    await before.flow.switchBoard('B2')
    expect(before.joins).toHaveLength(0)

    const same = setup({ hasJoinedRef: { current: true } })
    await same.flow.switchBoard('L')
    expect(same.joins).toHaveLength(0)
  })

  // An operation on the wire while the socket moves would be recorded
  // against the next board: the outbox drains first, the canvas blocked.
  it('blocks the canvas, waits for the outbox, then asks to move', async () => {
    const { deps, joins, flow, idle } = setup({ hasJoinedRef: { current: true } })
    const turning = flow.switchBoard('B2')
    expect(deps.wantedBoardRef.current).toBe('B2')
    expect(deps.setRoomContentReady).toHaveBeenCalledWith(false)
    expect(joins).toHaveLength(0)

    idle()
    await turning
    expect(deps.socketBoardRef.current).toBeNull()
    expect(joins[0].data).toMatchObject({ roomId: 'B2', name: 'Ann' })
  })

  it('lets a later turn supersede one still waiting', async () => {
    const { joins, flow, idle } = setup({ hasJoinedRef: { current: true } })
    const first = flow.switchBoard('B2')
    idle()
    const second = flow.switchBoard('B3')
    idle()
    await Promise.all([first, second])
    expect(joins.map(j => j.data.roomId)).toEqual(['B3'])
  })

  it('does not emit on a socket the page has since replaced', async () => {
    const { joins, flow, idle } = setup({ hasJoinedRef: { current: true }, isCurrentSocket: () => false })
    const turning = flow.switchBoard('B2')
    idle()
    await turning
    expect(joins).toHaveLength(0)
  })

  it('stays where it was, unblocked, when the move is refused', async () => {
    const { deps, joins, flow, idle } = setup({ hasJoinedRef: { current: true } })
    const turning = flow.switchBoard('B2')
    idle()
    await turning
    joins[0].ack({ ok: false, error: 'not_found' })
    expect(deps.wantedBoardRef.current).toBeNull()
    expect(deps.socketBoardRef.current).toBe('L')
    expect(deps.setRoomContentReady).toHaveBeenLastCalledWith(true)
  })
})

describe('a full resync', () => {
  // The live stream is no longer trusted: its bookkeeping restarts, and the
  // rejoin asks for everything past what this client already has.
  it('resets the live bookkeeping and rejoins the current board from the known seq', () => {
    const { deps, joins, flow } = setup({
      lastConfirmedSeqRef: { current: 30 }, latestKnownSeqRef: { current: 31 },
      wantedBoardRef: { current: 'B2' },
    })
    flow.requestFullResync()
    expect(deps.lastConfirmedSeqRef.current).toBe(0)
    expect(deps.engineRef.current!.resetPeerLiveStrokes).toHaveBeenCalled()
    expect(deps.streamedStrokeIdsRef.current.size).toBe(0)
    expect(joins[0].data).toMatchObject({ roomId: 'B2', lastKnownSeq: 31 })
  })
})
