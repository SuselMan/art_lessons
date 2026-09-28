import { useCallback, useMemo, useState, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'

import type { ClassVisibility, ClientToServerEvents, Participant, ServerToClientEvents } from '@grafetto/shared'

import { useT } from '../../i18n'
import { followDestination, teacherBoardId } from '../../lib/boards/boards'
import {
  classGrid, followChip, isForeignPersonalBoard, isPersonalBoard, neighbourInGrid, ownBoardIn, stripBoards,
} from '../../lib/boards/classMode'
import { notifyError } from '../../stores/noticeStore'
import { useRoomStore } from '../../stores/roomStore'

export interface ClassViewDeps {
  socketRef: RefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null>
  switchBoardRef: RefObject<((next: string) => void) | null>
  isOwnerRef: RefObject<boolean>
  /** useBoardActions' page turn — a student opening a board by hand is one. */
  selectBoard: (next: string) => void
  /** The board this client is on. */
  boardId: string | null
  participants: Participant[]
  myUserId: string
  isOwner: boolean
  /** The phone shell (#512), which only watches. */
  compact: boolean
}

/** (#493) Class mode as the screen needs it (#595, ADR 015): which board this
 *  is and whose, the grid of works and the teacher's ‹ ›, the strip, the
 *  chip that leads a student back, raised hands — and the requests the
 *  teacher and the students send about all of it. The server already sent only
 *  what this person may see; this decides where each piece goes. Out of Room;
 *  covered by classMode.spec and boards.spec. */
export function useClassView({
  socketRef, switchBoardRef, isOwnerRef, selectBoard, boardId, participants, myUserId, isOwner, compact,
}: ClassViewDeps) {
  const t = useT()
  const boards = useRoomStore(s => s.boards)
  const activeBoardId = useRoomStore(s => s.activeBoardId)
  const following = useRoomStore(s => s.following)
  /** The board the teacher is on — the lesson's own when `activeBoardId` is
   *  null. Undefined until the lesson is known: computed from the store's
   *  lesson id, not the URL-backed `lessonId` Room derives, which before the first
   *  room_state may still be a board's id. */
  const knownLessonId = useRoomStore(s => s.lessonId)
  const teacherBoard = knownLessonId ? teacherBoardId({ id: knownLessonId, activeBoardId }) : undefined
  // (#595, ADR 015 §6, §11) Class mode.
  // What the server put in `boards` is already what this person may see; the
  // split below is only about where each board goes on screen.
  const assignments = useRoomStore(s => s.assignments)
  const activeAssignmentId = useRoomStore(s => s.activeAssignmentId)
  const spotlightBoardId = useRoomStore(s => s.spotlightBoardId)
  const classVisibility = useRoomStore(s => s.classVisibility)
  const handsRaised = useRoomStore(s => s.handsRaised)
  /** The assignment whose works the big grid is showing; null — closed. */
  const [gridAssignmentId, setGridAssignmentId] = useState<string | null>(null)
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const presentUserIds = useMemo(() => new Set(participants.map(p => p.userId)), [participants])
  const currentBoardSummary = boards.find(b => b.id === boardId)
  const onPersonalBoard = currentBoardSummary !== undefined && isPersonalBoard(currentBoardSummary)
  const ownAssignmentBoardId = ownBoardIn(boards, activeAssignmentId, myUserId)?.id ?? null
  /** The grid, and the teacher's ‹ › on a student's board, both walk the works
   *  of one assignment: the grid's own, the board's own. */
  const gridAssignment = assignments.find(a => a.id === gridAssignmentId) ?? null
  const gridTiles = useMemo(
    () => classGrid(boards, gridAssignmentId, presentUserIds, handsRaised),
    [boards, gridAssignmentId, presentUserIds, handsRaised],
  )
  const barTiles = useMemo(
    () => classGrid(boards, currentBoardSummary?.assignmentId ?? null, presentUserIds, handsRaised),
    [boards, currentBoardSummary?.assignmentId, presentUserIds, handsRaised],
  )
  /** A student's own board in each assignment they have one in — the Class
   *  tab's "my boards". */
  const ownBoards = useMemo(() => {
    const own = new Map<string, string>()
    for (const b of boards) if (b.ownerId === myUserId && b.assignmentId) own.set(b.assignmentId, b.id)
    return own
  }, [boards, myUserId])
  /** The teacher's way to a student's work from the participants list: their
   *  board where the class is, else in the latest assignment they have one in. */
  const workOf = useCallback((userId: string) => {
    const s = useRoomStore.getState()
    const byOrder = [...s.assignments].sort((a, b) => b.order - a.order).map(a => a.id)
    for (const assignmentId of [s.activeAssignmentId, ...byOrder]) {
      const own = ownBoardIn(s.boards, assignmentId, userId)
      if (own) return own.id
    }
    return undefined
  }, [])
  /** A classmate's work this client was let in to look at: drawing on it is
   *  refused server-side (`board_not_yours`), so it is shown closed. */
  const readOnlyBoard = isForeignPersonalBoard(currentBoardSummary, myUserId, isOwner)
  const myHandRaised = handsRaised.includes(myUserId)
  /** Raised hands of people present — the Class tab's badge counts them. */
  const handsUp = handsRaised.filter(id => presentUserIds.has(id)).length
  const followDest = knownLessonId
    ? followDestination({ lessonId: knownLessonId, activeBoardId, spotlightBoardId, ownAssignmentBoardId })
    : undefined
  /** "All works" is the teacher's always; a student's only when the lesson
   *  shows work to the class. Not in the phone shell, which only watches. */
  const canOpenGrid = !compact && (isOwner || classVisibility === 'class')
  /** "Учитель смотрит вашу работу": the teacher is on this student's own board. */
  const teacherOnMyBoard = !isOwner && onPersonalBoard && currentBoardSummary?.ownerId === myUserId
    && participants.some(p => p.role === 'owner' && p.boardId === boardId)
  /** The strip is the lesson's pages only — personal boards live in the Class tab. */
  const stripList = useMemo(() => stripBoards(boards), [boards])

  /** (#176) The strip is offered when there is something to turn to, or to
   *  the owner who can make it so. The phone shell (#512) only turns pages —
   *  for the owner too, so there it needs a second board to be worth opening. */
  const stripAvailable = compact ? stripList.length > 1 : (isOwner || stripList.length > 1)
  const showTeacherChip = !isOwner && !following && followDest !== undefined && followDest !== boardId
  const chip = followDest === undefined ? null : followChip({
    destination: followDest, spotlightBoardId, ownAssignmentBoardId, boards,
  })
  const chipText = chip === null ? null
    : chip.kind === 'spotlight' ? t('class.chipSpotlight', { name: chip.name })
      : chip.kind === 'ownWork' ? t('class.chipOwnWork')
        : t('boards.teacherOn', { name: chip.name })
  /** (#595) A board opened from the class grid, the Class tab or the
   *  teacher's ‹ ›. For the teacher it is a visit, not a page turn: an ordinary
   *  join, never `set_active_board` — the class must not be sent to a
   *  student's work because the teacher went to look at it (ADR 015 §4). A
   *  student going to a board by hand is stepping away, like any pick. */
  const openClassBoard = useCallback((next: string) => {
    setGridAssignmentId(null)
    if (isOwnerRef.current) switchBoardRef.current?.(next)
    else selectBoard(next)
  }, [selectBoard, isOwnerRef, switchBoardRef])
  const startAssignment = useCallback((name: string) => {
    const socket = socketRef.current
    if (!socket || assignmentBusy) return
    setAssignmentBusy(true)
    socket.emit('assignment_start', { name }, result => {
      setAssignmentBusy(false)
      if (!result.ok) notifyError(t('class.error.start'), { key: 'assignment-start' })
    })
  }, [assignmentBusy, t, socketRef])
  /** (ADR 015 §11) Moves the class: to an assignment, or (null) "Все ко мне". */
  const setClassLocation = useCallback((assignmentId: string | null) => {
    socketRef.current?.emit('set_class_location', { assignmentId })
    setGridAssignmentId(null)
  }, [socketRef])
  const setSpotlight = useCallback((target: string | null) => {
    socketRef.current?.emit('set_spotlight', { boardId: target })
  }, [socketRef])
  const setHandRaised = useCallback((raised: boolean, whose?: string) => {
    socketRef.current?.emit('set_hand_raised', whose ? { raised, userId: whose } : { raised })
  }, [socketRef])
  const setClassVisibility = useCallback((value: ClassVisibility) => {
    socketRef.current?.emit('set_class_visibility', { value })
  }, [socketRef])
  const stepInGrid = useCallback((step: -1 | 1) => {
    if (!boardId) return
    const next = neighbourInGrid(barTiles, boardId, step)
    if (next) switchBoardRef.current?.(next)
  }, [boardId, barTiles, switchBoardRef])

  return {
    teacherBoard, gridAssignmentId, setGridAssignmentId, assignmentBusy, currentBoardSummary, onPersonalBoard,
    ownAssignmentBoardId, gridAssignment, gridTiles, barTiles, ownBoards, workOf, readOnlyBoard, myHandRaised,
    handsUp, canOpenGrid, teacherOnMyBoard, stripList, stripAvailable, showTeacherChip, chipText,
    openClassBoard, startAssignment, setClassLocation, setSpotlight, setHandRaised, setClassVisibility,
    stepInGrid,
  }
}
