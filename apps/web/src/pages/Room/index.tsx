import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import * as Sentry from '@sentry/react'
import clsx from 'clsx'
import { clamp } from 'lodash-es'
import { nanoid } from 'nanoid'
import type {
  LayerState, Operation, Participant, Room as RoomEntity, RoomAccessMode,
  SendResult, ClientToServerEvents, ServerToClientEvents, FillSourceMode,
  JoinDenial, BoardSummary, ClassVisibility, LessonState,
} from '@grafetto/shared'
import { BACKGROUND_LAYER_ID, isToolEnabledInRoom, normalizePaperType, packDabs, SHAPE_KINDS, SNAPSHOT_SEQ_INTERVAL, TOOLSET_MATERIAL_TOOLS, type ToggleableTool } from '@grafetto/shared'
import { PencilEngine, DEFAULT_TILT_RESPONSE, isTiltResponse, type PencilEngineAPI, type PencilGradeName, type StrokeDebugStats, type HapticGrainStats, isPressureResponse, watercolorPresetString, WATERCOLOR_MIX_BY_PRESET, isWatercolorMixPreset, watercolorPigmentByCode, isWatercolorPigmentCode, isWatercolorNib, isNibAnchor, DEFAULT_NIB_ANCHOR, charcoalPresetString, isCharcoalType, isCharcoalNib, DEFAULT_CHARCOAL_TYPE, digitalBrushFromPreset, digitalBrushPreset, type AreaImage } from '../../engine'
import { subscribePaperLoadProgress, type PaperLoadProgress } from '../../engine/src/paperLoader'
import { LayerPanel } from '../../components/LayerPanel'
import { FilterPanel } from '../../components/FilterPanel'
import { SidePanel } from '../../components/SidePanel'
import {
  ColorFlyout, ColorFlyoutBody, type ColorFlyoutContent, type ColorPairControls,
} from '../../components/ColorFlyout'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import { BoardStrip, TeacherChip } from './BoardStrip'
import { ClassBar, ClassGrid } from './ClassGrid'
import { ClassPlaces } from './ClassPlaces'
import { createPreviewSchedule } from './previewSchedule'
import { SettingsPanel } from '../../components/SettingsPanel'
import { SettingField } from '../../components/SettingField'
import { useConfirmDialog } from '../../components/ConfirmDialog/useConfirmDialog'
import { FloatingToolPanel, type PanelFlyout } from '../../components/FloatingToolPanel'
import { isFloatingPanelTool, TOOL_DISPLAY } from '../../components/FloatingToolPanel/tools'
import type { PanelGroups, SlotGroup } from '../../components/FloatingToolPanel/slots'
import type { PickerOption } from '../../components/OptionPicker/types'
import { exposeEngineForDev } from '../../lib/devEngineHandle'
import {
  computeCompositeOrder, eraseThroughTargets, isLayerLocked,
} from '../../lib/layers'
import { hexToRgb, rgbToHex } from '../../lib/color'
import { getFeatureFlag, getGraphiteGrainVariant, getCharcoalGrainVariant, grainVariantToMode } from '../../lib/featureFlags'
import { floatingPanelVisible, minimalUiActive, minimalUiTapsRequired } from '../../lib/uiPreferences'
import { useDragToAdjust } from '../../lib/useDragToAdjust'
import { setBackNavigationGuard } from '../../lib/backNavigationGuard'
import { holdReload } from '../../lib/reloadSafety'
import { diagLog } from '../../lib/diagLog'
import { formatHotkeyLabel } from '../../lib/hotkeys'
import { addRoomInvite, createBoard, deleteBoard, forkRoom, moveRoomToFolder, renameBoard, reorderBoard, setRoomClosed } from '../../lib/api'
import { useAuth } from '../../lib/authState'
import { BANNED_ERROR_CODE, noteBanned } from '../../lib/banned'
import { useSettingsStore } from '../../stores/settingsStore'
import { useViewport } from './useViewport'
import { useViewportToast } from './useViewportToast'
import { ViewportToast } from './ViewportToast'
import { useTapToggle, type TapDebugInfo } from './useTapToggle'
import { useCommittableSession } from './useCommittableSession'
import { useShapeTool } from './useShapeTool'
import { useEditorHotkeys } from './editorHotkeys'
import { useTransformGizmoGestures } from './useTransformGizmoGestures'
import { createBoardEventHandlers } from './boardEvents'
import { createPeerEventHandlers } from './peerEvents'
import { createConfirmedStreamHandler } from './confirmedStream'
import { createRoomControlEventHandlers } from './roomControlEvents'
import { useOperationDispatch } from './useOperationDispatch'
import { useSelection } from './useSelection'
import { ShapeFrameFields, ShapeRatioPresets } from './ShapeFrameFields'
import { DebugStack } from './DebugStack'
import { usePencilSound } from './usePencilSound'
import { useCanvasViewport } from './useCanvasViewport'
import { useAnnotations } from './useAnnotations'
import { useCursorBroadcast } from './useCursorBroadcast'
import { useLayerStateSync } from './useLayerStateSync'
import { useSpaceToPan } from './useSpaceToPan'
import { useDrawingActivity } from './useDrawingActivity'
import { RoomLoadingOverlay } from './RoomLoadingOverlay'
import { OfflineRoomOverlay } from './OfflineRoomOverlay'
import { PaperFailedOverlay } from './PaperFailedOverlay'
import { RestoreFailedOverlay, type RestoreFailureReason } from './RestoreFailedOverlay'
import { FrozenBanner } from './FrozenBanner'
import { ClosedBanner } from './ClosedBanner'
import { LostWorkBanner } from './LostWorkBanner'
import { ConnectionBanner } from './ConnectionBanner'
import { RoomHeader } from './RoomHeader'
import { ToolRail } from './ToolRail'
import { resolveDisplayName } from './displayName'
import { clientToCanvas } from './pointerTransform'
import { ZOOM_MAX, clientToRoomPoint, cameraTransformCss, deviceNativeZoom, minZoom } from './cameraMath'
import { canRetryJoinLater, describeJoinError, joinGateStateFor } from './joinError'
import {
  groupLostOpsByLayer, isRecoverableContentOp, resolveDeletedLayerName, retargetToLayer, type LostContentOp,
} from './lostWork'
import { Outbox } from './outbox'
import { createSocketRevival } from './socketRevival'
import { createIndexedDbOutboxStorage } from './outboxStorage'
import { PeerCursors } from './PeerCursors'
import { BrushCursor } from './BrushCursor'
import { useCursor, RULER_GESTURE_CURSOR, type ViewportCursor } from './cursorController'
import { RulerOverlay, type RulerPoint } from './RulerOverlay'
import { rulerGestureAt, RULER_BODY_GRAB_PX, RULER_ENDPOINT_GRAB_PX } from './rulerGesture'
import { GridOverlay, InfiniteGridOverlay } from './GridOverlay'
import { TransformGizmo } from './TransformGizmo'
import { SelectionOverlay } from './SelectionOverlay'
import { AnnotationOverlay } from './AnnotationOverlay'
import { useCompactLayout } from '../../lib/useCompactLayout'
import { useNarrowHeader } from '../../lib/useNarrowHeader'
import { rotateAboutMatrix, type TransformMode } from './transformMath'
import { ParticipantsPanel, ParticipantsRoomActions } from './ParticipantsPanel'
import { useJoinQueue } from './joinQueue'
import { JoinGate, type JoinGateState } from './JoinGate'
import { NoWebGL } from './NoWebGL'
import { probeWebGL } from '../../lib/webgl'
import {
  TOOL_SCHEMAS, loadToolSettings, saveToolSettings, linerSizeToPx,
  getToolColor, isColorCapableTool, type ColorCapableTool, type UiToolId,
  isShapeTool, toolColorField, shapeKindOf, SHAPE_KIND_ICONS, SHAPE_KIND_LABEL_KEYS,
} from './toolSchemas'
import { colorWellState, effectiveSwatch } from './colorWell'
import { loadPanelPosition, type PanelPosition } from './panelPosition'
import { TOOL_PHOTOS } from './toolTypeImages'
import { loadActiveLayerId, saveActiveLayerId } from './activeLayer'
import { ChiselAngleDial } from './ChiselAngleDial'
import { reportInvariant } from '../../lib/reportInvariant'
import { createPendingPreviews } from './pendingPreviews'
import { createSnapshotGate } from './snapshotGate'
import {
  activeBoardPayload, entryBoard, followDestination, followTarget, followingAfterPick, movedOrder, teacherBoardId,
} from '../../lib/boards'
import {
  classGrid, followChip, isForeignPersonalBoard, isPersonalBoard, isTeacherIn, neighbourInGrid, ownBoardIn,
  stripBoards,
} from '../../lib/classMode'
import { createSnapshotUploader, uploadThumbnail } from './snapshotSync'
import { reportSnapshotRestore } from './reportRestore'
import { reportRoomOpen } from './reportOpen'
import { SLOW_OPEN_MS, createOpenTimer, type OpenTimer } from './openTiming'
import { restoreLatestSnapshot, walkHistoryBackward, type SnapshotRestoreOutcome } from './snapshotRestore'
import { restoreRoomState } from './restoreRoomState'
import { useTransformSession, type TransformSession } from './useTransformSession'
import { initLayersFromStore, retireEngine, wireLocalStrokeEvents } from './engineWiring'
import { useRoomStore, resetRoomStore, resetBoardState } from '../../stores/roomStore'
import { notifyError, notifyWarning } from '../../stores/noticeStore'
import { useT } from '../../i18n'
import { makeInitialLayerState } from '../../stores/slices/layerSlice'
import {
  isPrimaryDrawingTool, PRIMARY_DRAWING_TOOLS,
  type EditorTool, type PrimaryDrawingTool,
} from '../../stores/slices/toolSlice'
import { isHandActive } from '../../stores/slices/viewportSlice'
import type { RoomInfo } from '../../stores/slices/roomSlice'
import { useClipboardStore } from '../../stores/clipboardStore'
import styles from './Room.module.css'

// Infinite-canvas rooms (#133 Phase 1) don't have a real canvasWidth/Height
// — camera-relative tile rendering (a separate follow-up) is what actually
// makes the canvas element's own size independent of "room size". Until
// that lands, an infinite room's RoomInfo gets this placeholder finite
// size so the existing fixed-canvas-shaped rendering/viewport/pointer
// pipeline below (all written in terms of one fixed-size canvas) keeps
// working unmodified rather than needing every call site touched twice.
// Large enough that "infinite" still feels roomy for this interim state.
const PLACEHOLDER_INFINITE_CANVAS_SIZE = 8192

// (#393) The one place a ViewportCursor becomes a class name. The decision
// itself is cursorController's; this is only the CSS-Modules lookup, kept
// exhaustive by the Record so a new cursor value cannot ship without one.
const VIEWPORT_CURSOR_CLASS: Record<ViewportCursor, string> = {
  crosshair: styles.viewportCursorCrosshair,
  grab: styles.viewportCursorGrab,
  default: styles.viewportCursorDefault,
}

/** Navigation state CreateRoom hands off to a freshly created room (see
 *  CreateRoom/index.tsx) — its presence is how this component tells "I am
 *  the creator, opening my own room" apart from "I opened someone else's
 *  room link" (no state at all, e.g. a second device). */
interface CreatorNavState {
  room: Pick<RoomEntity,
    'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight' | 'enabledTools'
    | 'classVisibility'>
  password?: string
  // (#232) Picked on the create form. The mode rides along on `create_room`
  // itself so the room is never briefly open; the invites are sent afterwards
  // over REST, which is where address normalization and dedup live.
  accessMode?: RoomAccessMode
  invites?: string[]
  // (#211 epic, #215) Set when CreateRoom was opened via "New room" while a
  // folder was open on MyLessons — files the freshly created room into it
  // right after create_room succeeds (see the ack handler below).
  folderId?: string
}

function toRoomConfig(
  room: Pick<RoomEntity, 'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight'>
    & Partial<Pick<RoomEntity, 'closedAt' | 'accessMode' | 'enabledTools'>>,
): RoomInfo {
  return {
    id: room.id, name: room.name,
    // (#300) The wire carries whatever the database holds — including the
    // three pre-grid names. Normalising here, at the single point a room
    // enters the client, keeps every downstream consumer (engine, sound,
    // picker) free of legacy handling.
    paper: normalizePaperType(room.paper), paperColor: room.paperColor, infinite: room.infinite,
    width: room.canvasWidth ?? PLACEHOLDER_INFINITE_CANVAS_SIZE,
    height: room.canvasHeight ?? PLACEHOLDER_INFINITE_CANVAS_SIZE,
    // (#222) Optional in the Pick because the creator's own branch builds a
    // RoomInfo from navigation state, where the field cannot exist yet — a
    // room is never born closed. Every other entry point comes from
    // `room_state`, which carries it.
    closedAt: room.closedAt,
    // (#460) Optional in the Pick for the same reason `closedAt` is: on the
    // creator's branch nothing has come back from the server yet, and what
    // they picked on the create form rides in on navigation state instead.
    // The fallback is the server's own — `create_room` stores
    // 'anyone_with_link' for anything it doesn't recognise (socketHandlers.ts)
    // — so this mirrors the row that is about to exist rather than inventing
    // a second default. Every other entry point comes from `room_state`,
    // which carries the real one.
    accessMode: room.accessMode ?? 'anyone_with_link',
    // (#548) No fallback and none wanted: absent *is* the unrestricted room,
    // on the creator's branch and on every other one alike.
    enabledTools: room.enabledTools,
  }
}

/** (#176, ADR 014) The lesson's `RoomInfo`, built from whichever board's
 *  `room_state` arrived first. `config` describes the *lesson* for the whole
 *  session — its id is what the share link and every lesson-level call use,
 *  its name is the header label — and a board's row differs from the lesson's
 *  only in those two fields: paper, colour, size and the social overlay are
 *  the lesson's already (see the shared `Room.lessonId`). The lesson's own
 *  name is in the strip, under the lesson's id, at order 0. */
function toLessonConfig(room: RoomEntity, lesson: LessonState): RoomInfo {
  const own = lesson.boards.find(b => b.id === lesson.id)
  return toRoomConfig({ ...room, id: lesson.id, name: own?.name ?? room.name })
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

/** (#176) How long a page turn waits for unconfirmed operations before moving
 *  the socket anyway — see Outbox.whenIdle for why it is bounded at all. Long
 *  enough for a burst of strokes to be acknowledged on an ordinary
 *  connection; short enough that a dead one does not hold the page. */
const BOARD_SWITCH_DRAIN_MS = 4000

// LAN dev server port (apps/server); derived from window.location.hostname
// How long a stroke's "drawing" activity (local or peer) stays visible before
// the #38 indicator clears it — see drawingIndicator.ts.

// (#329) Degrees of canvas rotation per pixel of vertical drag on the angle
// readout. Deliberately fine: the gesture has to be able to land on a specific
// angle (a horizon line, a construction axis), and a quarter turn is a click
// away regardless — so precision matters more here than reach.
const ROTATE_DEG_PER_PX = 0.5

// (#312) How long lost-work recovery waits for the outbox to stop producing
// `target_gone` rejections before it mints replacement layers, and the hard
// cap on that wait. Quiet period: rejections come back at the rate the
// outbox drains, so a gap this long means the backlog is done. Cap: a large
// enough backlog would otherwise keep re-arming the timer forever.
const LOST_WORK_QUIET_MS = 800
const LOST_WORK_MAX_WAIT_MS = 5000

// (#313) How long a room may sit unloaded with no socket before the
// preloader is replaced by an explicit "no connection" screen. Long enough
// that an ordinary slow load or a brief blip never trips it, short enough
// that nobody watches a spinner wondering whether their work survived.
const OFFLINE_OVERLAY_GRACE_MS = 6000

// (#291) How far back of the pre-snapshot operation log backfillHistory
// pulls in for undo/redo coverage. One snapshot interval below the restored
// snapshot's own seq means a joining client ends up holding roughly the last
// two snapshots' worth of history — exactly the undo depth spec v0.2 §7
// commits to, and nothing beyond it, since an operation older than that can
// never be undone anyway. See backfillHistory for why an unbounded walk is
// not an option.
const HISTORY_BACKFILL_DEPTH = SNAPSHOT_SEQ_INTERVAL

// (#289 epic, reliable history spec v0.2 §9) A bare socket.io ack has no
// timeout of its own — a dropped packet (either leg) would otherwise leave
// the Outbox waiting forever instead of ever retrying. `socket` is read at
// call time by the caller (never closed over stale), since Outbox.send is
// invoked long after the socket that existed when the Outbox itself was
// constructed may have been replaced by a reconnect.
function sendOperationWithTimeout(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null, op: Operation, timeoutMs = 5000,
): Promise<SendResult> {
  return new Promise((resolve, reject) => {
    if (!socket) { reject(new Error('sendOperationWithTimeout: no active socket')); return }
    const timer = setTimeout(() => reject(new Error('operation send timed out')), timeoutMs)
    socket.emit('operation', op, result => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}

/** (#570) The route component. The editor below assumes a WebGL context is
 *  there for the taking — `new PencilEngine` throws otherwise, from a mount
 *  effect, and nothing between that throw and the root's unmount used to say
 *  a word. Asked once, here, before a single one of the editor's hooks runs:
 *  no socket is opened and no join is attempted for a browser that could not
 *  draw the answer anyway. The probe result is state, not a re-run per
 *  render — the reader gets a reload button, and a reload is the re-probe. */
export function Room() {
  const [webgl] = useState(() => probeWebGL())
  if (!webgl.ok) return <NoWebGL reason={webgl.reason} />
  return <RoomEditor />
}

function RoomEditor() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const t        = useT()
  // (#380) Only for the access cache the join queue lives in — see joinQueue.ts.
  const queryClient = useQueryClient()
  // (#310) In-app replacements for the window.confirm/window.alert this
  // editor used to reach for. `alert` is renamed on the way in so a reader
  // can't mistake it for the global it replaces.
  const { confirm, alert: showAlert } = useConfirmDialog()

  // (#24) The store is a module-level singleton — reset it before anything
  // below reads a selector, so a genuine unmount+remount (e.g. via an
  // intermediate /create stop between two different rooms) never leaks a
  // previous room's stale data into this fresh mount. See resetRoomStore's
  // own doc comment.
  useState(resetRoomStore)

  // (#176, ADR 014 §4) Two keys where there used to be one. The socket lives
  // per *lesson* — one `io()` for the whole visit, kept across page turns —
  // and the engine, the outbox and the snapshot load live per *board*.
  //
  // `sessionId` is the socket's key: the URL id at mount, moving only when the
  // URL names a genuinely different lesson (taking a copy of a closed room
  // navigates in place — see takeRoomCopy). It deliberately does *not* move
  // when handleRoomState replaces a board id in the URL with its lesson's: the
  // socket is already in that lesson, and rebuilding it would re-join from
  // scratch for a change that is cosmetic.
  const [sessionId, setSessionId] = useState(id)
  useEffect(() => {
    if (!id || id === sessionId) return
    if (id === useRoomStore.getState().lessonId) return
    setSessionId(id)
  }, [id, sessionId])
  /** The lesson every lesson-level call is addressed to — access, rename,
   *  close, boards. Falls back to the URL id before the first `room_state`,
   *  which is the lesson unless the link was a board's (then it is corrected
   *  the moment the server says so). */
  const lessonId = useRoomStore(s => s.lessonId) ?? id
  /** The board the engine holds — see roomSlice's own doc comment on when
   *  this moves. Null before the first `room_state`, so the engine effect
   *  below has nothing to build for until the server has seated us. */
  const boardId = useRoomStore(s => s.boardId)
  const boardIdRef = useRef(boardId)
  boardIdRef.current = boardId
  /** A page turn in flight: the board we asked the server for and whose
   *  `room_state` has not arrived yet. Cleared by that arrival (or by a
   *  refusal). A second turn while one is pending simply replaces this, and
   *  the state for the board no longer wanted is ignored on arrival. */
  const wantedBoardRef = useRef<string | null>(null)
  /** The board the *server* currently has this socket on — as far as this
   *  client has been told. Set by every `room_state`, cleared the moment a
   *  `join_room` for another board is emitted. The outbox's send gate reads
   *  it: an operation may only leave for the board it was drawn on. */
  const socketBoardRef = useRef<string | null>(null)
  /** Published by the socket effect (it needs that effect's own socket and
   *  credentials) for the strip, the chip and the follow logic to call. */
  const switchBoardRef = useRef<((next: string) => void) | null>(null)

  // Captured once, at mount: CreateRoom hands the freshly-created room's
  // config off via navigation state. A second device opening the same room
  // link has no such state — that's the "joiner" branch, gated behind the
  // join-gate form below until a successful join_room tells us who we are.
  const [creatorDraft] = useState<CreatorNavState | undefined>(() => location.state as CreatorNavState | undefined)
  const isCreator = !!creatorDraft?.room
  // (#176) True until the creator's seeded board has had its first
  // `room_state` — the one case where the state for a board arrives with that
  // board's engine already built. See handleRoomState.
  const awaitingSeededBoardStateRef = useRef(isCreator)
  // Blocks pointer input on the canvas (see its style prop below) while a
  // join/reconnect's initial content restore is still in flight — a real
  // bug, not defensive: with #169's snapshot fast-join, that restore
  // includes an awaited network fetch (restoreLatestSnapshot), which — unlike
  // the old always-synchronous full-log replay loop — actually yields to
  // the event loop for a real, human-noticeable stretch (seconds). A stroke
  // drawn in that window paints onto a layer whose buffer
  // restoreLayerFromSnapshot then unconditionally overwrites wholesale with
  // the snapshot's own (older) pixels — silently wiping the stroke on this
  // client, while the operation itself still gets recorded server-side
  // (invisible until a later reconnect/backfill surfaces it, which is
  // exactly the "мерцает первый вариант потом перезатёртый" symptom).
  // Always starts blocked, creator included — a creator's own tab reloading
  // an already-drawn-on room looks identical, at mount time, to a genuinely
  // brand-new room (see handleRoomState's own doc comment on this exact
  // ambiguity); only handleRoomState's first room_state can actually tell
  // the two apart, so it alone gets to decide when this flips true, whether
  // that's "nothing to restore" (a real new room, decided quickly) or after
  // a full restore/replay (a reload). Optimistically starting `true` for
  // every creator used to mean the editor opened immediately, empty and
  // interactive, with the preloader only flashing on *afterward* if a
  // restore turned out to be needed — backwards from "preloader first, then
  // ready to draw." A joiner already started blocked the same way, via the
  // mount-engine effect's own replay / handleRoomState's reconnect branch.
  const [roomContentReady, setRoomContentReady] = useState(false)
  // (#429) Mirrored for the socket effect's live-stroke handler, which is
  // wired once per connection and must see the current value rather than
  // whatever it was when the listener was attached.
  const roomContentReadyRef = useRef(roomContentReady)
  roomContentReadyRef.current = roomContentReady
  useEffect(() => {
    diagLog('roomContentReady changed to', roomContentReady)
  }, [roomContentReady])

  // (#345) Paper-download progress for the loading overlay. Local state next
  // to roomContentReady rather than in roomStore, for the same reason that one
  // is local: it describes this mount's own loading sequence and dies with it.
  //
  // Null means "no texture download is happening" — which covers both `flat`
  // paper (synthesised, never fetched) and, importantly, the case the prefetch
  // makes common: the bytes were already in hand before the room opened, so no
  // progress is ever emitted and the overlay should not flash an empty bar.
  const [paperProgress, setPaperProgress] = useState<PaperLoadProgress | null>(null)
  useEffect(() => subscribePaperLoadProgress(setPaperProgress), [])

  // (#346) The paper texture failed to load, and with it this mount's whole
  // catch-up: every replay site below awaits `paperReady()` first, so a
  // rejection there means nothing was restored either. Both facts point the
  // same way — the room is not open, and saying otherwise is the bug this
  // closes. `paperRetrying` is the retry's own in-flight flag.
  const [paperFailed,   setPaperFailed]   = useState(false)
  const [paperRetrying, setPaperRetrying] = useState(false)

  /** (#533) The room's stored pixels did not arrive, so this catch-up restored
   *  nothing. Same conclusion as `paperFailed` and for a stricter reason: the
   *  server withholds the history a snapshot claims to cover, so there is no
   *  second source for those pixels — a room opened in this state is not
   *  "missing the last few strokes", it is blank where a lesson should be. It
   *  stayed blank and unexplained for twenty minutes on 2026-09-04, which is
   *  what this flag is for. See RestoreFailedOverlay.
   *
   *  (#538) A reason rather than a boolean, and null rather than false: the
   *  same screen now also covers a restore whose pixels *did* arrive and threw
   *  on the way to the canvas, and the two get different sentences. One piece
   *  of state, not a flag plus a variant beside it — those can disagree, and
   *  the disagreement would be a screen explaining the wrong failure. */
  const [restoreFailure, setRestoreFailure] = useState<RestoreFailureReason | null>(null)

  /** (#464) Whether this failure has already been reported to Sentry. Every
   *  replay site calls awaitPaper, so one broken load rejects at several of
   *  them and would otherwise send the same event three or four times.
   *
   *  Reset by a retry, deliberately: a second failure after the user asked
   *  again is a different fact from the first — it says the cause is not the
   *  transient blip the retry button exists for. */
  const paperReportedRef = useRef(false)

  /** Awaits the paper texture at a replay site, reporting a failure instead of
   *  letting it through. Returns whether the caller may proceed — `false`
   *  means it must leave `roomContentReady` alone (i.e. false) so the failure
   *  overlay stands, rather than run its restore against a placeholder
   *  texture and an engine that will refuse every stroke.
   *
   *  This is the `catch` the old `try/finally` sites were missing: the error
   *  itself is worth reading (paperLoader names the file, the HTTP status and
   *  the command to run), and it used to reach nothing but an unhandled
   *  rejection. */
  const awaitPaper = useCallback(async (engine: PencilEngineAPI | null): Promise<boolean> => {
    try {
      await engine?.paperReady()
      return true
    } catch (err) {
      console.error('paper texture failed to load — room cannot draw', err)
      // (#464) Reported, not just logged. This is a room that did not open,
      // and until an iPad on iPadOS 16.3 was picked up by hand we had no way
      // of knowing it ever happened: the console is on a device we don't have,
      // and the catch above is what stopped it reaching Sentry's unhandled
      // handler. A failure this total has to be something we see first.
      if (!paperReportedRef.current) {
        paperReportedRef.current = true
        Sentry.captureException(err)
      }
      setPaperFailed(true)
      return false
    }
  }, [])

  // Device performance investigation (#91) — shows a live per-stroke input/
  // render timing readout. Controlled by the "Debug overlay" feature flag
  // (#100) — VITE_DEBUG_OVERLAY in apps/web/.env.local as the default, or the
  // gear-icon settings panel to override per-browser via localStorage.
  const debugEnabled = getFeatureFlag('debugOverlay')
  const [strokeStats, setStrokeStats] = useState<StrokeDebugStats | null>(null)

  // Optional pointer-prediction experiment (#92) — same feature-flag pattern
  // as debugEnabled above. Off by default; lets Ilya A/B it on real hardware
  // before deciding whether to keep it.
  const predictEnabled = getFeatureFlag('predictPointer')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // The editor root — the stroke-active attribute goes on it, and the panels
  // measure against it. What goes fullscreen is `document.documentElement`,
  // not this — see RoomHeader's toggleFullscreen for why (#357).
  const editorRef = useRef<HTMLDivElement>(null)

  // Minimal UI (#99): a short single-finger tap on the canvas hides the
  // header/toolbar/layer panel via a CSS class (never unmounted — no lost
  // focus/state), tap again to bring them back.
  //
  // (#189) Two taps by default rather than one — see MinimalUiTapMode. The
  // count is a setting because the cheaper gesture is genuinely nicer for
  // anyone whose hand never trips it.
  //
  // (#321) A real setting now rather than a feature flag, and touch-only:
  // `minimalUiActive` folds in the device check, because a PC has neither the
  // tap that turns this on nor anything that would turn it back off (#384).
  const minimalUiSetting = useSettingsStore(s => s.minimalUi)
  const deviceType = useSettingsStore(s => s.deviceType)
  const tapToHideEnabled = minimalUiActive(minimalUiSetting, deviceType)
  /** (#509 v3) Whether a second tap on the canvas means "hide the chrome" right
   *  now — the only case worth making a new note wait for. A ref so the
   *  annotation gesture handlers read it at event time instead of being rebuilt
   *  every time the setting changes. Assigned just below useTapToggle, against
   *  that hook's own arming condition, so the two cannot drift. */
  const doubleTapArmedRef = useRef(false)
  /** A tap that may yet become a note, waiting out the grace period above.
   *  Declared up here, before `toggleUI`, because that is what has to be able
   *  to call the whole thing off. */
  const pendingNoteRef = useRef<{ timer: number } | null>(null)
  const minimalUiTapMode = useSettingsStore(s => s.minimalUiTapMode)
  // (#157/#321) Where the floating tool cluster is allowed to appear.
  const floatingPanelMode = useSettingsStore(s => s.floatingPanel)
  useEffect(() => { diagLog('tapToHideEnabled is', tapToHideEnabled) }, [tapToHideEnabled])
  const [uiHidden, setUiHidden] = useState(false)
  // Read via a ref (not the setUiHidden updater's own `h` param) purely so
  // the diagLog call sits in toggleUI's own body, not inside the updater —
  // StrictMode double-invokes updater functions to check purity, which
  // would otherwise log every real toggle twice with a misleadingly
  // identical "before" value both times. toggleUI itself stays `[]`-stable
  // (useTapToggle's effect deps include `onTap`; a churning identity there
  // re-attaches its native listeners on every toggle — see its own doc
  // comment on exactly that class of bug).
  const uiHiddenRef = useRef(uiHidden)
  uiHiddenRef.current = uiHidden
  // Diagnostic (matches useTapToggle/useViewport's own tap:/vp: diagLog
  // calls) for the "floating panel flickers after a stroke" reports — logs
  // every actual flip plus the stack-free "why" (never which call site;
  // there's only one), so a real device's copy-logs output can be
  // correlated against the tap:/vp:/stroke: timeline below.
  const toggleUI = useCallback(() => {
    diagLog('toggleUI: uiHidden', uiHiddenRef.current, '->', !uiHiddenRef.current)
    // (#509 v5) A double tap slower than NOTE_DOUBLE_TAP_GRACE_MS will already
    // have opened an empty note by the time it completes. Undoing that here is
    // what lets the grace period be short: a note has to survive only the
    // *brisk* double tap, and the slow one is tidied up after the fact instead
    // of being waited out. Nothing is lost either way — an empty draft is local
    // state and records no operation.
    //
    // Both halves matter. The open note is the first tap's; the *pending* one
    // is the second tap's, queued a moment ago by the very press that completed
    // this gesture — cancel only the first and the second lands 160ms later,
    // which is what "the double tap left a note behind" looked like.
    if (pendingNoteRef.current) {
      window.clearTimeout(pendingNoteRef.current.timer)
      pendingNoteRef.current = null
    }
    const draft = useRoomStore.getState().annotationDraft
    if (draft && draft.annotationId === null && !draft.text.trim()) {
      useRoomStore.getState().closeAnnotationDraft()
    }
    setUiHidden(h => !h)
  }, [])
  // (#321) Turning the setting off while the chrome is hidden has to give it
  // back: the tap that would restore it is the very thing being switched off,
  // so without this the room stays stripped with no way out short of a
  // reload — and the settings panel that was just used is itself part of the
  // hidden chrome.
  useEffect(() => {
    if (!tapToHideEnabled) setUiHidden(false)
  }, [tapToHideEnabled])

  // #94's "a resting hand mid-stroke corrupts settings" guard used to be a
  // `useState` here, on the theory that two flips per stroke are too cheap to
  // matter. On a Tab S7+ they were not: #309 measured a median 55 ms (worst
  // 99 ms) from pen-down to the UI reacting, plus a 60–85 ms dropped frame at
  // every stroke start, all of it Room re-rendering its whole tree twice per
  // stroke to change `pointer-events` on four wrappers. It now lives in the
  // store as `strokeActive` (see strokeSlice for the full rule) and reaches
  // the DOM without a render at all — see the projection effect below.

  // Diagnostic for "works on Samsung, not on a Surface" (see chat) — see
  // TapDebugInfo's docstring for what each field means.
  //
  // (#321) Gated on the debug flag as well as on the mode. It used to hang
  // off the mode alone, which was safe while the mode was itself a developer
  // feature flag — now that a teacher can turn minimal UI on, that would have
  // put an English stats overlay in the corner of their lesson.
  const [tapDebug, setTapDebug] = useState<TapDebugInfo | null>(null)
  const tapDebugEnabled = debugEnabled && tapToHideEnabled

  // (#321) One sound setting for the whole app — the graphite-on-paper
  // recipes here and the interface's own clicks (RadialDial) read the same
  // pair of values. (#493) The volume half moved into usePencilSound with the
  // effects that used it; what is left here gates the tuning panel below.
  const soundEnabled = useSettingsStore(s => s.soundEnabled)

  // Live-tuning debug panel for every PencilSound knob (#153 round 13, see
  // PencilSoundTuningPanel.tsx) — nothing to tune while the sound is off,
  // same feature-flag pattern as debugEnabled/hapticGrain above.
  const pencilSoundTuningEnabled = getFeatureFlag('pencilSoundTuning') && soundEnabled

  // Haptic paper-grain experiment: same feature-flag pattern as the ones
  // above. Off by default — for-fun prototype, Android Chrome only.
  const hapticGrainEnabled = getFeatureFlag('hapticGrain')
  const [hapticStats, setHapticStats] = useState<HapticGrainStats | null>(null)

  // Dev-only grain A/B (see SettingsPanel / DAB_FRAG's computeGrain) — live
  // shader mode, applies to every paper type. One per material (#304
  // follow-up): 'off' leaves it undefined, and the engine falls back to that
  // material's own shipped default rather than to a shared one.
  const grainMode = grainVariantToMode(getGraphiteGrainVariant())
  const charcoalGrainMode = grainVariantToMode(getCharcoalGrainVariant())

  // (#24) Backed by the store now — same one-shot seeding timing the old
  // useState(() => creatorDraft?.room ? toRoomConfig(...) : null) had.
  useState(() => {
    if (creatorDraft?.room) {
      // The mode is a sibling of `room` in the navigation state, not a field
      // of it (it rides on `create_room` itself, see CreatorNavState) — so it
      // is folded in here rather than being read off the draft room.
      useRoomStore.setState({
        room: toRoomConfig({ ...creatorDraft.room, accessMode: creatorDraft.accessMode }),
        // (#176) A room just created is a lesson with one board, and the
        // creator is on it: known synchronously for the same reason `room`
        // is. Its first `room_state` then arrives for this very board.
        lessonId: creatorDraft.room.id,
        boardId: creatorDraft.room.id,
        boards: [{ id: creatorDraft.room.id, name: creatorDraft.room.name, order: 0 }],
        // (#595) Picked on the create form; room_state confirms it shortly.
        classVisibility: creatorDraft.room.classVisibility ?? 'teacher_only',
      })
    }
  })
  const config = useRoomStore(s => s.room)
  // (#548) Which tools this room offers — `undefined` for all of them, which
  // is what every room says until someone restricts it. Read straight off the
  // room rather than mirrored into a field of its own: it arrives inside
  // `room_state` and is patched by `room_tools_changed`, and a second copy
  // would only be a second thing to keep in step.
  const enabledTools = useRoomStore(s => s.room?.enabledTools)
  /** Whether the room offers this tool at all. The toolbar asks it per button
   *  (a tool the room does not offer has no button), and `selectTool` asks it
   *  again for the paths that have no button to hide — a hotkey, a floating
   *  panel slot assigned before the tool was switched off. */
  const toolOffered = useCallback(
    (candidate: EditorTool) => isToolEnabledInRoom(enabledTools, candidate),
    [enabledTools],
  )
  /** Where a hand goes when what it was holding stops being offered. The first
   *  material the room still has — never the first *tool*, which could be the
   *  ruler, i.e. a hand that cannot draw. A toolset always keeps one material
   *  (sanitizeEnabledTools refuses the ones that don't), so this cannot come
   *  up empty; the pencil is the fallback for the unrestricted room. */
  const fallbackTool = useMemo<EditorTool>(() => (
    enabledTools?.find(candidate => (TOOLSET_MATERIAL_TOOLS as readonly string[]).includes(candidate)) as EditorTool
      ?? 'pencil'
  ), [enabledTools])
  // (#405) The one selected tool — a drawing tool, or one of the four that
  // paint nothing (eyedropper, ruler, transform, grid). Exactly one at a time:
  // there is no second "mode" axis over it any more.
  const tool = useRoomStore(s => s.tool)
  const setTool = useRoomStore(s => s.setTool)
  // (#405) The drawing tool the engine, the brush cursor and the sound are
  // configured from — `tool` itself while a drawing tool is selected, the last
  // one selected otherwise, so picking up the ruler never leaves the engine
  // holding a tool that isn't one. Also where the eyedropper goes back to.
  const drawingTool = useRoomStore(s => s.drawingTool)
  // Last of pencil/liner actually selected — what a "return to drawing"
  // toggle (eraser/smudge off) should go back to, instead of assuming
  // pencil (kept in sync by the store's own setTool, see toolSlice.ts).
  const lastDrawingTool = useRoomStore(s => s.lastDrawingTool)
  // Unified per-tool settings (#196) — grade/size/opacity/color for every
  // registered tool (TOOL_SCHEMAS in toolSchemas.ts), persisted per room
  // (#156). Backed by the store (#23): seeded once up front from this
  // room's localStorage — same one-shot timing the old
  // `useState(() => loadToolSettings(...))` had (id is stable for the
  // component's lifetime; a room switch remounts it), just done as a side
  // effect inside a throwaway useState initializer so it still runs
  // synchronously during the first render, before initialToolRef below
  // reads the store. Color used to be its own top-level `color` state
  // shared by whatever tool happened to be active; it now lives at
  // `toolSettings.pencil.color` — the schema's per-tool slot — same value,
  // same behavior, just no longer a second parallel place settings live.
  useState(() => useRoomStore.setState({ toolSettings: loadToolSettings(localStorage, id ?? '') }))
  const toolSettings = useRoomStore(s => s.toolSettings)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  // (#529) Which of a shape's two colours every colour control is acting on.
  const shapeSwatch = useRoomStore(s => s.shapeSwatch)
  const setShapeSwatch = useRoomStore(s => s.setShapeSwatch)
  // Floating tool panel's dragged-to position (#157) — same load-once-up-
  // front pattern as toolSettings above; null until the panel's
  // ever been dragged in this room, in which case it renders at its
  // CSS-anchored default corner instead (see FloatingToolPanel).
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(
    () => loadPanelPosition(localStorage, id ?? ''),
  )
  // Which of that panel's two fans — the palette, or the drawing tools its top
  // slot can hold — is out, if either. Lives here rather than inside
  // FloatingToolPanel because ChiselAngleDial, a sibling orbiting the same
  // panel at nearly the same radius, has to stand down while one of them is
  // open; see that component's own doc comment.
  const [panelFlyout, setPanelFlyout] = useState<PanelFlyout | null>(null)
  // Desktop keyboard shortcuts (#174) — global (per-browser, not per-room): a
  // rebound key is a habit of whoever's typing, not a property of this
  // drawing. A store subscription rather than a load-once-at-mount read
  // (#321): the settings panel applies a rebind immediately now, so this has
  // to see it without the page reload that used to carry it.
  const hotkeys = useSettingsStore(s => s.hotkeys)
  const gradeHotkeyLabels = ['gradeHarder', 'gradeSofter']
    .map(id => formatHotkeyLabel(hotkeys[id])).join('/')
  // (#405) The four non-painting tools, as plain "is this the selection?"
  // reads. They used to be an `OverlayMode` union in a slice of their own —
  // modes laid *on top of* whichever drawing tool was selected (#393) — which
  // is why two things could be "current" at once and why the cursor could
  // never be answered from `tool`. None of them may become a recorded
  // ToolType: three paint nothing at all, and transform produces an operation
  // of its own kind (layer_transform) via the engine's live preview +
  // dispatchOp rather than through engine.setTool(); see toolSlice.
  const eyedropperActive = tool === 'eyedropper'
  const rulerActive     = tool === 'ruler'
  const transformActive = tool === 'transform'
  // (#446) The selection tool. Unlike the four above it leaves something
  // behind that outlives having it in hand: the selection itself, which the
  // transform tool then operates through and which cut/copy/paste act on. So
  // "is it selected" and "is there a selection" are two different questions
  // here, and both get asked below.
  const selectionActive = tool === 'selection'
  // (#453) One-shot like the eyedropper — a tap is the whole gesture — but
  // unlike it the tool stays in hand afterwards: filling one region of a
  // drawing almost always means filling the next one too, whereas picking a
  // colour is something you do once on the way back to drawing.
  const fillActive = tool === 'fill'
  // (#509/#510, эпик #87) The two annotation tools. Both stay in hand after a
  // gesture like the fill does — remarks come in groups, one per thing worth
  // saying — and neither ever touches a layer: what they produce lives in the
  // annotation overlay, above the composite.
  const annotateTextActive = tool === 'annotateText'
  const annotatePenActive = tool === 'annotatePen'
  const annotateEraserActive = tool === 'annotateEraser'
  const annotationMode = useRoomStore(s => s.annotationMode)
  const annotateActive = annotateTextActive || annotatePenActive || annotateEraserActive
  // What the tool in hand may pick up — see AnnotationOverlay's `hitTargets`.
  // The pen picks up nothing, the note tool everything but ink (so a remark can
  // be pinned on top of a mark), the eraser everything.
  const annotationHitTargets = annotateEraserActive ? 'all' : annotateTextActive ? 'notes' : 'none'
  // (#512) The compact shell: a phone gets annotations and nothing else. Live,
  // not measured once — see useCompactLayout.
  const compact = useCompactLayout()
  // (#575) Below 1200px the header packs tighter: the "g" instead of the
  // wordmark, the save status as a dot, and the mode toggles (annotations,
  // boards, fullscreen) folded into the ≡ menu as checkable items.
  const narrowHeader = useNarrowHeader()
  /** (#509 v4) Whether the left rail is showing annotation tools instead of
   *  drawing ones. Two routes in and they are deliberately different things:
   *  the compact shell *is* this and cannot leave it, while the full layout
   *  enters and leaves it through the header's own toggle. */
  const annotationRail = compact || annotationMode
  // Finger-drawing is switched on by the compact shell and by nothing else.
  // On a tablet a finger still pans, so the annotation tools stay pen-and-mouse
  // there exactly like the fill and the selection — which is what keeps the
  // most-used gesture contract in the app from changing for a feature that did
  // not need it to. Where the finger *does* draw, two-finger pan follows
  // automatically rather than as a second setting: see toolActiveRef below.
  const annotateWithFinger = compact && annotateActive
  // (#23) Backed by the store now, alongside the transform-preview fields
  // below — moved for architectural consistency, but deliberately NEVER
  // persisted (see layerSlice.ts's own comment: a ruler is for quickly
  // comparing distances mid-drawing, not a saved setting).
  //
  // (#405) The line outlives the ruler being selected: nothing ever clears it,
  // so the same straight edge is back the moment the ruler is picked up again
  // rather than having to be laid a second time. Whether it is *on screen*
  // meanwhile is `rulerVisible` below.
  const rulerLine = useRoomStore(s => s.rulerLine)
  const setRulerLine = useRoomStore(s => s.setRulerLine)
  // (#508/#511) The annotation projection and the two pieces of local view
  // state around it. `annotationsHidden` is deliberately not an operation —
  // see the slice's own comment for why hiding is private.
  const annotations = useRoomStore(s => s.annotations)
  const annotationsHidden = useRoomStore(s => s.annotationsHidden)
  // (#557) The layer solo: the same kind of private view state as
  // `annotationsHidden`, applied to the engine as a display filter below.
  const soloIds = useRoomStore(s => s.soloIds)
  const setSoloIds = useRoomStore(s => s.setSoloIds)
  const annotationDraft = useRoomStore(s => s.annotationDraft)
  const collapsedAnnotationIds = useRoomStore(s => s.collapsedAnnotationIds)
  const setAnnotationDraftText = useRoomStore(s => s.setAnnotationDraftText)
  // (#405) The ruler's two settings, from the same TOOL_SCHEMAS store every
  // other tool's live in.
  const rulerLock = toolSettings.ruler.lock as boolean
  const rulerSnap = toolSettings.ruler.snap as boolean
  // (#445) Visibility is the selection first, the setting second: the ruler is
  // on screen while it is in hand, and `lock` only decides whether it stays
  // there under every other tool. Unlocked (the default) it behaves like a
  // straight edge laid on the paper to measure with and taken off again —
  // which is what the toggle used to get backwards, leaving the line lying
  // across the drawing until the user went back to the ruler to switch it off.
  //
  // This one boolean is the master switch the old `show` was: what is not
  // visible neither snaps (the engine sync below) nor can be grabbed (the
  // catcher), because an invisible line bending strokes is a trap.
  const rulerVisible = rulerActive || rulerLock
  // (#448) Is a ruler gesture running right now? Only the distance bubble
  // reads it: a measurement is worth showing while it is being taken and
  // nothing but clutter over the drawing afterwards. Local state rather than
  // the store because it is born and dies inside handleRulerDown's own drag —
  // nothing outside this component can observe it, and the store deliberately
  // holds no per-gesture scratch (see rulerLine's comment above for what does
  // belong there). Set twice per drag, not per move, so it costs no renders on
  // top of the ones setRulerLine already causes.
  const [rulerDragging, setRulerDragging] = useState(false)
  // Gated on the selection as well, so a flag stranded by a drag whose catcher
  // was unmounted under it (the tool switched by hotkey mid-gesture, with the
  // pen still down) cannot leave the bubble standing over a locked ruler: a
  // gesture can only run while the ruler is in hand in the first place.
  const rulerMeasuring = rulerDragging && rulerActive
  // Construction grid (#89, #405) — visibility is a setting on the grid tool
  // now rather than a store flag toggled by the toolbar button, which is what
  // lets it stay on screen under every other tool while its button selects it
  // like any other. It still intercepts no pointer events and blocks nothing.
  const gridVisible = toolSettings.grid.show as boolean
  // Content bounding box (engine.getContentBounds, unioned across the
  // current target(s)) — recomputed on activation/selection change and
  // after every commit (see refreshTransformBounds below), not per drag
  // frame. null while the tool is off, or before the first computation
  // lands, or (edge case) an active target with no content bounds and no
  // config to fall back to yet.
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
  // The session itself. Authoritative (the store copy exists to drive
  // rendering), and a ref rather than state so the drag handlers don't have to
  // list a value that changes on every animation frame among their deps.
  // `matrix` accumulates gestures; `targetIds` is frozen for the session so a
  // selection change ends it rather than silently re-aiming it mid-flight.
  const transformSessionRef = useRef<TransformSession | null>(null)
  // (#446) Handed to the next session the effect opens — the one moment a
  // session is created with pixels of its own rather than from a layer. Room
  // sets it, selects the transform tool, and the ordinary session-opening path
  // picks it up, so a floating paste needs no second lifecycle beside the one
  // that already handles Enter, Esc, tool changes, layer changes and the page
  // going away.
  const pendingPasteRef = useRef<AreaImage | null>(null)
  // (#446) The selection (selectionSlice.ts) — local to this participant: a
  // selection is what someone is about to do, and only what they did travels.
  const selection = useRoomStore(s => s.selection)
  const setSelection = useRoomStore(s => s.setSelection)
  const pendingSelection = useRoomStore(s => s.pendingSelection)
  const setPendingSelection = useRoomStore(s => s.setPendingSelection)
  // (#521) The clipboard is local too, but it is not room state: it outlives
  // this room and is shared with every other tab of this browser
  // (clipboardStore.ts). Only the meta is subscribed to — enough to answer
  // "is there anything to paste", which is all any of this component needs
  // until a paste actually happens.
  const clipboardMeta = useClipboardStore(s => s.meta)
  // (#399) Throws the open session's uncommitted gestures away and re-opens an
  // empty one on whatever the layer holds now. Assigned further down, where
  // the pieces it needs exist; declared here because undo/redo — defined well
  // above those — is what calls it.
  //
  // Two callers, two readings of the same operation:
  //  - *after* a real undo/redo, to re-derive the gizmo's bounds from pixels
  //    the log just changed underneath it;
  //  - as the cancel itself (#405): Esc, and Ctrl+Z while a session carries
  //    gestures, both mean "throw away what I was just doing". Nothing was
  //    committed, so there is no undo entry to leave behind — discarding *is*
  //    the whole of the undo.
  const resetTransformSessionRef = useRef<() => void>(() => {})
  // (#395/#399) A committed transform session whose operation hasn't reached
  // the layer yet, and the teardown that's waiting on it.
  //
  // Only the optimistic dispatch path paints a layer_transform locally, and
  // it covers just this client's own not-yet-confirmed layers (see
  // isLocalIslandSafe). For every other layer — i.e. any real drawing — the
  // op is sent and only lands when operation_confirmed comes back, a full
  // server round trip later. Dropping the gizmo preview at pointerup
  // therefore left the content sitting at its pre-drag position for that
  // whole trip, which is exactly what "слой прыгает на исходную позицию"
  // was. The preview is now held until the transform is genuinely resolved:
  // applied (applyRemoteOp), refused by the server (Outbox onSettled), or
  // given up on by the queue (onStalled) — whichever happens first.
  const pendingTransformCommitRef = useRef<{ opId: string; finish: () => void } | null>(null)
  const resolveTransformCommit = useCallback((opId: string) => {
    const pending = pendingTransformCommitRef.current
    if (!pending || pending.opId !== opId) return
    pendingTransformCommitRef.current = null
    pending.finish()
  }, [])
  // (#21) Backed by the store now — layerState is still a *derived cache*
  // of the engine's operation log (ADR 002), never independently mutable
  // content state; see syncFromLog below and roomStore's layerSlice.
  const layerState = useRoomStore(s => s.layerState)
  const setLayerStateLocal = useRoomStore(s => s.setLayerStateLocal)
  // (#506) The one field of that cache which is *not* derived from the log:
  // `activeId` is per-user view state, so a reload has nothing to rebuild it
  // from and every room used to open on its top layer regardless of what the
  // user was working on. Seeded here from this device's storage, in a
  // throwaway useState initializer so it lands during the first render —
  // before the join replay, which is the point: `overlayLocalFields` carries
  // `activeId` from the *current* state onto each freshly replayed one, so
  // the seeded id survives the replay the same way a mid-session selection
  // survives a peer's stroke.
  //
  // A stored id whose layer is gone (deleted, or never in this room) needs no
  // handling of its own: until the replay it selects nothing — the layer-state
  // → engine sync below reads `isEffectivelyVisible` as false and locks the
  // engine, so it cannot take a stroke — and the replay's `sanitizeSelection`
  // then drops it back to the top non-background layer, which is exactly the
  // behavior that existed before this was stored at all.
  useState(() => {
    const storedActiveId = loadActiveLayerId(localStorage, id ?? '')
    if (storedActiveId) useRoomStore.setState(prev => ({ layerState: { ...prev.layerState, activeId: storedActiveId } }))
  })
  // (#542) 'color' is back in this list, but it is no longer a tab with its own
  // contents — it renders the very same body the colour popover does.
  const [activePanel, setActivePanel] = useState<'layers' | 'color' | 'participants' | 'toolSettings' | null>('layers')
  // (#574) The layer the filter dialog is open on, or null. Local like
  // activePanel above: which dialog is open is this viewer's business, not the
  // room's.
  const [filterLayerId, setFilterLayerId] = useState<string | null>(null)

  // ── realtime state (#84/#37/#38) ────────────────────────────────────────────
  const [connected,   setConnected]   = useState(false)
  // Whether the socket has ever completed a connection on this mount. The
  // distinction `connected` alone cannot make: "still opening" and "was open,
  // dropped" both read as false, and only the second is worth warning about
  // (see ConnectionBanner, which is what this is for). Latches once true — a
  // later drop is a drop, not a return to the opening state.
  const [everConnected, setEverConnected] = useState(false)
  // (#289 §17, #312) Set when the server rejected an operation as
  // `target_gone` — the only rejection that can read as "my work vanished"
  // (drawn while offline/dropped onto a layer since deleted).
  //
  // `restoredLayerIds` non-empty means the content was actually recovered
  // onto fresh layers (see recoverLostWork) and the banner offers to undo
  // that; empty means there was nothing recoverable — a rejected
  // merge/transform — and it stays the plain notice it has always been.
  // Deliberately not an automatic room fork (see Outbox's onSettled).
  const [lostWork, setLostWork] = useState<{ layerNames: string[]; restoredLayerIds: string[] } | null>(null)
  // Rejected content operations waiting to be recovered as a batch. They
  // arrive one ack at a time as the outbox drains, so recovery debounces
  // rather than reacting to each — see scheduleLostWorkRecovery.
  const lostContentOpsRef = useRef<LostContentOp[]>([])
  const lostWorkTimerRef = useRef<number | null>(null)
  const lostWorkFirstAtRef = useRef<number | null>(null)
  // Assigned once recoverLostWork exists (it needs the engine and
  // syncFromLog, both defined well below the Outbox this is called from).
  const recoverLostWorkRef = useRef<(() => void) | null>(null)
  // (#346) Same shape, same reason: `requestFullResync` is defined inside the
  // socket-wiring effect (it needs that effect's own `socket`), and the paper
  // retry below — a UI callback with no socket of its own — is what has to
  // call it.
  const requestFullResyncRef = useRef<(() => void) | null>(null)
  // (#201) Live size of the outbox — how much drawing exists only on this
  // device so far. Mirrored into state (rather than read off the Outbox on
  // render) because the Outbox is not a React store and its changes come
  // from socket acks, not renders.
  const [outboxState, setOutboxState] = useState({ pending: 0, stalled: 0 })
  // (#24) Backed by the store now — applyParticipantAction still just
  // folds each socket event through the same pure participantsReducer
  // (participants.ts), reused unchanged.
  const participants = useRoomStore(s => s.participants)
  const layerDrawers = useRoomStore(s => s.layerDrawers)
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
  const dispatchParticipants = useRoomStore(s => s.applyParticipantAction)
  // (#254 epic) `userId` is normally read only non-reactively via getState()
  // at "moment of action" call sites (see its own doc comment on
  // roomSlice.ts) — this is the one legitimate exception: owner-only UI
  // (the freeze toggle, the ownerLocked control) and the frozen-self banner
  // both need to know, on every render, who "I" am relative to the live
  // `participants` list below.
  const myUserId = useRoomStore(s => s.userId)
  const myParticipant = participants.find(p => p.userId === myUserId)
  const isOwner = myParticipant?.role === 'owner'
  // (#518) `dispatchOp` has to ask "may I paint here" at the moment of
  // action, and the owner lock makes that question depend on who is asking.
  // Through a ref so the answer can change without rebuilding `dispatchOp` —
  // half the page depends on its identity, and a role that arrives with the
  // participant list would otherwise re-key all of it.
  const isOwnerRef = useRef(isOwner)
  isOwnerRef.current = isOwner

  // (#493) Who is drawing right now — the timestamps, both ways they are
  // written, and the interval that turns them into a list. See
  // useDrawingActivity.
  const {
    drawingIds, markActive, markLayerActive, forget: forgetDrawingActivity, reset: resetDrawingActivity,
  } = useDrawingActivity()
  // (#380) Who is knocking. Owner-only (the hook fetches nothing otherwise),
  // read here rather than inside ParticipantsPanel because the SidePanel tab's
  // badge needs the same count while that panel is collapsed.
  const joinQueue = useJoinQueue(lessonId, isOwner)
  // (#328) What this user is called in the room — their account name if they
  // have one, otherwise the per-device guest name (see resolveDisplayName).
  // `me` is prefetched before the app tree mounts (main.tsx), so this is
  // already the final answer on the first render rather than a guest name that
  // later flips. Mirrored into a ref because the socket effect below emits
  // create_room/join_room and must not re-subscribe when the auth query
  // settles.
  const { me } = useAuth()
  const myDisplayName = resolveDisplayName(me, localStorage)
  const myDisplayNameRef = useRef(myDisplayName)
  myDisplayNameRef.current = myDisplayName
  // Room-wide freeze (#256) OR this participant's own point freeze (#257) —
  // independent mechanisms, either one alone is enough to block input. The
  // owner is structurally exempt from both (see rooms.ts's
  // isOperationAllowed/setParticipantFrozen), so this only ever gates
  // non-owners, matching the server's own enforcement exactly — this is a
  // client-side UX gate, not a security boundary (see dispatchOp/handleUndo/
  // handleRedo below and the canvas's own pointerEvents for where it's
  // actually applied).
  const roomFrozen = useRoomStore(s => s.roomFrozen)
  const isBlockedByFreeze = !isOwner && (roomFrozen || !!myParticipant?.frozen)

  // ── boards (#176, ADR 014 §7 step 4) ─────────────────────────────────────
  const boards = useRoomStore(s => s.boards)
  const activeBoardId = useRoomStore(s => s.activeBoardId)
  const following = useRoomStore(s => s.following)
  const [boardsOpen, setBoardsOpen] = useState(false)
  // One request at a time from the "+": the board lands over REST *and* over
  // the socket, and a second tap during the round trip would make two pages.
  const [boardBusy, setBoardBusy] = useState(false)
  /** The board the teacher is on — the lesson's own when `activeBoardId` is
   *  null. Undefined until the lesson is known: computed from the store's
   *  lesson id, not the URL-backed `lessonId` above, which before the first
   *  room_state may still be a board's id. */
  const knownLessonId = useRoomStore(s => s.lessonId)
  const teacherBoard = knownLessonId ? teacherBoardId({ id: knownLessonId, activeBoardId }) : undefined
  // ── class mode (#595, ADR 015 §6, §11) ──────────────────────────────────
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
  }, [])
  /** The chip: back to the teacher, following on again. */
  const returnToTeacher = useCallback(() => {
    const s = useRoomStore.getState()
    if (!s.lessonId) return
    s.setFollowing(true)
    switchBoardRef.current?.(destinationOf(s) ?? s.lessonId)
  }, [])
  /** (#595) A board opened from the class grid, the Class tab or the
   *  teacher's ‹ ›. For the teacher it is a visit, not a page turn: an ordinary
   *  join, never `set_active_board` — the class must not be sent to a
   *  student's work because the teacher went to look at it (ADR 015 §4). A
   *  student going to a board by hand is stepping away, like any pick. */
  const openClassBoard = useCallback((next: string) => {
    setGridAssignmentId(null)
    if (isOwnerRef.current) switchBoardRef.current?.(next)
    else selectBoard(next)
  }, [selectBoard])
  const startAssignment = useCallback((name: string) => {
    const socket = socketRef.current
    if (!socket || assignmentBusy) return
    setAssignmentBusy(true)
    socket.emit('assignment_start', { name }, result => {
      setAssignmentBusy(false)
      if (!result.ok) notifyError(t('class.error.start'), { key: 'assignment-start' })
    })
  }, [assignmentBusy, t])
  /** (ADR 015 §11) Moves the class: to an assignment, or (null) "Все ко мне". */
  const setClassLocation = useCallback((assignmentId: string | null) => {
    socketRef.current?.emit('set_class_location', { assignmentId })
    setGridAssignmentId(null)
  }, [])
  const setSpotlight = useCallback((target: string | null) => {
    socketRef.current?.emit('set_spotlight', { boardId: target })
  }, [])
  const setHandRaised = useCallback((raised: boolean, whose?: string) => {
    socketRef.current?.emit('set_hand_raised', whose ? { raised, userId: whose } : { raised })
  }, [])
  const setClassVisibility = useCallback((value: ClassVisibility) => {
    socketRef.current?.emit('set_class_visibility', { value })
  }, [])
  const stepInGrid = useCallback((step: -1 | 1) => {
    if (!boardId) return
    const next = neighbourInGrid(barTiles, boardId, step)
    if (next) switchBoardRef.current?.(next)
  }, [boardId, barTiles])
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
  // (#222) Closed for editing — the lesson has been handed out and stopped
  // changing. Deliberately *not* `!isOwner`: the server binds the owner too
  // (see getOperationRejectReason in rooms.ts), and a client gate that let
  // them draw anyway would produce exactly the "drawing into the void" the
  // freeze gate below exists to prevent.
  const roomClosed = useRoomStore(s => s.room?.closedAt !== undefined)
  // Everything that would write to the room goes through this one condition.
  // (#595) A classmate's work opened to look at is closed to this pen too.
  const editingBlocked = isBlockedByFreeze || roomClosed || readOnlyBoard
  // (#429) Mirrored into a ref because the engine's own callbacks are wired
  // once, when the engine is constructed, and would otherwise close over
  // whatever this was at mount — a freeze arriving mid-lesson would never
  // reach them. Every other reader of `editingBlocked` is inside a hook with
  // it in the dependency list and needs no such mirror.
  const editingBlockedRef = useRef(editingBlocked)
  editingBlockedRef.current = editingBlocked
  // (#152) Cursor *positions* used to live here (setPeerCursors on every
  // incoming peer_cursor packet — up to ~30Hz per peer, summed across
  // however many peers are moving a pointer at once, all landing on this
  // ~1600-line component and reconciling its whole tree). PeerCursors now
  // owns that state itself, subscribing to the socket directly (see its own
  // component) — Room only needs to hand it the socket and participants.

  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const engineRef     = useRef<PencilEngineAPI | null>(null)
  // Bumped once per engine construction, and depended on by every effect that
  // pushes a setting into the engine.
  //
  // Those effects were written as "run when the setting changes", which is
  // only half of what they need: the engine is built by an effect that returns
  // early until the paper and the canvas element are both there (see "mount
  // engine" below), so on a fresh room it does not exist yet when they first
  // run. `engineRef.current?.` swallows that, and a setting nobody touches
  // afterwards is then never pushed at all — the engine keeps its own
  // constructor default forever.
  //
  // That is not hypothetical. The pencil has shipped with tiltResponse
  // 'restrained' since 18.08 (toolSchemas.ts) while the engine's own default is
  // 'smooth', and every stroke drawn on an untouched device came out 'smooth':
  // measured live (store said 'restrained', `__engine._tiltResponse` said
  // 'smooth'), and confirmed against real strokes in three rooms — the one
  // device that drew 'restrained' was the one where the control had been
  // touched by hand, which is exactly the shape this bug has.
  //
  // #475 met the same trap for the pen calibration and solved it locally, by
  // handing that one value over at construction. This is the general form of
  // the same fix, so the next setting added here inherits it instead of
  // rediscovering it.
  const [engineEpoch, setEngineEpoch] = useState(0)
  const initialToolRef = useRef({
    pencil: toolSettings.pencil.grade as PencilGradeName,
    size: toolSettings.pencil.size as number,
    opacity: toolSettings.pencil.opacity as number,
    tool,
  })

  const socketRef        = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  // (#24) userId lives in the store now (roomSlice) but is deliberately
  // never read reactively — it's only ever needed at "moment of action"
  // (e.g. stamping an operation), same non-reactive-ref-like usage as
  // before, just via useRoomStore.getState().userId instead of a ref.
  // Stamped by every create_room/join_room ack (#41) with the server's
  // cookie-resolved identity — stable across reconnects, unlike socket.id.
  const applyIdentity = useCallback((userId: string) => {
    useRoomStore.getState().setUserId(userId)
    engineRef.current?.setUserId(userId)
  }, [])
  const appliedOpIdsRef   = useRef<Set<string>>(new Set())
  // (#289 epic — reliable history spec v0.2 §2/§4, Phase 2 diagnostic) Highest
  // confirmed `seq` applied to each layer so far, keyed by layerId. Exists
  // purely to *detect and log* the one remaining ordering hazard Phase 1
  // doesn't close: this client's own stroke still paints immediately, at
  // `_onEnd` time, before its `seq` is even known — if a peer's concurrent
  // stroke on the same layer turns out to have an *earlier* true seq, it
  // still arrives (and gets composited) after this client's own already did.
  // Closing that gap for real means deferring a local stroke's commit into
  // the confirmed buffer until its own operation_confirmed arrives (the same
  // machinery peer reveals already use) — real engine-level surgery on the
  // live pointer/stroke-completion path, which needs a real device to verify
  // safely (see CLAUDE.md's cross-device pixel-determinism history) and is
  // deliberately not attempted unsupervised here. This tracker at least
  // turns the hazard from invisible into a logged, countable event, so
  // whether it's worth that follow-up can be judged from real usage instead
  // of guessing.
  const layerAppliedSeqRef = useRef<Map<string, number>>(new Map())
  const noteLayerSeq = useCallback((layerId: string, seq: number) => {
    const highest = layerAppliedSeqRef.current.get(layerId) ?? 0
    if (seq < highest) {
      // (#480) Ровно тот «logged, countable event», которого просит
      // комментарий выше — только теперь считается там, где это видно не
      // только при открытом девтулзе.
      reportInvariant('layer op applied out of true order', { layerId, seq, alreadyOnScreen: highest })
      return
    }
    layerAppliedSeqRef.current.set(layerId, seq)
  }, [])
  // (#289 epic — reliable history spec v0.2 §2/§4) layerId/folderId this
  // client itself created but the server hasn't confirmed yet — the
  // "local island" isLocalIslandSafe checks a layer_delete/layer_merge/
  // layer_duplicate/layer_transform's targets against. Added the instant a
  // layer_add/folder_add is dispatched (see onLocalOperation below), removed once
  // its SendResult settles either way — confirmed means it's now something
  // a peer could plausibly reference too; rejected means it never became
  // real in the first place.
  const pendingIdsRef = useRef<Set<string>>(new Set())
  // (#289 §12) Last seq seen on the live confirmed stream — distinct from
  // latestKnownSeqRef, which also folds in bulk room_state catch-up and so
  // can't tell "the live stream skipped something" from "we just replayed a
  // batch". Reset on every full resync, since the stream restarts there.
  const lastConfirmedSeqRef = useRef(0)
  // (#289 §16) True while this client is deliberately skipping peer-stroke
  // reveal animation to work through a backlog — see handleOperationConfirmed.
  const catchingUpRef = useRef(false)
  // (#169) A live operation_undo/operation_redo/operation_revoke whose
  // targetOpId isn't in appliedOpIdsRef yet — the target is somewhere in
  // pre-snapshot history background backfill hasn't reached yet. Applying it
  // immediately would silently no-op (OperationLog.applyUndo/applyRedo/
  // revoke all return null for an unknown id, see their own doc comments),
  // losing the operation permanently instead of catching up once backfill
  // reaches it. Drained by drainDeferredQueue after every backfill page.
  const deferredOpsQueueRef = useRef<Operation[]>([])
  const strokeActiveRef   = useRef(false)
  // Stroke ops whose live reveal (previewOperation) hasn't finished playing
  // yet — i.e. not yet appendOperation'd into the log/layer. Consulted by
  // handleOperationConfirmed so a fast operation_undo/operation_revoke
  // targeting one of these can drop it from the reveal instead of trying
  // (and silently failing) to undo an op the log was never given, and by
  // checkSnapshotBoundary for the seqs those reveals still owe. (#477) One
  // structure for both readings — see pendingPreviews.ts for why they were
  // two, and what that cost.
  const pendingPreviewsRef = useRef(createPendingPreviews())
  // (#429) Gestures this client watched arrive live, so their operations are
  // applied straight rather than animated a second time (see
  // handleOperationConfirmed's stroke branch).
  //
  // Trimmed rather than cleared on any particular event: a gesture's
  // operations follow its packets within moments, but there is no single
  // moment at which an id is provably finished with — a long gesture emits an
  // operation at every STROKE_DAB_CHUNK_LIMIT boundary, so "the operation
  // arrived" does not mean "no more will". Keeping the most recent
  // STREAMED_STROKE_MEMORY ids covers any plausible in-flight window while
  // bounding what would otherwise grow for the whole lesson. Insertion order
  // is Set's own iteration order, so the oldest is simply the first.
  const streamedStrokeIdsRef = useRef<Set<string>>(new Set())
  // A joiner's first room_state can arrive before the engine exists — we need
  // that very event to learn `config` in the first place, and the engine only
  // mounts once `config` is set (see the mount-engine effect below). Its
  // operations/participants are stashed here and replayed once the engine is
  // up, instead of being dropped.
  const pendingSnapshotRef = useRef<{
    latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]; palette: string[]
    // (#254/#255 epic) Room-wide freeze at the moment this snapshot was
    // taken — see the mount-engine effect's pending-snapshot replay below.
    frozen: boolean
  } | null>(null)
  // True once this session's `handleRoomState` has processed its very first
  // `room_state` — governs "initial handshake" vs. "genuine reconnect" there.
  // Deliberately a dedicated ref rather than checking `!useRoomStore.getState().room`:
  // that field is seeded synchronously for the *creator* (from navigation
  // state, before any socket round-trip — see the `useState` near this
  // component's top), so it doesn't distinguish "have we had our first
  // room_state yet" the way it does for a joiner (whose `room` is only ever
  // learned from that same first event).
  const firstRoomStateReceivedRef = useRef(false)
  // Highest operation seq this client has definitely seen — from ack'd local
  // operations and from operation_confirmed's envelopes (#149/#289). Sent back as
  // lastKnownSeq on every join_room/create_room (including reconnects), so
  // the server can trim room_state's tailOperations instead of resending
  // everything already known. 0 means "nothing yet," same as omitting it.
  const latestKnownSeqRef = useRef(0)
  // Bakes+uploads a full-room snapshot every time latestKnownSeqRef crosses
  // a SNAPSHOT_SEQ_INTERVAL boundary (#149/#167) — see snapshotSync.ts. One
  // instance per board (#176): a snapshot is content, and a fresh `attempted`
  // set per page is what lets the same boundary be baked on each.
  //
  // Read through a ref by everything the socket effect registers: that effect
  // is keyed on the lesson and must not be torn down by a page turn, so
  // nothing per-board may sit in its dependency list.
  const snapshotUploader = useMemo(() => (boardId ? createSnapshotUploader(boardId) : null), [boardId])

  // (#595, ADR 015 §5) The class grid's live picture of a student's board:
  // re-baked a few seconds after the pen comes to rest, never during a stroke,
  // only when something changed, and no more often than every five seconds —
  // see previewSchedule.ts. One baker per board: its student, or, while the
  // student is not on it, the teacher (whose corrections must reach the grid
  // too). Annotations never reach a preview, so a teacher who only remarks
  // changes nothing to bake.
  const previewScheduleRef = useRef<ReturnType<typeof createPreviewSchedule> | null>(null)
  const boardOwnerHere = currentBoardSummary?.ownerId !== undefined
    && participants.some(p => p.userId === currentBoardSummary.ownerId && p.boardId === boardId)
  const bakesLivePreview = onPersonalBoard && activeAssignmentId !== null
    && currentBoardSummary?.assignmentId === activeAssignmentId
    && (currentBoardSummary.ownerId === myUserId || (isOwner && !boardOwnerHere))
  useEffect(() => {
    if (!bakesLivePreview || !boardId) return
    const schedule = createPreviewSchedule()
    previewScheduleRef.current = schedule
    const unsubscribe = useRoomStore.subscribe((next, prev) => {
      if (next.strokeActive === prev.strokeActive) return
      if (next.strokeActive) schedule.notePenDown(Date.now())
      else schedule.notePenUp(Date.now())
    })
    const timer = window.setInterval(() => {
      const now = Date.now()
      const engine = engineRef.current
      if (!engine || !schedule.shouldBake(now)) return
      schedule.noteBaked(now)
      void uploadThumbnail(boardId, engine).then(ok => {
        if (ok) useRoomStore.getState().applyBoardsAction({ type: 'thumbnail_baked', boardId, at: new Date().toISOString() })
      })
    }, 500)
    return () => {
      window.clearInterval(timer)
      unsubscribe()
      if (previewScheduleRef.current === schedule) previewScheduleRef.current = null
    }
  }, [bakesLivePreview, boardId])
  const snapshotUploaderRef = useRef(snapshotUploader)
  snapshotUploaderRef.current = snapshotUploader
  // Highest seq the engine buffer has actually *committed* (painted) up to —
  // deliberately decoupled from latestKnownSeqRef's "arrived" tracking.
  // A peer stroke doesn't commit on arrival: it reveals progressively
  // (previewOperation/onPreviewApplied, paced by the stroke's own recorded
  // dab timing — see PencilEngineOptions.onPreviewApplied), and two peers'
  // reveals can finish out of order (a short stroke's reveal completing
  // before a longer, earlier-seq one that's still animating). Baking a
  // network snapshot the moment a seq merely *arrives* could therefore miss
  // an earlier op that hasn't actually painted yet. pendingPreviewsRef above
  // holds every stroke seq that has arrived but not yet committed; the
  // watermark can only advance past the smallest still-pending one — see
  // snapshotGate.ts, which owns that rule along with the rest of the
  // may-this-client-bake decision.
  // (#462) Holds the watermark and the "has this client's catch-up finished"
  // gate — see snapshotGate.ts for what it refuses and why. Per mount, like
  // replayIncompleteRef below: a fresh mount is a fresh, empty engine, and so
  // a client that has to earn the right to speak for the room again.
  const snapshotGateRef = useRef(createSnapshotGate(reportInvariant))
  /** (#385) Set when the join-time replay did not finish — an operation threw
   *  and the canvas therefore shows less than the log says the room contains.
   *
   *  The editor deliberately stays usable in that case (see the `finally`
   *  around the replay for why unblocking is the lesser harm), but what must
   *  *not* happen is this client writing its incomplete canvas back as the
   *  room's own state. A snapshot is authoritative — the next joiner restores
   *  from it and the server then withholds the operations it covers — so
   *  baking one here would turn "this session rendered the room wrong" into
   *  "the room is now actually missing that content", permanently, for
   *  everyone. The thumbnail is the same mistake in miniature: a blank preview
   *  on the lesson list, republished from a client that never managed to draw
   *  the lesson.
   *
   *  Never cleared for the life of this mount: nothing that happens after a
   *  half-applied replay can make the buffer whole again short of a reload,
   *  which is a fresh mount and a fresh attempt anyway. */
  // (#487) Замер входа: от нажатия «войти» до момента, когда преклоадер ушёл.
  // Ref, а не состояние: между стартом и финишем комната перерисовывается
  // (гейт сменяется редактором, движок монтируется), и замер обязан это
  // пережить, ничего при этом не перерисовывая сам.
  const openTimerRef = useRef<OpenTimer | null>(null)
  // Будильник: снимает состояние, **не дожидаясь конца**. Половина, ради
  // которой всё и делается — вход, который не заканчивается, не сообщает о
  // себе ничем, см. openTiming.ts.
  const openAlarmRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Будильник переживает смену экрана внутри комнаты, но не сам уход из неё:
  // отчёт «вход не закончился» от размонтированной страницы — это отчёт о
  // человеке, который просто ушёл, и он был бы неотличим от настоящего.
  useEffect(() => () => {
    if (openAlarmRef.current !== null) { clearTimeout(openAlarmRef.current); openAlarmRef.current = null }
  }, [])

  const replayIncompleteRef = useRef(false)
  const checkSnapshotBoundary = useCallback(() => {
    const engine = engineRef.current
    const uploader = snapshotUploaderRef.current
    if (!engine || !uploader) return
    const plan = snapshotGateRef.current.observe({
      latestKnownSeq: latestKnownSeqRef.current,
      pendingCommitSeqs: pendingPreviewsRef.current.commitSeqs(),
      replayIncomplete: replayIncompleteRef.current,
    })
    if (!plan) return
    uploader.onSeqObserved(plan.previous, plan.watermark, engine, useRoomStore.getState().layerState)
  }, [])
  /** (#462) Opens the snapshot path for this client, once its canvas actually
   *  holds the room — called from every catch-up that ran to completion: the
   *  mount effect's replay, `handleRoomState`'s restore, and the brand-new-room
   *  branch that has nothing to restore and is therefore caught up by
   *  definition. See snapshotGate.ts for what this is guarding. */
  const markJoinRestoreDone = useCallback(() => {
    snapshotGateRef.current.restoreCompleted(latestKnownSeqRef.current)
  }, [])

  // (#312) Queues one rejected content operation for recovery and (re)arms
  // the batch timer.
  //
  // Debounced rather than immediate because these arrive one ack at a time
  // as the outbox drains (MAX_CONCURRENT_SENDS at once, #298): reacting per
  // operation would mint one replacement layer per lost stroke. Debounce
  // alone would never fire on a long enough backlog, so it's capped — after
  // LOST_WORK_MAX_WAIT_MS from the first rejection the batch goes through
  // regardless, and anything still arriving simply forms the next batch.
  const scheduleLostWorkRecovery = useCallback((op: LostContentOp) => {
    lostContentOpsRef.current.push(op)
    const now = Date.now()
    lostWorkFirstAtRef.current ??= now

    const run = () => {
      lostWorkTimerRef.current = null
      lostWorkFirstAtRef.current = null
      recoverLostWorkRef.current?.()
    }
    if (now - lostWorkFirstAtRef.current >= LOST_WORK_MAX_WAIT_MS) {
      if (lostWorkTimerRef.current !== null) window.clearTimeout(lostWorkTimerRef.current)
      run()
      return
    }
    if (lostWorkTimerRef.current !== null) window.clearTimeout(lostWorkTimerRef.current)
    lostWorkTimerRef.current = window.setTimeout(run, LOST_WORK_QUIET_MS)
  }, [])

  // (#289 epic, reliable history spec v0.2 §9) Every outgoing operation goes
  // through here rather than a bare `socket.emit` — persisted to IndexedDB
  // first, retried with exponential backoff until a real `SendResult`
  // arrives, and replayed wholesale on reconnect (see handleConnect's
  // resendAll below). Without this, an operation whose packet was dropped
  // was simply lost forever: it painted locally, never reached the server,
  // and nothing ever noticed or retried it.
  //
  // `onSettled` is the one place a definitive verdict lands, for both
  // dispatch paths (optimistic and confirmation-gated) — the same
  // watermark/pendingIds/noteLayerSeq bookkeeping onLocalOperation's own ack
  // callback used to do inline.
  // (#176) The queue's key is the board, not the URL: operations are content,
  // and a page turn hands the next board a queue of its own (see the effect
  // below that retires the previous one). Before the first `room_state` a
  // joiner has no board yet; the URL id stands in so the offline screen (#313)
  // can still count a previous visit's unsent work for the common case of a
  // lesson with one board.
  const outboxBoardId = boardId ?? id ?? ''
  const outbox = useMemo(() => new Outbox({
    storage: createIndexedDbOutboxStorage(),
    // (#358) Binds this queue to this board, in storage as well as in memory.
    // `outboxBoardId` is in the dep list below for the same reason: a queue
    // holding one board's unconfirmed strokes must not survive into another —
    // that is exactly how they used to get sent there.
    roomId: outboxBoardId,
    send: op => sendOperationWithTimeout(socketRef.current, op),
    // (#298) Nothing may go out before create_room/join_room has completed:
    // the server has no room to record against and answers `not_joined`, so
    // every such send is guaranteed to fail. This used to drain on *connect*
    // instead, which on a tablet with a 384-operation backlog meant blasting
    // ~55 MB of stroke JSON at a socket that had joined nothing — every
    // reconnect, forever.
    //
    // (#176) And nothing may go out while the socket is on — or on its way to
    // — a board other than this queue's. An operation carries no board of its
    // own; the server records it against wherever the socket is. The join ack
    // for the *lesson* can land after this client has already asked to turn to
    // the teacher's board, and a `resendAll` at that moment would put the
    // first board's leftovers on the second.
    canSend: () => hasJoinedRef.current && socketBoardRef.current === outboxBoardId,
    onStalled: op => {
      console.error('operation stopped retrying after repeated failures', op.type, op.id)
      // (#395) Stop holding a transform preview for an operation that has
      // stopped trying to arrive. Showing the layer where it actually is
      // beats showing where it was meant to go with nothing indicating that
      // it never got there — the entry stays queued either way, so a later
      // resendAll can still land it.
      resolveTransformCommit(op.id)
    },
    // (#201) The counter the ConnectionBanner reports. Passing a plain
    // setState is safe from any callsite: React batches, and the Outbox
    // only ever calls this after a real size change.
    onPendingChange: (pending, stalled) => setOutboxState({ pending, stalled }),
    onSettled: (op, result) => {
      if (!result.ok) {
        console.error('operation rejected by server', op.type, op.id, result.reason)
        // (#395) It will never be applied, so nothing is coming to replace
        // the held gizmo preview — drop it and put the bounds back on what
        // the layer really contains.
        resolveTransformCommit(op.id)
        // Never became real — drop it back out of the local island so a
        // later delete/merge targeting it isn't wrongly treated as safe.
        if (op.type === 'layer_add' || op.type === 'folder_add') pendingIdsRef.current.delete(op.layerId)
        // (#289 §17, #312) `target_gone` on a content-bearing op is the one
        // rejection a user can actually perceive as lost work — typically
        // drawn offline (or during a drop) onto a layer someone deleted in
        // the meantime. Since #311 the server hands those operations back
        // intact instead of swallowing them, so they can be recovered onto
        // a fresh layer rather than merely reported.
        //
        // Deliberately still not an automatic room fork: forking on every
        // conflict was considered and rejected as worse than the problem (a
        // pile of near-duplicate rooms after any flaky wifi). A replacement
        // layer is the far smaller intervention — and it doesn't undo the
        // deletion either, since whoever deleted the layer deleted what they
        // could see; this only brings back what they couldn't.
        if (result.reason === 'target_gone') {
          if (isRecoverableContentOp(op)) scheduleLostWorkRecovery(op)
          else setLostWork({ layerNames: [], restoredLayerIds: [] })
        }
        return
      }
      latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, result.seq)
      if (op.type === 'stroke') noteLayerSeq(op.layerId, result.seq)
      // Confirmed — a peer could plausibly reference this id from now on, so
      // it no longer qualifies as this client's own private local island
      // (see isLocalIslandSafe/dispatchOp).
      if (op.type === 'layer_add' || op.type === 'folder_add') pendingIdsRef.current.delete(op.layerId)
      checkSnapshotBoundary()
    },
  }), [outboxBoardId, checkSnapshotBoundary, noteLayerSeq, scheduleLostWorkRecovery, resolveTransformCommit])
  // (#176) For the socket effect, which must not list `outbox` as a
  // dependency — see snapshotUploaderRef.
  const outboxRef = useRef(outbox)
  outboxRef.current = outbox
  // Tracks whether create_room/join_room has ever succeeded on this socket
  // connection's lineage, so a later auto-reconnect (socket.io's default
  // behavior on a dropped connection) rejoins rather than re-creating the
  // room or re-showing the join gate to an already-joined user.
  const hasJoinedRef = useRef(false)
  // The credentials a joiner's gate submission used, replayed verbatim on a
  // later reconnect (a fresh socket id always means a fresh join — see the
  // handleConnect reconnect branch below).
  const lastJoinAttemptRef = useRef<{ name: string; password?: string } | null>(null)

  // ── join gate state (joiner path only) ──────────────────────────────────────
  // Prefilled, not fixed: the joiner can overwrite it in the gate, and what
  // they type is what the room sees.
  const [joinName,       setJoinName]       = useState(myDisplayName)
  const [joinPassword,   setJoinPassword]   = useState('')
  const [joinError,      setJoinError]      = useState<string | null>(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  // (#231) Which screen the gate is showing. Three of the server's refusals
  // are states of the person rather than problems with the form — there is
  // nothing to re-type when the answer is "you were blocked" or "the owner
  // hasn't answered yet" — so they replace the form instead of appearing as
  // an error under it. See JoinGateState.
  const [joinState,      setJoinState]      = useState<JoinGateState>('form')
  // (#513) Whether the gate is asking for a password yet. False until a join
  // attempt that carried none comes back refused — see attemptJoin.
  const [joinPasswordAsked, setJoinPasswordAsked] = useState(false)

  // (#405) `drawingTool`, not `tool`: these are the size/opacity/colour the
  // engine is configured with, and while the ruler or the gizmo is selected
  // `tool` names something that has no such fields at all.
  const activeCfg = toolSettings[drawingTool]
  // #468 v4 — the named mix is a *shortcut* for the two sliders, not a fourth
  // independent setting: choosing one writes water and pigment, and moving
  // either slider afterwards simply leaves the named value stale rather than
  // fighting it. Keeping the presets as the only writers of the pair would mean
  // a user could never depart from them; keeping them independent would mean
  // two sources of truth for one brush.
  const watercolorMixName = toolSettings.watercolor.mix as string
  useEffect(() => {
    if (!isWatercolorMixPreset(watercolorMixName)) return
    const next = WATERCOLOR_MIX_BY_PRESET[watercolorMixName]
    setToolSetting('watercolor', 'water', next.water)
    setToolSetting('watercolor', 'pigment', next.pigment)
  }, [watercolorMixName, setToolSetting])

  // Read directly inside useViewport's native pointerdown listener — see
  // that hook's doc comment for why a ref (checked synchronously, before
  // React ever re-renders) is required here instead of just having the
  // catcher call e.stopPropagation() itself. The ruler shares that catcher but
  // is pen-only (see handleRulerDown), so it never reserves a touch here — a
  // finger always pans/zooms while the ruler is in hand, exactly like it does
  // while drawing with the pencil.
  const toolActiveRef = useRef(false)
  // (#512) The annotation tools join the eyedropper here while the compact
  // shell is on, and that one line is the whole of "one finger draws, two
  // fingers pan". The mechanism already existed for the eyedropper: the first
  // touch is reserved for the tool and never enters the pan/pinch bookkeeping,
  // while a second finger landing behind it pans normally. Nothing about the
  // gesture had to be invented, and nothing about it changes anywhere the
  // finger does not draw.
  toolActiveRef.current = eyedropperActive || annotateWithFinger

  // (#362) Declared before useViewport because it feeds it: the pinch/rotate
  // edges the toast lives by are only observable from inside that hook's own
  // gesture handlers.
  const { toastVisible: viewportToastVisible, onPinchPhase, hide: hideViewportToast } = useViewportToast()

  const { vp, setVp, vpRef, setVpNode, vpEl, canvasWrapRef, fitCanvas, zoomBy, angleDeg, canvasTransform } =
    useViewport(config, toolActiveRef, config?.infinite ?? false, onPinchPhase)

  // Infinite rooms measure "100%" against the device-native 1-world-unit-per-
  // physical-pixel scale rather than against `vp.zoom` directly — see
  // deviceNativeZoom's doc comment. Both the header readout and #362's toast
  // display and reset through these, so the two cannot drift into disagreeing
  // about what 100% means.
  const zoomBase = config?.infinite ? deviceNativeZoom() : 1
  const zoomPercent = Math.round(vp.zoom / zoomBase * 100)
  const resetZoom = useCallback(() => {
    setVp(v => ({ ...v, zoom: zoomBase }))
  }, [setVp, zoomBase])
  // Both values at once, for the toast's single button — and only those two.
  // `fitCanvas` would also re-centre, which in minimal UI means the drawing
  // jumping out from under the fingers that just finished a gesture on it.
  const resetZoomAndRotation = useCallback(() => {
    setVp(v => ({ ...v, zoom: zoomBase, angle: 0 }))
  }, [setVp, zoomBase])

  // (#362) The readout belongs to a gesture made *in* minimal UI, so crossing
  // that boundary drops it either way: entering, so a pinch made moments before
  // the tap doesn't surface a readout as though the tap had caused it; leaving,
  // so the pending dismissal doesn't survive to fire against a later gesture.
  useEffect(() => { hideViewportToast() }, [uiHidden, hideViewportToast])

  // Hand (#319, #443) — the drag itself lives in useViewport; Room owns the
  // ways in and out and what it looks like. Two routes, one meaning: the hand
  // *selected* (an ordinary member of `tool` since #443) and Space *held* over
  // whatever else is selected. Everything downstream wants the union, which is
  // what `isHandActive` names.
  const handHeld = useRoomStore(s => s.handHeld)
  const handActive = isHandActive({ tool, handHeld })
  // (#405) Read inside a native pointerdown listener that must not be torn
  // down and rebuilt every time Space goes up and down — see the click-past-
  // the-gizmo effect below.
  const handActiveRef = useRef(handActive)
  handActiveRef.current = handActive
  // (#407) Read by the tap-past-the-gizmo listener, which is registered once
  // per transform session and must not be torn down and rebuilt every time the
  // drawing tool underneath it changes — same reason handActiveRef exists.
  const drawingToolRef = useRef(drawingTool)
  drawingToolRef.current = drawingTool

  // (#393) What the pointer looks like right now — the whole decision, made
  // once, in one module, from the tool plus every mode laid on top of it.
  // Nothing else in this file (or in BrushCursor/TransformGizmo/RulerOverlay,
  // or in Room.module.css) decides any part of it.
  const cursor = useCursor()

  // Drag up/down on the zoom label to adjust zoom without a two-finger pinch
  // (#97); a plain click still resets to 100%, mirroring angleLabel's
  // click-to-reset-rotation below.
  // Clamped to the same limits as the wheel/pinch gestures (see minZoom) —
  // this control writes vp.zoom directly, so a floor of its own would let a
  // drag reach a zoom no gesture can, which for an infinite room is the
  // per-frame tile cost #363 exists to bound.
  const zoomFloor = minZoom(!!config?.infinite)
  const { onPointerDown: onZoomDragDown } = useDragToAdjust(
    vp.zoom,
    z => setVp(v => ({ ...v, zoom: clamp(z, zoomFloor, ZOOM_MAX) })),
    { min: zoomFloor, max: ZOOM_MAX, sensitivity: 0.01 },
  )

  // (#329) Rotation by the same drag gesture, on the angle readout — this
  // replaced the two rotate-by-15° buttons, which could only ever step. Worked
  // in degrees rather than radians so the sensitivity is a number that means
  // something: at 0.5°/px a quarter turn is a ~180px drag, and single degrees
  // are still individually reachable. Wrapping, not clamping: half a turn is
  // not a wall anyone rotating a sheet of paper expects to hit.
  const { onPointerDown: onAngleDragDown } = useDragToAdjust(
    vp.angle * 180 / Math.PI,
    deg => setVp(v => ({ ...v, angle: deg * Math.PI / 180 })),
    { min: 0, max: 360, sensitivity: ROTATE_DEG_PER_PX, wrap: true },
  )


  // #99: layered independently on top of useViewport's own touch pan/pinch
  // handling on the same `.viewport` element — see useTapToggle's docstring
  // for why the two never conflict, and why it takes the element (`vpEl`)
  // rather than the ref.
  //
  // (#408) Off entirely while the gizmo is up: a tap on the canvas then belongs
  // to the transform tool, which reads it as "I'm done here" (see the
  // click-past-the-gizmo effect below). Both listeners sit on `.viewport` and
  // neither can see what the other made of the same touch, so leaving both
  // armed meant one finger dismissing the gizmo *and* stripping the chrome in
  // the same instant — two answers to a gesture that asked one question.
  // Suppressing it here rather than inside the hook keeps the rule where the
  // conflict is, and costs nothing: the tap puts the transform tool down, so
  // by the next tap this is armed again and hides the chrome as it always did.
  //
  // (#519) The selection tool claims the same tap for the same kind of reason,
  // with one difference: it claims it only while there is a selection on
  // screen to put down (see clearSelectionOnTap below). With none, a tap means
  // nothing to that tool, so the chrome toggle keeps it — unlike the gizmo,
  // which is either up or the tool is not in hand at all.
  const canvasTapClaimed = transformActive || (selectionActive && selection !== null)
  useTapToggle(vpEl, toggleUI, tapToHideEnabled && !canvasTapClaimed, minimalUiTapMode, tapDebugEnabled ? setTapDebug : undefined)
  // (#509 v3) Mirrors the exact condition above, so a note only ever waits for
  // the double-tap window when a double tap is really listening for one.
  doubleTapArmedRef.current = tapToHideEnabled && !canvasTapClaimed
    && minimalUiTapsRequired(minimalUiTapMode) > 1

  // ── require a room id ────────────────────────────────────────────────────────
  // Config itself no longer loads here: the creator's is known synchronously
  // from navigation state (see the `config` initializer above); a joiner's
  // arrives asynchronously from the server once they submit the join gate and
  // room_state comes back (see the socket-wiring effect below).
  useEffect(() => {
    if (!id) navigate('/create')
  }, [id, navigate])

  // Marks a user as "currently drawing" (#38) — a timestamp refreshed by local
  // stroke start/move and by incoming remote stroke ops; a separate interval


  // ── operation log bridge ──────────────────────────────────────────────────────
  // LayerState is derived: base room state + replay of done operations, with
  // per-user view fields (selection, collapse, local lock) carried over.
  // Defined here (rather than further down, closer to dispatchOp/handleUndo)
  // because the mount-engine effect below needs it for pending-snapshot replay.
  //
  // (#148) replayLayerState walks the *entire* done-operations array from
  // scratch on every call — cost scaling with total session length, not the
  // current canvas — and syncFromLog is called once per incoming
  // operation_confirmed, undo/redo, and finished stroke-reveal (onPreviewApplied).
  // Several peers drawing at once easily produces a burst of these calls
  // within the same tick/microtask turn (a socket 'message' handler firing
  // several times before the event loop yields), each currently paying its
  // own full O(log length) scan back to back for what ends up being the same
  // final state. Coalesced here via a microtask (same "collapse a same-tick
  // burst" idea as useViewport's own rAF-throttled updateVp, just finer-
  // grained — a microtask runs before the next paint regardless, so this
  // adds no perceptible delay): repeated calls before the microtask fires are
  // free, and the one real scan that does happen reads getOperations() fresh
  // at that point, reflecting every op appended by then either way, so this
  // is purely a *when* change — never a stale or partial replay.
  const syncFromLogScheduledRef = useRef(false)
  // (#169) Once a network-snapshot restore has happened, LayerState must be
  // derived on top of the snapshot's own `layerState` — not
  // makeInitialLayerState() — since the client's OperationLog only has the
  // live tail at that point (full pre-snapshot history arrives later, via
  // background backfill, purely for undo/redo; see
  // engine.getOperationsSinceRestore's own doc comment for why replaying it
  // again here would double-apply structure the restored base already
  // reflects). Sticky for the rest of the session once set — never reset
  // back to null, even after backfill completes.
  const restoredLayerStateRef = useRef<LayerState | null>(null)
  const deriveLayerStateFromLog = useCallback(() => {
    const base = restoredLayerStateRef.current
    const ops = base
      ? (engineRef.current?.getOperationsSinceRestore() ?? [])
      : (engineRef.current?.getOperations() ?? [])
    useRoomStore.getState().syncLayerStateFromLog(base ?? makeInitialLayerState(), ops)
    // (#508) Annotations fold from the *whole* done log, not from the
    // since-restore tail LayerState uses, and with no base to sit on. The
    // asymmetry is the point: a snapshot restores pixels and the stored
    // layerState restores structure, so replaying either again would
    // double-apply it — but nothing anywhere stores annotations, which is
    // exactly why the server never withholds one (see isCoveredBySnapshot).
    // Every annotation operation the room ever had is therefore present here,
    // and folding all of them from empty is both correct and, because the fold
    // is keyed by annotation id, immune to being run twice.
    useRoomStore.getState().syncAnnotationsFromLog(engineRef.current?.getOperations() ?? [])
  }, [])
  const syncFromLog = useCallback(() => {
    if (syncFromLogScheduledRef.current) return
    syncFromLogScheduledRef.current = true
    queueMicrotask(() => {
      syncFromLogScheduledRef.current = false
      deriveLayerStateFromLog()
    })
  }, [deriveLayerStateFromLog])
  /** (#386) The same derivation, run now instead of on the next microtask.
   *
   *  Deferring is right for the ordinary case: operations arrive in bursts and
   *  one derivation per burst beats one per operation. It is wrong for any
   *  caller that goes on to *read* the store in the same task, because the
   *  microtask has not run yet and the store still holds whatever was there
   *  before — for a fresh join, `makeInitialLayerState()`.
   *
   *  That is not hypothetical. The snapshot bootstrap below used to call
   *  `syncFromLog()` and then read `useRoomStore.getState().layerState`
   *  synchronously a few lines later, so it uploaded the *empty room's*
   *  structure as the room's authoritative one. On a real 2001-operation
   *  lesson that stored `{layer-1, background}` at seq 2000 over a room with
   *  six layers and a folder, and the next join restored from it: two empty
   *  layers, with the server then withholding the operations it believed that
   *  snapshot covered. The pixels were never in danger — every operation was
   *  still in Postgres — but the room read as wiped.
   *
   *  Leaves any already-queued microtask alone rather than trying to cancel
   *  it: this derivation is a pure function of the log, so running it twice
   *  costs a little work and changes nothing. */
  const syncFromLogNow = useCallback(() => {
    deriveLayerStateFromLog()
  }, [deriveLayerStateFromLog])

  // (#312) Mints one replacement layer per dead target and replays the
  // rejected operations onto it, in their original draw order.
  //
  // A *new* layer rather than resurrecting the deleted one, deliberately:
  // `aliveIds` on the server is a monotonic fold over the log, so un-deleting
  // an id would break that invariant and leave every client to answer "what
  // about the operations between the delete and the resurrection" on its
  // own — the exact class of divergence #289 exists to remove. A fresh layer
  // is an ordinary `layer_add` plus ordinary strokes: no new server
  // semantics, and replay converges everywhere by construction.
  //
  // The content comes from this client's own rejected operations, never from
  // a pixel bake of the dead layer. Those operations go through the same
  // validation as any other, so the server is asked to trust nothing new —
  // whereas uploading client-baked pixels as truth is exactly #287, which
  // poisoned a room and is why snapshot pruning is still switched off. Worth
  // noting this is also the only source that survives at all once pruning
  // returns (#207): a snapshot taken after the deletion no longer contains
  // the layer, and the strokes below it get pruned, so the author's own
  // device is the last place this work exists.
  const recoverLostWork = useCallback(() => {
    const collected = lostContentOpsRef.current
    lostContentOpsRef.current = []
    const engine = engineRef.current
    if (!collected.length || !engine) return

    const { layerState: liveLayerState, userId } = useRoomStore.getState()
    const log = engine.getOperations()
    const layerNames: string[] = []
    const restoredLayerIds: string[] = []

    for (const [deadLayerId, ops] of groupLostOpsByLayer(collected)) {
      const originalName = resolveDeletedLayerName(deadLayerId, liveLayerState, log, restoredLayerStateRef.current)
        ?? t('room.lostWork.unnamedLayer')
      const newLayerId = nanoid(10)
      // Same optimistic path dispatchOp takes for local-island work: a
      // brand-new layer and strokes onto it can't conflict with anything,
      // since nobody else has heard of the id yet.
      engine.appendOperation({
        id: nanoid(10), type: 'layer_add', userId, timestamp: Date.now(),
        layerId: newLayerId, name: t('room.lostWork.restoredLayerName', { name: originalName }),
      })
      for (const op of ops) engine.appendOperation(retargetToLayer(op, newLayerId, nanoid(10), Date.now()))
      layerNames.push(originalName)
      restoredLayerIds.push(newLayerId)
    }

    syncFromLog()
    setLostWork({ layerNames, restoredLayerIds })
  }, [syncFromLog, t])

  useEffect(() => {
    recoverLostWorkRef.current = recoverLostWork
  }, [recoverLostWork])

  // (#313) Surfaces a previous page load's unconfirmed work immediately,
  // without waiting for a join that may never come on this visit — the
  // offline screen's whole job is to report that number at exactly the
  // moment nothing can be sent.
  //
  // (#358) Also where the *previous* room's queue is retired. Room is one
  // component for every `/room/:id` (no `key` on the route), so an in-place id
  // change — taking a copy of a closed room, opening a fork — swaps `outbox`
  // without unmounting anything, and the instance left behind kept its retry
  // timers, its unsent entries, and a `send` closing over the shared socket
  // ref that has since joined the new room. Its next retry then landed in that
  // room, because an operation carries no room of its own and the server
  // records whatever arrives against the socket's current one.
  //
  // Retired by comparing instances rather than from this effect's cleanup:
  // StrictMode runs mount → cleanup → mount while `useMemo` keeps handing back
  // the same Outbox, so a disposing cleanup would leave the live queue dead in
  // development and nowhere else. Comparing means a simulated remount sees two
  // identical refs and does nothing.
  const previousOutbox = useRef(outbox)
  useEffect(() => {
    if (previousOutbox.current !== outbox) {
      previousOutbox.current.dispose()
      previousOutbox.current = outbox
    }
    void outbox.hydrate()
  }, [outbox])

  // (#313) A disconnected socket alone isn't enough to give up on loading —
  // socket.io reconnects on its own, and a slow network looks identical for
  // the first moments. Only after this grace period does a still-absent
  // connection get reported as offline rather than as "still loading".
  const [offlineGraceElapsed, setOfflineGraceElapsed] = useState(false)
  useEffect(() => {
    if (connected) { setOfflineGraceElapsed(false); return }
    const id = window.setTimeout(() => setOfflineGraceElapsed(true), OFFLINE_OVERLAY_GRACE_MS)
    return () => window.clearTimeout(id)
  }, [connected])
  // Deliberately gated on `roomContentReady`, not on `connected` alone: a
  // mid-session reconnect blip also flips roomContentReady false (see
  // handleRoomState), and covering a room the user has already loaded — and
  // can still pan and zoom — with "no connection" would be a lie about what
  // they're looking at. This is only for a room that never opened.
  const showOfflineOverlay = !roomContentReady && !connected && offlineGraceElapsed
  // (#346) Offline wins the tie. With no socket the paper fetch fails too, so
  // both are true at once — and "no connection" is the diagnosis that explains
  // the other one, while a retry button that cannot possibly succeed is just
  // an invitation to press it.
  const showPaperFailedOverlay = !roomContentReady && paperFailed && !showOfflineOverlay
  // (#533) Behind both of those. Offline explains itself and a retry cannot
  // work without a socket; a missing paper texture is the more total failure of
  // the two, since without it the engine would refuse to draw even on a room
  // that did restore.
  const showRestoreFailedOverlay =
    !roomContentReady && restoreFailure !== null && !showOfflineOverlay && !showPaperFailedOverlay

  /** (#533) Ask for the room's content again.
   *
   *  The same full resync the paper retry ends with, and for the same reason:
   *  the `room_state` that would have restored this room was consumed by the
   *  attempt that failed, so there is nothing left to re-run locally — the
   *  server has to be asked again. Clearing the flag first is what puts the
   *  loading overlay back up; if this attempt fails the same way, the catch-up
   *  sets it again and this screen returns. */
  const retryRestore = useCallback(() => {
    setRestoreFailure(null)
    requestFullResyncRef.current?.()
  }, [])

  /** (#346) Load the paper texture again, without reloading the page — which
   *  for a room is never a neutral act: it throws away whatever the reload
   *  catches mid-flight, and #313 cares enough about that to put a
   *  beforeunload prompt in the way.
   *
   *  The retry is two steps because the failure cost two things. The texture
   *  comes back via the engine (the byte and manifest caches evict rejections
   *  rather than memoize them — see paperLoader — so this genuinely re-fetches).
   *  The room's *content* has to be asked for again separately: the room_state
   *  that would have restored it was consumed by the attempt that failed, so
   *  this re-runs the same full catch-up a seq gap does, and the ordinary
   *  handleRoomState path takes it from there. */
  const retryPaper = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    setPaperRetrying(true)
    paperReportedRef.current = false
    try {
      await engine.retryPaper()
      setPaperFailed(false)
      requestFullResyncRef.current?.()
    } catch (err) {
      // Stays on this screen with the button live again — a second attempt is
      // exactly as reasonable as the first was, and there is nothing else to
      // offer that reloading would not do worse.
      console.error('paper texture retry failed', err)
      // (#464) Reported here rather than left to awaitPaper: a rejected retry
      // never reaches a replay site, so this branch is the only one that knows
      // the user asked again and got the same answer.
      if (!paperReportedRef.current) {
        paperReportedRef.current = true
        Sentry.captureException(err)
      }
    } finally {
      setPaperRetrying(false)
    }
  }, [])

  // The unload half of "confirm before leaving a room": closing the tab or
  // reloading can't be intercepted by the app's own dialog (see leaveRoom),
  // only by the browser's, so this is what covers those paths. Armed for the
  // whole life of the room rather than only when work is unsent — the two
  // reasons to ask are different in weight but the prompt is the same one:
  //
  //  - ordinary case: an accidental close mid-lesson drops the user out of a
  //    live session, and the way back in is a room link they may not have.
  //  - (#313) unconfirmed work lives in IndexedDB and survives a reload, but
  //    it only leaves this device if the tab eventually gets back online.
  //    Closing it while the queue is full turns a recoverable situation into a
  //    permanent loss — and it's usually done by someone who has already
  //    concluded the work is gone.
  //
  // Same `config` gate as the back guard below: at the join gate there is no
  // session and nothing unsent, so a prompt would be pure friction.
  //
  // (#400) The same gate now also states the fact out loud, via holdReload():
  // "a reload right now would cost something". The service worker updater
  // reads it to decide whether a new build may be applied without asking, and
  // it has to be the *same* condition — a second one derived from the route
  // would be a copy free to drift from this one. Note that the hold is the
  // half that actually protects a room from an automatic reload: a
  // programmatic reload carries no user activation, and browsers do not raise
  // the beforeunload dialog for those at all.
  useEffect(() => {
    if (!config) return
    const releaseHold = holdReload()
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Browsers ignore custom text here and show their own wording; the
      // preventDefault is what actually triggers the prompt.
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      releaseHold()
    }
  }, [config])

  // Any pending batch dies with the room — a timer firing after unmount would
  // append to an engine that no longer exists.
  useEffect(() => () => {
    if (lostWorkTimerRef.current !== null) window.clearTimeout(lostWorkTimerRef.current)
  }, [])

  // Applies an operation that arrived from the network (room_state replay or
  // operation_confirmed) exactly once. The guard isn't full reconnect/catch-up
  // logic (#74) — it's a minimal idempotency net: since a reconnect re-runs
  // join_room and gets the *entire* history back in a fresh room_state,
  // without this guard every op already applied before the drop would be
  // appended to the engine's log a second time (OperationLog.append() does
  // not dedupe by id — see engine/src/OperationLog.ts), corrupting pixel
  // state and undo. It does not attempt to reconcile a divergent history.
  const applyRemoteOp = useCallback((op: Operation) => {
    if (appliedOpIdsRef.current.has(op.id)) return
    appliedOpIdsRef.current.add(op.id)
    engineRef.current?.appendOperation(op, 'remote')
    if (op.type === 'stroke') markActive(op.userId)
    // (#395) The layer now genuinely carries this transform, so the gizmo
    // preview that has been standing in for it since pointerup can go. This
    // is the only place that can know it: on the confirmation-gated dispatch
    // path the author's own layer_transform comes back through here like any
    // peer's (see dispatchOp's outbox branch and #289 §7/§11).
    resolveTransformCommit(op.id)
  }, [markActive, resolveTransformCommit])

  // (#169) Re-checks every deferred meta-op (see deferredOpsQueueRef's own
  // doc comment) after a backfill page lands — anything whose target has
  // since become known gets applied now, in the order it originally arrived.
  const drainDeferredQueue = useCallback(() => {
    const queue = deferredOpsQueueRef.current
    if (!queue.length) return
    const stillDeferred: Operation[] = []
    let appliedAny = false
    for (const op of queue) {
      const targetId = 'targetOpId' in op ? op.targetOpId : undefined
      if (targetId !== undefined && appliedOpIdsRef.current.has(targetId)) {
        applyRemoteOp(op)
        appliedAny = true
      } else {
        stillDeferred.push(op)
      }
    }
    deferredOpsQueueRef.current = stillDeferred
    if (appliedAny) {
      syncFromLog()
      checkSnapshotBoundary()
    }
  }, [applyRemoteOp, syncFromLog, checkSnapshotBoundary])

  // (#169) Creates the engine's layer buffers from a restored snapshot's own
  // layerState — the same initLayer calls the mount-engine effect already
  // makes from the store below, just driven by the snapshot instead of
  // store state (which a fresh joiner doesn't have yet). Deliberately
  // just buffer creation, no setActiveLayer/setCompositeOrder here — see
  // restoreFromSnapshot's own comment for why those must come *after* pixel
  // restoration, not before.
  // (#486) setBaseLayers, not a loop of initLayer: the restored structure has
  // to be able to *retire* a layer this mount already init'd, not only add to
  // it. See the engine method's own doc comment for the room that fixing this
  // gets back.
  const initLayersFromLayerState = useCallback((engine: PencilEngineAPI, ls: LayerState) => {
    engine.setBaseLayers(
      Object.values(ls.items).filter(item => item.kind === 'layer').map(item => item.id),
    )
  }, [])

  // (#169 bug fix) Injects a downloaded snapshot's pixels + structure into
  // `engine` and sets restoredLayerStateRef so syncFromLog starts deriving
  // LayerState from it. Awaited by the caller before applying tailOperations
  // on top — unlike backfillHistory below, this must finish first (the tail
  // paints relative to this restored buffer state).
  //
  // setActiveLayer/setCompositeOrder must run *after* every
  // restoreLayerFromSnapshot call, not before: setCompositeOrder
  // unconditionally invalidates and repaints the engine's below/above
  // split-composite cache (#122) right when it's called — calling it while
  // layers are still freshly initLayer'd (i.e. empty) bakes that emptiness
  // into the cache for every layer except whichever one is active, and
  // nothing afterward invalidates it again just because pixels got injected
  // later. The result: any non-active layer's restored content is silently
  // missing from the composite until some *later*, unrelated event forces
  // another invalidation (a stroke on yet another layer, or an undo/redo,
  // whose own history-replay path always invalidates unconditionally) —
  // exactly the "part of the drawing disappeared after reload, drawing
  // something and hitting undo brought it back" report (#121).
  //
  // (#374) Each layer carries its own `coveredSeq`, handed to the engine so it
  // can tell which of the operations arriving next are already in these
  // pixels. A layer in `layerState` with no entry here simply has nothing
  // stored — it stays empty and is rebuilt from the operations the server
  // sends precisely because it is uncovered. Treating that as an empty layer
  // instead is what lost drawing in #369.
  /** Restores this room from its stored snapshot, reporting whether there was
   *  one to restore. Returns false for "nothing baked yet" and for a failed
   *  fetch alike — the caller falls back to replaying operations either way.
   *
   *  (#467) The layers arrive one at a time through a sink instead of as a map
   *  handed over whole, and the engine call inside `applyLayer` is what makes
   *  that worth doing: it copies each layer's pixels into GL and keeps no
   *  reference, so the decoded buffer dies with the iteration that made it.
   *  Room F4uw21Ob measured 431 MiB of inflated pixels across ten layers —
   *  held at once, that killed the tab on iPadOS.
   *
   *  (#533) Returns the outcome's own status rather than a boolean, because the
   *  two ways of not restoring are opposites and the callers have to tell them
   *  apart: `none` is a room nobody ever baked, whose whole history the server
   *  is therefore sending as operations, and `failed` is a room whose history
   *  was withheld in favour of pixels that then did not arrive. The boolean
   *  collapsed them, and the second one used to open a blank room. */
  const restoreFromSnapshot = useCallback(async (
    engine: PencilEngineAPI, roomId: string,
  ): Promise<SnapshotRestoreOutcome['status']> => {
    const outcome = await restoreLatestSnapshot(roomId, {
      beginLayers: layerState => initLayersFromLayerState(engine, layerState),
      applyLayer: (layerId, tiles, coveredSeq) => engine.restoreLayerFromSnapshot(layerId, tiles, coveredSeq),
    })
    // (#474) Drained here and nowhere else, on every path including failure:
    // the audit is what the engine saw, and leaving it behind on a failed
    // restore would hand those records to the *next* one. This is also the
    // only moment both accounts of the restore exist at once — the plan the
    // network described and the tiles the engine ended up holding.
    // Wrapped because this sits on the join path: reporting must never be able
    // to break the restore it is describing. A driver that answers getParameter
    // oddly, or a Sentry transport that throws, would otherwise cost the lesson
    // — the exact failure this code exists to catch, caused by the catching.
    try {
      reportSnapshotRestore(roomId, outcome, engine.takeSnapshotRestoreAudit(), engine.gpuInfo())
    } catch { /* a report we couldn't build is not worth a room we can't open */ }
    if (outcome.status !== 'restored') return outcome.status
    const { head } = outcome
    engine.setActiveLayer(head.layerState.activeId)
    engine.setCompositeOrder(computeCompositeOrder(head.layerState))
    restoredLayerStateRef.current = head.layerState
    return 'restored'
  }, [initLayersFromLayerState])

  /** (#487) Гасит будильник и отчитывается о завершившемся входе.
   *
   *  Число слоёв и `gpuInfo()` берутся здесь, а не на старте: на старте их
   *  ещё нет, а объясняют они ровно то, из-за чего вход бывает долгим — все
   *  слои поднимаются разом (#467), и упирается это в GPU устройства (#469). */
  // (#176) Both timers read the URL id through a ref rather than closing over
  // it. They are dependencies of the engine effect, and handleRoomState
  // rewrites the URL (a board id becomes its lesson's) in the same breath as
  // it seats the engine on the board — a callback keyed on `id` rebuilt the
  // engine right after its first mount had consumed the board's content, and
  // the second engine opened empty. The report is per open, not per URL, so
  // whatever the id is at finish time is the right one to file it under.
  const urlIdRef = useRef(id)
  urlIdRef.current = id
  const finishOpenTimer = useCallback((engine: PencilEngineAPI | null) => {
    const timer = openTimerRef.current
    if (!timer || timer.done) return
    if (openAlarmRef.current !== null) { clearTimeout(openAlarmRef.current); openAlarmRef.current = null }
    if (engine) timer.note({ layers: engine.liveLayerIds().length })
    const reportId = urlIdRef.current
    if (reportId) reportRoomOpen(reportId, timer.finish(), engine?.gpuInfo())
  }, [])

  /** (#487) Пускает замер входа и заводит будильник. Вызывается там, где
   *  человек нажал «войти», а не там, где сокет что-то отправил: меряем то,
   *  что он ждёт, а не то, что делает клиент. */
  const startOpenTimer = useCallback(() => {
    if (openAlarmRef.current !== null) clearTimeout(openAlarmRef.current)
    const timer = createOpenTimer(() => performance.now())
    openTimerRef.current = timer
    openAlarmRef.current = setTimeout(() => {
      openAlarmRef.current = null
      // Не гасит замер: вход продолжается, и если он всё-таки дойдёт до конца,
      // финиш об этом скажет. Дедуп по комнате в reportOpen следит, чтобы из
      // двух отчётов об одном входе уехал только первый.
      const reportId = urlIdRef.current
      if (!timer.done && reportId) reportRoomOpen(reportId, timer.stalled(), engineRef.current?.gpuInfo())
    }, SLOW_OPEN_MS)
  }, [])

  // (#169) Walks the room's history backward from `fromSeq` (the restored
  // snapshot's own seq) in pages, merging each into the engine's log purely
  // for undo/redo purposes (see absorbHistoricalOperations's own doc
  // comment — never paints). Deliberately fire-and-forget from every caller:
  // this runs fully in the background, must not block first paint, and its
  // own best-effort failure handling (fetchHistoryPage swallows errors,
  // returning []) means it simply stops rather than throwing.
  //
  // (#291) Bounded to HISTORY_BACKFILL_DEPTH, not the room's whole history.
  // This used to walk all the way to seq 0, which stayed cheap only because
  // `pruneOperationsBeforeSnapshot` deleted pre-snapshot operations once a
  // room went idle — there was simply nothing old left to fetch. #289
  // disabled that prune (a snapshot can't authorize deleting its own
  // evidence until it's independently verified), and the unbounded walk
  // immediately became the dominant cost of opening any long room:
  // production room nHImlawW served 66 MB of stroke JSON in a single
  // response, 22 s on the wire, and hard-froze the renderer while parsing —
  // a tablet just OOMs instead.
  //
  // The depth matches the agreed undo rule (spec v0.2 §7): an operation
  // older than roughly the last two snapshots is permanently out of undo
  // reach, so backfilling past that point buys nothing anyone can use. This
  // bound holds regardless of whether pruning is ever re-enabled.
  const backfillHistory = useCallback(async (roomId: string, engine: PencilEngineAPI, fromSeq: number) => {
    await walkHistoryBackward(roomId, fromSeq, HISTORY_BACKFILL_DEPTH, page => {
      engine.absorbHistoricalOperations(page)
      for (const op of page) appliedOpIdsRef.current.add(op.id)
      drainDeferredQueue()
    })
  }, [drainDeferredQueue])

  // (#461) The three room fields the engine is actually built from, pulled out
  // as scalars so that they — and nothing else about the room — are what can
  // cost a WebGL context. The mount effect below used to depend on `config`
  // itself, and `room` is patched in place by a growing list of actions that
  // each write a *new* object (setRoomName, setRoomClosedAt,
  // setRoomAccessMode): to that effect a new object reads as "the room
  // changed", so it tore the engine down and built a fresh one — empty, because
  // nothing re-restores content on a remount (the first room_state consumed
  // pendingSnapshotRef long ago), taking the operation log and all of undo with
  // it. Renaming from the header (#216) wiped the canvas outright; closing the
  // room mid-lesson (#222) and switching access mode (#460) stood on the same
  // mine. handleRoomState already dodges it by hand — setRoomInfo only on the
  // first room_state, see firstRoomStateReceivedRef — and this removes the mine
  // rather than adding a third dodge. Paper, paper color and infinite-ness are
  // the ones that genuinely cannot change without a rebuild, and nothing in the
  // app changes them mid-session: they are picked once, on the create form.
  //
  // `undefined` here means only "no room known yet" (`config` is null until the
  // join lands), which is why the effects below can gate on the paper alone
  // instead of on `config` — referencing the object at all is what would put it
  // back in their dependency lists.
  const enginePaper = config?.paper
  // (#493) The sound's whole lifetime, out of line — see usePencilSound.
  const pencilSoundRef = usePencilSound(enginePaper)
  const enginePaperColor = config?.paperColor
  const engineInfinite = config?.infinite ?? false
  // (#470) Captured alongside the other engine options rather than read off
  // `config` inside the effect: the effect's deps are these primitives, and
  // reaching through a possibly-null config there is what the narrowing above
  // exists to avoid.
  const enginePageW = config?.width
  const enginePageH = config?.height

  // (#345) Remember this room's paper so the *next* launch can start
  // downloading the right ~4 MB texture before anything is opened (see
  // App's usePaperPrefetch). Recorded on every room, not just the first: the
  // useful guess is the paper the person actually works on, and a teacher who
  // always uses one grain should never pay for the texture twice.
  useEffect(() => {
    if (enginePaper) useSettingsStore.getState().setLastPaperType(enginePaper)
  }, [enginePaper])

  // (#176) `navigate` changes identity with the location, and the socket
  // effect — which replaces a board id in the URL with its lesson's — must not
  // be rebuilt by the very navigation it performs.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const fitCanvasRef = useRef(fitCanvas)
  fitCanvasRef.current = fitCanvas

  /** (#176, ADR 014 §4) Takes this client onto `board`: everything that
   *  described the previous board's content is put back to zero, the board's
   *  own `room_state` is stashed for the engine that is about to be built,
   *  and `boardId` is moved — which is what tears the old engine down (its
   *  cleanup bakes that board's thumbnail) and mounts a fresh one that
   *  replays the stash, exactly the path a joiner's first `room_state` has
   *  always taken.
   *
   *  Runs for every way of arriving on a board: the first entry, a page turn
   *  this client asked for, the teacher's move when following, the server
   *  moving us off a deleted board, and a navigation into another lesson.
   *
   *  What is *not* reset here, on purpose: `replayIncompleteRef` and
   *  `snapshotGateRef` are per engine mount and are reset at the top of the
   *  mount effect instead — the outgoing engine's cleanup reads the first to
   *  decide whether its canvas may be published as the board's preview, and
   *  React runs that cleanup before the next mount's body. */
  const enterBoard = useCallback((board: string, stash: NonNullable<typeof pendingSnapshotRef.current>) => {
    appliedOpIdsRef.current = new Set()
    layerAppliedSeqRef.current = new Map()
    pendingIdsRef.current = new Set()
    lastConfirmedSeqRef.current = 0
    latestKnownSeqRef.current = 0
    catchingUpRef.current = false
    deferredOpsQueueRef.current = []
    resetDrawingActivity()
    pendingPreviewsRef.current = createPendingPreviews()
    streamedStrokeIdsRef.current = new Set()
    restoredLayerStateRef.current = null
    lostContentOpsRef.current = []
    if (lostWorkTimerRef.current !== null) { window.clearTimeout(lostWorkTimerRef.current); lostWorkTimerRef.current = null }
    lostWorkFirstAtRef.current = null
    setLostWork(null)
    setRestoreFailure(null)
    // Blocked until the new engine's replay says otherwise — the same gate a
    // first join sits behind (see roomContentReady's own doc comment).
    setRoomContentReady(false)
    resetBoardState()
    // A new page is looked at whole, the way a sketchbook page is. The
    // camera itself survives resetBoardState (see SURVIVES_PAGE_TURN) so a
    // *reconnect* to the same board keeps the person's zoom; this is the one
    // moment the page genuinely changes under them.
    fitCanvasRef.current()
    pendingSnapshotRef.current = stash
    wantedBoardRef.current = null
    socketBoardRef.current = board
    useRoomStore.getState().setBoardId(board)
  // (#493) Stable: a `useCallback` with no dependencies inside useDrawingActivity,
  // so naming it keeps this callback exactly as stable as it was with the
  // bare state setter it replaces.
  }, [resetDrawingActivity])

  // ── mount engine ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // (#176) No board, no engine: a joiner has nothing to build for until the
    // first `room_state` says which board they are on.
    if (enginePaper === undefined || boardId === null || !canvasRef.current) return
    // Per mount, not per board — see enterBoard's doc comment on why these two
    // are reset here rather than there.
    replayIncompleteRef.current = false
    snapshotGateRef.current = createSnapshotGate(reportInvariant)
    const engine = new PencilEngine(canvasRef.current, {
      infinite: engineInfinite,
      // (#470) The sheet, in world units. The canvas is the viewport now, so
      // the engine can no longer read this off it the way it used to.
      pageWidth: engineInfinite ? undefined : enginePageW,
      pageHeight: engineInfinite ? undefined : enginePageH,
      paper: enginePaper,
      paperColor: enginePaperColor ? hexToRgb(enginePaperColor) : undefined,
      pencilType: initialToolRef.current.pencil,
      size: initialToolRef.current.size,
      opacity: initialToolRef.current.opacity,
      userId: useRoomStore.getState().userId,
      // Broadcast-loop fix (#84): only genuinely local appends (layer-panel
      // ops via dispatchOp, and the stroke this engine records internally on
      // pointer up) reach this callback — see PencilEngineOptions.onLocalOperation.
      // Remote ops are applied via appendOperation(op, 'remote') below, which
      // skips it, so they're never echoed back to the server.
      //
      // (#289 §7/§11) `operation_confirmed` now reaches the author too (see
      // handleOperationConfirmed below) — mark this id as already-applied
      // *before* it's even sent, so that later arrival doesn't repaint it a
      // second time.
      //
      // (#289 §9) Sending goes through the Outbox rather than a bare emit:
      // persisted first, retried with backoff, replayed on reconnect. Its
      // `onSettled` (see the Outbox construction above) owns everything the
      // old inline ack callback did — watermark, pendingIds, noteLayerSeq.
      onLocalOperation: op => {
        appliedOpIdsRef.current.add(op.id)
        // (#289 §2/§4) A fresh layer/folder is a "local island" member from
        // the instant it's created — nobody else could possibly reference
        // it yet — until its own SendResult settles one way or the other.
        if (op.type === 'layer_add' || op.type === 'folder_add') pendingIdsRef.current.add(op.layerId)
        void outbox.enqueue(op)
        if (op.type === 'stroke') markActive(useRoomStore.getState().userId)
      },
      // A peer's stroke reveal (#37 follow-up v2) has finished playing back —
      // commit it for real now, matching what's already visible on screen.
      // (#480) Движку некому докладывать самому — см. PencilEngineOptions.onInvariant.
      onInvariant: reportInvariant,
      onPreviewApplied: op => {
        pendingPreviewsRef.current.remove(op.id)
        applyRemoteOp(op)
        syncFromLog()
        checkSnapshotBoundary()
      },
      // (#429) Sending half of the live stroke channel. A bare emit, not the
      // Outbox: these are not operations and there is nothing to persist,
      // retry or reconcile — the gesture's real record goes through
      // onLocalOperation above, and a packet that misses its moment is worth
      // nothing later. `editingBlocked` is checked for the same reason
      // dispatchOp checks it: with the room frozen or closed the operation
      // will be refused, and streaming ink that is going to be refused is
      // exactly the "drawing into the void" this codebase already decided
      // against — the server rejects these too, but not sending beats
      // sending and being dropped.
      onLiveStrokeDabs: packet => {
        if (editingBlockedRef.current) return
        socketRef.current?.emit('stroke_live', {
          strokeId: packet.strokeId, layerId: packet.layerId, tool: packet.tool,
          preset: packet.preset, color: packet.color, packetSeq: packet.packetSeq,
          dabsPacked: packDabs(packet.dabs),
          // (#468) Watercolor only. Without it a peer groups this gesture by
          // its stroke id alone and paints a wash the author never made — see
          // StrokeLiveData.washId.
          ...(packet.washId ? { washId: packet.washId } : {}),
        })
      },
      onLiveStrokeEnd: strokeId => {
        if (editingBlockedRef.current) return
        socketRef.current?.emit('stroke_live_end', { strokeId })
      },
      debug: debugEnabled,
      onStrokeDebugStats: debugEnabled ? stats => {
        setStrokeStats(stats)
      } : undefined,
      predictPointer: predictEnabled,
      hapticGrain: hapticGrainEnabled,
      onHapticGrainStats: hapticGrainEnabled ? setHapticStats : undefined,
      grainMode,
      charcoalGrainMode,
    })
    engineRef.current = engine
    exposeEngineForDev(engine)
    // Tells every engine-sync effect below that there is now an engine to sync
    // to — see engineEpoch's own comment for what silently did not happen
    // before this existed.
    setEngineEpoch(n => n + 1)
    // (#475) The pen calibration this device already has, handed over at
    // birth. The effect that pushes later changes (further down, next to the
    // tilt response) only runs when the *setting* changes, so without this a
    // freshly built engine — this effect re-runs on a paper change, and on
    // every room mount — would draw uncalibrated until the person happened to
    // touch the setting again. Read straight off the store rather than through
    // a dependency, because a calibration in this list would tear the WebGL
    // context down and rebuild it every time the curve is dragged.
    engine.setPressureCalibration(useSettingsStore.getState().pressureCalibration)

    // (#493) What happens around this person's own strokes, and the layer
    // structure the store already holds — see engineWiring.
    wireLocalStrokeEvents(engine, { strokeActiveRef, markActive, pencilSoundRef })
    initLayersFromStore(engine)

    // Joiner path: the room_state that told us `config` (see the socket-wiring
    // effect) arrived before the engine existed to apply its operations to —
    // replay it now that it does. No-op for the creator, and for a joiner's
    // reconnect (appliedOpIdsRef already dedupes across a fresh room_state
    // reaching an already-mounted engine, but this path is specifically the
    // one-time first mount).
    const pending = pendingSnapshotRef.current
    if (pending) {
      pendingSnapshotRef.current = null
      // Awaits engine.paperReady() first (see its own doc comment): a
      // stroke replayed before the real paper texture has loaded would
      // permanently bake in the placeholder's flat response, with nothing
      // later to re-paint it once the real texture arrives. Wrapped in an
      // async IIFE rather than making this whole effect async — the effect
      // still needs to register handlers/cleanup synchronously below,
      // unaffected by this deferred branch.
      void (async () => {
        // (#487) Фазы входа. Отмечаются по факту перехода, вплотную к тому
        // await'у, который их и стоит — иначе они меряют не то, что называют.
        openTimerRef.current?.stage('paper')
        openTimerRef.current?.note({
          tailOperations: pending.tailOperations.length,
          latestSeq: latestKnownSeqRef.current,
          snapshotSeq: pending.latestSnapshotSeq,
        })
        // (#346) A failure here abandons the replay rather than running it
        // against the placeholder: awaitPaper puts up the retry screen, and
        // roomContentReady stays false so the room is not claimed to be open.
        if (!(await awaitPaper(engine))) return
        // (#493) The restore itself is shared with handleRoomState — see
        // restoreRoomState for the whole of it and why there is one.
        await restoreRoomState(engine, pending, { mode: 'join', alreadyHadSeq: 0 }, {
          boardId,
          restoreFromSnapshot, backfillHistory, applyRemoteOp, syncFromLogNow, markJoinRestoreDone,
          dispatchParticipants, setRestoreFailure, setRoomContentReady, finishOpenTimer,
          notifyReplayIncomplete: () => notifyError(tRef.current('room.replayIncomplete'), {
            key: 'replay-incomplete', durationMs: null,
          }),
          getSnapshotUploader: () => snapshotUploader,
          latestKnownSeqRef, replayIncompleteRef, pendingPreviewsRef, openTimerRef,
        })
      })()
    } else if (!isCreator) {
      // Nothing to restore on this particular mount (e.g. a remount after
      // the first join already completed) — don't leave a stale `false`
      // from a prior mount stuck forever with nothing left to flip it.
      // Creator excluded: `pending` is always null for a creator's very
      // first mount too (its config is known synchronously, so
      // handleRoomState never has a reason to populate pendingSnapshotRef
      // the way a joiner's does — see its own doc comment), but at this
      // point nothing has confirmed yet whether this is a genuinely new
      // room or the creator's own reload of one with real content to
      // restore. Marking ready here regardless used to race ahead of that
      // answer; handleRoomState's first room_state is what actually knows,
      // and sets this itself either way (see its own two branches).
      //
      // Still gated on paperReady() even though there is nothing to replay:
      // "ready" is what takes the preloader down and lets the pencil through,
      // and the engine refuses to start a stroke until the real texture has
      // loaded (see _paperTexLoaded). Marking ready before then hands over a
      // room that looks open and silently ignores every stroke.
      void (async () => {
        openTimerRef.current?.stage('paper')
        if (await awaitPaper(engine)) { setRoomContentReady(true); finishOpenTimer(engine) }
      })()
    }

    return () => {
      engineRef.current = null
      // (#493) Final thumbnail, then destroy — see retireEngine. `engine` is
      // this closure's local, not engineRef.current, which is already null.
      retireEngine(engine, boardId, replayIncompleteRef)
    }
  }, [
    boardId, enginePaper, enginePaperColor, engineInfinite,
    markActive, applyRemoteOp, syncFromLog, syncFromLogNow, debugEnabled, predictEnabled,
    hapticGrainEnabled, checkSnapshotBoundary, markJoinRestoreDone, restoreFromSnapshot, backfillHistory,
    finishOpenTimer,
    grainMode, charcoalGrainMode, dispatchParticipants, isCreator, snapshotUploader, noteLayerSeq, outbox,
    awaitPaper,
    // (#493) The ref *object* — stable for the component's life, so naming it
    // costs nothing. Never `.current`: that would rebuild the engine every
    // time the sound instance changed.
    pencilSoundRef,
  ])

  // ── sync tool → engine ────────────────────────────────────────────────────────
  const pencilGrade = toolSettings.pencil.grade as PencilGradeName
  const linerSize = toolSettings.liner.size as string
  const markerNib = toolSettings.marker.nib as string
  const markerSize = toolSettings.marker.size as number
  const charcoalType = toolSettings.charcoal.type as string
  // #501 — the stick's own preset slot carries which nib it is cut to, after
  // the type it is made of (`willow:chisel`). Same trick the marker plays with
  // `${nib}:${size}` and watercolor with its five fields, for the reason given
  // just below: a slot that already exists costs no bytes per operation.
  const charcoalNib = toolSettings.charcoal.nib as string
  const charcoalPreset = charcoalPresetString(
    isCharcoalType(charcoalType) ? charcoalType : DEFAULT_CHARCOAL_TYPE,
    isCharcoalNib(charcoalNib) ? charcoalNib : undefined,
  )
  // #454: the brush pen's preset slot carries its pressure response, since the
  // tool has no nib list or size ladder to spend that slot on — see
  // brushPenPresets.ts's brushPenResponseFromPreset on why the setting rides
  // the existing per-stroke string rather than a new Operation field.
  const brushPenResponse = toolSettings.brushPen.pressureResponse as string
  // #547, ADR 013 §7 — the brush's id *and* its version, assembled here rather
  // than stored: the settings layer remembers which brush is selected and has no
  // business knowing about versions, while the recorded stroke must carry the
  // one it was actually drawn with so a later retune of that brush cannot
  // repaint it. digitalBrushFromPreset resolves a bare id for exactly this
  // hand-off.
  const digitalBrushId = toolSettings.digitalBrush.brush as string
  // #547, #573 — the two pressure switches ride the same token as modifiers.
  // They change the mark, so they have to be recorded: a peer replaying the
  // stroke has their own switches in whatever position they left them.
  const digitalBrushSizeFromPressure = toolSettings.digitalBrush.sizeFromPressure as boolean
  const digitalBrushOpacityFromPressure = toolSettings.digitalBrush.opacityFromPressure as boolean
  const digitalBrushPresetName = (() => {
    const brush = digitalBrushFromPreset(digitalBrushId)
    return digitalBrushPreset(brush.id, brush.version, {
      size: digitalBrushSizeFromPressure, opacity: digitalBrushOpacityFromPressure,
    })
  })()
  // #468 v4 — the whole watercolor mix rides the one preset slot as
  // `response:water:pigment` (watercolorPresetString). Same trick the marker
  // plays with `${nib}:${size}`, and for the same reason: #366 exists to shrink
  // operation payloads, so a new Operation field is paid for by every operation
  // in every room forever, while a slot that already exists is free.
  const watercolorResponse = toolSettings.watercolor.pressureResponse as string
  const watercolorWater = toolSettings.watercolor.water as number
  const watercolorPigment = toolSettings.watercolor.pigment as number
  // #468 v5 — which paint, on top of how much of it. Rides the same string as
  // a fourth field; a stroke recorded before v5 has no code and falls back.
  const watercolorPaint = toolSettings.watercolor.pigmentCode as string
  // #489 — and which brush, as a fifth field. Absent from every stroke recorded
  // before it, which is why they replay as the round nib they were drawn with.
  const watercolorNib = toolSettings.watercolor.nib as string
  const watercolorPreset = watercolorPresetString(
    isPressureResponse(watercolorResponse) ? watercolorResponse : 'normal',
    { water: watercolorWater, pigment: watercolorPigment },
    isWatercolorPigmentCode(watercolorPaint) ? watercolorPaint : undefined,
    isWatercolorNib(watercolorNib) ? watercolorNib : undefined,
  )
  // #468 v5 — picking a paint sets the tool's colour to that paint's own. The
  // colour swatch stays editable afterwards: the four behavioural numbers still
  // apply, which is the honest reading of "cobalt, but I want it warmer" — you
  // are still painting with cobalt.
  useEffect(() => {
    if (!isWatercolorPigmentCode(watercolorPaint)) return
    setToolSetting('watercolor', 'color', watercolorPigmentByCode(watercolorPaint).color)
  }, [watercolorPaint, setToolSetting])

  // Same preset string engine.setPencil below records (`${nib}:${size}` for
  // marker, the size label for liner, the charcoal type for charcoal, the
  // grade name otherwise) — only marker's own dispatch (bullet/chisel)
  // actually reads it (shapingForTool -> shapingForMarkerPreset), but
  // BrushCursor takes the same shape every tool's real stroke would, not a
  // marker-only special case.
  const cursorPresetName = drawingTool === 'marker' ? `${markerNib}:${markerSize}`
    : drawingTool === 'liner' ? linerSize
    : drawingTool === 'charcoal' ? charcoalPreset
    : drawingTool === 'brushPen' ? brushPenResponse
    : drawingTool === 'watercolor' ? watercolorPreset
    : drawingTool === 'digitalBrush' ? digitalBrushPresetName
    : pencilGrade
  // #278/#279 → #482, ADR 012 §3. The frame the chisel's angle is measured in
  // is now named and lives on the tool, so the engine resolves it (dabShaping's
  // anchoredAngleShaping) instead of the UI pre-baking it.
  //
  // What this replaced: the angle was always converted to canvas space up here,
  // which for the "stay visually fixed on screen" mode meant continuously
  // subtracting the live `vp.angle` — a per-rotate-frame effect re-pushing a
  // derived number into the engine, to express something the engine could not
  // say. It can now: `screen` is one subtraction inside the shaping function,
  // where the camera angle already is.
  //
  // #489: read off whichever tool is in hand rather than off the marker, now
  // that two tools wear a chisel. Same boundary as the tilt response just
  // below, and the same care about it: a tool with no angle field at all must
  // land on the defaults instead of pushing `undefined` into the engine, so
  // both values go through a guard rather than a cast.
  const nibAngleDeg = typeof toolSettings[drawingTool]?.angle === 'number'
    ? toolSettings[drawingTool].angle as number
    : 45
  const storedAnchor = toolSettings[drawingTool]?.anchor
  const nibAnchor = typeof storedAnchor === 'string' && isNibAnchor(storedAnchor)
    ? storedAnchor
    : DEFAULT_NIB_ANCHOR
  const nibCanvasAngleRadians = (nibAngleDeg * Math.PI) / 180
  useEffect(() => {
    engineRef.current?.setNibAngle(nibCanvasAngleRadians, nibAnchor)
  }, [nibCanvasAngleRadians, nibAnchor, engineEpoch])
  // #409: the tilt-response setting of whichever tool is in hand. The engine
  // holds one active response rather than a table (see setTiltResponse), so the
  // lookup is here — and it goes through `isTiltResponse` rather than a cast:
  // the value is a schema-validated string on the way out of localStorage, but
  // the schemas are what decides which tools even have the field, and a tool
  // without one (liner, marker) must land on the default instead of pushing
  // `undefined` into the engine.
  const tiltResponse = useMemo(() => {
    const stored = toolSettings[drawingTool]?.tiltResponse
    return typeof stored === 'string' && isTiltResponse(stored) ? stored : DEFAULT_TILT_RESPONSE
  }, [toolSettings, drawingTool])
  useEffect(() => { engineRef.current?.setTiltResponse(tiltResponse) }, [tiltResponse, engineEpoch])
  // #475: this device's pen calibration. Unlike the tilt response above it is
  // not per tool and not read from the room's tool settings — it describes the
  // stylus and driver in front of this person, so it lives in settingsStore
  // (per browser) and applies to every tool at once. Re-pushed on change so the
  // settings panel's curve can be dragged and felt without leaving the room.
  const pressureCalibration = useSettingsStore(s => s.pressureCalibration)
  useEffect(() => {
    engineRef.current?.setPressureCalibration(pressureCalibration)
  }, [pressureCalibration])
  useEffect(() => {
    // engine.setPencil's argument is a generic preset-name string
    // (StrokeOperation.preset) — pencil's own grade normally, but the
    // liner's own size label while it's the active tool. _resolvePreset in
    // engine/index.ts ignores this string for 'liner' rendering (liner has
    // one flat preset regardless of size, see LINER_PRESET's own comment),
    // but the recorded Operation should still reflect what was actually
    // selected, not silently keep whatever pencil's grade happened to be.
    // Marker (#252) piggybacks on this same free-form string rather than
    // needing a new Operation field: `_resolvePreset` has no 'marker' branch
    // yet (that's #249-251, the actual dab-shaping/compositing work), so an
    // unrecognized presetName like this just falls back to PENCIL_PRESETS
    // ['HB'] — the intended, explicitly-fine placeholder rendering until
    // then — while nib+size are still faithfully recorded/replicated on the
    // wire via the existing preset string for whenever the engine side is
    // ready to actually read them back out of it.
    // Charcoal's string was the type name alone until #501 ('vine'/'willow'/
    // 'compressed'), because all three types shared one dab geometry (ADR 005
    // §2) — they still do, but the nib no longer does, so the same slot now
    // carries both halves and _resolvePreset reads the type out of field 0.
    const markerPreset = `${markerNib}:${markerSize}`
    engineRef.current?.setPencil(
      drawingTool === 'liner' ? linerSize
        : drawingTool === 'marker' ? markerPreset
        : drawingTool === 'charcoal' ? charcoalPreset
        : drawingTool === 'brushPen' ? brushPenResponse
        : drawingTool === 'watercolor' ? watercolorPreset
        : drawingTool === 'digitalBrush' ? digitalBrushPresetName
        : pencilGrade,
    )
  }, [drawingTool, pencilGrade, linerSize, markerNib, markerSize, charcoalPreset, brushPenResponse, watercolorPreset, digitalBrushPresetName, engineEpoch])
  // (#405) Every line in this block reads `drawingTool` rather than the
  // selection: `setTool` takes a `ToolType`, and the four non-painting tools
  // are deliberately not one (toolSlice). Leaving the engine configured with
  // the last real drawing tool is also what makes switching back to it
  // instant — nothing to re-push, since nothing was ever unset. What actually
  // stops paint while the ruler or the gizmo is selected is `engine.setLocked`
  // (see the layer-state sync effect), one gate rather than a second copy of
  // "which tools can draw" living in here.
  useEffect(() => { engineRef.current?.setTool(drawingTool) }, [drawingTool, engineEpoch])
  // Liner's own 'size' field is a fixed-label enum (ADR 003), not a plain px
  // number like every other tool's (marker included, since it dropped its
  // own ladder for a plain px slider) — see linerSizeToPx's own comment for
  // why the mm→px mapping lives in the UI layer. Hoisted out of the
  // engine-sync effect below (not effect-local) so BrushCursor can read the
  // same physical-px value for its hover preview without recomputing it.
  const sizePx = drawingTool === 'liner' ? linerSizeToPx(activeCfg.size as string)
    : (activeCfg.size as number)
  useEffect(() => {
    engineRef.current?.setSize(sizePx)
    // (#468 v4) Watercolor has no opacity field: its Pigment slider *is* that
    // axis, and a second control for it would be two knobs over one quantity.
    // Falls back to 1 rather than passing undefined through to the engine.
    engineRef.current?.setOpacity((activeCfg.opacity as number | undefined) ?? 1)
  }, [sizePx, activeCfg, engineEpoch])
  // Which tool's own color field the "Color" SidePanel tab, the palette
  // swatches, FloatingToolPanel's color dot and the eyedropper all read and
  // write — lastDrawingTool rather than `tool` directly, so it still reflects
  // liner/marker while eraser/smudge is briefly active on top of it, same
  // reasoning as lastDrawingTool itself (see toolSlice.ts). Typed as
  // ColorCapableTool (toolSchemas.ts), the capability these consumers
  // actually depend on — not re-listing pencil/liner/marker by hand here.
  //
  // (#453) The fill broke the "always a drawing tool" assumption: it owns a
  // colour and is not a DrawingTool, so falling through to `lastDrawingTool`
  // pointed every colour control at the pencil while the bucket was in hand —
  // the picker moved a swatch and the next fill came out the old colour. The
  // question this answers is "whose colour am I editing", so it asks the
  // capability (isColorCapableTool) of the tool actually selected, and only
  // falls back for the tools that own no colour at all.
  // (#529) Choosing a colour also switches that swatch back on.
  //
  // Only the shapes have a swatch to switch on, and this is the whole of what
  // "off" means for them — an explicit absence, not a transparent colour. A
  // person who reaches for the palette with an empty fill selected is asking
  // for a fill; making them press the crossed-out circle again first would be
  // an extra step whose only outcome is the one they already chose (Ilya,
  // 05.09).
  //
  // (#542) Through `effectiveSwatch`, not the stored one: with a line in hand
  // and the fill selected the stored value names a colour the tool cannot draw,
  // and a pick landing there would vanish without a trace.
  const applyToolColor = useCallback((toolId: ColorCapableTool, value: [number, number, number]) => {
    const settings = useRoomStore.getState().toolSettings
    const swatch = effectiveSwatch(settings, toolId, shapeSwatch)
    setToolSetting(toolId, toolColorField(toolId, swatch), value)
    if (isShapeTool(toolId)) setToolSetting(toolId, swatch === 'fill' ? 'fillOn' : 'strokeOn', true)
  }, [setToolSetting, shapeSwatch])

  const colorTool: ColorCapableTool = isColorCapableTool(tool) ? tool : lastDrawingTool
  const colorToolColor = getToolColor(toolSettings, colorTool, effectiveSwatch(toolSettings, colorTool, shapeSwatch))
  // (#405) Where a picked colour lands: the tool the eyedropper hands the
  // canvas back to, if that tool owns a colour at all. The issue asks for the
  // colour to be written "into the tool you returned to" — for the eraser or
  // smudge there is no such field, so it falls through to `colorTool`, the
  // same slot the picker and the palette are already editing, rather than
  // being silently dropped. Deliberately the same expression `activeColor`
  // below feeds the engine, so the swatch that lights up is the colour the
  // next stroke will actually use.
  const pickedColorTool: ColorCapableTool = isColorCapableTool(drawingTool) ? drawingTool : colorTool
  // Which shape the picker takes is a per-person preference, so it comes from
  // settingsStore, not the room store — the latter is wiped on every Room
  // mount (#337).
  const colorPickerMode = useSettingsStore(s => s.colorPickerMode)
  const setColorPickerMode = useSettingsStore(s => s.setColorPickerMode)
  // Falls back to colorTool's color for eraser/smudge, which have no color
  // field of their own — the engine keeps one current color regardless of
  // which tool is active, so it should already hold what the next drawing
  // stroke will use.
  const activeColor = getToolColor(toolSettings, pickedColorTool, effectiveSwatch(toolSettings, pickedColorTool, shapeSwatch))
  useEffect(() => { engineRef.current?.setColor(activeColor) }, [activeColor, engineEpoch])

  // ── the colour well (#542) ──────────────────────────────────────────────────
  //
  // One glyph and one flyout serve every tool, so what the well shows is
  // resolved once — in colorWell.ts, which is also the only part of this
  // reachable from a unit test — instead of being assembled again at each
  // surface that shows a colour.
  //
  // `colorTool` already falls back to the last drawing tool for the eraser and
  // the smudge, so the well is never empty and never disabled: with a rubber in
  // hand it shows — and edits — the colour the next stroke will use. That is
  // the same slot the picker has always been editing in that state; what
  // changes is only that it is now visible instead of one tab away.
  const well = colorWellState(toolSettings, colorTool, shapeSwatch)
  const wellLabel = well.pair
    ? t(well.pair.active === 'fill' ? 'room.shape.fill' : 'room.shape.stroke')
    : t('room.panel.color')

  const swapShapeColors = useCallback(() => {
    // Trades the colours themselves, not which one is selected — the same
    // thing X does in every other editor, and the reason it is a swap rather
    // than two edits is that the pair is what the user is looking at.
    const settings = useRoomStore.getState().toolSettings
    const stroke = getToolColor(settings, 'shape', 'stroke')
    const fill = getToolColor(settings, 'shape', 'fill')
    const strokeOn = settings.shape.strokeOn !== false
    const fillOn = settings.shape.fillOn === true
    setToolSetting('shape', 'strokeColor', fill)
    setToolSetting('shape', 'fillColor', stroke)
    setToolSetting('shape', 'strokeOn', fillOn)
    setToolSetting('shape', 'fillOn', strokeOn)
  }, [setToolSetting])

  const toggleActiveShapeSwatch = useCallback(() => {
    const settings = useRoomStore.getState().toolSettings
    const swatch = effectiveSwatch(settings, 'shape', useRoomStore.getState().shapeSwatch)
    const key = swatch === 'fill' ? 'fillOn' : 'strokeOn'
    setToolSetting('shape', key, settings.shape[key] === false)
  }, [setToolSetting])

  const colorPair: ColorPairControls | undefined = well.pair ? {
    ...well.pair,
    onSelect: setShapeSwatch,
    onSwap: swapShapeColors,
    onToggleActive: toggleActiveShapeSwatch,
  } : undefined
  // FloatingToolPanel (#157) is an eight-slot compass the user lays out
  // themselves: any slot holds a tool, one of the two groups, undo/redo, or
  // nothing.
  //
  // (#544) It used to hold *roles* instead of groups — "the drawing tool you
  // have no button for", "the eraser/smudge/eyedropper you have no button
  // for" — and they are gone. A role could only ever hand back a tool you had
  // already picked somewhere else, which on a tablet in minimal UI, with no
  // rail and no hotkeys, means it could not reach a material you had not
  // touched this session. A group reaches all of them, and does it without a
  // slot whose meaning changes under you. `recentSecondaryTools` and
  // `lastSecondaryTool` left the store with the secondary role: it was the
  // only thing that ever read them.
  //
  // (#544) The three things the rail's one drawing button needs.
  //
  // `drawingGroupTool` is what the button wears and what a plain tap takes.
  // It follows `lastDrawingTool` — the last *material* in hand, which the
  // store already maintains and which every route to a material updates, the
  // hotkeys and the floating panel included — so the rail cannot disagree with
  // the hand. The fallback covers the one case that can: a room whose toolset
  // no longer offers what this person last drew with (#548). The button then
  // shows what the room does offer rather than a material it has withdrawn.
  const drawingGroupOptions = useMemo<PickerOption[]>(
    () => PRIMARY_DRAWING_TOOLS.filter(toolOffered).map(id => ({
      value: id,
      label: t(TOOL_DISPLAY[id].labelKey),
      photo: TOOL_PHOTOS[id],
    })),
    [toolOffered, t],
  )
  const drawingGroupTool = useMemo<PrimaryDrawingTool>(
    () => (toolOffered(lastDrawingTool)
      ? lastDrawingTool
      : (drawingGroupOptions[0]?.value as PrimaryDrawingTool) ?? 'pencil'),
    [lastDrawingTool, toolOffered, drawingGroupOptions],
  )
  // Lit when any material is in hand — not when `tool` happens to equal the
  // one the button is wearing. The eraser and the smudge are their own buttons
  // beside it and must not light this one.
  const drawingGroupActive = isPrimaryDrawingTool(tool)
  // (#544) The same three things for the shapes, with one difference that
  // matters: these options are values of one tool's `kind` setting, not tools.
  // The chooser therefore reads and writes the setting — and the labels and
  // icons come from that setting's own schema, so the rail cannot come to
  // disagree with the settings panel about what a polystar is called.
  const shapeKind = shapeKindOf(toolSettings)
  const shapeKindOptions = useMemo<PickerOption[]>(
    () => SHAPE_KINDS.map(kind => ({
      value: kind,
      label: t(SHAPE_KIND_LABEL_KEYS[kind]),
      icon: SHAPE_KIND_ICONS[kind],
    })),
    [t],
  )
  // (#544) The same two groups again, in the shape the floating panel wants
  // them. Built from the values above rather than beside them, so the panel
  // and the rail cannot come to disagree about what is in hand — which is the
  // whole reason the panel stopped keeping its own answer (a role) in the
  // first place.
  //
  // The shape group is empty when the room does not offer shapes; the panel
  // reads that as "withdrawn" and draws the slot dim. The drawing group can
  // never be empty — a toolset always keeps one material.
  const panelGroups = useMemo<PanelGroups>(() => ({
    drawing: {
      tool: drawingGroupTool,
      icon: TOOL_DISPLAY[drawingGroupTool].icon,
      value: drawingGroupTool,
      members: drawingGroupOptions.map(option => ({
        value: option.value,
        label: option.label,
        icon: TOOL_DISPLAY[option.value as PrimaryDrawingTool].icon,
      })),
    },
    shape: {
      tool: 'shape',
      icon: SHAPE_KIND_ICONS[shapeKind],
      value: shapeKind,
      members: toolOffered('shape')
        ? shapeKindOptions.map(option => ({
          value: option.value,
          label: option.label,
          icon: option.icon ?? 'shapes',
        }))
        : [],
    },
  }), [drawingGroupTool, drawingGroupOptions, shapeKind, shapeKindOptions, toolOffered])
  // Which slots light up. Deliberately null for the tools no slot can name —
  // which, now that every toolbar tool can sit in a slot, means only the
  // annotation set, and the panel is not on screen alongside those anyway
  // (`compact` below).
  const floatingSlotTool = isFloatingPanelTool(tool) ? tool : null
  // Global, not per room — see settingsStore's own comment for why the panel's
  // layout and the panel's position part company on that.
  const floatingPanelLayout = useSettingsStore(s => s.floatingPanelLayout)
  const setFloatingPanelLayout = useSettingsStore(s => s.setFloatingPanelLayout)
  // (#190 epic) Room palette — see roomSlice's own doc comment for why this
  // is a plain setter, not a reducer. Add/remove requests round-trip through
  // the server (dedup lives there, see rooms.ts's addPaletteColor) rather
  // than being applied optimistically here — palette_updated is the only
  // thing that ever actually writes this store field.
  const palette = useRoomStore(s => s.palette)
  const addPaletteColor = useCallback((color: string) => {
    socketRef.current?.emit('palette_add_color', { color })
  }, [])
  const removePaletteColor = useCallback((color: string) => {
    socketRef.current?.emit('palette_remove_color', { color })
  }, [])

  // Everything the colour surface needs, built once and handed to whichever
  // presentation is up — the popover, or the same body pinned in the panel.
  // One object rather than two prop lists, so the two can never drift apart.
  const colorContent: ColorFlyoutContent = {
    value: colorToolColor,
    onChange: v => applyToolColor(colorTool, v),
    mode: colorPickerMode,
    onModeChange: setColorPickerMode,
    palette,
    onAddPaletteColor: addPaletteColor,
    onRemovePaletteColor: removePaletteColor,
    pair: colorPair,
  }
  // (#254/#256/#259) Optimistic-free, same as palette add/remove above — the
  // server is the only writer of `roomFrozen` (via room_frozen_changed);
  // this just requests the change. socketHandlers.ts rejects the request
  // outright for a non-owner, so wiring the button to always be callable
  // here is safe (the header button itself is also only rendered for the
  // owner — see the render section below — this stays defensive either way).
  const toggleRoomFrozen = useCallback(() => {
    socketRef.current?.emit('set_room_frozen', !useRoomStore.getState().roomFrozen)
  }, [])
  // (#548) Same shape as the freeze toggle above and for the same reason: the
  // server is the only writer, and it broadcasts the result back to everyone
  // (`room_tools_changed`) including this tab. So nothing is patched locally
  // here — an optimistic update would only be a second opinion about a value
  // the server sanitizes anyway.
  const setRoomTools = useCallback((next: ToggleableTool[] | undefined) => {
    socketRef.current?.emit('set_room_tools', next)
  }, [])
  // (#222) Reopening from inside the room. Unlike the freeze toggles around
  // it this goes over REST, because closing is persisted and the same call
  // has to work from the lesson list where there is no socket for the room
  // (see roomRoutes.ts). The store is patched from the answer rather than
  // waiting for the server's own `room_closed_changed` broadcast to come
  // back: the broadcast is what tells *everyone else*, and relying on it
  // here would leave the person who pressed the button looking at a room
  // that is still closed if their socket happens to be down.
  const [closedBusy, setClosedBusy] = useState(false)
  const reopenRoom = useCallback(async () => {
    if (!lessonId) return
    setClosedBusy(true)
    try {
      const updated = await setRoomClosed(lessonId, false)
      useRoomStore.getState().setRoomClosedAt(updated.closedAt ?? null)
    } catch {
      void showAlert({ message: t('room.error.reopen') })
    } finally {
      setClosedBusy(false)
    }
  }, [lessonId, showAlert, t])
  // (#222/#317) The student half: a closed lesson is homework, and this is
  // how it gets taken. Navigates *into* the copy — the opposite of the same
  // action in the lesson list (#317), and for the opposite reason: there the
  // point is to hand copies out, here the point is to start working.
  const takeRoomCopy = useCallback(async () => {
    if (!id) return
    setClosedBusy(true)
    try {
      const { room: copy } = await forkRoom(id, { name: t('lessons.forkedName', { name: config?.name ?? '' }), scope: 'board' })
      navigate(`/room/${copy.id}`)
    } catch {
      void showAlert({ message: t('room.error.takeCopy') })
      setClosedBusy(false)
    }
  }, [id, navigate, config?.name, showAlert, t])
  // (#254/#257/#259) Same reasoning as toggleRoomFrozen above, targeted at
  // one participant — passed to ParticipantsPanel's onToggleFreeze.
  const toggleParticipantFrozen = useCallback((userId: string, frozen: boolean) => {
    socketRef.current?.emit('set_participant_frozen', { userId, frozen })
  }, [])
  // (#542) "Go refine this further than a tap on the well allows." Which well
  // it opens from is the whole of the state: 'rail' is the one pinned at the
  // top of the tool bar, 'panel' the one in the middle of the floating panel.
  //
  // This used to be `setUiHidden(false); setActivePanel('color')` — bringing
  // the whole chrome back was load-bearing, because the picker lived in a tab
  // of a strip that minimal UI fades out. A flyout that hangs off the well
  // that opened it needs none of that: the surface goes where the colour
  // already is, in either chrome state, which is the point of the well having
  // a fixed home in each.
  const [colorFlyoutAt, setColorFlyoutAt] = useState<'rail' | 'panel' | null>(null)
  const railWellRef = useRef<HTMLButtonElement>(null)
  const panelWellRef = useRef<HTMLButtonElement>(null)
  const closeColorFlyout = useCallback(() => setColorFlyoutAt(null), [])
  /** What pressing a colour well in the chrome does: the popover, always. The
   *  side panel's Color tab shows the same surface and is always there too, but
   *  it is a second route rather than a mode this has to branch on — a press on
   *  the well means "the colour, here, now", and answering it by scrolling a
   *  panel into view somewhere else would be a different answer to a different
   *  question (Ilya, 10.09). */
  const openRailColorSurface = useCallback(() => {
    setColorFlyoutAt(at => (at === 'rail' ? null : 'rail'))
  }, [])
  // A colour swatch in the full settings tab opens the *rail's* surface, not
  // one chasing the swatch that was pressed: that tab is only ever on screen
  // beside the rail, and one surface in one fixed place beats a popover that
  // follows whichever copy of a swatch was clicked. Which field was pressed
  // still matters — it points the surface at that colour first, so a shape's
  // fill swatch edits the fill rather than whichever of the two was last
  // selected.
  const expandColorField = useCallback((key: string) => {
    if (key === 'strokeColor') setShapeSwatch('stroke')
    if (key === 'fillColor') setShapeSwatch('fill')
    openRailColorSurface()
  }, [setShapeSwatch, openRailColorSurface])
  // Persist last-used settings per room (#156/#196) — mirrors the pattern
  // above (derived state -> engine), just targeting storage instead.
  useEffect(() => {
    if (!id) return
    saveToolSettings(localStorage, id, toolSettings)
  }, [id, toolSettings])

  // (#506) Same, for the selected layer — including the case where the
  // selection was not made by hand: a `sanitizeSelection` fallback (the active
  // layer was deleted, here or by a peer) is the new selection and is stored
  // as such, so the next reload doesn't try to restore a layer this session
  // already watched disappear.
  useEffect(() => {
    if (!id) return
    saveActiveLayerId(localStorage, id, layerState.activeId)
  }, [id, layerState.activeId])

  // ── sync layer state → engine ─────────────────────────────────────────────────
  // (#493) Active layer, composite order, and the one gate that decides
  // whether a stroke may start at all — see useLayerStateSync.
  useLayerStateSync(engineRef, isOwner)

  // (#520) Which layers the eraser goes through, when it is set to go through
  // them at all. Pushed from here rather than decided in the engine because the
  // rule is made of things the engine has no business knowing — folder
  // nesting, the two kinds of lock, and whether this participant is the owner;
  // `eraseThroughTargets` is where it is written down.
  //
  // An empty list whenever the toggle is off, which is what restores the plain
  // single-layer eraser exactly. Deliberately *not* gated on the eraser being
  // the tool in hand: the engine reads this at pen-down and only for an eraser
  // stroke, so gating here would buy nothing and add a way for the list to be
  // stale at the moment it is read.
  const eraseThroughLayers = toolSettings.eraser.throughLayers as boolean
  useEffect(() => {
    engineRef.current?.setEraseThroughLayers(
      eraseThroughLayers ? eraseThroughTargets(layerState, isOwner) : [],
    )
  }, [eraseThroughLayers, layerState, isOwner, engineEpoch])

  // ── sync viewport → engine ────────────────────────────────────────────────────
  // (#493) Both effects — where the camera looks and how big the surface it
  // looks through is — live in useCanvasViewport now. They were never two
  // topics: #470 replaced a bounded room's CSS transform with a camera, and
  // these are the two halves of keeping that camera honest.
  useCanvasViewport({
    engineRef, vp, vpRef, vpEl,
    infinite: config?.infinite ?? false,
    pageW: enginePageW, pageH: enginePageH,
  })

  // ── local cursor broadcast (#37) ──────────────────────────────────────────────
  // (#493) One listener, its throttle clock and its cached rect — all of it in
  // useCursorBroadcast now.
  useCursorBroadcast({ vpRef, socketRef, strokeActiveRef })

  // ── operation log bridge ──────────────────────────────────────────────────────
  // (#493) How an operation leaves this client — optimistic, through the
  // outbox, or refused — and undo/redo, in useOperationDispatch.
  const { dispatchOp, handleUndo, handleRedo } = useOperationDispatch({
    roomContentReady, editingBlocked, connected, outbox, engineRef, pendingIdsRef, isOwnerRef,
    syncFromLog, transformSessionRef, resetTransformSessionRef,
  })

  // (#312) The banner's "undo" — drops the replacement layers again, for
  // when the deletion was right and the recovered strokes aren't wanted.
  // An ordinary layer_delete on this client's own new ids, so it goes
  // through every normal path (confirmation, undo history) rather than
  // reaching behind them.
  const undoLostWorkRecovery = useCallback(() => {
    const ids = lostWork?.restoredLayerIds ?? []
    setLostWork(null)
    if (ids.length) dispatchOp({ type: 'layer_delete', layerIds: ids })
  }, [lostWork, dispatchOp])

  // (#263) LayerPanel has no direct engine access — this is the same
  // engineRef-backed-callback shape as dispatchOp above, threaded down as a
  // prop so its own delete confirm can ask "does this layer have content"
  // without the panel needing to know the engine exists at all.
  const hasLayerContent = useCallback((layerId: string): boolean =>
    engineRef.current?.hasLayerContent(layerId) ?? false
  , [])



  // Every way out of the editor asks first. Leaving a room is not destructive
  // — the drawing is in the room, not in this tab — but it is disorienting
  // mid-lesson, and the exit sits in the same header strip as controls that
  // get tapped constantly, so an accidental one is easy.
  const leavePendingRef = useRef(false)
  const leaveRoom = useCallback(async () => {
    // A second tap while the dialog is already up would otherwise pre-empt the
    // first dialog, which resolves it as `false` — a cancel the user never
    // asked for. (Back can no longer be one of those callers — see the guard
    // effect below — but the header wordmark and the menu item still can.)
    if (leavePendingRef.current) return
    leavePendingRef.current = true
    try {
      const leaving = await confirm({
        title: t('room.confirmLeaveTitle'),
        message: t('room.confirmLeaveMessage'),
        confirmLabel: t('room.confirmLeave'),
        cancelLabel: t('room.confirmLeaveStay'),
      })
      if (leaving) navigate('/')
    } finally {
      leavePendingRef.current = false
    }
  }, [confirm, navigate, t])

  // (#309) The only place `strokeActive` reaches this component's own DOM:
  // one attribute on the editor root, from which CSS blocks pointer events on
  // the four chrome wrappers and the floating panel (`.strokeBlockable` in
  // Room.module.css / FloatingToolPanel.module.css). A store *subscription*,
  // not a selector — the point is that this runs without React re-rendering
  // anything, which is what a `useRoomStore(s => s.strokeActive)` here would
  // do to the whole tree twice per stroke.
  //
  // React never sets this attribute itself (it appears in no JSX), so it
  // can't be clobbered by an unrelated re-render the way a className toggled
  // behind React's back would be. It dies with the element on unmount, so
  // there is nothing to clean up beyond the subscription.
  useEffect(() => useRoomStore.subscribe((state, prev) => {
    if (state.strokeActive === prev.strokeActive) return
    editorRef.current?.toggleAttribute('data-stroke-active', state.strokeActive)
  }), [])

  // (#377) Back does nothing while the editor is on screen — Chrome's
  // edge-swipe-back gesture fires by accident often enough while drawing that
  // even asking about it is an interruption. The whole mechanism (reverting
  // the URL, and keeping a spare history entry so there is something to
  // revert) lives in backNavigationGuard; see its comment. Armed only while
  // this room is actually mounted, so back navigation elsewhere in the app
  // (/create, /my-lessons) is unaffected, and leaving stays available through
  // the header wordmark and the room menu's "Leave".
  //
  // `config` is what says the editor itself is on screen rather than the join
  // gate. Nothing at the gate can trigger the accidental edge-swipe this guard
  // exists for (the draggable controls are all in the editor), and there is no
  // room to be kept in yet — trapping back there would only strand someone who
  // opened a link they've decided not to follow. Depended on as a boolean, not
  // as the room object: the object's identity changes on every rename and
  // room_state, and re-running this effect is not free now that arming pushes
  // a history entry.
  const editorOnScreen = !!config
  useEffect(() => {
    if (!editorOnScreen) return
    setBackNavigationGuard(location.pathname + location.search + location.hash)
    return () => setBackNavigationGuard(null)
  }, [editorOnScreen, location.pathname, location.search, location.hash])

  // Eyedropper (#82): consumes the next pointerdown on the canvas catcher
  // (armed only while eyedropperActive) instead of letting it reach the
  // canvas as a stroke. Deliberately NOT switched to clientToRoomPoint/
  // world-space for infinite rooms like the #143 overlays below —
  // engine.pickColor reads whatever's currently on *screen* (a
  // gl.readPixels off the real, already-camera-composited framebuffer, see
  // its own doc comment), not a layer's world-space content, so it needs
  // plain canvas-backing-pixel coordinates in both modes, not world ones.
  // For infinite rooms that's just the pointer's viewport offset scaled to
  // the DPR-sized backing store (the canvas fills the viewport with no CSS
  // pan transform of its own) — this used to go through clientToCanvas with
  // the PLACEHOLDER_INFINITE_CANVAS_SIZE placeholder config, a pre-existing
  // inaccuracy #143 explicitly left alone.
  const handleEyedropperPick = useCallback((e: React.PointerEvent) => {
    // (#405) The hand outranks the tool underneath it — the same precedence
    // resolveCursor states (rule 1) and the gizmo handles follow. With it up, a
    // press on the canvas moves the view; picking a colour instead would both
    // pan and switch tools out from under the drag.
    if (handActive) return
    e.preventDefault()
    const el = vpRef.current
    if (!el || !config) return
    const rect = el.getBoundingClientRect()
    const nz = deviceNativeZoom()
    const { x, y } = config.infinite
      ? { x: (e.clientX - rect.left) / nz, y: (e.clientY - rect.top) / nz }
      : clientToCanvas(
          e.clientX, e.clientY,
          { cx: rect.left + vp.cx, cy: rect.top + vp.cy, zoom: vp.zoom, angle: vp.angle },
          config,
        )
    const picked = engineRef.current?.pickColor(x, y)
    if (picked) {
      // Writes the slot of the tool the canvas is being handed back to, not a
      // hardcoded 'pencil' — picking a color while the liner or marker was
      // selected used to silently repaint the pencil's swatch instead, so the
      // picked color never showed up in the stroke that followed. See
      // pickedColorTool for the eraser/smudge case, which owns no color.
      applyToolColor(pickedColorTool, picked)
      // (#405) The eyedropper's one schema field, wired at last. It has been
      // in TOOL_SCHEMAS since #196 with nothing behind it, which was tolerable
      // only because the eyedropper was a mode and its settings never reached
      // a panel — now that it is a tool, selecting it puts this toggle on
      // screen, and a control that provably does nothing is worse than no
      // control (the same rule keepProportions is hidden under in Distort).
      if (toolSettings.eyedropper.addToPalette) addPaletteColor(rgbToHex(picked))
      // (#405) The eyedropper is the one tool with a one-shot gesture: taking
      // a colour is the whole of it, so it hands the canvas straight back to
      // the drawing tool that was in hand rather than staying armed and making
      // the next stroke a second pick. `drawingTool` and not `lastDrawingTool`
      // deliberately — if the eraser was what you were using, the eraser is
      // what you get back.
      setTool(drawingTool)
      // (#542) No longer opens the full picker on top of the drawing. It used
      // to switch the side panel to its Color tab, which was passive — the tab
      // either was already in view or was not. The flyout that replaced that
      // tab is a popover over the canvas, and throwing one up after every pick
      // is a different thing entirely. It costs nothing to drop: the colour is
      // already in the well, and the well is one press away from anywhere,
      // which is exactly what giving it a fixed home bought.
    }
    // `applyToolColor`, not `setToolSetting`: the former is what this actually
    // calls, and it closes over `shapeSwatch`. Listing the setter instead left
    // a stale copy here — with a shape in hand and the fill selected, a pick
    // taken after the swatch was switched wrote the field the swatch used to
    // point at.
  }, [vpRef, vp, config, handActive, applyToolColor, pickedColorTool, setTool, drawingTool, toolSettings.eyedropper, addPaletteColor])

  // Ruler tool (#89, #405): the engine only ever knows about the ruler as a
  // *snapping* guide, so this is where "is there a line to snap to right now"
  // is answered, once, for every way the answer can change.
  //
  // Off screen means genuinely inert, not merely invisible: the engine is
  // handed null and nothing bends. (#445) That is what makes an unlocked ruler
  // safe to leave lying in the store — pick up the pencil and the line is gone
  // from both the canvas and the snapping, so measuring costs nothing to undo.
  // Snapping off keeps the line on screen and draggable, and simply stops it
  // pulling on strokes: a straight edge to measure and align against is half
  // of what a ruler on a drawing is for.
  //
  // Deliberately an effect on the state rather than an engine call inside each
  // drag handler (which is what this replaced): "the engine's ruler is exactly
  // the visible, snapping line" is an invariant, and hand-written call sites
  // are how an invariant becomes a bug.
  useEffect(() => {
    engineRef.current?.setRuler(rulerVisible && rulerSnap ? rulerLine : null)
  }, [rulerLine, rulerVisible, rulerSnap])

  // (#405) Selecting a tool selects it. Pressing a toolbar button never hands
  // the canvas back to something else, however many times it is pressed: a
  // button that reads as "this tool is in hand" and answers a second press by
  // putting a *different* tool in hand contradicts the one thing this whole
  // change is for. It also could not be consistent — the toggle-back target
  // used to be `lastDrawingTool` for the eraser and smudge but a hardcoded
  // pencil for charcoal, liner and marker, so the same gesture landed
  // somewhere different depending on which button you pressed.
  //
  // (#548) And the one gate on the room's toolset. Every way a tool gets into
  // a hand routes through here or through `toggleTool` below, so refusing a
  // tool the room does not offer is one check rather than fifteen. The toolbar
  // does not render those buttons at all; this is the backstop for the paths
  // with no button to hide.
  const selectTool = useCallback((next: EditorTool) => {
    if (!isToolEnabledInRoom(enabledTools, next)) return
    setTool(next)
  }, [setTool, enabledTools])

  // (#544) Picking one member out of a group's fan in the floating panel. The
  // two groups differ exactly here and nowhere the panel can see: a material
  // *is* a tool, while a shape is a setting on a tool that then has to be
  // taken as well. Routed through `selectTool` like every other path into a
  // hand, so the toolset gate applies here too.
  const selectGroupMember = useCallback((group: SlotGroup, value: string) => {
    if (group === 'drawing') { selectTool(value as EditorTool); return }
    setToolSetting('shape', 'kind', value)
    selectTool('shape')
  }, [selectTool, setToolSetting])

  // The toggle survives, but only on the *keys*. "Press E, do a correction,
  // press E again" is a real one-handed affordance that a key can offer and a
  // button cannot: the finger is already there, and there is no visual state
  // claiming otherwise. Both halves route through here so a second press
  // always lands on the tool you were drawing with, whichever key it was.
  const toggleTool = useCallback((next: EditorTool) => {
    if (!isToolEnabledInRoom(enabledTools, next)) return
    // (#548) The tool to come back to may itself have been switched off since
    // it was last held — `drawingTool` remembers what was drawn with, not what
    // is still on the desk.
    const back = isToolEnabledInRoom(enabledTools, drawingTool) ? drawingTool : fallbackTool
    setTool(prev => (prev === next ? back : next))
  }, [setTool, drawingTool, enabledTools, fallbackTool])

  // (#548) The hand that was holding a tool the room has just stopped
  // offering. Every other path is closed by `selectTool` above, but this one
  // is not a selection at all — the tool was already in hand when the toolset
  // moved under it.
  //
  // Silent on the first run: a room whose toolset excludes the pencil hands a
  // joiner something else before they have touched anything, and announcing
  // that would be telling someone their tool was taken when they never had it.
  // Only an actual change during the session is worth a word.
  const toolsetSeenRef = useRef(false)
  useEffect(() => {
    const announce = toolsetSeenRef.current
    toolsetSeenRef.current = true
    if (isToolEnabledInRoom(enabledTools, tool)) return
    setTool(fallbackTool)
    if (announce) notifyWarning(t('toolset.withdrawn'), { key: 'toolset-withdrawn' })
  }, [enabledTools, tool, fallbackTool, setTool, t])

  // Active layer, or the current multi-select from LayerPanel — background
  // is never a legal transform target, same as merge/delete (#120).
  // useMemo'd (not just a plain const) so it has a stable reference to key
  // the bounds-refresh effect below on — without that it would refire every
  // render instead of only on an actual selection change.
  //
  // (#518) Locked layers drop out here, which is what makes the gizmo itself
  // refuse them: with no targets there are no bounds, and with no bounds
  // nothing is drawn to grab. Filtered rather than all-or-nothing on a mixed
  // multi-select — the frame then holds exactly the layers it can actually
  // move, which is both the honest readout and the only version that agrees
  // with what `dispatchOp` would let through.
  const transformTargetIds = useMemo(() => (
    (layerState.selectedIds.length > 0 ? layerState.selectedIds : [layerState.activeId])
      .filter((layerId): layerId is string => !!layerId && layerId !== BACKGROUND_LAYER_ID && layerState.items[layerId]?.kind === 'layer')
      .filter(layerId => !isLayerLocked(layerState, layerId, isOwner))
  ), [layerState, isOwner])

  // (#493) The gizmo's open session — start, commit, reset, and when each
  // happens — lives in useTransformSession. What comes back is what the rest
  // of the page reads: the region the gizmo frames, and the commit Enter uses.
  const { areaSelection, commitTransformSessionRef } = useTransformSession({
    engineRef, transformSessionRef, resetTransformSessionRef, pendingPasteRef,
    pendingTransformCommitRef, drawingToolRef, handActiveRef,
    transformTargetIds, dispatchOp, vpEl,
  })

  const rulerRectRef = useRef<DOMRect | null>(null)

  // Ruler tool (#89, #405): one gesture handler for the whole tool.
  //
  // Down/move/up tracked manually via setPointerCapture + direct DOM
  // listeners, the same pattern ColorPicker's onSvDown/onHueDown use for their
  // own drag handling. Pen-only, same as the pencil itself ignores touch (see
  // PointerInput.ts) — a finger on the catcher falls straight through to
  // useViewport's own panning untouched, instead of trying to arbitrate whose
  // gesture a given touch belongs to.
  //
  // What a press means is decided by hit-testing it against the line
  // (rulerGestureAt): on an endpoint it swings that end, on the body it slides
  // the whole ruler, anywhere else it lays a brand-new one over whatever was
  // there. That is what reconciles the tool's two rules — "dragging always
  // makes a new line" and "an existing line can only be moved while the ruler
  // is selected" — and it is why this replaced a two-surface arrangement (a
  // catcher div for the first placement, then RulerOverlay's own SVG shapes
  // forever after) that could express neither: the catcher was gone by the
  // time a second line was wanted, and the SVG handles stayed draggable under
  // every other tool.
  //
  // The tolerances are screen px, divided by the zoom here so a ruler is no
  // harder to grab zoomed out than zoomed in (#394's rule for the gizmo's own
  // handles).
  //
  // Only mounted while the ruler is the selected tool — which (#445) is also
  // exactly when it is guaranteed to be on screen. A locked ruler stays
  // visible under the pencil but is not draggable there, and an unlocked one
  // is not on screen at all: nothing off screen can be grabbed any more than
  // it can snap, see the engine sync above.
  const handleRulerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return
    // Same precedence as everywhere else (#405): while the hand is up, a drag
    // moves the view. useViewport's own listener is on `.viewport`, an ancestor
    // of this catcher, and native listeners on an ancestor run *before* React
    // dispatches here — so without this the same drag would pan and lay a
    // ruler line at once.
    if (handActive) return
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    const overlay = e.currentTarget
    const penPointerId = e.pointerId
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    const rect = rulerRectRef.current = el.getBoundingClientRect()
    // #143: world-space for infinite rooms (clientToRoomPoint) — matches
    // what engine.setRuler's snapping (rulerSnap.ts) compares against real
    // stroke dabs there (genuine world coordinates, see setInfiniteCamera's
    // pointer transform), and what RulerOverlay's a/b props expect for
    // infinite rooms (see the render section below).
    const toPoint = (clientX: number, clientY: number): RulerPoint => clientToRoomPoint(clientX, clientY, rect, vp, config)

    const startPoint = toPoint(e.clientX, e.clientY)
    const startLine = rulerLine // frozen for the duration of this drag
    const gesture = rulerGestureAt(
      startPoint, startLine,
      RULER_ENDPOINT_GRAB_PX / vp.zoom, RULER_BODY_GRAB_PX / vp.zoom,
    )

    const computeLine = (clientX: number, clientY: number): { a: RulerPoint; b: RulerPoint } => {
      const p = toPoint(clientX, clientY)
      // A new line is anchored where the press landed and follows the pointer
      // with its far end — the same A→B drag the tool has always opened with.
      if (gesture === 'new' || !startLine) return { a: startPoint, b: p }
      if (gesture === 'a') return { a: p, b: startLine.b }
      if (gesture === 'b') return { a: startLine.a, b: p }
      const dx = p.x - startPoint.x
      const dy = p.y - startPoint.y
      return {
        a: { x: startLine.a.x + dx, y: startLine.a.y + dy },
        b: { x: startLine.b.x + dx, y: startLine.b.y + dy },
      }
    }

    // Committed on the press, not on the first move: a tap that lays a
    // zero-length line and a drag that lays a real one are the same gesture at
    // this point, and rulerSnap.ts already refuses a degenerate line rather
    // than dividing by zero (MIN_RULER_LENGTH_SQ).
    setRulerLine(computeLine(e.clientX, e.clientY))
    setRulerDragging(true)

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      setRulerLine(computeLine(ev.clientX, ev.clientY))
    }
    // (#448) `end`, not `up`: a pointercancel (the browser taking the gesture
    // over) never sends pointerup, and a distance bubble left standing after
    // one would be exactly the permanent label this issue removed.
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      setRulerDragging(false)
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onEnd)
      overlay.removeEventListener('pointercancel', onEnd)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onEnd)
    overlay.addEventListener('pointercancel', onEnd)
  }, [vpRef, vp, config, handActive, rulerLine, setRulerLine])

  // (#405) The catcher's own cursor, per pointer position — the one cursor in
  // the editor that cannot come from a CSS class, because which gesture is on
  // offer depends on where the pointer is relative to the line rather than on
  // any state. Written straight to the element rather than through React state
  // so a hover costs no render; the *decision* is still cursorController's
  // (RULER_GESTURE_CURSOR), which is the rule #393 exists to keep.
  const handleRulerHover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = vpRef.current
    if (!el || !config) return
    // Cached rect, same forced-reflow reasoning as the cursor broadcast's own
    // (see its comment): getBoundingClientRect is a synchronous layout read and
    // this runs on every pointermove over the canvas. Re-read on entry and on
    // every press, which is every moment it could matter; a window resize while
    // the pointer sits still leaves the *cursor* a frame stale and nothing else,
    // since the press that follows reads the rect afresh.
    const rect = rulerRectRef.current ??= el.getBoundingClientRect()
    const gesture = rulerGestureAt(
      clientToRoomPoint(e.clientX, e.clientY, rect, vp, config), rulerLine,
      RULER_ENDPOINT_GRAB_PX / vp.zoom, RULER_BODY_GRAB_PX / vp.zoom,
    )
    e.currentTarget.style.cursor = RULER_GESTURE_CURSOR[gesture]
  }, [vpRef, vp, config, rulerLine])

  // Which layer a pixel *action* would touch: the active one, refusing the
  // background (never a legal target for anything that paints, same rule as
  // transform/merge/delete). Null disables the actions — not the outline: a
  // region can be marked with the background active, it simply has nothing to
  // act on until a real layer is.
  //
  // (#453) Shared with the fill tool, which lands on exactly the same layer by
  // exactly the same rule — it was named for the selection only because that
  // was the first thing to need it.
  const paintTargetId = layerState.activeId
    && layerState.activeId !== BACKGROUND_LAYER_ID
    && layerState.items[layerState.activeId]?.kind === 'layer'
    ? layerState.activeId
    : null

  // (#518) Whether that target refuses paint right now. Kept apart from
  // `paintTargetId` itself rather than folded into it, because the two answer
  // different questions and one caller wants each: copying a region reads the
  // layer and is fine on a locked one, everything else here writes to it.
  const paintTargetLocked = !!paintTargetId && isLayerLocked(layerState, paintTargetId, isOwner)
  const paintTargetLockedRef = useRef(paintTargetLocked)
  paintTargetLockedRef.current = paintTargetLocked

  // Which layer the pixel actions act on (the selection's, the shape's, the
  // fill's), read when they run rather than captured: the selection outlives
  // any one layer, so "copy this region" means "from whatever is active right
  // now".
  const paintTargetIdRef = useRef(paintTargetId)
  paintTargetIdRef.current = paintTargetId

  // ── Selection (#446) ────────────────────────────────────────────────────
  // (#493) The gestures that draw an outline and the four things that can be
  // done with one live in useSelection; what comes back is what the markup,
  // the action buttons and the keyboard handler read.
  const {
    selectionShapeKind, selectionCursor, setSelectionCursor, selectionRectRef, finishSelection,
    handleSelectionDown, handleSelectionDoubleClick, handleSelectionHover,
    copySelection, deleteSelectionContents, cutSelection, pasteClipboard,
  } = useSelection({
    roomId: id, vpRef, vpEl, handActive, handActiveRef, engineRef, dispatchOp,
    paintTargetIdRef, paintTargetLockedRef, isOwnerRef, pendingPasteRef,
  })

  // (#530) The shape tool's own session. Everything it needs is already here
  // for the tools next to it: the same paint target, the same lock ref, the
  // same dispatch. What it adds is a frame that stays editable after the pen
  // comes up — see useShapeTool.
  const shapeActive = isShapeTool(tool)
  const shape = useShapeTool({
    active: shapeActive,
    config,
    vpEl,
    vpRef,
    engineRef,
    paintTargetIdRef,
    paintTargetLockedRef,
    handActiveRef,
    dispatchOp,
  })
  const shapeFrame = shape.frame
  // Read through a ref by the key handler, which is installed once: it must
  // see the current session, not the one that was open when it was bound.
  const shapeRef = useRef(shape)
  shapeRef.current = shape
  // The same three clauses the transform session gets, for the same reasons —
  // one mechanism, two tools (#528). A click past an open shape applies it and
  // leaves the tool in hand: unlike a transform, drawing shapes is something
  // you do several of in a row.
  useCommittableSession({
    active: shapeFrame !== null,
    commit: shape.commit,
    vpEl,
    handActiveRef,
    ownControlsSelector: '[data-transform-gizmo]',
    onClickPast: shape.commit,
  })


  // (#453) The fill's one gesture: a tap works out the region and emits an
  // `area_fill`. Two pieces of state around it, both for the same reason —
  // the work happens on the main thread and is not instant (a readback of the
  // fill's domain plus a scan of it), so the tool has to say it is thinking
  // and has to refuse a second tap while it is.
  const [fillBusy, setFillBusy] = useState(false)
  const fillBusyRef = useRef(false)

  const handleFillTap = useCallback(async (e: React.PointerEvent<HTMLDivElement>) => {
    // Pen (and mouse) only, same as the selection tool. On a tablet a finger is
    // how the canvas is panned and zoomed, so a touch that reaches here is
    // almost always the start of a two-finger gesture — and unlike a stray
    // stroke, a stray fill repaints a whole region.
    if (e.pointerType === 'touch') return
    // Same precedence as every other canvas tool: the hand outranks what is
    // under it, and a press with it up pans instead.
    if (handActive) return
    e.preventDefault()
    e.stopPropagation()
    const engine = engineRef.current
    const el = vpRef.current
    const layerId = paintTargetIdRef.current
    if (!engine || !el || !config || !layerId || fillBusyRef.current) return
    // (#518) Refused before the work, not after: the fill's own readback and
    // scan take long enough to show a busy state, and spending them on a tap
    // `dispatchOp` will throw away would look like the tool hanging on a
    // locked layer rather than declining.
    if (paintTargetLockedRef.current) return

    const rect = el.getBoundingClientRect()
    // Layer space, not screen space — #143's rule for everything that reaches
    // an operation: the viewport is this user's own, so a seed recorded in
    // screen pixels would be somewhere else on every other participant's
    // canvas (and, here, somewhere else in this user's own layer one zoom
    // later).
    const seed = clientToRoomPoint(e.clientX, e.clientY, rect, useRoomStore.getState().viewport, config)
    const values = useRoomStore.getState().toolSettings.fill
    const color = getToolColor(useRoomStore.getState().toolSettings, 'fill')
    // The one place the on-screen toggle becomes the operation's named mode —
    // see the schema's own comment for why the two are shaped differently.
    const source: FillSourceMode = values.allLayers ? 'visible' : 'layer'

    fillBusyRef.current = true
    setFillBusy(true)
    try {
      // Yields one frame before the blocking work so the busy state is on
      // screen while it runs, rather than painting after it is over.
      await new Promise(resolve => requestAnimationFrame(resolve))
      const filled = await engine.computeAreaFill({
        layerId,
        seedX: seed.x,
        seedY: seed.y,
        color,
        tolerance: values.tolerance as number,
        gapClose: values.gapClose as number,
        expand: values.expand as number,
        source,
      })
      // Null means the tap produced no region at all (an empty result, not a
      // failure) — nothing to record and nothing to say.
      if (!filled) return
      dispatchOp({
        type: 'area_fill',
        layerId,
        image: filled.image,
        x: filled.x,
        y: filled.y,
        width: filled.width,
        height: filled.height,
        seedX: seed.x,
        seedY: seed.y,
        color,
        tolerance: values.tolerance as number,
        gapClose: values.gapClose as number,
        expand: values.expand as number,
        source,
      })
    } catch (err) {
      console.error('fill failed', err)
    } finally {
      fillBusyRef.current = false
      setFillBusy(false)
    }
  }, [vpRef, config, dispatchOp, handActive])

  // ── Annotations (#509/#510, эпик #87) ───────────────────────────────────
  // (#493) Out of line in useAnnotations; what comes back is what the page's
  // markup and keyboard handling read.
  const {
    annotationDraftInputRef, annotationHover, annotationLayerRef, annotationTextCatcherRef, cancelAnnotationDraft, clearAllAnnotations, commitAnnotationDraft, erasingIds, handleAnnotationEraseDown, handleAnnotationHover, handleAnnotationPeekDown, handleAnnotationPeekUp, handleAnnotationPenDown, handleAnnotationsToggle, handleAnnotationTextTap, liveInk, pinDrag, setAnnotationHover, toggleAnnotationMode,
  } = useAnnotations({
    dispatchOp, selectTool, vpRef, handActive, compact, annotateWithFinger,
    onPersonalBoard, isOwner, doubleTapArmedRef, pendingNoteRef,
  })

  // (#391) The transform tool's mode, from the same TOOL_SCHEMAS store every
  // other tool's settings live in (see settingsToolId below for how they reach
  // the UI). `transient` there — a transform mode remembered from half an
  // hour ago is a gizmo whose edge handles no longer do what the last person
  // to touch them expects. The gestures read it (and the proportions toggle)
  // themselves; see useTransformGizmoGestures.
  const transformMode = toolSettings.transform.mode as TransformMode

  // (#391/#405) Whose settings the quick-access column and the "Tool settings"
  // tab are showing: the selected tool, full stop. This used to be
  // `transformActive ? 'transform' : tool` — a special case, because transform
  // was a mode rather than a tool and only that one mode had settings worth
  // surfacing. With one exclusive selection there is no special case left to
  // write: the ruler's show/snap and the grid's visibility are its settings
  // exactly the way the pencil's grade is, and selecting a drawing tool again
  // hands both surfaces back with its own settings where they were.
  //
  // Every `EditorTool` is a `UiToolId` by construction (toolSlice's two lists
  // are `satisfies readonly UiToolId[]`), so this needs no widening or
  // fallback: there is always a schema to show.
  const settingsToolId: UiToolId = tool

  // (#493) The gizmo's pointer gestures — see useTransformGizmoGestures.
  const { handleTransformHandleDown, handleTransformCenterDown, handleTransformCenterReset } =
    useTransformGizmoGestures({ vpRef, vp, handActive, engineRef, transformSessionRef, pendingTransformCommitRef })

  // ── socket wiring (#84/#37/#38/join-gate) ──────────────────────────────────────
  // Runs once per room id, independent of `config` — a joiner doesn't have a
  // config yet at connect time (that's the entire point of the join gate), so
  // the socket has to exist before it does. What gets emitted on 'connect'
  // branches on creator vs. joiner instead.
  //
  // (#176, ADR 014 §4) Keyed on the *lesson* (`sessionId`), not on the board:
  // a page turn is a `join_room` on this same socket, never a new one. Nothing
  // per-board may appear in the dependency list below — the outbox and the
  // snapshot uploader are reached through refs for exactly that reason.
  useEffect(() => {
    if (!sessionId) return
    // The URL id at the moment this lesson's socket was built. `id` itself
    // may change underneath (a board id replaced by its lesson's) without this
    // effect re-running, so the first join uses the id it was made for.
    const id = sessionId
    // A new socket is a new first `room_state` — the one that tells a joiner
    // the lesson's config. Reset here rather than only at mount so a
    // navigation into another lesson (takeRoomCopy) learns that lesson's name
    // and paper instead of keeping the previous one's.
    firstRoomStateReceivedRef.current = false

    // Same-origin: the Vite dev server proxies /socket.io to apps/server
    // (see vite.config.ts) — works under both `npm run dev` (https, needed
    // for AudioWorklet-based sound experiments) and `npm run dev:http`.
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
      io({ withCredentials: true })
    socketRef.current = socket

    /** The board a reconnect or a resync re-joins: the one this client is on
     *  (or heading to), falling back to the URL for the very first join. */
    const currentBoard = () => wantedBoardRef.current ?? boardIdRef.current ?? id
    const joinCredentials = () => lastJoinAttemptRef.current
      ?? { name: myDisplayNameRef.current, password: creatorDraft?.password }

    // (#504) socket.io переподключается само — кроме двух случаев, в которых
    // оно объявляет, что больше не пытается, и тогда открытая комната висит на
    // «Нет связи» до перезагрузки страницы. См. socketRevival.ts: там и
    // перечень случаев, и почему у страницы комнаты нет законной причины
    // принять такой ответ.
    const revival = createSocketRevival(socket)

    // Fires on the initial connect *and* on every auto-reconnect (socket.io-
    // client's default behavior). Rejoining after a drop is what gives us the
    // "reasonable MVP" reconnect behavior called for by #84 (full catch-up/
    // session-continuity is #74): the client resyncs from a fresh room_state
    // rather than getting stuck. Identity (#41) comes from the server-
    // resolved cookie identity via each create_room/join_room ack below
    // (applyIdentity), not from socket.id — a fresh socket id churns on every
    // reconnect, which used to mean a reconnecting creator was misjudged as a
    // `student` and operations kept a stale userId; both are fixed now that
    // ownership/authorship key off the same stable id every time.
    /** (#496) A join that came back refused somewhere the join gate cannot
     *  see it — the creator's own `create_room`, a reconnect's silent rejoin,
     *  a gap resync. All three used to end in `console.error` and nothing
     *  else.
     *
     *  The gate is not an option here, and that is the whole difficulty:
     *  `JoinGate` only renders while `config` is null (see the render below),
     *  and on every path this covers the room is already open on screen. So
     *  the refusal has to be told, not shown — the same shape `handleKicked`
     *  settled on for the same reason.
     *
     *  Why it matters more than "an error was swallowed": the failure is
     *  invisible in exactly the way that looks like success. The editor keeps
     *  working, the canvas keeps painting, and the operations pile up in a
     *  queue against a socket that has joined nothing. The user does learn
     *  eventually — the outbox stalls and ConnectionBanner says so — but
     *  minutes later, and phrased as "your work isn't saving" rather than
     *  "you are not in this room". On the creator's path they will have been
     *  drawing into a room the server never created.
     *
     *  `durationMs: null` and a fixed key, like every other notice about a
     *  state rather than an event: it stays until the state changes, and a
     *  reconnect that fails the same way again replaces it instead of
     *  stacking. */
    const reportJoinFailure = (error: JoinDenial, where: string) => {
      console.error(`${where} failed`, error)
      // Clearing the flag is what stops the auto-rejoin from re-asking a
      // settled question on every reconnect — the same thing `handleKicked`
      // does, with the same intent. Which refusals are worth re-asking lives
      // in joinError.ts, next to the other two readings of a reason.
      if (!canRetryJoinLater(error)) hasJoinedRef.current = false
      notifyError(describeJoinError(error, tRef.current), { key: 'join-failed', durationMs: null })
    }

    const handleConnect = () => {
      setConnected(true)
      setEverConnected(true)
      revival.noteConnect()
      // (#298) resendAll deliberately does NOT happen here any more. It used
      // to, and a fresh connection is precisely the moment the socket has
      // joined nothing — so the whole backlog went out against a socket the
      // server would answer `not_joined` for (or, before that reason
      // existed, not answer at all). Each of the join paths below calls it
      // once its own join has actually succeeded.
      if (isCreator && creatorDraft) {
        if (!hasJoinedRef.current) {
          socket.emit(
            'create_room',
            {
              room: creatorDraft.room, password: creatorDraft.password,
              // (#232) On the creation itself, so the room is never open for
              // the length of a second request — see the shared contract.
              accessMode: creatorDraft.accessMode,
              name: myDisplayNameRef.current,
              lastKnownSeq: latestKnownSeqRef.current || undefined,
            },
            result => {
              if (result.ok) {
                hasJoinedRef.current = true
                applyIdentity(result.userId)
                void outboxRef.current.resendAll()
                // Best-effort: room creation already succeeded either way, so
                // a failure here just leaves the room at root level (still
                // visible on MyLessons) rather than blocking anything.
                if (creatorDraft.folderId) {
                  moveRoomToFolder(id, creatorDraft.folderId).catch(err =>
                    console.error('failed to file newly created room into its folder', err))
                }
                // (#232) The allow-list the creator typed on the create form.
                // Sent one at a time through the same endpoint the access
                // panel uses, so normalization, dedup and validation happen in
                // exactly one place. Failing loudly matters here: the room is
                // already `invite_only`, so an invite that didn't land is a
                // student who will be stuck asking to be let in.
                const invites = creatorDraft.invites ?? []
                if (invites.length > 0) {
                  void Promise.allSettled(invites.map(email => addRoomInvite(id, email)))
                    .then(results => {
                      const failed = results.filter(r => r.status === 'rejected').length
                      if (failed > 0) {
                        notifyError(tRef.current('room.invitesFailed', { count: failed }), {
                          key: 'invites-failed', durationMs: null,
                        })
                      }
                    })
                }
              }
              // (#496) The one refusal the server can actually answer here is
              // `server_busy` (#415) — the comment that used to sit here called
              // this practically unreachable and blamed a nanoid collision,
              // which is not something socketHandlers.ts's create_room can
              // return. It is reachable, and it is the worst of the three
              // paths this reports: the creator's `config` comes from
              // navigation state, so the editor renders and paints normally
              // for a room the server declined to create.
              else reportJoinFailure(result.error, 'create_room')
            },
          )
        } else {
          // (#176) Back onto the board this client was on, not the lesson's
          // first: a reconnect must not turn the page.
          socket.emit(
            'join_room',
            {
              roomId: currentBoard(), name: myDisplayNameRef.current, password: creatorDraft.password,
              lastKnownSeq: latestKnownSeqRef.current || undefined,
            },
            result => {
              if (result.ok) { applyIdentity(result.userId); void outboxRef.current.resendAll() }
              else reportJoinFailure(result.error, 'join_room on reconnect')
            },
          )
        }
        return
      }

      // Joiner path: the first connect waits for the join-gate form to submit
      // (see handleJoinSubmit). A later reconnect replays the same
      // credentials automatically so an already-joined user isn't dropped
      // back to the gate.
      if (hasJoinedRef.current && lastJoinAttemptRef.current) {
        socket.emit(
          'join_room',
          { roomId: currentBoard(), ...lastJoinAttemptRef.current, lastKnownSeq: latestKnownSeqRef.current || undefined },
          result => {
            if (result.ok) { applyIdentity(result.userId); void outboxRef.current.resendAll() }
            else reportJoinFailure(result.error, 'join_room on reconnect')
          },
        )
      }
    }

    /** (#176, ADR 014 §4) Turns the page: asks the server to move this socket
     *  onto `next`. The board's `room_state` comes back through
     *  handleRoomState, which is where the engine is actually swapped (see
     *  enterBoard) — nothing here touches content.
     *
     *  Waits for the outbox first, bounded (see Outbox.whenIdle): an operation
     *  on the wire while the socket moves would be recorded against the next
     *  board. The canvas is blocked for the wait — a stroke drawn *during* it
     *  would go out after the move for the same reason.
     *
     *  Idempotent against the board already shown or already asked for, so the
     *  follow logic can call it on every event that could mean "the teacher
     *  moved" without checking first. */
    const switchBoard = async (next: string) => {
      if (!hasJoinedRef.current) return
      if (next === (wantedBoardRef.current ?? boardIdRef.current)) return
      wantedBoardRef.current = next
      setRoomContentReady(false)
      await outboxRef.current.whenIdle(BOARD_SWITCH_DRAIN_MS)
      // Superseded while waiting — by a later turn, or by the server moving
      // us (a deleted board). The later call owns the emit.
      if (wantedBoardRef.current !== next || socket !== socketRef.current) return
      socketBoardRef.current = null
      socket.emit(
        'join_room',
        { roomId: next, ...joinCredentials() },
        result => {
          if (result.ok) { applyIdentity(result.userId); return }
          // Still on the previous board server-side; say so and unblock it.
          if (wantedBoardRef.current === next) {
            wantedBoardRef.current = null
            socketBoardRef.current = boardIdRef.current
            setRoomContentReady(true)
          }
          reportJoinFailure(result.error, 'join_room for a board')
        },
      )
    }
    switchBoardRef.current = next => { void switchBoard(next) }

    /** Turns the page to the teacher's board when this client is following
     *  and not already there — see followTarget. Called after every event
     *  that can move the teacher or change what "following" means. */
    const maybeFollow = () => {
      const s = useRoomStore.getState()
      const target = followTarget({
        // (#595) Also read off the roster, not only the ref: this runs from
        // inside the handler that has just delivered the roster, before any
        // render has refreshed the ref, and a teacher who "followed" would now
        // be sent into the spotlight or a student's board.
        following: s.following, isOwner: isOwnerRef.current || isTeacherIn(s), lessonId: s.lessonId,
        activeBoardId: s.activeBoardId, boardId: s.boardId, wantedBoardId: wantedBoardRef.current,
        spotlightBoardId: s.spotlightBoardId,
        ownAssignmentBoardId: ownBoardIn(s.boards, s.activeAssignmentId, s.userId)?.id ?? null,
      })
      if (target) void switchBoard(target)
    }

    // (#289 §12) Re-requests the room's state from scratch-as-of-what-we-
    // have, the same way a reconnect does, without waiting for (or needing)
    // an actual socket drop — the response arrives as an ordinary
    // `room_state`, which handleRoomState already knows how to fold in.
    // Used when the live confirmed stream turns out to have a gap, i.e. the
    // connection was interrupted at some point without this client noticing.
    const requestFullResync = () => {
      lastConfirmedSeqRef.current = 0 // the stream restarts from this room_state
      // (#429) Everything about the live channel describes what this client
      // painted from a stream it is about to stop trusting: the layers get
      // rebuilt from the log, so any pre-painted ink is gone and any claim
      // against it would make the replayed operations skip dabs that are no
      // longer there. Both sides of the bookkeeping reset together.
      engineRef.current?.resetPeerLiveStrokes()
      streamedStrokeIdsRef.current.clear()
      socket.emit(
        'join_room',
        { roomId: currentBoard(), ...joinCredentials(), lastKnownSeq: latestKnownSeqRef.current || undefined },
        result => {
          if (result.ok) applyIdentity(result.userId)
          else reportJoinFailure(result.error, 'join_room during gap resync')
        },
      )
    }
    // (#346) Published for the paper retry, which lives outside this effect —
    // see requestFullResyncRef's own comment.
    requestFullResyncRef.current = requestFullResync

    const handleRoomState = async ({ room, latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen, lesson }: {
      room: RoomEntity; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
      palette: string[]; frozen: boolean; lesson: LessonState
    }) => {
      const store = useRoomStore.getState()
      // (#176) The social half first, whichever board this is for: the
      // strip, the teacher's board and the lesson's roster (everyone in the
      // lesson, each with their board) are the lesson's and always current.
      store.setLesson(lesson)
      dispatchParticipants({ type: 'room_state', participants: roomParticipants })
      store.setPalette(palette)
      store.setRoomFrozen(frozen)
      const arrivedBoard = room.id
      socketBoardRef.current = arrivedBoard

      if (!firstRoomStateReceivedRef.current) {
        firstRoomStateReceivedRef.current = true
        // (#176) A board id in the URL — a link copied out of a preview
        // request. The lesson is what the address bar should carry (ADR 014
        // §4); `sessionId` deliberately does not follow this replace, so the
        // socket stays. The board itself is kept: it is the one the link
        // meant.
        const enteredByBoardUrl = room.lessonId !== undefined
        if (enteredByBoardUrl && id !== lesson.id) navigateRef.current(`/room/${lesson.id}`, { replace: true })
        // Only a joiner needs this: a creator's config is already known
        // synchronously from navigation state (see creatorDraft/toRoomConfig
        // above) with the exact same fields toLessonConfig would produce
        // here, so writing it a second time says nothing new.
        //
        // It used to be worse than redundant. `config` itself was a dependency
        // of the mount-engine effect, and setRoomInfo always writes a *new*
        // object even when every field is identical (toRoomConfig has no
        // memoization) — which that effect read as "the room changed" and
        // answered by destroying whatever this handler had just restored into
        // the engine, rebuilding it empty. That is why this line is gated
        // rather than unconditional. The gate is no longer what protects the
        // canvas: the effect now depends on the three fields it actually builds
        // from, not on the object (#461, which fixed the same wipe reaching the
        // canvas through setRoomName instead).
        if (!isCreator) store.setRoomInfo(toLessonConfig(room, lesson))
        // (#176) Where to land. The server seats a join on the board it was
        // asked for; the lesson URL asks for the lesson's own first board, and
        // the teacher may well be on another. Ask for that one now and let
        // *its* room_state be the one that builds the engine — this one's
        // content is for a page we are not going to look at.
        const entry = entryBoard({ arrivedBoardId: arrivedBoard, enteredByBoardUrl, lesson })
        store.setFollowing(entry.following)
        if (entry.target !== arrivedBoard && store.boardId === null) {
          wantedBoardRef.current = entry.target
          socketBoardRef.current = null
          socket.emit('join_room', { roomId: entry.target, ...joinCredentials() }, result => {
            if (result.ok) { applyIdentity(result.userId); return }
            // Fall back to the board we were seated on: ask for it again so
            // its content arrives through the ordinary path below.
            reportJoinFailure(result.error, 'join_room for the teacher\'s board')
            wantedBoardRef.current = null
            requestFullResync()
          })
          return
        }
      }

      // (#176) A room_state for a board other than the one the engine holds:
      // the first entry (no board yet), a page turn this client asked for,
      // the server moving us off a deleted board, or a new lesson after an
      // in-place navigation. All of them mean a fresh engine — see enterBoard.
      // One that is neither the board we hold nor the one we asked for is a
      // turn already superseded (two quick turns), and is dropped: the state
      // for the board actually wanted is on its way.
      if (arrivedBoard !== store.boardId) {
        if (wantedBoardRef.current !== null && wantedBoardRef.current !== arrivedBoard) return
        // A board we held but never asked to leave: the server evacuated us
        // off a deleted board. The page the student picked by hand is gone
        // with it, so the pick is void and they follow the teacher again —
        // otherwise they would sit on board one chip-less (the teacher
        // happens to be there too) and silently stay behind on the teacher's
        // next turn.
        const evacuated = wantedBoardRef.current === null && store.boardId !== null
        if (evacuated && !isOwnerRef.current) store.setFollowing(true)
        enterBoard(arrivedBoard, { latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen })
        maybeFollow()
        return
      }
      wantedBoardRef.current = null

      // What this socket already had *before* this room_state's own tail —
      // the reconnect fast-path check below needs this, not the value after
      // folding tailOperations' seqs in just below.
      const alreadyHadSeq = latestKnownSeqRef.current
      // Bulk catch-up (join/reconnect), not a live single operation — doesn't
      // trigger snapshotUploader here even if it spans a checkpoint
      // boundary. Any client live at the moment a boundary was actually
      // crossed already baked it (see onLocalOperation/handleOperationConfirmed
      // below); this client wasn't present for it, and doesn't need to
      // retroactively contribute a bake for history it's only now replaying.
      for (const op of tailOperations) latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, op.seq ?? 0)
      // A reconnect while following: the teacher may have moved meanwhile.
      maybeFollow()

      // (#176) The one board whose room_state can arrive with its engine
      // already standing: the creator's own, seated synchronously from
      // navigation state. Every other board is entered through enterBoard
      // above, so past this point a same-board room_state is a reconnect.
      if (awaitingSeededBoardStateRef.current) {
        awaitingSeededBoardStateRef.current = false
        if (!engineRef.current) {
          // Real first join: this is how we learn paper/canvas size — the
          // engine doesn't exist yet to apply `tailOperations` to, so stash
          // them for the mount-engine effect to replay once it does.
          pendingSnapshotRef.current = { latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen }
          return
        }
        // The creator's one legitimate first room_state — arrives *after*
        // the mount-engine effect already ran, since a creator's `config` is
        // known synchronously from navigation state (see the `useState`
        // seeding `room` near this component's top), well before any socket
        // round-trip. Used to be misclassified as a reconnect here (the old
        // check was `!useRoomStore.getState().room`, which that same
        // synchronous seeding already makes truthy for the creator) —
        // needlessly re-locked roomContentReady (setRoomContentReady(false)
        // below) right after the mount effect had already marked it ready,
        // producing a visible "loads fine, then the preloader flashes on
        // for no reason" — reported after #185 made this window visible for
        // the first time (previously silent, just pointer-events:none).
        //
        // That "nothing to restore" assumption only holds for a genuinely
        // brand-new room, though — this exact same branch (fresh refs +
        // engine already mounted) is also what the *creator's own tab
        // reloading an already-drawn-on room* looks like, and there
        // `tailOperations`/`latestSnapshotSeq` are not empty at all. The old
        // code never checked, so a creator's reload silently produced a
        // blank canvas with no restore and no preloader — as if a brand-new
        // room had just been created — dropping whatever was drawn before
        // the reload (still safe on the server/Postgres side, just never
        // fetched back). Tell the two apart by the payload itself: only
        // take the early-return shortcut when there's truly nothing to
        // restore; otherwise fall through into the exact same restore-from-
        // snapshot/replay-tail logic below a real reconnect uses — this
        // engine instance is just as freshly empty as a reconnecting
        // client's would be.
        if (tailOperations.length === 0 && latestSnapshotSeq === null) {
          dispatchParticipants({ type: 'room_state', participants: roomParticipants })
          useRoomStore.getState().setPalette(palette)
          useRoomStore.getState().setRoomFrozen(frozen)
          // The genuinely-new-room case: roomContentReady now starts
          // `false` for every creator (see its own doc comment), and
          // nothing else sets it for this branch — a real new room has
          // nothing to restore, so it's ready the instant that's confirmed.
          //
          // "Nothing to restore" is not the same as "nothing to wait for",
          // though: the paper texture is a hard prerequisite for drawing at
          // all (the engine drops any stroke that starts before it has
          // loaded — see _paperTexLoaded), so this awaits it exactly like
          // every other exit from this handler does. Without the await, a
          // freshly created room dismissed its own preloader mid-download —
          // visibly, since #345 put a real progress bar on it — and opened
          // onto a canvas with no paper on it that quietly ignored the
          // pencil until the remaining ~4 MB landed.
          if (!(await awaitPaper(engineRef.current))) return
          // (#462) A room with no history to replay is caught up the moment
          // that is confirmed — this is the one branch where an empty store is
          // the room rather than a stand-in for it, so the creator's own first
          // checkpoint still bakes normally.
          markJoinRestoreDone()
          setRoomContentReady(true)
          return
        }
      }
      // See the mount-engine effect's own comment on engine.paperReady() —
      // same reasoning applies to a reconnect's full-history replay. A
      // no-op await in the overwhelmingly common case (paper long since
      // loaded by the time a reconnect happens).
      const engine = engineRef.current
      setRoomContentReady(false)
      // (#462) Re-closed for the length of this catch-up, not just on a first
      // join — see snapshotGate.ts's restoreStarted.
      snapshotGateRef.current.restoreStarted()
      // (#533) A previous catch-up's verdict says nothing about this one, and
      // a stale `true` would put the failure screen over the next reconnect
      // blip of a room that is fine. Cleared here rather than only in
      // retryRestore, because an ordinary reconnect is just as much a second
      // attempt as a pressed button is.
      setRestoreFailure(null)
      // (#346) Outside the try/finally below, for the same reason as the mount
      // effect's own site: a paper failure must leave the room closed and
      // explained, not opened and mute.
      if (!(await awaitPaper(engine))) return
      // (#533) Read by this catch-up's own `finally` — see the first-join
      // path's flag of the same name.
      // (#493) Shared with the engine's mount effect — see restoreRoomState.
      // The open is not being timed any more, hence the no-op finisher: a
      // real one here would also be a new dependency of this effect, and
      // this effect's dependencies are what tear the socket down.
      await restoreRoomState(engine, {
        latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen,
      }, { mode: 'catchup', alreadyHadSeq }, {
        boardId: arrivedBoard,
        restoreFromSnapshot, backfillHistory, applyRemoteOp, syncFromLogNow, markJoinRestoreDone,
        dispatchParticipants, setRestoreFailure, setRoomContentReady,
        finishOpenTimer: () => {},
        notifyReplayIncomplete: () => notifyError(tRef.current('room.replayIncomplete'), {
          key: 'replay-incomplete', durationMs: null,
        }),
        // Through the ref, and read when the bootstrap needs it: the uploader
        // is per board, and this effect does not re-run when the board does.
        getSnapshotUploader: () => snapshotUploaderRef.current,
        latestKnownSeqRef, replayIncompleteRef, pendingPreviewsRef, openTimerRef,
      })
    }

    // (#493) Out of line — see confirmedStream.ts.
    const handleOperationConfirmed = createConfirmedStreamHandler({
      engineRef, lastConfirmedSeqRef, latestKnownSeqRef, appliedOpIdsRef, pendingPreviewsRef,
      catchingUpRef, streamedStrokeIdsRef, deferredOpsQueueRef, previewScheduleRef,
      noteLayerSeq, markLayerActive, applyRemoteOp, syncFromLog, checkSnapshotBoundary, requestFullResync,
    })

    // (#152) peer_cursor itself is no longer handled here at all — Room had
    // nothing to do with it beyond forwarding into Room-level state (which
    // is exactly what re-rendered this whole ~1600-line component up to
    // ~30Hz per moving peer). PeerCursors now subscribes directly (see its
    // own component) — position updates never reach Room's render tree.

    const handleDisconnect = (reason: string) => {
      setConnected(false)
      revival.noteDisconnect(reason)
    }

    // (#504) Раньше не слушался вовсе, а это половина проблемы: отказ в
    // хендшейке (серверный `io.use()` не смог резолвить личность — например,
    // новый контейнер уже принимает сокеты, а Prisma ещё не отвечает) socket.io
    // считает окончательным и больше не пытается.
    // (#587) Кроме одного отказа, который окончателен по-настоящему: бан.
    // Оживлять такой сокет — значит стучаться в сервер раз в пять секунд до
    // закрытия вкладки; вместо этого всё приложение уходит на экран бана.
    const handleConnectError = (err: Error) => {
      if (err.message === BANNED_ERROR_CODE) {
        noteBanned()
        return
      }
      revival.noteConnectError()
    }

    // (#493) Three domains out of line, as handler factories — see
    // peerEvents.ts, boardEvents.ts and roomControlEvents.ts. The `socket.on` table below
    // still lists every event this page answers.
    const peer = createPeerEventHandlers({
      engineRef, roomContentReadyRef, streamedStrokeIdsRef, pendingPreviewsRef,
      markActive, markLayerActive, forgetDrawingActivity,
      applyRemoteOp, syncFromLog, checkSnapshotBoundary, requestFullResync,
    })
    const board = createBoardEventHandlers({
      maybeFollow, wantedBoardRef, socketBoardRef, boardIdRef, setRoomContentReady, isOwnerRef,
    })
    const control = createRoomControlEventHandlers({
      sessionId: id, queryClient, hasJoinedRef, retryJoinRef, setJoinState, tRef,
    })

    socket.on('lesson_state',               board.lesson_state)
    socket.on('participant_hand_changed',   board.participant_hand_changed)
    socket.on('board_thumbnail_updated',    board.board_thumbnail_updated)
    socket.on('peer_board_changed',         board.peer_board_changed)
    socket.on('active_board_changed',       board.active_board_changed)
    socket.on('board_created',              board.board_created)
    socket.on('board_renamed',              board.board_renamed)
    socket.on('boards_reordered',           board.boards_reordered)
    socket.on('board_deleted',              board.board_deleted)
    socket.on('connect',                    handleConnect)
    socket.on('room_state',                 handleRoomState)
    socket.on('operation_confirmed',        handleOperationConfirmed)
    socket.on('peer_joined',                peer.peer_joined)
    socket.on('peer_left',                  peer.peer_left)
    socket.on('peer_stroke_live',           peer.peer_stroke_live)
    socket.on('peer_stroke_live_end',       peer.peer_stroke_live_end)
    socket.on('palette_updated',            control.palette_updated)
    socket.on('room_frozen_changed',        control.room_frozen_changed)
    socket.on('room_tools_changed',         control.room_tools_changed)
    socket.on('room_closed_changed',        control.room_closed_changed)
    socket.on('participant_frozen_changed', control.participant_frozen_changed)
    socket.on('join_request_created',       control.join_request_created)
    socket.on('join_request_resolved',      control.join_request_resolved)
    socket.on('kicked',                     control.kicked)
    socket.on('disconnect',                 handleDisconnect)
    socket.on('connect_error',              handleConnectError)

    return () => {
      // Раньше `socket.disconnect()`: иначе запланированная попытка заведёт
      // сокет комнаты, которую уже покинули.
      revival.cancel()
      socket.disconnect()
      socketRef.current = null
      requestFullResyncRef.current = null
      switchBoardRef.current = null
      socketBoardRef.current = null
      wantedBoardRef.current = null
    }
  }, [
    sessionId, isCreator, creatorDraft, syncFromLog, applyRemoteOp, applyIdentity, checkSnapshotBoundary, markJoinRestoreDone,
    restoreFromSnapshot, backfillHistory, drainDeferredQueue, dispatchParticipants, noteLayerSeq,
    syncFromLogNow, enterBoard,
    // (#429) Used by the live-stroke handler, markLayerActive too. Both are
    // useCallback with no dependencies (see their definitions), so they are
    // stable for this component's lifetime and can never tear the socket
    // down and rebuild it.
    markActive, markLayerActive,
    forgetDrawingActivity,
    awaitPaper,
    // Stable for the app's lifetime (one QueryClient, created outside React —
    // see lib/queryClient.ts), so listing it here can never tear the socket
    // down and rebuild it.
    queryClient,
    // (#176) Deliberately absent: `outbox` and `snapshotUploader` (per board,
    // read through refs), `navigate` (changes with the URL this effect itself
    // rewrites) and `boardId` (a page turn is not a new socket).
  ])

  // Submits the join gate (joiner path only): connects/join_room's with the
  // entered name + optional password. Kept separate from the socket-wiring
  // effect above so it can run any time after the socket exists, in response
  // to a user action rather than a connection lifecycle event.
  const attemptJoin = useCallback((name: string, password: string | undefined) => {
    if (!id) return

    setJoinError(null)
    setJoinSubmitting(true)
    // (#487) Отсюда, а не с отправки в сокет: замеряем ожидание человека.
    startOpenTimer()
    lastJoinAttemptRef.current = { name, password }
    socketRef.current?.emit(
      'join_room',
      { roomId: id, name, password, lastKnownSeq: latestKnownSeqRef.current || undefined },
      result => {
        setJoinSubmitting(false)
        if (!result.ok) {
          // (#513) A `wrong_password` for an attempt that carried no password
          // is not a wrong guess — it is the only way this client can learn
          // the room has a password at all, since nothing about a room is
          // readable before joining it. So it opens the field instead of
          // accusing the reader of mistyping something they never typed.
          // `joinError` was cleared at the top of this call, so what they see
          // is the field and the note explaining it, and nothing red.
          if (result.error === 'wrong_password' && password === undefined) {
            setJoinPasswordAsked(true)
            setJoinState('form')
            return
          }
          // (#231) Some refusals are screens, not errors under the form —
          // see joinGateStateFor for which and why.
          const state = joinGateStateFor(result.error)
          if (state) { setJoinState(state); return }
          setJoinState('form')
          setJoinError(describeJoinError(result.error, t))
          return
        }
        hasJoinedRef.current = true
        applyIdentity(result.userId)
        // (#298) Only now may the outbox drain — see its canSend gate.
        void outbox.resendAll()
        // room_state (already wired above) populates `config` from here, which
        // unmounts the gate in favor of the editor.
      },
    )
  }, [id, applyIdentity, outbox, t, startOpenTimer])

  // Submits the join gate's form. The name is validated here rather than in
  // `attemptJoin`, which is also called with credentials already known good
  // (a retry after approval — see joinRequestResolvedRef).
  const handleJoinSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = joinName.trim()
    if (!trimmed) { setJoinError(t('join.error.nameRequired')); return }
    // (#513) Only once the field is up. Before that an empty password is the
    // normal case and submitting without one is precisely how we ask; after
    // it, sending nothing again would come back as the same silent refusal
    // and look like the button did nothing.
    if (joinPasswordAsked && !joinPassword) { setJoinError(t('join.error.passwordRequired')); return }
    attemptJoin(trimmed, joinPassword || undefined)
  }, [joinName, joinPassword, joinPasswordAsked, attemptJoin, t])

  /** (#231) Asks again with whatever was entered last — from the "ask again"
   *  button after a denial, from "try again" once signed in elsewhere, and
   *  automatically when the owner approves. */
  const retryJoin = useCallback(() => {
    const last = lastJoinAttemptRef.current
    const name = last?.name ?? joinName.trim()
    if (!name) { setJoinState('form'); return }
    attemptJoin(name, last?.password)
  }, [joinName, attemptJoin])

  // Read by the socket effect's `join_request_resolved` listener, which is
  // registered once per connection and must not re-subscribe every time this
  // callback's identity changes (its effect rebuilds the whole socket).
  const retryJoinRef = useRef(retryJoin)
  retryJoinRef.current = retryJoin

  // Same reason as `retryJoinRef`: `t` changes identity when the reader
  // switches language, and listing it as a dependency of the socket effect
  // would tear the connection down and rebuild it on a language switch.
  const tRef = useRef(t)
  tRef.current = t

  // ── keyboard shortcuts (#174: bindings come from the `hotkeys` registry
  // loaded above, not hardcoded here — see lib/hotkeys.ts) ─────────────────
  // (#493) The routing, and the precedence it encodes, is editorHotkeys.ts.
  useEditorHotkeys({
    tool, drawingTool, hotkeys,
    isTransformOpen: () => transformSessionRef.current !== null,
    transformAvailable: transformActive || transformTargetIds.length > 0,
    commitTransform: () => commitTransformSessionRef.current(true),
    resetTransform: () => resetTransformSessionRef.current(),
    commitShape: () => shapeRef.current.commit(),
    cancelShape: () => shapeRef.current.cancel(),
    finishSelection,
    cancelLasso: () => { setPendingSelection(null); setSelectionCursor(null) },
    clearSelection: () => setSelection(null),
    copySelection: () => { void copySelection() },
    cutSelection: () => { void cutSelection() },
    pasteClipboard: () => { void pasteClipboard() },
    deleteSelectionContents,
    undo: () => { void handleUndo() },
    redo: () => { void handleRedo() },
    zoomBy, resetZoom,
    rotateView: radians => setVp(v => ({ ...v, angle: radians === null ? 0 : v.angle + radians })),
    toggleTool, setTool, setToolSetting,
  })

  // ── Space = hold to pan (#319, ADR 007 §4) ────────────────────────────────
  useSpaceToPan()

  // ── callbacks ─────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────

  if (!config) {
    // Creator's config is known synchronously (see the `config` initializer
    // above), so reaching here with `isCreator` true would mean navigation
    // state was lost — nothing sensible to render but not this component's
    // job to redirect (CreateRoom already sent us here deliberately).
    if (isCreator) return null
    return (
      <JoinGate
        roomName={null}
        state={joinState}
        name={joinName}
        onNameChange={setJoinName}
        password={joinPassword}
        onPasswordChange={setJoinPassword}
        passwordAsked={joinPasswordAsked}
        error={joinError}
        submitting={joinSubmitting}
        onSubmit={handleJoinSubmit}
        onRetry={retryJoin}
        // Back to this room after signing in — the link they arrived with is
        // the only thing they have, and the lesson list would not contain it.
        returnTo={`/room/${id ?? ''}`}
      />
    )
  }


  return (
    <div
      ref={editorRef}
      className={styles.editor}
      // #102: on a pen+touch tablet, a hand resting on the screen while
      // slowly dragging a slider/stroke can be read by the OS as "press and
      // hold" and synthesized into a right click — with nothing here
      // calling preventDefault(), that surfaces the browser's native
      // context menu (save/share/print) over the whole editor. Nothing in
      // this page uses a real contextmenu, so suppressing it outright is
      // safe; scoped to the editor root rather than `document` so it never
      // touches other pages (e.g. CreateRoom).
      onContextMenu={e => e.preventDefault()}
    >

      {/* ── Header ── (#493: RoomHeader) */}
      <RoomHeader
        engineRef={engineRef} lessonId={lessonId} isOwner={isOwner}
        uiHidden={uiHidden} narrowHeader={narrowHeader} compact={compact}
        leaveRoom={leaveRoom} connected={connected} pending={outboxState.pending}
        angleDeg={angleDeg} onAngleDragDown={onAngleDragDown} setVp={setVp}
        zoomPercent={zoomPercent} onZoomDragDown={onZoomDragDown} resetZoom={resetZoom} fitCanvas={fitCanvas}
        handleUndo={() => { void handleUndo() }} handleRedo={() => { void handleRedo() }}
        toggleAnnotationMode={toggleAnnotationMode}
        handleAnnotationPeekDown={handleAnnotationPeekDown} handleAnnotationPeekUp={handleAnnotationPeekUp}
        handleAnnotationsToggle={handleAnnotationsToggle}
        stripAvailable={stripAvailable} boardsOpen={boardsOpen} setBoardsOpen={setBoardsOpen}
        knownLessonId={knownLessonId} myHandRaised={myHandRaised} setHandRaised={setHandRaised}
        tapToHideEnabled={tapToHideEnabled} toggleUI={toggleUI} setSettingsOpen={setSettingsOpen}
      />

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

      {/* (#230) roomId/isOwner are what the Access tab needs; the panel shows
          it only when both are present. */}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          roomId={lessonId}
          isOwner={isOwner}
          enabledTools={enabledTools}
          onEnabledToolsChange={setRoomTools}
          classVisibility={classVisibility}
          onClassVisibilityChange={setClassVisibility}
        />
      )}

      <div className={styles.body}>

        {/* ── Left toolbar — tool selection only, fixed height per row ── */}
        {/* (#512) The two rails — tool buttons and the active tool's quick
            settings — are two side-by-side columns everywhere else, which is
            what keeps the buttons from reflowing when the field count changes
            between tools. On a phone that costs a third of the screen width
            for two nearly empty columns, so the wrapper stacks them into one
            instead. Everywhere else it is `display: contents` and changes
            nothing at all: both bars keep their own absolute positioning. */}
        <div className={clsx(
          styles.toolRail,
          compact && styles.toolRailCompact,
          // (#512) The wrapper carries the rail's surface in the compact shell,
          // so minimal UI has to fade *it* — fading only the two bars inside
          // left their background behind as a blank column over the drawing.
          compact && uiHidden && styles.uiHidden,
        )}>
        {/* (#493) The rail itself — see ToolRail. */}
        <ToolRail
          uiHidden={uiHidden} annotationRail={annotationRail} compact={compact}
          toolOffered={toolOffered} selectTool={selectTool}
          railWellRef={railWellRef} well={well} wellLabel={wellLabel}
          colorExpanded={colorFlyoutAt === 'rail'} openRailColorSurface={openRailColorSurface}
          drawingGroupTool={drawingGroupTool} drawingGroupOptions={drawingGroupOptions}
          drawingGroupActive={drawingGroupActive} gradeHotkeyLabels={gradeHotkeyLabels}
          shapeKind={shapeKind} shapeKindOptions={shapeKindOptions}
          hasTransformTargets={transformTargetIds.length > 0}
          clearAllAnnotations={clearAllAnnotations}
        />

        {/* ── Quick-settings panel — the active tool's quick-access fields
            (#196), driven entirely by TOOL_SCHEMAS. Kept as its own
            same-width column next to the toolbar rather than interleaved
            with the tool-select buttons above: interleaving made the
            buttons visually jump every time the field count changed
            switching tools (pencil: grade+size+opacity+color, eraser:
            size+opacity only) — a fixed button column plus a separately
            reflowing settings column reads far more stable.

            (#471) Alone among the chrome, this column survives minimal UI:
            .quickSettingsBarMinimal moves it into the corner the header and
            toolbar just vacated instead of .uiHidden fading it out. The
            reasoning lives on that CSS rule. */}
        {/* (#512) In the compact shell minimal UI hides this too, where
            everywhere else it *moves* it into the corner the chrome vacated
            (#471). The exception earned its keep on a tablet, where the quick
            settings are the one thing worth keeping within reach while drawing.
            On a phone the whole point of minimal UI is the screen, and a rail
            that stays is the largest thing still on it. */}
        <aside className={clsx(
          styles.quickSettingsBar,
          uiHidden && (compact ? styles.uiHidden : styles.quickSettingsBarMinimal),
          styles.strokeBlockable,
        )}>
          {Object.entries(TOOL_SCHEMAS[settingsToolId])
            .filter(([, descriptor]) => descriptor.quickAccess)
            // (#542) No colour in this column at all any more — every colour a
            // tool carries is drawn by the pinned well in the rail to the left.
            // Filtered here rather than by clearing `quickAccess` in ten
            // schemas: the flag says "this is a field a hand reaches for
            // mid-gesture", which is still true of colour, and a schema that
            // denied it to make one layout come out right would be lying to
            // every other reader of it.
            .filter(([, descriptor]) => descriptor.valueType.kind !== 'color')
            .filter(([, descriptor]) => !descriptor.visibleWhen || descriptor.visibleWhen(toolSettings[settingsToolId]))
            .map(([key, descriptor]) => (
              <SettingField
                key={key}
                descriptor={descriptor}
                value={toolSettings[settingsToolId][key]}
                onChange={v => setToolSetting(settingsToolId, key, v)}
                layout="toolbar"
              />
            ))}
          {/* (#530) The numbers behind the drag, and only while a shape is
              open: they edit *this* shape, not the tool. For a frame around a
              thumbnail sketch this is arguably more of the tool than the drag
              is — an exact size cannot be set with a pen. The ratio presets
              live in the full settings panel instead (Ilya, 05.09): the rail is
              for what a hand reaches for mid-gesture. */}
          {shapeFrame && <ShapeFrameFields frame={shapeFrame} onChange={shape.setFrame} />}
          {/* (#446) What can be done with a selection, as buttons rather than
              only as Ctrl+C/X/V. A tablet is a first-class target here and has
              no modifier keys at all: without these, cut/copy/paste — the half
              of this feature Ilya actually asked for — would exist only for
              people with a keyboard.

              In the quick column rather than floating over the canvas: it is
              already the place the selected tool's own controls appear, it
              never covers the drawing, and it needs no placement logic of its
              own. Each button is disabled exactly when its action would do
              nothing, so the row also answers "is anything selected" and "is
              there anything to paste" without a word of text. */}
          {selectionActive && (
            <div className={styles.selectionActions}>
              <button
                className={styles.toolIconBtn}
                title={t('selection.copy')}
                aria-label={t('selection.copy')}
                disabled={!selection || !paintTargetId}
                onClick={() => { void copySelection() }}
              ><Icon name="content_copy" /></button>
              <button
                className={styles.toolIconBtn}
                title={t('selection.cut')}
                aria-label={t('selection.cut')}
                disabled={!selection || !paintTargetId || paintTargetLocked}
                onClick={() => { void cutSelection() }}
              ><Icon name="content_cut" /></button>
              <button
                className={styles.toolIconBtn}
                title={t('selection.paste')}
                aria-label={t('selection.paste')}
                disabled={!clipboardMeta || !paintTargetId || paintTargetLocked}
                onClick={() => { void pasteClipboard() }}
              ><Icon name="content_paste" /></button>
              <button
                className={styles.toolIconBtn}
                title={t('selection.delete')}
                aria-label={t('selection.delete')}
                disabled={!selection || !paintTargetId || paintTargetLocked}
                onClick={deleteSelectionContents}
              ><Icon name="delete" /></button>
              <button
                className={styles.toolIconBtn}
                title={t('selection.clear')}
                aria-label={t('selection.clear')}
                disabled={!selection}
                onClick={() => setSelection(null)}
              ><Icon name="deselect" /></button>
            </div>
          )}
        </aside>
        </div>

        {/* ── Viewport ── */}
        {/* (#319) The grab cursor lives on .viewport rather than the canvas
            because the canvas is inert while the hand is on — a cursor set on
            an element that isn't hit-testable never shows. */}
        <div ref={setVpNode} className={clsx(styles.viewport, VIEWPORT_CURSOR_CLASS[cursor.viewportCursor])}>
          <div
            className={styles.canvasWrap}
            /* (#470) No CSS transform any more: the camera moves the view
               inside the engine, for both kinds of room. */
          >
            <canvas
              ref={canvasRef}
              // Infinite canvas (#133 Phase 1): no fixed backing-buffer size
              // to set here — the ResizeObserver effect above drives it via
              // engine.resizeCanvas() to track the viewport container's own
              // size instead, and the CSS size simply fills that container.
              // No fixed backing-buffer size to set here — the ResizeObserver
              // effect above drives it via engine.resizeCanvas() to track the
              // viewport container's own size, and the CSS size fills it.
              width={undefined}
              height={undefined}
              className={styles.canvas}
              // (#169 bug fix) pointerEvents 'none' while the initial
              // content restore is still in flight — see roomContentReady's
              // own doc comment. PointerInput binds pointerdown/move/up
              // directly on this element, so this fully blocks drawing
              // input (nothing to un-wire/re-wire in the engine itself).
              // (#254 epic, #222) editingBlocked gates it the same way —
              // the server would reject the resulting operation anyway
              // (#256/#257, #222), so this keeps anyone from drawing into
              // the void (see FrozenBanner/ClosedBanner for the visible
              // explanation of *why* input stopped responding).
              // (#319) The hand tool rides the same mechanism: with the
              // canvas inert, a press lands on .canvasWrap and bubbles to
              // .viewport's own drag handlers, so the view moves and nothing
              // paints — no second "is the hand on?" check inside the engine's
              // pointer path, which is where the two would drift apart.
              style={{
                width: '100%', height: '100%',
                pointerEvents: (roomContentReady && !editingBlocked && !handActive && !shapeActive) ? undefined : 'none',
              }}
            />
            {/* (#470) The transform moved here, off the canvas.
                These overlays work in canvas-pixel space and used to inherit
                pan/zoom/rotate for free from canvasWrap's own CSS transform.
                The canvas is not transformed any more — the camera moves the
                view inside the engine — but the overlays still want exactly
                that transform, and it is still exactly right for them: the
                string is unchanged, it simply applies to a layer that holds
                only overlays now.
                It also keeps the ref, so useViewport's per-event imperative
                write (updateVp) still lands on a real element and gestures
                stay as smooth as they were — writing it to the canvas wrapper
                would silently put the old CSS pan back on the canvas and
                double every movement. */}
            <div
              ref={canvasWrapRef}
              className={styles.worldOverlayWrap}
              style={{ transform: canvasTransform }}
            >
            {!config.infinite && (
              <PeerCursors
                key={boardId ?? ''}
                socket={socketRef.current}
                participants={participants}
                zoom={vp.zoom}
                angle={vp.angle}
              />
            )}
            {/* (#393) Mounted exactly while the cursor controller says a dab
                preview belongs on screen — with the hand on, or with any of
                the four non-painting tools selected, nothing is going to be
                painted, and a ring that keeps following the pointer reads as
                if it still would. (#405) `drawingTool` is what it draws: the
                controller has already established that this is the tool in
                hand, and `tool` is not narrowed to a ToolType. */}
            {!config.infinite && cursor.dabPreview && (
              <BrushCursor
                vpRef={vpRef}
                tool={drawingTool}
                presetName={cursorPresetName}
                baseSize={sizePx}
                vp={vp}
                config={config}
                nibAngleRadians={nibCanvasAngleRadians}
                nibAnchor={nibAnchor}
                tiltResponse={tiltResponse}
              />
            )}
            {!config.infinite && gridVisible && <GridOverlay width={config.width} height={config.height} />}
            {/* (#405, #445) On screen while the ruler is in hand, and under
                every other tool too once it is locked — a straight edge you
                can draw against is the point of one, but only while you asked
                for it. It carries no pointer handlers at all; dragging it is
                the catcher's job, and the catcher only exists while the ruler
                is the selected tool. */}
            {!config.infinite && rulerVisible && rulerLine && (
              <RulerOverlay a={rulerLine.a} b={rulerLine.b} zoom={vp.zoom} angle={vp.angle} showDistance={rulerMeasuring} />
            )}
            {/* (#530) The shape's own handles are the transform gizmo's: same
                component, same hit areas, same rotate zones. Only what a drag
                *means* differs — a shape has no pixels yet, so a handle edits
                the frame it will be drawn from (see shapeTool.ts). */}
            {!config.infinite && shapeFrame && (
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
                onHandleDown={shape.onHandleDown}
                onCenterDown={e => shape.onHandleDown('body', e)}
                onCenterDoubleClick={() => {}}
              />
              </div>
            )}
            {!config.infinite && transformActive && transformBounds && (
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
                onHandleDown={handleTransformHandleDown}
                onCenterDown={handleTransformCenterDown}
                onCenterDoubleClick={handleTransformCenterReset}
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
            {!config.infinite && (
              <AnnotationOverlay
                annotations={annotations}
                hidden={annotationsHidden}
                draft={annotationDraft}
                onDraftChange={setAnnotationDraftText}
                onDraftCommit={commitAnnotationDraft}
                onDraftCancel={cancelAnnotationDraft}
                liveInk={liveInk}
                collapsedIds={collapsedAnnotationIds}
                erasingIds={erasingIds}
                dragPreview={pinDrag}
                zoom={vp.zoom}
                angle={vp.angle}
                hitTargets={annotationHitTargets}
                layerRef={annotationLayerRef}
                draftInputRef={annotationDraftInputRef}
              />
            )}
            </div>
          </div>
          {/* Infinite rooms (#143): the same five overlays, camera-aware —
              there's no canvasWrap CSS transform here for them to ride
              along with "for free" (content is redrawn under a camera
              instead of the DOM element being panned), so this wrapper
              applies the equivalent transform itself (cameraTransformCss —
              see its own doc comment for why it's a *separate* sibling of
              <canvas>, never applied to canvasWrap/canvas directly) and
              every point fed to the overlays below is genuine world-space
              (see the drag handlers above, all switched to
              clientToRoomPoint) — the same coordinate convention
              getContentBounds/Dab.x,y already use for infinite rooms, so
              e.g. TransformGizmo's bounds line up with the actual painted
              content, not an arbitrary placeholder space. Rendered as a
              sibling of canvasWrap (not inside it) purely for clarity —
              canvasWrap carries no transform in infinite mode anyway (see
              above), so nesting wouldn't change anything either way. */}
          {config.infinite && (
            <div className={styles.worldOverlayWrap} style={{ transform: cameraTransformCss(vp) }}>
              <PeerCursors
                key={boardId ?? ''}
                socket={socketRef.current}
                participants={participants}
                zoom={vp.zoom}
                angle={vp.angle}
              />
              {cursor.dabPreview && (
                <BrushCursor
                  vpRef={vpRef}
                  tool={drawingTool}
                  presetName={cursorPresetName}
                  baseSize={sizePx}
                  vp={vp}
                  config={config}
                  nibAngleRadians={nibCanvasAngleRadians}
                  nibAnchor={nibAnchor}
                  tiltResponse={tiltResponse}
                />
              )}
              {gridVisible && (
                <InfiniteGridOverlay
                  vp={vp}
                  viewportWidth={vpRef.current?.clientWidth ?? 0}
                  viewportHeight={vpRef.current?.clientHeight ?? 0}
                />
              )}
              {rulerVisible && rulerLine && (
                <RulerOverlay a={rulerLine.a} b={rulerLine.b} zoom={vp.zoom} angle={vp.angle} showDistance={rulerMeasuring} />
              )}
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
                  onHandleDown={shape.onHandleDown}
                  onCenterDown={e => shape.onHandleDown('body', e)}
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
                  onHandleDown={handleTransformHandleDown}
                  onCenterDown={handleTransformCenterDown}
                  onCenterDoubleClick={handleTransformCenterReset}
                />
              )}
              <SelectionOverlay
                selection={selection}
                pending={pendingSelection}
                pendingClosed={selectionShapeKind === 'rectangle'}
                cursor={selectionCursor}
                zoom={vp.zoom}
                matrix={areaSelection ? transformSessionMatrix : null}
              />
              <AnnotationOverlay
                annotations={annotations}
                hidden={annotationsHidden}
                draft={annotationDraft}
                onDraftChange={setAnnotationDraftText}
                onDraftCommit={commitAnnotationDraft}
                onDraftCancel={cancelAnnotationDraft}
                liveInk={liveInk}
                collapsedIds={collapsedAnnotationIds}
                erasingIds={erasingIds}
                dragPreview={pinDrag}
                zoom={vp.zoom}
                angle={vp.angle}
                hitTargets={annotationHitTargets}
                layerRef={annotationLayerRef}
                draftInputRef={annotationDraftInputRef}
              />
            </div>
          )}
          {/* (#405) One catcher for the two tools whose gesture is a press on
              the canvas itself. The ruler's is armed for as long as the tool is
              selected — laying a new line and grabbing the existing one are the
              same surface now, told apart per press by rulerGestureAt — where
              it used to disappear the moment a line existed. (#445) That is
              also exactly when the ruler is on screen, so nothing invisible is
              ever grabbable: off screen means inert, the same rule that keeps
              it from snapping. */}
          {eyedropperActive && (
            <div className={styles.canvasCatcher} onPointerDown={handleEyedropperPick} />
          )}
          {/* (#453) A tap, like the eyedropper's. `pointerEvents: none` while a
              fill is running is what refuses the second tap, and it refuses it
              at the surface rather than inside the handler so the cursor says
              so too. */}
          {fillActive && (
            <div
              className={styles.canvasCatcher}
              style={fillBusy ? { cursor: 'progress' } : undefined}
              onPointerDown={handleFillTap}
            />
          )}
          {rulerActive && (
            <div
              className={styles.canvasCatcher}
              onPointerDown={handleRulerDown}
              onPointerMove={handleRulerHover}
              onPointerEnter={() => { rulerRectRef.current = null }}
            />
          )}
          {/* (#446) Same pattern: mounted only while the selection tool is in
              hand, so a selection left on screen under the pencil is an
              outline and nothing more. */}
          {selectionActive && (
            <div
              className={styles.canvasCatcher}
              onPointerDown={handleSelectionDown}
              onPointerMove={handleSelectionHover}
              onDoubleClick={handleSelectionDoubleClick}
              onPointerEnter={() => { selectionRectRef.current = null }}
            />
          )}
          {/* (#509/#510) The same pattern once more, and the same rule: the
              catcher exists exactly while its tool is in hand, so annotations
              left on screen under the pencil are marks and nothing more.

              Ordered under the overlay in the DOM but above it in effect —
              a press on an editable note hits the note's own handler first
              (it stops propagation), and everything that misses one lands
              here and starts a new one. */}
          {annotateTextActive && (
            <div
              ref={annotationTextCatcherRef}
              className={styles.canvasCatcher}
              style={annotationHover ? { cursor: 'pointer' } : undefined}
              onPointerDown={handleAnnotationTextTap}
              onPointerMove={handleAnnotationHover}
              onPointerLeave={() => setAnnotationHover(false)}
            />
          )}
          {annotatePenActive && (
            <div className={styles.canvasCatcher} onPointerDown={handleAnnotationPenDown} />
          )}
          {annotateEraserActive && (
            <div
              className={styles.canvasCatcher}
              style={annotationHover ? { cursor: 'pointer' } : undefined}
              onPointerDown={handleAnnotationEraseDown}
              onPointerMove={handleAnnotationHover}
              onPointerLeave={() => setAnnotationHover(false)}
            />
          )}
        </div>

        {/* (#343) Derived notices — each one visible exactly while its own
            condition holds, so the condition is the whole lifetime and
            there is nothing to dismiss or time out. Stacked as siblings in
            a flex column instead of each guessing at the others' height.

            (#364) Siblings of `.viewport`, not children of it. `.viewport` is
            a positioned element with a z-index, i.e. a stacking context, so a
            column inside it could not paint above the header or the side panel
            no matter what z-index it was given — and hit-testing follows
            painting, which is why a wide strip's dismiss button (its rightmost
            control) was unclickable under `.layerPanelWrap` on a tablet, where
            the column's `max-width` reaches that far. Raising the z-index
            *inside* the viewport was not the fix, and neither was dropping
            `.viewport`'s own: `.canvasCatcher` is a
            full-viewport `pointer-events: auto` layer at z-index 4 in there,
            and lifting them into the shared context would have them swallow
            taps meant for the chrome. */}
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
          {roomClosed && (
            <ClosedBanner
              isOwner={isOwner}
              busy={closedBusy}
              onReopen={reopenRoom}
              onTakeCopy={takeRoomCopy}
            />
          )}
          {/* (#289 §17) Independent of the freeze banner above — both can
              be up at once, which the column now handles on its own. */}
          {lostWork && (
            <LostWorkBanner
              layerNames={lostWork.layerNames}
              recovered={lostWork.restoredLayerIds.length > 0}
              onUndo={undoLostWorkRecovery}
              onDismiss={() => setLostWork(null)}
            />
          )}
          {/* (#362) Last in the column on purpose: a frozen or closed room is
              the more important thing on screen and keeps the top slot, and
              being siblings is what stops the two from overlapping — the same
              reason the banners above are a column rather than three absolute
              boxes. Only in minimal UI: with the chrome up, the header's own
              readouts are the ones to read, and a second copy of them
              floating over the canvas would be noise. */}
          {uiHidden && viewportToastVisible && (
            <ViewportToast
              zoomPercent={zoomPercent}
              angleDeg={angleDeg}
              onReset={resetZoomAndRotation}
            />
          )}
        </div>
        {/* (#201) Bottom-anchored, so it can coexist with the event
            banners above for as long as a bad connection lasts. Hidden
            entirely while connected with an empty queue. */}
        <div className={styles.noticesBottom}>
          <ConnectionBanner
            connected={connected}
            everConnected={everConnected}
            pending={outboxState.pending}
            stalled={outboxState.stalled}
          />
        </div>

        {/* (#574) Mounted only while its layer is a paintable layer: if the
            layer is deleted, or the room stops taking edits, the dialog goes
            away and takes its preview with it. */}
        {(() => {
          const item = filterLayerId ? layerState.items[filterLayerId] : undefined
          if (!filterLayerId || !item || item.kind !== 'layer' || editingBlocked || compact) return null
          const layerId = filterLayerId
          return (
            <FilterPanel
              key={layerId}
              layerName={item.name}
              onPreview={filter => engineRef.current?.previewLayerFilter(layerId, filter)}
              onApply={filter => {
                dispatchOp({ type: 'layer_filter', layerId, filter })
                setFilterLayerId(null)
              }}
              onClose={() => setFilterLayerId(null)}
            />
          )
        })()}

        {/* ── Side panel (layers, color, …) ── */}
        {/* #99: wrapped rather than passing a className into SidePanel — the
            wrapper is a positioned overlay (see .layerPanelWrap) that only
            fades in/out, so the panel stays mounted (no lost focus/state)
            and the canvas underneath never resizes, same as header/toolbar
            above. */}
        {/* (#512) Not rendered in the compact shell, like the drawing tools:
            layers are a property of the picture, and this shell does not edit
            the picture.

            Not rendered, and the distinction cost a debugging round: an HTML
            `hidden` attribute here does nothing, because `.layerPanelWrap` sets
            `display: flex` and a class beats the attribute's UA stylesheet
            rule. On a desktop that was invisible — the panel is a right-hand
            strip. At 390 px wide it covers the whole canvas, and every touch
            aimed at the drawing landed on the panel instead: no note, no mark,
            not even a two-finger pan. */}
        {!compact && (
        <div
          className={clsx(styles.layerPanelWrap, uiHidden && styles.uiHidden, styles.strokeBlockable)}
        >
          <SidePanel
            active={activePanel}
            onSelect={setActivePanel}
            tabs={[
              {
                id: 'layers', icon: 'layers', title: t('room.panel.layers'),
                content: (
                  <LayerPanel
                    layerState={layerState} onChange={setLayerStateLocal} onOp={dispatchOp}
                    isOwner={isOwner} hasLayerContent={hasLayerContent}
                    soloIds={soloIds} onSoloChange={setSoloIds}
                    drawerColors={layerDrawerColors}
                    onOpenFilters={setFilterLayerId}
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
                  {knownLessonId && teacherBoard !== undefined && !compact && (
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
                content: Object.keys(TOOL_SCHEMAS[settingsToolId]).length === 0 ? (
                  <p className={styles.noToolSettings}>{t('room.noToolSettings')}</p>
                ) : (
                  <div className={styles.toolSettingsPanel}>
                    {Object.entries(TOOL_SCHEMAS[settingsToolId])
                      .filter(([, descriptor]) => !descriptor.visibleWhen || descriptor.visibleWhen(toolSettings[settingsToolId]))
                      .map(([key, descriptor]) => (
                      <SettingField
                        key={key}
                        descriptor={descriptor}
                        value={toolSettings[settingsToolId][key]}
                        onChange={v => setToolSetting(settingsToolId, key, v)}
                        layout="panel"
                        // (#542) Every colour field, not just the one named
                        // `color` — a shape's two are `strokeColor`/`fillColor`
                        // and were left without a way to expand at all. They
                        // all open the same flyout, on the well in the rail:
                        // this tab is only ever on screen next to it, and one
                        // surface in one place beats a popover that chases
                        // whichever copy of a swatch was pressed.
                        onExpand={descriptor.valueType.kind === 'color' ? () => expandColorField(key) : undefined}
                      />
                    ))}
                    {/* (#530) The ratio presets, here rather than in the quick
                        column (Ilya, 05.09): picking 3:4 is a decision made
                        once, and the rail is for what a hand reaches for
                        mid-gesture. Only while a shape is open — they resize
                        that shape, not the tool. */}
                    {shapeFrame && <ShapeRatioPresets frame={shapeFrame} onChange={shape.setFrame} />}
                  </div>
                ),
              },
            ]}
          />
        </div>
        )}

        {/* Draggable floating tool cluster (#157) — independent of the
            header/left-toolbar above, both of which stay as they are.
            (#321) When it shows is a setting now (Always / in minimal UI /
            Never) rather than "only while minimal UI has hidden the chrome",
            which is what it meant when it was that mode's replacement
            toolkit and nothing else — see lib/uiPreferences. */}
        <FloatingToolPanel
          // See floatingSlotTool above for why this is narrowed rather than
          // folded: ruler/transform/grid/hand light neither slot.
          tool={floatingSlotTool}
          groups={panelGroups}
          onSelectGroupMember={selectGroupMember}
          // (#548) selectTool, not the raw store setter: it is the gate that
          // refuses a tool the room does not offer, and a slot assigned before
          // that happened is exactly the path with no button to hide.
          onSetTool={selectTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          // (#542) The same well the rail carries, at the panel's centre. It
          // reports the ring/core pair rather than one colour, so a shape's two
          // colours are as readable here as they are with the chrome up.
          wellRef={panelWellRef}
          wellFill={well.fill}
          wellStroke={well.stroke}
          wellHighlight={well.highlight}
          wellLabel={wellLabel}
          palette={palette}
          onSelectColor={v => applyToolColor(colorTool, v)}
          // Opens the flyout on the panel's own well, not on the rail's — the
          // rail may not be on screen at all, which is the case this panel
          // exists for.
          onOpenColorPicker={() => setColorFlyoutAt('panel')}
          // The two service entries in the palette fan, present only for a tool
          // that carries two colours. Touch-sized where the glyph's own ring is
          // not, which is why the switch lives out here and not on the glyph.
          pair={colorPair}
          roomId={id ?? ''}
          position={panelPosition}
          onPositionChange={setPanelPosition}
          containerRef={editorRef}
          enabledTools={enabledTools}
          // (#512) Never in the compact shell, and this is the one place the
          // shell had to say so twice. The panel is a *replacement* toolkit —
          // its whole purpose is to hand you the drawing tools when the
          // toolbar is not there — so a shell that removes the drawing tools
          // from the toolbar and leaves this up has removed nothing at all.
          // Found exactly that way: the toolbar was clean and the panel was
          // still handing out a pencil.
          hidden={compact || !floatingPanelVisible(floatingPanelMode, deviceType, uiHidden)}
          layout={floatingPanelLayout}
          onLayoutChange={setFloatingPanelLayout}
          undoHotkeyLabel={formatHotkeyLabel(hotkeys.undo)}
          redoHotkeyLabel={formatHotkeyLabel(hotkeys.redo)}
          flyout={panelFlyout}
          onFlyoutChange={setPanelFlyout}
        />

        {/* (#542) The one colour surface: the picker and the palette together,
            hanging off whichever well opened it. */}
        <ColorFlyout
          open={colorFlyoutAt !== null}
          onDismiss={closeColorFlyout}
          anchorRef={colorFlyoutAt === 'panel' ? panelWellRef : railWellRef}
          {...colorContent}
        />

        {/* #277/#278: marker chisel-nib angle dial — orbits FloatingToolPanel
            the same way its own color flyout does, but as a continuously
            draggable ring instead of fixed swatch slots (see RadialDial's
            own doc comment for the interaction spec and why it deliberately
            differs from PrecisionSlider's no-tap-jump rule). Decides for
            itself whether to render (#309) — it is the one bit of chrome
            that unmounts mid-stroke instead of merely going unresponsive,
            and keeping that decision out here would put `strokeActive` back
            in Room's render path. */}
        <ChiselAngleDial
          panelPosition={panelPosition}
          containerRef={editorRef}
          uiHidden={uiHidden}
          flyoutOpen={panelFlyout !== null}
        />

        {/* #185: visible while the initial content restore (snapshot fetch
            + operation-log replay/backfill) is still in flight — a direct
            child of .editor (not .viewport), rendered last and with a
            z-index above every other child (.header 3, .toolbar/
            .layerPanelWrap 2) so it genuinely covers the whole screen, not
            just the canvas — an earlier version lived inside .viewport
            (z-index 1) and could never rise above those. */}
        {/* Four ways a room can be not-open, in order of how much they know:
            no socket at all (#313), the paper texture failed (#346), the
            room's own pixels never arrived (#533), or it is simply still
            loading. Each replaces the one below it. */}
        {!roomContentReady && (
          showOfflineOverlay
            ? <OfflineRoomOverlay pending={outboxState.pending} />
            : showPaperFailedOverlay
              ? <PaperFailedOverlay retrying={paperRetrying} onRetry={() => void retryPaper()} />
              : showRestoreFailedOverlay
                ? <RestoreFailedOverlay reason={restoreFailure ?? 'transfer'} onRetry={retryRestore} />
                : <RoomLoadingOverlay paper={paperProgress} />
        )}
      </div>

      {/* (#493) The developer overlays — see DebugStack. */}
      <DebugStack
        debugEnabled={debugEnabled} hapticGrainEnabled={hapticGrainEnabled}
        tapDebugEnabled={tapDebugEnabled} pencilSoundTuningEnabled={pencilSoundTuningEnabled}
        strokeStats={strokeStats} hapticStats={hapticStats} tapDebug={tapDebug}
        engineRef={engineRef} pencilSoundRef={pencilSoundRef} tool={tool} drawingTool={drawingTool}
      />
    </div>
  )
}
