import type { ComponentProps } from 'react'

import { Notice } from '../../../components/Notice'
import { useT } from '../../../i18n'
import { useRoomStore } from '../../../stores/roomStore'
import type { useClassView } from '../useClassView'
import type { LostWork } from '../useLostWork'
import { ClosedBanner } from './ClosedBanner'
import { ConnectionBanner } from './ConnectionBanner'
import { FrozenBanner } from './FrozenBanner'
import { LostWorkBanner } from './LostWorkBanner'
import { ViewportToast } from './ViewportToast'
import styles from '../Room.module.css'

export interface RoomNoticesProps {
  isOwner: boolean
  /** A non-owner held by the room-wide or their own freeze (#256/#257). */
  isBlockedByFreeze: boolean
  classView: Pick<ReturnType<typeof useClassView>,
    'teacherOnMyBoard' | 'readOnlyBoard' | 'currentBoardSummary' | 'ownAssignmentBoardId'>
  selectBoard: (board: string) => void
  closed: Omit<ComponentProps<typeof ClosedBanner>, 'isOwner'>
  lostWork: LostWork | null
  onUndoLostWork: () => void
  onDismissLostWork: () => void
  /** (#362) The zoom/angle readout, or null while it is not on screen. */
  toast: ComponentProps<typeof ViewportToast> | null
  connection: ComponentProps<typeof ConnectionBanner>
}

/** (#343, #493) The derived notices — each one visible exactly while its own
 *  condition holds, so the condition is the whole lifetime and there is
 *  nothing to dismiss or time out. Stacked as siblings in a flex column
 *  instead of each guessing at the others' height; the connection banner
 *  anchored at the bottom.
 *
 *  (#364) Room renders these as siblings of `.viewport`, not children of it.
 *  `.viewport` is a positioned element with a z-index, i.e. a stacking context,
 *  so a column inside it could not paint above the header or the side panel
 *  no matter what z-index it was given — and hit-testing follows painting,
 *  which is why a wide strip's dismiss button (its rightmost control) was
 *  unclickable under `.layerPanelWrap` on a tablet, where the column's
 *  `max-width` reaches that far. Raising the z-index *inside* the viewport was
 *  not the fix, and neither was dropping `.viewport`'s own: `.canvasCatcher`
 *  is a full-viewport `pointer-events: auto` layer at z-index 4 in there, and
 *  lifting them into the shared context would have them swallow taps meant
 *  for the chrome. */
export function RoomNotices({
  isOwner, isBlockedByFreeze, classView, selectBoard, closed, lostWork, onUndoLostWork, onDismissLostWork, toast,
  connection,
}: RoomNoticesProps) {
  const t = useT()
  const roomFrozen = useRoomStore(s => s.roomFrozen)
  const roomClosed = useRoomStore(s => s.room?.closedAt !== undefined)
  const { teacherOnMyBoard, readOnlyBoard, currentBoardSummary, ownAssignmentBoardId } = classView

  return (
    <>
      <div className={styles.noticesTop}>
        {/* (#254/#259) Only ever shown to a blocked non-owner — the owner
            triggering their own room-wide freeze isn't blocked by it (see
            isBlockedByFreeze), so this never shows for them. */}
        {isBlockedByFreeze && !roomClosed && <FrozenBanner roomFrozen={roomFrozen} />}
        {/* (#595) Class mode's two notices for a student: the teacher is on
            their own board (the cursor alone is easy to miss), or they are
            looking at a classmate's work and the pen will not take. */}
        {teacherOnMyBoard && (
          <Notice variant="neutral" icon="school" role="status" message={t('class.teacherWatching')} />
        )}
        {readOnlyBoard && currentBoardSummary && (
          <Notice
            variant="neutral"
            icon="visibility"
            role="status"
            message={t('class.readOnly', { name: currentBoardSummary.name })}
            action={ownAssignmentBoardId ? { label: t('class.backToOwn'), onClick: () => selectBoard(ownAssignmentBoardId) } : undefined}
          />
        )}
        {/* (#222) Wins over the freeze banner when both apply: a closed
            lesson is the more complete explanation, and unlike freeze it
            offers the way forward (reopen, or take a copy). */}
        {roomClosed && <ClosedBanner isOwner={isOwner} {...closed} />}
        {/* (#289 §17) Independent of the freeze banner above — both can
            be up at once, which the column now handles on its own. */}
        {lostWork && (
          <LostWorkBanner
            layerNames={lostWork.layerNames}
            recovered={lostWork.restoredLayerIds.length > 0}
            onUndo={onUndoLostWork}
            onDismiss={onDismissLostWork}
          />
        )}
        {/* (#362) Last in the column on purpose: a frozen or closed room is
            the more important thing on screen and keeps the top slot, and
            being siblings is what stops the two from overlapping — the same
            reason the banners above are a column rather than three absolute
            boxes. Only in minimal UI: with the chrome up, the header's own
            readouts are the ones to read, and a second copy of them
            floating over the canvas would be noise. */}
        {toast && <ViewportToast {...toast} />}
      </div>
      {/* (#201) Bottom-anchored, so it can coexist with the event
          banners above for as long as a bad connection lasts. Hidden
          entirely while connected with an empty queue. */}
      <div className={styles.noticesBottom}>
        <ConnectionBanner {...connection} />
      </div>
    </>
  )
}
