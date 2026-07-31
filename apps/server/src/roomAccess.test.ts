import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkJoinAccess } from './roomAccess.js'

// The gate reads Postgres and the live room record. Prisma is mocked (same
// pattern as the route tests); the room record is real — `createRoom` from
// rooms.ts, so the owner/mode/password facts under test are the ones the
// server actually holds, not a hand-built stand-in.
const mockPrisma = vi.hoisted(() => ({
  roomBlock: { findUnique: vi.fn() },
  roomInvite: { findUnique: vi.fn() },
  roomJoinRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  roomParticipant: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
  room: { create: vi.fn(), update: vi.fn() },
  roomPalette: { upsert: vi.fn() },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

const { _flushPendingWrites, createRoom, setRoomAccessMode } = await import('./rooms.js')

let nextRoomId = 0
const createdRoomIds: string[] = []

/** A live room owned by `teacher`, in `anyone_with_link` unless told otherwise. */
function makeRoom(opts: { password?: string; inviteOnly?: boolean } = {}): string {
  const id = `room-${nextRoomId++}`
  createdRoomIds.push(id)
  createRoom(
    { id, name: 'Still life', paper: 'coarse', infinite: false, canvasWidth: 1240, canvasHeight: 1754 },
    opts.password, 'teacher', 'Teacher', `sock-${id}`,
  )
  if (opts.inviteOnly) setRoomAccessMode(id, 'invite_only')
  return id
}

beforeEach(async () => {
  // Same drain as rooms.test.ts: createRoom fires off Postgres writes whose
  // rejections would otherwise settle after the test that made them.
  await Promise.all(createdRoomIds.splice(0).map(_flushPendingWrites))
  for (const model of Object.values(mockPrisma)) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset()
  }
  // Default world: nobody blocked, nobody queued, nobody invited, no prior
  // participation, and the joiner is a signed-in account.
  mockPrisma.roomBlock.findUnique.mockResolvedValue(null)
  mockPrisma.roomInvite.findUnique.mockResolvedValue(null)
  mockPrisma.roomJoinRequest.findUnique.mockResolvedValue(null)
  mockPrisma.roomJoinRequest.upsert.mockResolvedValue({})
  mockPrisma.roomParticipant.findUnique.mockResolvedValue(null)
  mockPrisma.user.findUnique.mockResolvedValue({ email: 'student@example.com' })
})

describe('checkJoinAccess — an open room (#225)', () => {
  it('lets anyone with the link in', async () => {
    expect(await checkJoinAccess(makeRoom(), 'student', 'Alice', undefined)).toEqual({ ok: true })
  })

  it('is not_found for a room that was never loaded', async () => {
    expect(await checkJoinAccess('no-such-room', 'student', 'Alice', undefined))
      .toEqual({ ok: false, error: 'not_found' })
  })

  it('still asks for the password when the room has one', async () => {
    const roomId = makeRoom({ password: 'secret' })

    expect(await checkJoinAccess(roomId, 'student', 'Alice', 'nope'))
      .toEqual({ ok: false, error: 'wrong_password' })
    expect(await checkJoinAccess(roomId, 'student', 'Alice', undefined))
      .toEqual({ ok: false, error: 'wrong_password' })
    expect(await checkJoinAccess(roomId, 'student', 'Alice', 'secret')).toEqual({ ok: true })
  })
})

describe('checkJoinAccess — blocks (#225)', () => {
  it('refuses a blocked user before anything else can admit them', async () => {
    // Open room, no password, and the user is even a prior participant — every
    // other branch in the gate would say yes. The block is checked first
    // precisely so none of them gets the chance.
    const roomId = makeRoom()
    mockPrisma.roomBlock.findUnique.mockResolvedValue({ id: 'block-1' })
    mockPrisma.roomParticipant.findUnique.mockResolvedValue({ id: 'part-1' })

    expect(await checkJoinAccess(roomId, 'student', 'Alice', undefined))
      .toEqual({ ok: false, error: 'access_revoked' })
  })

  it('never blocks the owner out of their own room', async () => {
    const roomId = makeRoom()
    // Even if a row somehow exists for them, it is not consulted: a room whose
    // owner can be locked out is a room that can be stolen.
    mockPrisma.roomBlock.findUnique.mockResolvedValue({ id: 'block-1' })

    expect(await checkJoinAccess(roomId, 'teacher', 'Teacher', undefined)).toEqual({ ok: true })
    expect(mockPrisma.roomBlock.findUnique).not.toHaveBeenCalled()
  })
})

describe('checkJoinAccess — the owner (#225)', () => {
  it('gets in without the password they set', async () => {
    // Deliberate change from pre-#225 behaviour, where the password gated
    // everyone equally: being shut out of your own lesson for forgetting it is
    // a support ticket, not a security property.
    const roomId = makeRoom({ password: 'secret' })

    expect(await checkJoinAccess(roomId, 'teacher', 'Teacher', undefined)).toEqual({ ok: true })
  })

  it('gets into their own invite_only room without being on its allow-list', async () => {
    const roomId = makeRoom({ inviteOnly: true })

    expect(await checkJoinAccess(roomId, 'teacher', 'Teacher', undefined)).toEqual({ ok: true })
    expect(mockPrisma.roomJoinRequest.upsert).not.toHaveBeenCalled()
  })
})

describe('checkJoinAccess — invite_only (#225)', () => {
  it('lets in an address on the allow-list', async () => {
    const roomId = makeRoom({ inviteOnly: true })
    mockPrisma.roomInvite.findUnique.mockResolvedValue({ id: 'invite-1' })

    expect(await checkJoinAccess(roomId, 'student', 'Alice', undefined)).toEqual({ ok: true })
    expect(mockPrisma.roomInvite.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId_email: { roomId, email: 'student@example.com' } },
    }))
    expect(mockPrisma.roomJoinRequest.upsert).not.toHaveBeenCalled()
  })

  it('tells a guest with no email to sign in, and does not queue them', async () => {
    const roomId = makeRoom({ inviteOnly: true })
    // An identity-cookie browser that has never signed in — User row, no email.
    mockPrisma.user.findUnique.mockResolvedValue({ email: null })

    expect(await checkJoinAccess(roomId, 'guest', 'Guest-4821', undefined))
      .toEqual({ ok: false, error: 'login_required' })
    // Queueing them would ask the owner to approve "someone"; signing in is
    // the only move that can change the answer.
    expect(mockPrisma.roomJoinRequest.upsert).not.toHaveBeenCalled()
  })

  it('queues everyone else and records what they call themselves', async () => {
    const roomId = makeRoom({ inviteOnly: true })

    expect(await checkJoinAccess(roomId, 'student', 'Alice', undefined))
      .toEqual({ ok: false, error: 'pending_approval' })
    expect(mockPrisma.roomJoinRequest.upsert).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId, userId: 'student' } },
      create: { roomId, userId: 'student', name: 'Alice', status: 'pending' },
      update: { name: 'Alice', status: 'pending', resolvedAt: null },
    })
  })

  it('lets in someone whose request was approved', async () => {
    const roomId = makeRoom({ inviteOnly: true })
    mockPrisma.roomJoinRequest.findUnique.mockResolvedValue({ status: 'approved' })

    expect(await checkJoinAccess(roomId, 'student', 'Alice', undefined)).toEqual({ ok: true })
  })

  it('reopens a denied request instead of leaving the asker stuck', async () => {
    const roomId = makeRoom({ inviteOnly: true })
    mockPrisma.roomJoinRequest.findUnique.mockResolvedValue({ status: 'denied' })

    // One row per (room, user) is what keeps a refresh loop from growing the
    // owner's queue; re-asking stays possible and stays visible, and the
    // answer to someone who won't take no is a block.
    expect(await checkJoinAccess(roomId, 'student', 'Alice', undefined))
      .toEqual({ ok: false, error: 'pending_approval' })
    expect(mockPrisma.roomJoinRequest.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { name: 'Alice', status: 'pending', resolvedAt: null },
    }))
  })

  it('keeps the class that is already in the room in it', async () => {
    // The room was open when these students joined; the teacher has just
    // flipped it to invite_only. Tablets reconnect constantly — locking them
    // out here would drop the whole lesson into the approval queue at once.
    const roomId = makeRoom({ inviteOnly: true })
    mockPrisma.roomParticipant.findUnique.mockResolvedValue({ id: 'part-1' })

    expect(await checkJoinAccess(roomId, 'student', 'Alice', undefined)).toEqual({ ok: true })
    expect(mockPrisma.roomJoinRequest.upsert).not.toHaveBeenCalled()
    // Not even looked up: prior participation settles it without needing to
    // know who they are.
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('checks the password before the mode, so a wrong guess learns nothing', async () => {
    const roomId = makeRoom({ password: 'secret', inviteOnly: true })

    expect(await checkJoinAccess(roomId, 'student', 'Alice', 'nope'))
      .toEqual({ ok: false, error: 'wrong_password' })
    // No queue entry, no login_required — a failed password tells the caller
    // nothing about how the room admits people, and leaves no trace in the
    // owner's queue for someone who never got past the door.
    expect(mockPrisma.roomJoinRequest.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
  })
})
