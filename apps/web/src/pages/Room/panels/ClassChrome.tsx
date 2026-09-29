import type { RefObject } from 'react'
import clsx from 'clsx'

import { useRoomStore } from '../../../stores/roomStore'
import type { useBoardActions } from '../useBoardActions'
import type { useClassView } from '../useClassView'
import { BoardStrip, TeacherChip } from './BoardStrip'
import { ClassBar, ClassGrid } from './ClassGrid'
import styles from '../Room.module.css'

export interface ClassChromeProps {
  /** Minimal UI's hidden chrome (#99). */
  uiHidden: boolean
  isOwner: boolean
  /** The phone shell (#512), which only watches. */
  compact: boolean
  classView: ReturnType<typeof useClassView>
  boardActions: ReturnType<typeof useBoardActions>
  /** A page turn in flight — the strip marks the board being turned to. */
  wantedBoardRef: RefObject<string | null>
  toggleAnnotationMode: (next: boolean) => void
}

/** (#176, #595, #493) The lesson's chrome between the header and the canvas:
 *  the board strip, the "teacher is on …" chip, the teacher's bar on a
 *  student's board, and the class grid over the canvas. Out of Room; what the
 *  store owns is read here, the class view and the strip's actions come in
 *  whole from their hooks. */
export function ClassChrome({
  uiHidden, isOwner, compact, classView, boardActions, wantedBoardRef, toggleAnnotationMode,
}: ClassChromeProps) {
  const knownLessonId = useRoomStore(s => s.lessonId)
  const boardId = useRoomStore(s => s.boardId)
  const participants = useRoomStore(s => s.participants)
  const spotlightBoardId = useRoomStore(s => s.spotlightBoardId)
  const activeAssignmentId = useRoomStore(s => s.activeAssignmentId)
  const annotationMode = useRoomStore(s => s.annotationMode)
  const {
    teacherBoard, stripList, stripAvailable, showTeacherChip, chipText, onPersonalBoard, currentBoardSummary,
    gridAssignmentId, setGridAssignmentId, barTiles, stepInGrid, setSpotlight, gridAssignment, canOpenGrid, gridTiles,
    openClassBoard, setClassLocation, setHandRaised,
  } = classView
  const {
    boardsOpen, setBoardsOpen, boardBusy, selectBoard, returnToTeacher, addBoard, renameBoardAction, moveBoard,
    removeBoard,
  } = boardActions

  return (
    <>
      {/* (#176) The board strip and the "teacher is on …" chip. Both live
          under the header and go with it in minimal UI — the same wrapper
          class, so a hidden header never leaves a strip floating over the
          paper. The chip is offered to a student who stepped away from the
          teacher's board; the strip to anyone who can turn pages. */}
      {knownLessonId && teacherBoard !== undefined && (
        <div className={clsx(uiHidden && styles.uiHidden)}>
          {boardsOpen && stripAvailable && (
            <BoardStrip
              boards={stripList}
              lessonId={knownLessonId}
              currentId={wantedBoardRef.current ?? boardId}
              teacherId={teacherBoard}
              participants={participants}
              canEdit={isOwner && !compact}
              compact={compact}
              busy={boardBusy}
              onSelect={selectBoard}
              onClose={() => setBoardsOpen(false)}
              onCreate={() => void addBoard()}
              onRename={(target, name) => void renameBoardAction(target, name)}
              onMove={(target, direction) => void moveBoard(target, direction)}
              onDelete={target => void removeBoard(target)}
            />
          )}
          {showTeacherChip && chipText !== null && (
            <TeacherChip
              text={chipText}
              stripOpen={boardsOpen && stripAvailable}
              onReturn={returnToTeacher}
            />
          )}
          {/* (#595) The teacher's bar on a student's board. Takes the chip's
              place — the teacher never has one. */}
          {isOwner && onPersonalBoard && currentBoardSummary && !compact && gridAssignmentId === null && !(boardsOpen && stripAvailable) && (
            <ClassBar
              name={currentBoardSummary.name}
              lit={spotlightBoardId === currentBoardSummary.id}
              canStep={barTiles.length > 1}
              annotating={annotationMode}
              onGrid={() => setGridAssignmentId(currentBoardSummary.assignmentId ?? null)}
              onStep={stepInGrid}
              onSpotlight={() => setSpotlight(spotlightBoardId === currentBoardSummary.id ? null : currentBoardSummary.id)}
              onAnnotatingChange={next => toggleAnnotationMode(next)}
            />
          )}
        </div>
      )}

      {/* (#595) The class grid, over the canvas — see ClassGrid's own note. */}
      {gridAssignment && canOpenGrid && (
        <ClassGrid
          assignment={gridAssignment}
          isCurrent={gridAssignment.id === activeAssignmentId}
          tiles={gridTiles}
          isTeacher={isOwner}
          currentId={boardId}
          spotlightBoardId={spotlightBoardId}
          onOpen={openClassBoard}
          onClose={() => setGridAssignmentId(null)}
          onGather={() => setClassLocation(null)}
          onSendHere={() => setClassLocation(gridAssignment.id)}
          onSpotlight={setSpotlight}
          onLowerHand={whose => setHandRaised(false, whose)}
        />
      )}
    </>
  )
}
