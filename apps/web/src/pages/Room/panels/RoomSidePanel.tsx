import { useMemo, type ComponentProps } from 'react'
import clsx from 'clsx'

import type { OperationDraft } from '@grafetto/shared'

import { ColorFlyoutBody, type ColorFlyoutContent } from '../../../components/ColorFlyout'
import { LayerPanel } from '../../../components/LayerPanel'
import { SidePanel } from '../../../components/SidePanel'
import { useT } from '../../../i18n'
import { useRoomStore } from '../../../stores/roomStore'
import type { JoinQueue } from '../net/joinQueue'
import type { useClassView } from '../useClassView'
import type { useLayerPanelBridge } from '../useLayerPanelBridge'
import { ClassPlaces } from './ClassPlaces'
import { ParticipantsPanel, ParticipantsRoomActions } from './ParticipantsPanel'
import { ToolSettingsTab } from './ToolSettingsTab'
import styles from '../Room.module.css'

export type SidePanelId = 'layers' | 'color' | 'participants' | 'toolSettings'

type ClassView = ReturnType<typeof useClassView>

export interface RoomSidePanelProps {
  /** Minimal UI's hidden chrome (#99). */
  uiHidden: boolean
  active: SidePanelId | null
  onSelect: (id: SidePanelId | null) => void
  isOwner: boolean
  dispatchOp: (draft: OperationDraft) => void
  layerPanelBridge: ReturnType<typeof useLayerPanelBridge>
  /** (#574) Opens the filter dialog on a layer. */
  onOpenFilters: (layerId: string) => void
  colorContent: ColorFlyoutContent
  joinQueue: JoinQueue
  /** Who is drawing right now (#38) — see useDrawingActivity. */
  drawingIds: string[]
  classView: Pick<ClassView,
    | 'teacherBoard' | 'ownBoards' | 'canOpenGrid' | 'assignmentBusy' | 'handsUp' | 'workOf' | 'setClassLocation'
    | 'startAssignment' | 'setGridAssignmentId' | 'setSpotlight' | 'setHandRaised' | 'openClassBoard'>
  selectBoard: (board: string) => void
  toggleRoomFrozen: () => void
  toggleParticipantFrozen: ComponentProps<typeof ParticipantsPanel>['onToggleFreeze']
  onExpandColor: ComponentProps<typeof ToolSettingsTab>['onExpandColor']
  onShapeFrameChange: ComponentProps<typeof ToolSettingsTab>['onShapeFrameChange']
}

/** (#493) The side panel: layers, colour, the class and the tool's full
 *  settings. Room renders it only outside the compact shell (#512).
 *
 *  #99: wrapped rather than passing a className into SidePanel — the wrapper
 *  is a positioned overlay (see .layerPanelWrap) that only fades in/out, so
 *  the panel stays mounted (no lost focus/state) and the canvas underneath
 *  never resizes, same as header/toolbar.
 *
 *  What the store owns — the layer state and solo, the roster, the lesson's
 *  boards and assignments — is read here; what Room derives comes in. */
export function RoomSidePanel({
  uiHidden, active, onSelect, isOwner, dispatchOp, layerPanelBridge, onOpenFilters, colorContent, joinQueue,
  drawingIds, classView, selectBoard, toggleRoomFrozen, toggleParticipantFrozen, onExpandColor, onShapeFrameChange,
}: RoomSidePanelProps) {
  const t = useT()
  const layerState = useRoomStore(s => s.layerState)
  const setLayerStateLocal = useRoomStore(s => s.setLayerStateLocal)
  // (#557) The layer solo: private view state like `annotationsHidden`,
  // applied to the engine as a display filter (see useLayerStateSync).
  const soloIds = useRoomStore(s => s.soloIds)
  const setSoloIds = useRoomStore(s => s.setSoloIds)
  const participants = useRoomStore(s => s.participants)
  const layerDrawers = useRoomStore(s => s.layerDrawers)
  const myUserId = useRoomStore(s => s.userId)
  const roomFrozen = useRoomStore(s => s.roomFrozen)
  const knownLessonId = useRoomStore(s => s.lessonId)
  const boardId = useRoomStore(s => s.boardId)
  const boards = useRoomStore(s => s.boards)
  const assignments = useRoomStore(s => s.assignments)
  const activeAssignmentId = useRoomStore(s => s.activeAssignmentId)
  const spotlightBoardId = useRoomStore(s => s.spotlightBoardId)
  const handsRaised = useRoomStore(s => s.handsRaised)
  const {
    teacherBoard, ownBoards, canOpenGrid, assignmentBusy, handsUp, workOf, setClassLocation, startAssignment,
    setGridAssignmentId, setSpotlight, setHandRaised, openClassBoard,
  } = classView

  // Layer id → the colours of the peers drawing into it, for the layer
  // panel's outline. A peer without a roster entry (left a moment ago, the
  // entry already gone) simply has no colour to show and drops out.
  const layerDrawerColors = useMemo(() => {
    const colorOf = new Map(participants.map(p => [p.userId, p.color]))
    const out: Record<string, string[]> = {}
    for (const [layerId, userIds] of Object.entries(layerDrawers)) {
      const colors = userIds.flatMap(u => colorOf.get(u) ?? [])
      if (colors.length) out[layerId] = colors
    }
    return out
  }, [layerDrawers, participants])

  return (
    <div className={clsx(styles.layerPanelWrap, uiHidden && styles.uiHidden, styles.strokeBlockable)}>
      <SidePanel
        active={active}
        onSelect={onSelect}
        tabs={[
          {
            id: 'layers', icon: 'layers', title: t('room.panel.layers'),
            content: (
              <LayerPanel
                layerState={layerState} onChange={setLayerStateLocal} onOp={dispatchOp}
                isOwner={isOwner} {...layerPanelBridge}
                soloIds={soloIds} onSoloChange={setSoloIds}
                drawerColors={layerDrawerColors}
                onOpenFilters={onOpenFilters}
              />
            ),
          },
          {
            // (#542) The colour surface, always here. Not the old Color tab
            // back: that one had contents of its own, and this renders the
            // very same `ColorFlyoutBody` the popover does — one surface in
            // two presentations, which is what the issue asked for.
            //
            // It earns the strip's space on the tools that mix: stroke,
            // nudge the colour, stroke again is a loop, and a popover has
            // to be reopened for every nudge while hiding both the canvas
            // and the quick settings under it — on the watercolour, that is
            // the Water and Pigment sliders, the other half of mixing.
            id: 'color', icon: 'palette', title: t('room.panel.color'),
            content: <ColorFlyoutBody {...colorContent} />,
          },
          {
            // (#328) Who's in the room, their live status, and the owner's
            // moderation actions on each of them — plus the room-wide
            // freeze in this tab's own header, which is where it moved to
            // from the top bar.
            // (#595, ADR 015 §11) The Class tab: where the class is, the
            // lesson's assignments, and the people in it.
            id: 'participants', icon: 'group', title: t('room.panel.class'),
            // (#380) The one thing in this panel that needs an answer
            // *now*. Without it on the strip, the waiting section below
            // only reaches an owner who was already looking at this tab —
            // which, mid-lesson, is nobody. (#595) Raised hands are the
            // other one, counted with it — like unread messages.
            badge: isOwner ? joinQueue.requests.length + handsUp : 0,
            badgeLabel: [
              joinQueue.requests.length > 0 ? t('room.joinQueue.badge', { n: joinQueue.requests.length }) : null,
              handsUp > 0 && isOwner ? t('class.handsBadge', { n: handsUp }) : null,
            ].filter(Boolean).join(' · '),
            headerActions: (
              <ParticipantsRoomActions
                isOwner={isOwner}
                roomFrozen={roomFrozen}
                onToggleRoomFrozen={toggleRoomFrozen}
              />
            ),
            content: (
              <>
              {knownLessonId && teacherBoard !== undefined && (
                <ClassPlaces
                  isTeacher={isOwner}
                  assignments={assignments}
                  activeAssignmentId={activeAssignmentId}
                  spotlight={spotlightBoardId
                    ? { name: boards.find(b => b.id === spotlightBoardId)?.name ?? '' }
                    : null}
                  ownBoards={ownBoards}
                  currentBoardId={boardId}
                  teacherBoardId={teacherBoard}
                  canOpenGrid={canOpenGrid}
                  busy={assignmentBusy}
                  defaultName={t('class.defaultName', { n: assignments.length + 1 })}
                  onGather={() => setClassLocation(null)}
                  onSendTo={setClassLocation}
                  onStart={startAssignment}
                  onOpenGrid={setGridAssignmentId}
                  onGoto={selectBoard}
                  onSpotlightOff={() => setSpotlight(null)}
                />
              )}
              <ParticipantsPanel
                participants={participants}
                drawingIds={drawingIds}
                myUserId={myUserId}
                isOwner={isOwner}
                onToggleFreeze={toggleParticipantFrozen}
                joinRequests={joinQueue.requests}
                resolvingRequestId={joinQueue.resolvingId}
                onResolveJoinRequest={joinQueue.resolve}
                handsRaised={handsRaised}
                onLowerHand={whose => setHandRaised(false, whose)}
                workOf={workOf}
                onOpenWork={openClassBoard}
              />
              </>
            ),
          },
          {
            // #197: full settings for the *currently active* tool, same
            // TOOL_SCHEMAS/SettingField data + component the toolbar's
            // quick-access row uses (#196) — this tab just renders every
            // field, not only the quickAccess-flagged ones.
            id: 'toolSettings', icon: 'tune', title: t('room.panel.toolSettings'),
            content: <ToolSettingsTab onExpandColor={onExpandColor} onShapeFrameChange={onShapeFrameChange} />,
          },
        ]}
      />
    </div>
  )
}
