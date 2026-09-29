import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import clsx from 'clsx'
import type {
  Operation, Participant,
  SendResult, ClientToServerEvents, ServerToClientEvents,
} from '@grafetto/shared'
import { BACKGROUND_LAYER_ID } from '@grafetto/shared'
import { PencilEngine, type PencilEngineAPI, type PencilGradeName, type StrokeDebugStats, type HapticGrainStats, WATERCOLOR_MIX_BY_PRESET, isWatercolorMixPreset, type AreaImage } from '../../engine'
import { LayerPanel } from '../../components/LayerPanel'
import { FilterPanel } from '../../components/FilterPanel'
import { SidePanel } from '../../components/SidePanel'
import { ColorFlyout, ColorFlyoutBody } from '../../components/ColorFlyout'
import { Notice } from '../../components/Notice'
import { BoardStrip, TeacherChip } from './panels/BoardStrip'
import { ClassBar, ClassGrid } from './panels/ClassGrid'
import { ClassPlaces } from './panels/ClassPlaces'
import { SettingsPanel } from '../../components/SettingsPanel'
import { FloatingToolPanel, type PanelFlyout } from '../../components/FloatingToolPanel'
import { exposeEngineForDev } from './diagnostics/devEngineHandle'
import {
  eraseThroughTargets, isLayerLocked,
} from '../../lib/layers/layers'
import { hexToRgb } from '../../lib/browser/color'
import { getFeatureFlag, getGraphiteGrainVariant, getCharcoalGrainVariant, grainVariantToMode } from '../../lib/observability/featureFlags'
import { floatingPanelVisible, minimalUiActive, minimalUiTapsRequired } from '../../lib/browser/uiPreferences'
import { diagLog } from '../../lib/observability/diagLog'
import { formatHotkeyLabel } from '../../lib/input/hotkeys'
import { useAuth } from '../../lib/api/authState'
import { BANNED_ERROR_CODE, noteBanned } from '../../lib/api/banned'
import { useSettingsStore } from '../../stores/settingsStore'
import { useViewport } from './viewport/useViewport'
import { useViewportToast } from './viewport/useViewportToast'
import { ViewportToast } from './status/ViewportToast'
import { useTapToggle, type TapDebugInfo } from './gestures/useTapToggle'
import { useCommittableSession } from './shapes/useCommittableSession'
import { useShapeTool } from './shapes/useShapeTool'
import { useRulerTool } from './useRulerTool'
import { useFillTool } from './useFillTool'
import { useEyedropper } from './useEyedropper'
import { useEditorHotkeys } from './tools/editorHotkeys'
import { useTransformGizmoGestures } from './useTransformGizmoGestures'
import { createBoardEventHandlers } from './net/boardEvents'
import { createPeerEventHandlers } from './net/peerEvents'
import { createConfirmedStreamHandler } from './net/confirmedStream'
import { createOutboxVerdicts } from './net/outboxVerdict'
import { createEngineNetworkCallbacks } from './engineNetwork'
import { createJoinFlow, type CreatorNavState } from './net/joinFlow'
import { toRoomConfig } from './net/roomConfig'
import { createRoomStateHandler } from './net/roomStateHandler'
import { createRoomControlEventHandlers } from './net/roomControlEvents'
import { useOperationDispatch } from './useOperationDispatch'
import { useJoinGate } from './useJoinGate'
import { usePaperReadiness } from './usePaperReadiness'
import { useOpenTimer } from './useOpenTimer'
import { useLeaveGuard } from './useLeaveGuard'
import { useToolSync } from './useToolSync'
import { useToolColor } from './useToolColor'
import { useToolChoice } from './useToolChoice'
import { useZoomControls } from './useZoomControls'
import { useRemoteOperations } from './useRemoteOperations'
import { useSnapshotPublishing } from './useSnapshotPublishing'
import { useLivePreviewBake } from './useLivePreviewBake'
import { useLostWork } from './useLostWork'
import { useLessonActions } from './useLessonActions'
import { useBoardActions } from './useBoardActions'
import { useClassView } from './useClassView'
import { useServerClockSync } from './net/useServerClockSync'
import { useLogDerivedState } from './useLogDerivedState'
import { useTrueOrder } from './useTrueOrder'
import { useSelection } from './useSelection'
import { DebugStack } from './panels/DebugStack'
import { usePencilSound } from './usePencilSound'
import { useCanvasViewport } from './useCanvasViewport'
import { useAnnotations } from './useAnnotations'
import { useCursorBroadcast } from './useCursorBroadcast'
import { useLayerStateSync } from './useLayerStateSync'
import { useLayerPanelBridge } from './useLayerPanelBridge'
import { useSpaceToPan } from './useSpaceToPan'
import { useDrawingActivity } from './useDrawingActivity'
import { RoomLoadingOverlay } from './status/RoomLoadingOverlay'
import { OfflineRoomOverlay } from './status/OfflineRoomOverlay'
import { PaperFailedOverlay } from './status/PaperFailedOverlay'
import { RestoreFailedOverlay, type RestoreFailureReason } from './status/RestoreFailedOverlay'
import { FrozenBanner } from './status/FrozenBanner'
import { ClosedBanner } from './status/ClosedBanner'
import { LostWorkBanner } from './status/LostWorkBanner'
import { ConnectionBanner } from './status/ConnectionBanner'
import { RoomHeader } from './panels/RoomHeader'
import { ToolRail } from './panels/ToolRail'
import { QuickSettingsBar } from './panels/QuickSettingsBar'
import { ToolSettingsTab } from './panels/ToolSettingsTab'
import { resolveDisplayName } from './participants/displayName'
import { cameraTransformCss } from './viewport/cameraMath'
import { Outbox } from './net/outbox'
import { createSocketRevival } from './net/socketRevival'
import { createIndexedDbOutboxStorage } from './net/outboxStorage'
import { PeerCursors } from './overlays/PeerCursors'
import { BrushCursor } from './overlays/BrushCursor'
import { useCursor, type ViewportCursor } from './overlays/cursorController'
import { RulerOverlay } from './overlays/RulerOverlay'
import { GridOverlay, InfiniteGridOverlay } from './overlays/GridOverlay'
import { TransformGizmo } from './overlays/TransformGizmo'
import { SelectionOverlay } from './overlays/SelectionOverlay'
import { AnnotationOverlay } from './overlays/AnnotationOverlay'
import { useCompactLayout } from './useCompactLayout'
import { useNarrowHeader } from '../../lib/input/useNarrowHeader'
import { rotateAboutMatrix, type TransformMode } from '../../lib/transform/transformMath'
import { ParticipantsPanel, ParticipantsRoomActions } from './panels/ParticipantsPanel'
import { useJoinQueue } from './net/joinQueue'
import { JoinGate } from './status/JoinGate'
import { NoWebGL } from './status/NoWebGL'
import { probeWebGL } from '../../lib/browser/webgl'
import {
  loadToolSettings, saveToolSettings,
  isShapeTool,
} from '../../lib/tools/toolSchemas'
import { loadPanelPosition, type PanelPosition } from '../../components/FloatingToolPanel/panelPosition'
import { loadActiveLayerId, saveActiveLayerId } from './editing/activeLayer'
import { ChiselAngleDial } from './overlays/ChiselAngleDial'
import { reportInvariant } from '../../lib/observability/reportInvariant'
import { pressureMapOf } from '../../lib/input/pressureCalibration'
import { createPendingPreviews } from './net/pendingPreviews'
import { createSnapshotGate } from './net/snapshotGate'
import { restoreRoomState } from './restoreRoomState'
import { useTransformSession, type TransformSession } from './useTransformSession'
import { initLayersFromStore, retireEngine, wireLocalStrokeEvents } from './engineWiring'
import { useRoomStore, resetRoomStore, resetBoardState } from '../../stores/roomStore'
import { notifyError } from '../../stores/noticeStore'
import { useT } from '../../i18n'
import { isHandActive } from '../../stores/slices/viewportSlice'
import { createReplayGate } from './replayGate'
import { GlLostOverlay, useGlContextLost } from './status/GlLostOverlay'
import { useWatercolorDevFlags } from './useWatercolorDevFlags'
import styles from './Room.module.css'

// (#393) The one place a ViewportCursor becomes a class name. The decision
// itself is cursorController's; this is only the CSS-Modules lookup, kept
// exhaustive by the Record so a new cursor value cannot ship without one.
const VIEWPORT_CURSOR_CLASS: Record<ViewportCursor, string> = {
  crosshair: styles.viewportCursorCrosshair,
  grab: styles.viewportCursorGrab,
  default: styles.viewportCursorDefault,
}

// (#313) How long a room may sit unloaded with no socket before the
// preloader is replaced by an explicit "no connection" screen. Long enough
// that an ordinary slow load or a brief blip never trips it, short enough
// that nobody watches a spinner wondering whether their work survived.
const OFFLINE_OVERLAY_GRACE_MS = 6000

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
  const replayGateRef = useRef(createReplayGate<{ seq: number; operation: Operation }>())
  const roomContentReadyRef = useRef(roomContentReady)
  roomContentReadyRef.current = roomContentReady
  useEffect(() => {
    diagLog('roomContentReady changed to', roomContentReady)
  }, [roomContentReady])

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
  // (#493) The toolset gate, every way a tool gets into a hand, and the two
  // groups the rail and the floating panel show — see useToolChoice.
  const {
    toolOffered, selectTool, selectGroupMember, toggleTool, drawingGroupOptions, drawingGroupTool,
    drawingGroupActive, shapeKind, shapeKindOptions, panelGroups, floatingSlotTool,
  } = useToolChoice()
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

  // ── boards and class mode (#176, #595) ─────────────────────────────────
  // Hoisted from the engine refs below: both hooks send over it, and a ref
  // named in a hook's arguments has to exist before the hook is called.
  const socketRef        = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  // The store's own facts about the lesson, read where the markup uses them.
  const boards = useRoomStore(s => s.boards)
  const knownLessonId = useRoomStore(s => s.lessonId)
  const assignments = useRoomStore(s => s.assignments)
  const activeAssignmentId = useRoomStore(s => s.activeAssignmentId)
  const spotlightBoardId = useRoomStore(s => s.spotlightBoardId)
  const classVisibility = useRoomStore(s => s.classVisibility)
  const handsRaised = useRoomStore(s => s.handsRaised)
  // (#493) The strip's page turns and edits — see useBoardActions.
  const {
    boardsOpen, setBoardsOpen, boardBusy, selectBoard, returnToTeacher, addBoard, renameBoardAction, moveBoard,
    removeBoard,
  } = useBoardActions({ socketRef, switchBoardRef, isOwnerRef })
  // (#493) Where each board goes on screen, and the class-mode requests — see
  // useClassView.
  const {
    teacherBoard, gridAssignmentId, setGridAssignmentId, assignmentBusy, currentBoardSummary, onPersonalBoard,
    ownAssignmentBoardId, gridAssignment, gridTiles, barTiles, ownBoards, workOf, readOnlyBoard, myHandRaised,
    handsUp, canOpenGrid, teacherOnMyBoard, bakesPreviewHere, stripList, stripAvailable, showTeacherChip, chipText,
    openClassBoard, startAssignment, setClassLocation, setSpotlight, setHandRaised, setClassVisibility,
    stepInGrid,
  } = useClassView({
    socketRef, switchBoardRef, isOwnerRef, selectBoard, boardId, participants, myUserId, isOwner, compact,
  })
  // (#432) The latency meter's clock — see useServerClockSync.
  useServerClockSync(socketRef, connected)
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
  const glLost = useGlContextLost(canvasRef, engineEpoch) // (#536, §17.50) see GlLostOverlay
  const initialToolRef = useRef({
    pencil: toolSettings.pencil.grade as PencilGradeName,
    size: toolSettings.pencil.size as number,
    opacity: toolSettings.pencil.opacity as number,
    tool,
  })

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
  // (#537) Own operations' place in the room's order, and the #480 counter.
  const { noteOperationSeq, resetLayerSeqs, confirmOwnOperation, discardOwnOperation, syncFromLogRef } = useTrueOrder({ engineRef })
  // (#148, #169, #386, #508) The store's layer state and annotations, derived
  // from the engine's log — coalesced per burst, or now — see
  // useLogDerivedState.
  const { restoredLayerStateRef, syncFromLog, syncFromLogNow } = useLogDerivedState({ engineRef })
  syncFromLogRef.current = syncFromLog
  // (#289 §17, #312) Work the server refused as `target_gone`, brought back on
  // fresh layers and reported — see useLostWork.
  const { lostWork, setLostWork, scheduleLostWorkRecovery, resetLostWork } =
    useLostWork({ engineRef, restoredLayerStateRef, syncFromLog })
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
  // (#493) Whether and when this client writes its canvas back as the room's
  // snapshot — the per-board uploader, the gate, the replay-incomplete flag —
  // see useSnapshotPublishing.
  const {
    snapshotUploader, snapshotUploaderRef, snapshotGateRef, replayIncompleteRef, checkSnapshotBoundary,
    markJoinRestoreDone,
  } = useSnapshotPublishing({ boardId, engineRef, latestKnownSeqRef, pendingPreviewsRef })
  // (#595) The class grid's live picture of this board — see useLivePreviewBake.
  const previewScheduleRef = useLivePreviewBake({ engineRef, boardId, active: bakesPreviewHere })
  // (#487) The open's own measurement and its slow-open alarm — see
  // useOpenTimer.
  const { openTimerRef, startOpenTimer, finishOpenTimer } = useOpenTimer({ id, engineRef })

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
  // watermark/pendingIds bookkeeping onLocalOperation's own ack
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
    // (#493) What a stalled or settled operation means for this client —
    // see outboxVerdict.ts.
    ...createOutboxVerdicts({
      pendingIdsRef, latestKnownSeqRef, checkSnapshotBoundary,
      confirmOperation: (op, seq) => confirmOwnOperation(op, seq, false),
      discardOperation: discardOwnOperation,
      resolveTransformCommit, scheduleLostWorkRecovery, setLostWork,
    }),
    // (#201) The counter the ConnectionBanner reports. Passing a plain
    // setState is safe from any callsite: React batches, and the Outbox
    // only ever calls this after a real size change.
    onPendingChange: (pending, stalled) => setOutboxState({ pending, stalled }),
  }), [
    outboxBoardId, checkSnapshotBoundary, confirmOwnOperation, discardOwnOperation, scheduleLostWorkRecovery,
    resolveTransformCommit, setLostWork,
  ])
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

  // (#493) What "100%" means, the resets, and the drag gestures on the zoom
  // and angle readouts — see useZoomControls.
  const { zoomPercent, resetZoom, resetZoomAndRotation, onZoomDragDown, onAngleDragDown } =
    useZoomControls({ vp, setVp, infinite: config?.infinite ?? false })

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

  // (#346, #464) Whether the paper texture arrived, the retry when it did not,
  // and the download's progress — see usePaperReadiness.
  const { paperProgress, paperFailed, paperRetrying, awaitPaper, retryPaper } =
    usePaperReadiness({ engineRef, requestFullResyncRef })

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

  // (#493) How the network's operations reach the engine — once each, deferred
  // until their target arrives, restored from a snapshot and backfilled behind
  // it — see useRemoteOperations.
  const {
    appliedOpIdsRef, deferredOpsQueueRef, applyRemoteOp, drainDeferredQueue, restoreFromSnapshot, backfillHistory,
  } = useRemoteOperations({
    engineRef, restoredLayerStateRef, markActive, resolveTransformCommit, confirmOwnOperation, noteOperationSeq,
    syncFromLog, checkSnapshotBoundary,
  })

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
    resetLayerSeqs()
    pendingIdsRef.current = new Set()
    lastConfirmedSeqRef.current = 0
    latestKnownSeqRef.current = 0
    catchingUpRef.current = false
    deferredOpsQueueRef.current = []
    resetDrawingActivity()
    pendingPreviewsRef.current = createPendingPreviews()
    streamedStrokeIdsRef.current = new Set()
    restoredLayerStateRef.current = null
    resetLostWork()
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
  }, [resetDrawingActivity, restoredLayerStateRef, resetLayerSeqs, appliedOpIdsRef, deferredOpsQueueRef, resetLostWork])

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
      diagLog,
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
      // (#493) Local operations out, peer reveals committed, the live stroke
      // channel — see engineNetwork.ts.
      ...createEngineNetworkCallbacks({
        engineRef, appliedOpIdsRef, pendingIdsRef, outbox, markActive, pendingPreviewsRef,
        applyRemoteOp, syncFromLog, checkSnapshotBoundary, editingBlockedRef,
        sendLive: data => { socketRef.current?.emit('stroke_live', data) },
        sendLiveEnd: data => { socketRef.current?.emit('stroke_live_end', data) },
      }),
      // (#480) Движку некому докладывать самому — см. PencilEngineOptions.onInvariant.
      onInvariant: reportInvariant,
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
    // birth: useToolSync pushes later changes only when the *setting* changes,
    // so a freshly built engine (a paper change, every room mount) would draw
    // uncalibrated until the person touched it again. Read off the store, not
    // through a dependency: a calibration in this list would rebuild the WebGL
    // context every time the curve is dragged.
    engine.setPressureMap(pressureMapOf(useSettingsStore.getState().pressureCalibration))

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
          latestKnownSeqRef, replayIncompleteRef, pendingPreviewsRef, openTimerRef, replayGate: replayGateRef.current,
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
    grainMode, charcoalGrainMode, dispatchParticipants, isCreator, snapshotUploader, outbox,
    awaitPaper,
    // (#493) The ref *object* — stable for the component's life, so naming it
    // costs nothing. Never `.current`: that would rebuild the engine every
    // time the sound instance changed. openTimerRef likewise (useOpenTimer).
    pencilSoundRef, openTimerRef, appliedOpIdsRef, snapshotGateRef, replayIncompleteRef,
  ])

  // ── sync tool → engine ────────────────────────────────────────────────────────
  // (#493) Every engine.setX that reflects the tool in hand — see useToolSync.
  const { cursorPresetName, nibAnchor, nibCanvasAngleRadians, tiltResponse, sizePx } =
    useToolSync({ engineRef, engineEpoch })
  useWatercolorDevFlags(engineRef, engineEpoch) // (#536) dev views and A/B switches
  // (#493) Whose colour the controls edit, what the engine draws with, the
  // well, the room palette and the flyout — see useToolColor.
  const {
    applyToolColor, colorTool, pickedColorTool, well, wellLabel, colorPair, palette, addPaletteColor,
    colorContent, colorFlyoutAt, openPanelColorSurface, railWellRef, panelWellRef, closeColorFlyout,
    openRailColorSurface, expandColorField,
  } = useToolColor({ engineRef, engineEpoch, socketRef })
  // Global, not per room — see settingsStore's own comment for why the panel's
  // layout and the panel's position part company on that.
  const floatingPanelLayout = useSettingsStore(s => s.floatingPanelLayout)
  const setFloatingPanelLayout = useSettingsStore(s => s.setFloatingPanelLayout)
  // (#493) The owner's live switches and the two ways out of a closed lesson
  // — see useLessonActions.
  const {
    toggleRoomFrozen, setRoomTools, closedBusy, reopenRoom, takeRoomCopy, toggleParticipantFrozen,
  } = useLessonActions({ socketRef, roomId: id, lessonId })

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
  }, [lostWork, dispatchOp, setLostWork])

  // (#263/#608) LayerPanel has no direct engine access — the callbacks it
  // needs from the engine and the editor come through this bridge instead.
  const layerPanelBridge = useLayerPanelBridge(engineRef)

  // (#313, #377, #400) Every way out of the room — confirmed, guarded
  // against a reload with work unsent, and Back disarmed — see useLeaveGuard.
  const leaveRoom = useLeaveGuard()

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

  // (#493) The eyedropper's pick — see useEyedropper.
  const handleEyedropperPick = useEyedropper({
    engineRef, vpRef, vp, handActive, applyToolColor, pickedColorTool, addPaletteColor,
  })

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

  // (#493) The ruler — whether it shows, the engine sync, its gesture and
  // cursor — lives in useRulerTool.
  const { rulerVisible, rulerMeasuring, handleRulerDown, handleRulerHover, handleRulerEnter } =
    useRulerTool({ engineRef, vpRef, vp, handActive })

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

  // (#493) The fill's tap and its busy state — see useFillTool.
  const { fillBusy, handleFillTap } = useFillTool({
    engineRef, vpRef, handActive, paintTargetIdRef, paintTargetLockedRef, dispatchOp,
  })

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

  // (#493) The gizmo's pointer gestures — see useTransformGizmoGestures.
  const { handleTransformHandleDown, handleTransformCenterDown, handleTransformCenterReset } =
    useTransformGizmoGestures({ vpRef, vp, handActive, engineRef, transformSessionRef, pendingTransformCommitRef })

  // ── join gate (joiner path only) ──────────────────────────────────────────
  // (#493) The form, its screens and the attempt — see useJoinGate.
  const {
    joinName, setJoinName, joinPassword, setJoinPassword, joinError, joinSubmitting,
    joinState, setJoinState, joinPasswordAsked, handleJoinSubmit, retryJoin, retryJoinRef,
  } = useJoinGate({
    id, myDisplayName, socketRef, latestKnownSeqRef, lastJoinAttemptRef, hasJoinedRef,
    applyIdentity, outbox, startOpenTimer,
  })

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

    // (#504) socket.io переподключается само — кроме двух случаев, в которых
    // оно объявляет, что больше не пытается, и тогда открытая комната висит на
    // «Нет связи» до перезагрузки страницы. См. socketRevival.ts: там и
    // перечень случаев, и почему у страницы комнаты нет законной причины
    // принять такой ответ.
    const revival = createSocketRevival(socket)

    // (#493) Joining and staying joined — create/rejoin, page turns,
    // following, gap resync — see joinFlow.ts. Handed the two joining emits
    // rather than the socket.
    const {
      joinCredentials, reportJoinFailure, handleConnect, switchBoard, maybeFollow, requestFullResync,
    } = createJoinFlow({
      id, isCreator, creatorDraft,
      joinRoom: (data, ack) => { socket.emit('join_room', data, ack) },
      createRoom: (data, ack) => { socket.emit('create_room', data, ack) },
      isCurrentSocket: () => socket === socketRef.current,
      noteConnected: () => {
        setConnected(true)
        setEverConnected(true)
        revival.noteConnect()
      },
      applyIdentity, setRoomContentReady,
      hasJoinedRef, lastJoinAttemptRef, myDisplayNameRef, latestKnownSeqRef, lastConfirmedSeqRef, outboxRef,
      wantedBoardRef, boardIdRef, socketBoardRef, isOwnerRef, engineRef, streamedStrokeIdsRef, tRef,
    })
    switchBoardRef.current = next => { void switchBoard(next) }
    // (#346) Published for the paper retry, which lives outside this effect —
    // see requestFullResyncRef's own comment.
    requestFullResyncRef.current = requestFullResync

    // (#493) Where a room_state takes this client, and what it does with the
    // content — see roomStateHandler.ts.
    const handleRoomState = createRoomStateHandler({
      id, isCreator,
      replaceUrl: path => navigateRef.current(path, { replace: true }),
      joinRoom: (data, ack) => { socket.emit('join_room', data, ack) },
      joinCredentials, applyIdentity, reportJoinFailure, requestFullResync, maybeFollow,
      enterBoard, awaitPaper, markJoinRestoreDone, setRoomContentReady,
      clearRestoreFailure: () => setRestoreFailure(null),
      // Shared with the engine's mount effect — see restoreRoomState. The open
      // is not being timed any more, hence the no-op finisher: a real one here
      // would also be a new dependency of this effect, and this effect's
      // dependencies are what tear the socket down.
      restoreCatchup: async (engine, state, alreadyHadSeq, boardId) => {
        await restoreRoomState(engine, state, { mode: 'catchup', alreadyHadSeq }, {
          boardId,
          restoreFromSnapshot, backfillHistory, applyRemoteOp, syncFromLogNow, markJoinRestoreDone,
          dispatchParticipants, setRestoreFailure, setRoomContentReady,
          finishOpenTimer: () => {},
          notifyReplayIncomplete: () => notifyError(tRef.current('room.replayIncomplete'), {
            key: 'replay-incomplete', durationMs: null,
          }),
          // Through the ref, and read when the bootstrap needs it: the uploader
          // is per board, and this effect does not re-run when the board does.
          getSnapshotUploader: () => snapshotUploaderRef.current,
          latestKnownSeqRef, replayIncompleteRef, pendingPreviewsRef, openTimerRef, replayGate: replayGateRef.current,
        })
      },
      socketBoardRef, wantedBoardRef, firstRoomStateReceivedRef, awaitingSeededBoardStateRef,
      pendingSnapshotRef, latestKnownSeqRef, isOwnerRef, engineRef, snapshotGateRef,
    })

    // (#493) Out of line — see confirmedStream.ts.
    const handleOperationConfirmed = createConfirmedStreamHandler({
      engineRef, lastConfirmedSeqRef, latestKnownSeqRef, appliedOpIdsRef, pendingPreviewsRef,
      catchingUpRef, streamedStrokeIdsRef, deferredOpsQueueRef, previewScheduleRef,
      confirmOwnOperation: (op, seq) => confirmOwnOperation(op, seq, true),
      markLayerActive, applyRemoteOp, syncFromLog, checkSnapshotBoundary, requestFullResync,
      replayGate: replayGateRef.current,
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
    restoreFromSnapshot, backfillHistory, drainDeferredQueue, dispatchParticipants, confirmOwnOperation,
    syncFromLogNow, enterBoard,
    // (#429) Used by the live-stroke handler, markLayerActive too. Both are
    // useCallback with no dependencies (see their definitions), so they are
    // stable for this component's lifetime and can never tear the socket
    // down and rebuild it.
    markActive, markLayerActive,
    forgetDrawingActivity,
    awaitPaper,
    // Stable for the app's lifetime (one QueryClient, created outside React —
    // see lib/api/queryClient.ts), so listing it here can never tear the socket
    // down and rebuild it.
    queryClient,
    // (#493) From useJoinGate, useRemoteOperations, useSnapshotPublishing and
    // useLivePreviewBake now, so the lint rule
    // asks for them: a useState setter and useRef objects, all stable for the
    // component's life — naming them can never tear the socket down.
    setJoinState, retryJoinRef, openTimerRef, appliedOpIdsRef, deferredOpsQueueRef,
    previewScheduleRef, replayIncompleteRef, snapshotGateRef, snapshotUploaderRef,
    // (#176) Deliberately absent: `outbox` and `snapshotUploader` (per board,
    // read through refs), `navigate` (changes with the URL this effect itself
    // rewrites) and `boardId` (a page turn is not a new socket).
  ])

  // Same reason as `retryJoinRef`: `t` changes identity when the reader
  // switches language, and listing it as a dependency of the socket effect
  // would tear the connection down and rebuild it on a language switch.
  const tRef = useRef(t)
  tRef.current = t

  // ── keyboard shortcuts (#174: bindings come from the `hotkeys` registry
  // loaded above, not hardcoded here — see lib/input/hotkeys.ts) ─────────────────
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

  // (#493) The overlays over the canvas — cursors, brush ring, grid, ruler,
  // gizmos, selection, annotations — written once. They ride the canvas-
  // space wrapper in a bounded room and the camera-transformed world wrapper
  // in an infinite one (#143); the two used to be the same hundred lines
  // twice, told apart only by a `config.infinite` guard on every element.
  const canvasOverlays = (
    <>
      <PeerCursors
        key={boardId ?? ''}
        socket={socketRef.current}
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
    </>
  )

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

        {/* (#493) The quick-settings column — see QuickSettingsBar. */}
        <QuickSettingsBar
          uiHidden={uiHidden} compact={compact} onShapeFrameChange={shape.setFrame}
          paintTargetId={paintTargetId} paintTargetLocked={paintTargetLocked}
          copySelection={() => { void copySelection() }} cutSelection={() => { void cutSelection() }}
          pasteClipboard={() => { void pasteClipboard() }} deleteSelectionContents={deleteSelectionContents}
          onWatercolorDry={() => { dispatchOp({ type: 'paper_dry' }) }}
        />
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
              {!config.infinite && canvasOverlays}
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
              {canvasOverlays}
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
              onPointerEnter={handleRulerEnter}
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
                    isOwner={isOwner} {...layerPanelBridge}
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
                content: <ToolSettingsTab onExpandColor={expandColorField} onShapeFrameChange={shape.setFrame} />,
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
            toolkit and nothing else — see lib/browser/uiPreferences. */}
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
          onOpenColorPicker={openPanelColorSurface}
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

      {glLost && <GlLostOverlay />}
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
