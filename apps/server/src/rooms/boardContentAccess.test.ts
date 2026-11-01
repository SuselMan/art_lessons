import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mayReadBoardContent } from './boardContentAccess.js'
import { passwordGrant } from './roomPersistence.js'

const mocks = vi.hoisted(() => ({
  room: { findUnique: vi.fn() },
  roomBlock: { findUnique: vi.fn() },
  roomParticipant: { findUnique: vi.fn() },
  flushRoomWrites: vi.fn(),
}))
vi.mock('../db/prisma.js', () => ({ prisma: mocks }))
vi.mock('./roomRegistry.js', () => ({ flushRoomWrites: mocks.flushRoomWrites, enqueueWrite: vi.fn() }))
const board = { id: 'board', lessonId: 'lesson', boardOwnerId: null as string | null }
const lesson = { ownerId: 'teacher', passwordHash: 'password-revision-1' as string | null,
  classVisibility: 'teacher_only' as const, spotlightBoardId: null as string | null }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.room.findUnique.mockImplementation(async ({ where }) => where.id === 'board' ? board : lesson)
  mocks.roomBlock.findUnique.mockResolvedValue(null)
  mocks.roomParticipant.findUnique.mockResolvedValue({ passwordGrant: passwordGrant(lesson.passwordHash) })
})

describe('HTTP board access independent of socket presence', () => {
  it('allows an admitted user even with no resident room or live participant', async () => {
    expect(await mayReadBoardContent('board', 'student')).toBe(true)
    expect(mocks.roomParticipant.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId_userId: { roomId: 'lesson', userId: 'student' } },
    }))
  })
  it('rejects a user with only an identity cookie, never admitted to the lesson', async () => {
    mocks.roomParticipant.findUnique.mockResolvedValue(null)
    expect(await mayReadBoardContent('board', 'stranger')).toBe(false)
  })
  it('rejects a kicked user despite prior participation and the correct password grant', async () => {
    mocks.roomBlock.findUnique.mockResolvedValue({ id: 'block' })
    expect(await mayReadBoardContent('board', 'student')).toBe(false)
  })
  it('invalidates the old grant when the password changes', async () => {
    mocks.roomParticipant.findUnique.mockResolvedValue({ passwordGrant: passwordGrant('old-password-revision') })
    expect(await mayReadBoardContent('board', 'student')).toBe(false)
  })
  it('requires re-entry for a legacy membership without a password grant', async () => {
    mocks.roomParticipant.findUnique.mockResolvedValue({ passwordGrant: null })
    expect(await mayReadBoardContent('board', 'student')).toBe(false)
  })
  it('allows legacy membership in a room without a password', async () => {
    mocks.room.findUnique.mockResolvedValueOnce(board).mockResolvedValueOnce({ ...lesson, passwordHash: null })
    mocks.roomParticipant.findUnique.mockResolvedValue({ passwordGrant: null })
    expect(await mayReadBoardContent('board', 'student')).toBe(true)
  })
  it('allows the owner without membership or password', async () => {
    mocks.roomParticipant.findUnique.mockResolvedValue(null)
    expect(await mayReadBoardContent('board', 'teacher')).toBe(true)
  })
  it('denies another student’s personal board; honours current spotlight', async () => {
    mocks.room.findUnique.mockResolvedValueOnce({ ...board, boardOwnerId: 'other' }).mockResolvedValueOnce(lesson)
    expect(await mayReadBoardContent('board', 'student')).toBe(false)
    mocks.room.findUnique.mockResolvedValueOnce({ ...board, boardOwnerId: 'other' })
      .mockResolvedValueOnce({ ...lesson, spotlightBoardId: 'board' })
    expect(await mayReadBoardContent('board', 'student')).toBe(true)
  })
  it('waits for the successful join’s queued membership before reading it', async () => {
    let complete!: () => void
    mocks.flushRoomWrites.mockReturnValue(new Promise<void>(resolve => { complete = resolve }))
    const access = mayReadBoardContent('board', 'student')
    await vi.waitFor(() => expect(mocks.flushRoomWrites).toHaveBeenCalledWith('board'))
    expect(mocks.roomParticipant.findUnique).not.toHaveBeenCalled()
    complete()
    expect(await access).toBe(true)
  })
  it('denies a missing or deleted board', async () => {
    mocks.room.findUnique.mockResolvedValue(null)
    expect(await mayReadBoardContent('missing', 'student')).toBe(false)
  })
})

it('refuses an unsupported board format before membership or any content is read', async () => {
  for (const rasterVersion of ['straight-rgba8-v1', 'future']) {
    mocks.room.findUnique.mockResolvedValueOnce({ ...board, rasterVersion })
    expect(await mayReadBoardContent('board', 'teacher')).toBe(false)
  }
  expect(mocks.roomParticipant.findUnique).not.toHaveBeenCalled()
})

it('uses explicit trusted mixed read format while preserving current DB block and membership policy',async()=>{
 mocks.room.findUnique.mockImplementation(async({where})=>where.id==='board'?{...board,rasterVersion:'straight-rgba8-v1'}:lesson)
 expect(await mayReadBoardContent('board','student')).toBe(false)
 expect(await mayReadBoardContent('board','student','mixed-v2')).toBe(true)
 mocks.roomBlock.findUnique.mockResolvedValue({id:'blocked'})
 expect(await mayReadBoardContent('board','student','mixed-v2')).toBe(false)
 mocks.roomBlock.findUnique.mockResolvedValue(null);mocks.roomParticipant.findUnique.mockResolvedValue(null)
 expect(await mayReadBoardContent('board','student','mixed-v2')).toBe(false)
 expect(await mayReadBoardContent('board','teacher')).toBe(false)
})

it('indexed captured drains do not await later drawing but still perform fresh stored membership checks',async()=>{
 mocks.flushRoomWrites.mockReturnValue(new Promise<void>(()=>{}))
 const current=vi.fn(),drains={roomId:'board',lessonId:'lesson',board:Promise.resolve(),lesson:Promise.resolve(),assertCurrent:current}
 expect(await mayReadBoardContent('board','student','mixed-v2',drains)).toBe(true)
 expect(mocks.flushRoomWrites).not.toHaveBeenCalled()
 mocks.roomParticipant.findUnique.mockResolvedValue(null)
 expect(await mayReadBoardContent('board','student','mixed-v2',drains)).toBe(false)
 expect(current.mock.calls.length).toBeGreaterThan(3)
})
it('indexed captured drains cannot publish across a queued live visibility or seat change',async()=>{
 let live=true
 const drains={roomId:'board',lessonId:'lesson',board:Promise.resolve(),lesson:Promise.resolve(),assertCurrent:()=>{if(!live)throw Error('Live policy changed')}}
 mocks.room.findUnique.mockImplementation(async({where})=>{if(where.id==='board'){live=false;return board}return lesson})
 await expect(mayReadBoardContent('board','student','mixed-v2',drains)).rejects.toThrow('Live policy changed')
 expect(mocks.roomParticipant.findUnique).not.toHaveBeenCalled()
})
