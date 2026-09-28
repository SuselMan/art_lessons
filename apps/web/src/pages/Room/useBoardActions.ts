import { useCallback, useState, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'

import type { BoardSummary, ClientToServerEvents, ServerToClientEvents } from '@grafetto/shared'

import { useConfirmDialog } from '../../components/ConfirmDialog/useConfirmDialog'
import { useT } from '../../i18n'
import { createBoard, deleteBoard, renameBoard, reorderBoard } from '../../lib/api/api'
import { activeBoardPayload, followDestination, followingAfterPick, movedOrder } from '../../lib/boards/boards'
import { ownBoardIn } from '../../lib/boards/classMode'
import { notifyError } from '../../stores/noticeStore'
import { useRoomStore } from '../../stores/roomStore'

export interface BoardActionsDeps {
  socketRef: RefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null>
  /** Takes this client onto a board — Room's switchBoard, through a ref
   *  because it is defined after the socket effect it needs. */
  switchBoardRef: RefObject<((next: string) => void) | null>
  isOwnerRef: RefObject<boolean>
}

/** (#595) Where following leads a student right now, from the store — for
 *  the callbacks that decide it at the moment of the tap. */
function destinationOf(s: {
  lessonId: string | null; activeBoardId: string | null; spotlightBoardId: string | null
  activeAssignmentId: string | null; boards: BoardSummary[]; userId: string
}): string | null {
  if (!s.lessonId) return null
  return followDestination({
    lessonId: s.lessonId, activeBoardId: s.activeBoardId, spotlightBoardId: s.spotlightBoardId,
    ownAssignmentBoardId: ownBoardIn(s.boards, s.activeAssignmentId, s.userId)?.id ?? null,
  })
}

/** (#493) The lesson's strip of boards, as actions: a page turn by hand (the
 *  owner's turns the class too, a student's decides whether they still
 *  follow), the chip back to the teacher, and the owner's add, rename,
 *  reorder and delete. Everything reads the store at the moment of the tap,
 *  so none of it re-creates on a render. Out of Room; covered by boards.spec. */
export function useBoardActions({ socketRef, switchBoardRef, isOwnerRef }: BoardActionsDeps) {
  const t = useT()
  const { confirm } = useConfirmDialog()
  const [boardsOpen, setBoardsOpen] = useState(false)
  // One request at a time from the "+": the board lands over REST *and* over
  // the socket, and a second tap during the round trip would make two pages.
  const [boardBusy, setBoardBusy] = useState(false)
  /** A page turn by hand. The owner's turn is also the class's: their board
   *  becomes the active one (persisted server-side, broadcast as
   *  `active_board_changed`). A student's turn decides whether they are still
   *  following — see followingAfterPick. */
  const selectBoard = useCallback((next: string) => {
    const s = useRoomStore.getState()
    if (!s.lessonId) return
    if (isOwnerRef.current) {
      const payload = activeBoardPayload(next, s.lessonId)
      s.setActiveBoardId(payload)
      socketRef.current?.emit('set_active_board', { boardId: payload })
    } else {
      // (#595) "Where following leads" is not always the teacher's board any
      // more — during a round it is the student's own.
      s.setFollowing(followingAfterPick(next, destinationOf(s) ?? s.lessonId))
    }
    switchBoardRef.current?.(next)
  }, [socketRef, switchBoardRef, isOwnerRef])
  /** The chip: back to the teacher, following on again. */
  const returnToTeacher = useCallback(() => {
    const s = useRoomStore.getState()
    if (!s.lessonId) return
    s.setFollowing(true)
    switchBoardRef.current?.(destinationOf(s) ?? s.lessonId)
  }, [switchBoardRef])
  const addBoard = useCallback(async () => {
    const lesson = useRoomStore.getState().lessonId
    if (!lesson || boardBusy) return
    setBoardBusy(true)
    try {
      const board = await createBoard(lesson)
      // The broadcast delivers it too; the reducer merges by id.
      useRoomStore.getState().applyBoardsAction({ type: 'board_created', board })
      selectBoard(board.id)
    } catch {
      notifyError(t('boards.error.create'), { key: 'board-create' })
    } finally {
      setBoardBusy(false)
    }
  }, [boardBusy, selectBoard, t])
  const renameBoardAction = useCallback(async (target: string, name: string) => {
    const s = useRoomStore.getState()
    const lesson = s.lessonId
    const previous = s.boards.find(b => b.id === target)?.name
    if (!lesson || previous === undefined) return
    // Optimistic, like the header's own rename: the field is already gone.
    s.applyBoardsAction({ type: 'board_renamed', boardId: target, name })
    if (target === lesson) s.setRoomName(name)
    try {
      await renameBoard(lesson, target, name)
    } catch {
      useRoomStore.getState().applyBoardsAction({ type: 'board_renamed', boardId: target, name: previous })
      if (target === lesson) useRoomStore.getState().setRoomName(previous)
      notifyError(t('boards.error.rename'), { key: 'board-rename' })
    }
  }, [t])
  const moveBoard = useCallback(async (target: string, direction: -1 | 1) => {
    const s = useRoomStore.getState()
    const lesson = s.lessonId
    if (!lesson) return
    const before = s.boards.map(b => b.id)
    const order = movedOrder(s.boards, target, direction, lesson)
    if (!order) return
    s.applyBoardsAction({ type: 'boards_reordered', order })
    try {
      await reorderBoard(lesson, target, order.indexOf(target))
    } catch {
      useRoomStore.getState().applyBoardsAction({ type: 'boards_reordered', order: before })
      notifyError(t('boards.error.reorder'), { key: 'board-reorder' })
    }
  }, [t])
  /** Hard delete, so it asks first — the same dialog shape as clearing a
   *  layer (#171). The strip updates from the `board_deleted` broadcast, and
   *  anyone on the board is moved by the server before it arrives. */
  const removeBoard = useCallback(async (target: string) => {
    const s = useRoomStore.getState()
    const lesson = s.lessonId
    const board = s.boards.find(b => b.id === target)
    if (!lesson || !board || target === lesson) return
    const ok = await confirm({
      title: t('boards.deleteTitle', { name: board.name }),
      message: t('boards.deleteMessage'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteBoard(lesson, target)
    } catch {
      notifyError(t('boards.error.delete'), { key: 'board-delete' })
    }
  }, [confirm, t])

  return {
    boardsOpen, setBoardsOpen, boardBusy, selectBoard, returnToTeacher, addBoard, renameBoardAction, moveBoard,
    removeBoard,
  }
}
