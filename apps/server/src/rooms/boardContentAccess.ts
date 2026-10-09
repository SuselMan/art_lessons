import { prisma } from '../db/prisma.js'
import { canSeeBoard, lessonOf } from './lessons.js'
import { passwordGrant } from './roomPersistence.js'
import { flushRoomWrites } from './roomRegistry.js'

/** A cookie identifies the caller; a successful join grants content access.
 * Read current policy from storage, including when the last socket and resident
 * room have gone away. No live-participant shortcut may bypass a revocation. */
export async function mayReadBoardContent(roomId: string, userId: string): Promise<boolean> {
  await flushRoomWrites(roomId)
  const board = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, lessonId: true, boardOwnerId: true },
  })
  if (!board) return false
  const lessonId = lessonOf(board)
  // Successful seating queues membership before announcing the snapshot.
  // Await that write rather than racing it on the first HTTP request.
  await flushRoomWrites(lessonId)
  const lesson = await prisma.room.findUnique({
    where: { id: lessonId },
    select: { ownerId: true, passwordHash: true, classVisibility: true, spotlightBoardId: true },
  })
  if (!lesson || !canSeeBoard(userId, { board, lesson })) return false
  if (lesson.ownerId === userId) return true
  const [blocked, membership] = await Promise.all([
    prisma.roomBlock.findUnique({ where: { roomId_userId: { roomId: lessonId, userId } }, select: { id: true } }),
    prisma.roomParticipant.findUnique({ where: { roomId_userId: { roomId: lessonId, userId } }, select: { passwordGrant: true } }),
  ])
  return !blocked && membership !== null
    && (!lesson.passwordHash || membership.passwordGrant === passwordGrant(lesson.passwordHash))
}
