import type {CanonicalFullHistoryFormat} from './canonicalExecutionPolicy.js'
import { supportsCurrentRoomRaster } from './roomRasterAdmission.js'
import { prisma } from '../db/prisma.js'
import { canSeeBoard, lessonOf } from './lessons.js'
import { passwordGrant } from './roomPersistence.js'
import { flushRoomWrites } from './roomRegistry.js'

/** INTERNAL indexed owner only: captured queue tails must be paired with its
 * actual joined seat and strict live access-policy guard. This is not a wire
 * option or an authorization proof; current DB checks still run on every call. */
export interface CapturedBoardReadDrains {
 readonly roomId:string;readonly lessonId:string
 readonly board:Promise<void>;readonly lesson:Promise<void>
 readonly assertCurrent:()=>void
}

/** A cookie identifies the caller; a successful join grants content access.
 * Read current policy from storage, including when the last socket and resident
 * room have gone away. No live-participant shortcut may bypass a revocation. */
export async function mayReadBoardContent(roomId: string, userId: string,fullHistoryFormat:CanonicalFullHistoryFormat='frames-v1',captured?:CapturedBoardReadDrains): Promise<boolean> {
  const current=()=>captured?.assertCurrent()
  current()
  if(captured&&captured.roomId!==roomId)return false
  await (captured?captured.board:flushRoomWrites(roomId))
  current()
  const board = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, lessonId: true, boardOwnerId: true, rasterVersion: true },
  })
  current()
  if (!board || !supportsCurrentRoomRaster(board.rasterVersion,fullHistoryFormat)) return false
  const lessonId = lessonOf(board)
  // Successful seating queues membership before announcing the snapshot.
  // Await that write rather than racing it on the first HTTP request.
  if(captured&&captured.lessonId!==lessonId)return false
  await (captured?captured.lesson:flushRoomWrites(lessonId))
  current()
  const lesson = await prisma.room.findUnique({
    where: { id: lessonId },
    select: { ownerId: true, passwordHash: true, classVisibility: true, spotlightBoardId: true },
  })
  current()
  if (!lesson || !canSeeBoard(userId, { board, lesson })) return false
  if (lesson.ownerId === userId) return true
  const [blocked, membership] = await Promise.all([
    prisma.roomBlock.findUnique({ where: { roomId_userId: { roomId: lessonId, userId } }, select: { id: true } }),
    prisma.roomParticipant.findUnique({ where: { roomId_userId: { roomId: lessonId, userId } }, select: { passwordGrant: true } }),
  ])
  current()
  return !blocked && membership !== null
    && (!lesson.passwordHash || membership.passwordGrant === passwordGrant(lesson.passwordHash))
}
