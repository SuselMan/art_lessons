import { useT } from '../../../i18n'
import type { fetchReviewImage } from '../../../lib/api/reviewImage'
import type { ComponentProps, RefObject } from 'react'

import type { ShapeFrame } from '@grafetto/shared'

import { rotateAboutMatrix, type TransformMode } from '../../../lib/transform/transformMath'
import { useRoomStore } from '../../../stores/roomStore'
import type { RoomInfo } from '../../../stores/slices/roomSlice'
import type { Viewport } from '../viewport/useViewport'
import { AnnotationOverlay } from './AnnotationOverlay'
import { BrushCursor } from './BrushCursor'
import { GridOverlay, InfiniteGridOverlay } from './GridOverlay'
import { PeerCursors } from './PeerCursors'
import { RulerOverlay } from './RulerOverlay'
import { SelectionOverlay } from './SelectionOverlay'
import { TransformGizmo } from './TransformGizmo'
import styles from '../Room.module.css'

type GizmoProps = ComponentProps<typeof TransformGizmo>
type AnnotationProps = ComponentProps<typeof AnnotationOverlay>

export interface CanvasOverlaysProps {
  reviewImage: Awaited<ReturnType<typeof fetchReviewImage>> | null
  config: RoomInfo
  vp: Viewport
  vpRef: RefObject<HTMLDivElement | null>
  socket: ComponentProps<typeof PeerCursors>['socket']
  /** (#393) Whether the cursor controller says a dab preview belongs on
   *  screen, and what it looks like. */
  dabPreview: boolean
  brush: Pick<ComponentProps<typeof BrushCursor>,
    'presetName' | 'baseSize' | 'nibAngleRadians' | 'nibAnchor' | 'tiltResponse'>
  rulerVisible: boolean
  rulerMeasuring: boolean
  /** (#530) The open shape's frame and its handle gesture, or null. */
  shapeFrame: ShapeFrame | null
  onShapeHandleDown: GizmoProps['onHandleDown']
  onTransformHandleDown: GizmoProps['onHandleDown']
  onTransformCenterDown: GizmoProps['onCenterDown']
  onTransformCenterReset: GizmoProps['onCenterDoubleClick']
  selectionShapeKind: string
  selectionCursor: ComponentProps<typeof SelectionOverlay>['cursor']
  /** Whether the open transform session moves a selected area rather than
   *  whole layers — the outline then rides the session's matrix. */
  areaSelection: boolean
  annotation: Pick<AnnotationProps,
    'onDraftCommit' | 'onDraftCancel' | 'liveInk' | 'erasingIds' | 'dragPreview' | 'hitTargets' | 'layerRef'
    | 'draftInputRef'>
}

/** (#493) The overlays over the canvas — cursors, brush ring, grid, ruler,
 *  gizmos, selection, annotations — written once. Room mounts them on the
 *  canvas-space wrapper in a bounded room and on the camera-transformed world
 *  wrapper in an infinite one (#143); the two used to be the same hundred
 *  lines twice, told apart only by a `config.infinite` guard on every element.
 *
 *  What the store owns — the roster, the ruler line, the transform preview,
 *  the selection, the annotations — is read here; what Room derives from its
 *  own hooks comes in as props. */
export function CanvasOverlays({
  reviewImage,
  config, vp, vpRef, socket, dabPreview, brush, rulerVisible, rulerMeasuring, shapeFrame, onShapeHandleDown,
  onTransformHandleDown, onTransformCenterDown, onTransformCenterReset, selectionShapeKind, selectionCursor,
  areaSelection, annotation,
}: CanvasOverlaysProps) {
  const t = useT()
  const boardId = useRoomStore(s => s.boardId)
  const participants = useRoomStore(s => s.participants)
  const drawingTool = useRoomStore(s => s.drawingTool)
  const transformActive = useRoomStore(s => s.tool === 'transform')
  // Construction grid (#89, #405) — visibility is a setting on the grid tool
  // now rather than a store flag toggled by the toolbar button, which is what
  // lets it stay on screen under every other tool while its button selects it
  // like any other. It still intercepts no pointer events and blocks nothing.
  const gridVisible = useRoomStore(s => s.toolSettings.grid.show as boolean)
  // (#391) The transform tool's mode, from the same TOOL_SCHEMAS store every
  // other tool's settings live in. `transient` there — a transform mode
  // remembered from half an hour ago is a gizmo whose edge handles no longer
  // do what the last person to touch them expects. The gestures read it (and
  // the proportions toggle) themselves; see useTransformGizmoGestures.
  const transformMode = useRoomStore(s => s.toolSettings.transform.mode as TransformMode)
  // (#23, #405) The line outlives the ruler being selected: nothing ever clears
  // it, so the same straight edge is back the moment the ruler is picked up
  // again. Whether it is *on screen* meanwhile is `rulerVisible`.
  const rulerLine = useRoomStore(s => s.rulerLine)
  // Content bounding box (engine.getContentBounds, unioned across the
  // current target(s)) — null while the tool is off, or before the first
  // computation lands. See useTransformSession.
  const transformBounds = useRoomStore(s => s.transformBounds)
  // Custom rotation pivot (Adobe Animate-style draggable transform point) —
  // null means "use the content bounds' own center". Reset on activation
  // and after every commit: each drag already commits immediately (no
  // multi-step Free-Transform session, see #120's scope notes), so treating
  // a custom point as scoped to a single drag rather than trying to carry
  // an absolute canvas-space point through a move/scale that just changed
  // where the content actually is keeps this from silently pointing
  // somewhere stale.
  const transformCenterOverride = useRoomStore(s => s.transformCenterOverride)
  // (#399) Every gesture of the open transform session, composed — fed to
  // TransformGizmo so its handles ride along with the content, and to the
  // engine's preview so the canvas shows the same thing. Null between
  // sessions. This used to be per-*drag* and was nulled on release, which is
  // what made the frame snap back to an upright box the moment you let go of
  // a rotation: the bounds behind it are axis-aligned, so re-deriving them
  // from pixels threw the rotation away (a 30° turn grew the box 32%x42%).
  const transformSessionMatrix = useRoomStore(s => s.transformSessionMatrix)
  // (#446) The selection — local to this participant.
  const selection = useRoomStore(s => s.selection)
  const pendingSelection = useRoomStore(s => s.pendingSelection)
  // (#508/#511) The annotation projection and the local view state around it.
  const annotations = useRoomStore(s => s.annotations)
  const annotationsHidden = useRoomStore(s => s.annotationsHidden)
  const annotationDraft = useRoomStore(s => s.annotationDraft)
  const collapsedAnnotationIds = useRoomStore(s => s.collapsedAnnotationIds)
  const setAnnotationDraftText = useRoomStore(s => s.setAnnotationDraftText)

  return (
    <>
      {reviewImage && <img alt={t('room.reviewImage')} src={reviewImage.url} draggable={false}
        style={{ position: 'absolute', left: reviewImage.bounds.x, top: reviewImage.bounds.y, width: reviewImage.bounds.width, height: reviewImage.bounds.height }} />}
      <PeerCursors
        key={boardId ?? ''}
        socket={socket}
        participants={participants}
        zoom={vp.zoom}
        angle={vp.angle}
      />
      {/* (#393) Mounted exactly while the cursor controller says a dab
          preview belongs on screen — with the hand on, or with any of
          the four non-painting tools selected, nothing is going to be
          painted, and a ring that keeps following the pointer reads as
          if it still would. (#405) `drawingTool` is what it draws: the
          controller has already established that this is the tool in
          hand, and `tool` is not narrowed to a ToolType. */}
      {dabPreview && (
        <BrushCursor
          vpRef={vpRef}
          tool={drawingTool}
          vp={vp}
          config={config}
          {...brush}
        />
      )}
      {gridVisible && (config.infinite
        ? (
          <InfiniteGridOverlay
            vp={vp}
            viewportWidth={vpRef.current?.clientWidth ?? 0}
            viewportHeight={vpRef.current?.clientHeight ?? 0}
          />
        )
        : <GridOverlay width={config.width} height={config.height} />)}
      {/* (#405, #445) On screen while the ruler is in hand, and under
          every other tool too once it is locked — a straight edge you
          can draw against is the point of one, but only while you asked
          for it. It carries no pointer handlers at all; dragging it is
          the catcher's job, and the catcher only exists while the ruler
          is the selected tool. */}
      {rulerVisible && rulerLine && (
        <RulerOverlay a={rulerLine.a} b={rulerLine.b} zoom={vp.zoom} angle={vp.angle} showDistance={rulerMeasuring} />
      )}
      {/* (#530) The shape's own handles are the transform gizmo's: same
          component, same hit areas, same rotate zones. Only what a drag
          *means* differs — a shape has no pixels yet, so a handle edits
          the frame it will be drawn from (see shapeTool.ts). */}
      {shapeFrame && (
        <div className={styles.shapeGizmoLayer}>
        <TransformGizmo
          bounds={{
            x: Math.min(shapeFrame.x, shapeFrame.x + shapeFrame.width),
            y: Math.min(shapeFrame.y, shapeFrame.y + shapeFrame.height),
            width: Math.abs(shapeFrame.width),
            height: Math.abs(shapeFrame.height),
          }}
          center={{
            x: shapeFrame.x + shapeFrame.width / 2,
            y: shapeFrame.y + shapeFrame.height / 2,
          }}
          matrix={rotateAboutMatrix(
            shapeFrame.angle,
            shapeFrame.x + shapeFrame.width / 2,
            shapeFrame.y + shapeFrame.height / 2,
          )}
          zoom={vp.zoom}
          angleRad={vp.angle}
          mode="free"
          onHandleDown={onShapeHandleDown}
          onCenterDown={e => onShapeHandleDown('body', e)}
          onCenterDoubleClick={() => {}}
        />
        </div>
      )}
      {transformActive && transformBounds && (
        <TransformGizmo
          bounds={transformBounds}
          center={transformCenterOverride ?? {
            x: transformBounds.x + transformBounds.width / 2,
            y: transformBounds.y + transformBounds.height / 2,
          }}
          matrix={transformSessionMatrix ?? undefined}
          zoom={vp.zoom}
          angleRad={vp.angle}
          mode={transformMode}
          onHandleDown={onTransformHandleDown}
          onCenterDown={onTransformCenterDown}
          onCenterDoubleClick={onTransformCenterReset}
        />
      )}
      {/* (#446) Drawn under every tool, not only the selection tool: a
          selection persists until it is replaced or cleared, and the
          transform tool needs to show what it is about to move. It takes
          no pointer events in either case — see SelectionOverlay. */}
      <SelectionOverlay
        selection={selection}
        pending={pendingSelection}
        pendingClosed={selectionShapeKind === 'rectangle'}
        cursor={selectionCursor}
        zoom={vp.zoom}
        matrix={areaSelection ? transformSessionMatrix : null}
      />
      {/* (#508, эпик #87) Above every other overlay, because an
          annotation is above every other thing on screen — it is a
          remark *about* the picture, including about the grid or the
          selection someone left on it. */}
      <AnnotationOverlay
        annotations={annotations}
        hidden={annotationsHidden}
        draft={annotationDraft}
        onDraftChange={setAnnotationDraftText}
        collapsedIds={collapsedAnnotationIds}
        zoom={vp.zoom}
        angle={vp.angle}
        {...annotation}
      />
    </>
  )
}
