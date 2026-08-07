import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import * as Sentry from '@sentry/react'
import clsx from 'clsx'
import { clamp } from 'lodash-es'
import { nanoid } from 'nanoid'
import type {
  LayerState, OperationDraft, Operation, Participant, Room as RoomEntity, RoomAccessMode, RoomJoinRequest,
  SendResult, ClientToServerEvents, ServerToClientEvents,
} from '@grafetto/shared'
import { BACKGROUND_LAYER_ID, normalizePaperType, SNAPSHOT_SEQ_INTERVAL, toWireMatrix } from '@grafetto/shared'
import { PencilEngine, PENCIL_PRESETS, CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS, PENCIL_TILT, PENCIL_TILT_SLIDERS, DEFAULT_TILT_RESPONSE, isTiltResponse, type CharcoalFeelConfig, type PencilTiltConfig, type PencilEngineAPI, type PencilGradeName, type StrokeDebugStats, type HapticGrainStats } from '../../engine'
import { subscribePaperLoadProgress, type PaperLoadProgress } from '../../engine/src/paperLoader'
import { LayerPanel } from '../../components/LayerPanel'
import { SidePanel } from '../../components/SidePanel'
import { ColorPicker } from '../../components/ColorPicker'
import { PaletteBar } from '../../components/PaletteBar'
import { Icon } from '../../components/Icon'
import { Logo } from '../../components/Logo'
import { Menu } from '../../components/Menu'
import { SettingsPanel } from '../../components/SettingsPanel'
import { SettingField } from '../../components/SettingField'
import { useConfirmDialog } from '../../components/ConfirmDialog/useConfirmDialog'
import { isModalOpen } from '../../components/Modal/modalSlot'
import { isDismissLayerOpen } from '../../lib/useDismissOnOutside'
import { FloatingToolPanel } from '../../components/FloatingToolPanel'
import { exposeEngineForDev } from '../../lib/devEngineHandle'
import { computeCompositeOrder, isEffectivelyVisible, isLayerLocked } from '../../lib/layers'
import { hexToRgb, rgbToHex } from '../../lib/color'
import { getFeatureFlag, getGraphiteGrainVariant, getCharcoalGrainVariant, grainVariantToMode } from '../../lib/featureFlags'
import { floatingPanelVisible, minimalUiActive } from '../../lib/uiPreferences'
import { PencilSound, TOOL_SOUND_CONFIGS } from '../../lib/PencilSound'
import { useDragToAdjust } from '../../lib/useDragToAdjust'
import { TAP_MOVE_THRESHOLD_PX } from '../../lib/tapThreshold'
import { setBackNavigationGuard } from '../../lib/backNavigationGuard'
import { holdReload } from '../../lib/reloadSafety'
import { diagLog, getDiagLogs, clearDiagLogs } from '../../lib/diagLog'
import { matchesHotkey, formatHotkeyLabel } from '../../lib/hotkeys'
import { addRoomInvite, forkRoom, moveRoomToFolder, renameRoom, setRoomClosed } from '../../lib/api'
import { useAuth } from '../../lib/authState'
import { useSettingsStore } from '../../stores/settingsStore'
import { useViewport } from './useViewport'
import { useViewportToast } from './useViewportToast'
import { ViewportToast } from './ViewportToast'
import { useTapToggle, type TapDebugInfo } from './useTapToggle'
import { PencilSoundTuningPanel } from './PencilSoundTuningPanel'
import { RoomLoadingOverlay } from './RoomLoadingOverlay'
import { OfflineRoomOverlay } from './OfflineRoomOverlay'
import { PaperFailedOverlay } from './PaperFailedOverlay'
import { FrozenBanner } from './FrozenBanner'
import { ClosedBanner } from './ClosedBanner'
import { LostWorkBanner } from './LostWorkBanner'
import { ConnectionBanner } from './ConnectionBanner'
import { SyncIndicator } from './SyncIndicator'
import { currentlyDrawing, sameIds } from './drawingIndicator'
import { resolveDisplayName } from './displayName'
import { shouldEmitCursor } from './cursorThrottle'
import { clientToCanvas } from './pointerTransform'
import { ZOOM_MAX, clientToRoomPoint, screenToWorld, cameraTransformCss, deviceNativeZoom, minZoom } from './cameraMath'
import { describeJoinError, joinGateStateFor } from './joinError'
import { hasSeqGap, shouldEnterCatchUp, shouldLeaveCatchUp } from './catchUp'
import { isLocalIslandSafe } from './optimism'
import {
  groupLostOpsByLayer, isRecoverableContentOp, resolveDeletedLayerName, retargetToLayer, type LostContentOp,
} from './lostWork'
import { Outbox } from './outbox'
import { createIndexedDbOutboxStorage } from './outboxStorage'
import { PeerCursors } from './PeerCursors'
import { BrushCursor } from './BrushCursor'
import { useCursor, RULER_GESTURE_CURSOR, type ViewportCursor } from './cursorController'
import { RulerOverlay, type RulerPoint } from './RulerOverlay'
import { rulerGestureAt, RULER_BODY_GRAB_PX, RULER_ENDPOINT_GRAB_PX } from './rulerGesture'
import { editorOwnsKey, isTypingTarget } from './editorKeys'
import { GridOverlay, InfiniteGridOverlay } from './GridOverlay'
import { TransformGizmo } from './TransformGizmo'
import {
  translateMatrix, scaleAxisMatrix, skewAxisMatrix, rotateAboutMatrix,
  composeMatrix, invertMatrix, applyMatrix, isIdentityMatrix, IDENTITY_MATRIX,
  transformGestureKind, isNegligibleTransform, distortQuad, solveQuadMatrix, isFrameInFront,
  type TransformBounds, type TransformMatrix, type TransformHandleKind, type TransformMode,
} from './transformMath'
import { ParticipantsPanel, ParticipantsRoomActions } from './ParticipantsPanel'
import { applyJoinRequestCreated, applyJoinRequestResolved, useJoinQueue } from './joinQueue'
import { JoinGate, type JoinGateState } from './JoinGate'
import {
  TOOL_SCHEMAS, loadToolSettings, saveToolSettings, linerSizeToPx, stepLinerSize,
  getToolColor, isColorCapableTool, toolSizeRange, type ColorCapableTool, type UiToolId,
} from './toolSchemas'
import { loadPanelPosition, type PanelPosition } from './panelPosition'
import { ChiselAngleDial } from './ChiselAngleDial'
import { createSnapshotUploader, uploadThumbnail } from './snapshotSync'
import { fetchLatestSnapshot, walkHistoryBackward, type RestoredSnapshot } from './snapshotRestore'
import { useRoomStore, resetRoomStore } from '../../stores/roomStore'
import { notifyError } from '../../stores/noticeStore'
import { useT } from '../../i18n'
import { makeInitialLayerState } from '../../stores/slices/layerSlice'
import { isDrawingTool, type EditorTool, type PrimaryDrawingTool } from '../../stores/slices/toolSlice'
import type { RoomInfo } from '../../stores/slices/roomSlice'
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
  room: Pick<RoomEntity, 'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight'>
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
    & Partial<Pick<RoomEntity, 'closedAt'>>,
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
  }
}

// LAN dev server port (apps/server); derived from window.location.hostname
// How long a stroke's "drawing" activity (local or peer) stays visible before
// the #38 indicator clears it — see drawingIndicator.ts.
const DRAWING_TIMEOUT_MS = 1500

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

// Layer transform tool (#120): canvas-space pivot for a scale handle is
// always the *opposite* corner/edge of the content bounding box (see
// engine.getContentBounds) — a real resize anchor, unlike the old
// whole-canvas-rect version this replaced.
const TRANSFORM_PIVOT: Record<'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r', (b: TransformBounds) => { x: number; y: number }> = {
  tl: b => ({ x: b.x + b.width, y: b.y + b.height }),
  tr: b => ({ x: b.x,           y: b.y + b.height }),
  bl: b => ({ x: b.x + b.width, y: b.y }),
  br: b => ({ x: b.x,           y: b.y }),
  t:  b => ({ x: b.x,           y: b.y + b.height }),
  b:  b => ({ x: b.x,           y: b.y }),
  l:  b => ({ x: b.x + b.width, y: b.y }),
  r:  b => ({ x: b.x,           y: b.y }),
}

function unionTransformBounds(a: TransformBounds, b: TransformBounds): TransformBounds {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}

// (#391) How far a shear may be pushed in one gesture. Unlike a scale this
// has no singularity to protect against (a single-axis shear's determinant is
// exactly 1 whatever the amount), so the clamp is purely about what a slip of
// the pen near the anchor edge can do: the shear is a ratio whose denominator
// is the distance to that edge, and 20 already lays the layer almost flat.
const MAX_TRANSFORM_SHEAR = 20

/** What dispatchOp did with an operation (#395). `applied: true` means the
 *  engine already carries it (the optimistic local-island path); `false`
 *  means it is queued in the Outbox and only becomes real when the server
 *  confirms it. A null return means it was refused outright and nothing will
 *  ever land. Only the transform gizmo reads this — it has to keep its
 *  preview on screen until the operation is genuinely applied; every other
 *  call site ignores the result. */
interface DispatchedOp { op: Operation; applied: boolean }

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

export function Room() {
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

  // Captured once, at mount: CreateRoom hands the freshly-created room's
  // config off via navigation state. A second device opening the same room
  // link has no such state — that's the "joiner" branch, gated behind the
  // join-gate form below until a successful join_room tells us who we are.
  const [creatorDraft] = useState<CreatorNavState | undefined>(() => location.state as CreatorNavState | undefined)
  const isCreator = !!creatorDraft?.room
  // Blocks pointer input on the canvas (see its style prop below) while a
  // join/reconnect's initial content restore is still in flight — a real
  // bug, not defensive: with #169's snapshot fast-join, that restore
  // includes an awaited network fetch (fetchLatestSnapshot), which — unlike
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

  // Dev-only live tuning (see PencilEngineAPI.setPaperFillThreshold) — a
  // debug-overlay slider that calls straight through to the engine on every
  // drag, no Save/reload round-trip: this one's meant to be dragged and
  // felt out in real time while actually drawing, not toggled once and
  // reloaded like every other Settings-panel control. Not persisted —
  // purely a session tuning aid; once a value's picked, it becomes the
  // engine's own hardcoded default instead of staying a runtime knob.
  const [paperFillThreshold, setPaperFillThresholdState] = useState(0)
  // Companion slider (see PencilEngineAPI.setPaperFillCap) — hard ceiling
  // on how far a single dab's own fill can push paperCatch toward 1.0.
  // Threshold alone couldn't express "impossible to fully flatten in one
  // pass, only through repeated passes" — some pressure always fully
  // triggered it eventually, no matter how close the threshold sat to 1.0.
  const [paperFillCap, setPaperFillCapState] = useState(0.35)
  // #305: charcoal's tilt ladder, seeded from the engine module's own current
  // values rather than a second hardcoded copy here — CHARCOAL_FEEL is the one
  // source of truth, and these sliders only ever push deltas back into it.
  const [charcoalFeel, setCharcoalFeelState] = useState<CharcoalFeelConfig>(() => ({ ...CHARCOAL_FEEL }))
  // #389: graphite's tilt curve, seeded and pushed the same way charcoal's
  // ladder above is.
  const [pencilTilt, setPencilTiltState] = useState<PencilTiltConfig>(() => ({ ...PENCIL_TILT }))

  // Optional pointer-prediction experiment (#92) — same feature-flag pattern
  // as debugEnabled above. Off by default; lets Ilya A/B it on real hardware
  // before deciding whether to keep it.
  const predictEnabled = getFeatureFlag('predictPointer')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // #93: fullscreen toggle for the whole page — removes tablet browser chrome
  // (address bar/nav), which eats real estate especially in landscape. iOS
  // Safari doesn't support the Fullscreen API for arbitrary elements, hence the
  // fullscreenEnabled gate below (hide rather than show a button that would
  // throw). What goes fullscreen is `document.documentElement`, not `editorRef`
  // — see toggleFullscreen for why that distinction is load-bearing (#357).
  const editorRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fullscreenSupported = typeof document !== 'undefined' && document.fullscreenEnabled

  // Minimal UI (#99): a short single-finger tap on the canvas hides the
  // header/toolbar/layer panel via a CSS class (never unmounted — no lost
  // focus/state), tap again to bring them back.
  //
  // (#321) A real setting now rather than a feature flag, and touch-only:
  // `minimalUiActive` folds in the device check, because a PC has neither the
  // tap that turns this on nor anything that would turn it back off (#384).
  const minimalUiSetting = useSettingsStore(s => s.minimalUi)
  const deviceType = useSettingsStore(s => s.deviceType)
  const tapToHideEnabled = minimalUiActive(minimalUiSetting, deviceType)
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
  // pair of values. Store subscriptions, not a read at mount: the volume
  // slider is meant to be dragged while a sound is playing.
  const soundEnabled = useSettingsStore(s => s.soundEnabled)
  const soundVolume = useSettingsStore(s => s.soundVolume)

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
  useState(() => { if (creatorDraft?.room) useRoomStore.setState({ room: toRoomConfig(creatorDraft.room) }) })
  const config = useRoomStore(s => s.room)
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
  // Floating tool panel's dragged-to position (#157) — same load-once-up-
  // front pattern as toolSettings above; null until the panel's
  // ever been dragged in this room, in which case it renders at its
  // CSS-anchored default corner instead (see FloatingToolPanel).
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(
    () => loadPanelPosition(localStorage, id ?? ''),
  )
  // Whether that panel's palette flyout is fanned out. Lives here rather than
  // inside FloatingToolPanel because ChiselAngleDial — a sibling orbiting the
  // same panel at nearly the same radius — has to stand down while it is
  // open; see that component's own doc comment.
  const [paletteFlyoutOpen, setPaletteFlyoutOpen] = useState(false)
  // Desktop keyboard shortcuts (#174) — global (per-browser, not per-room): a
  // rebound key is a habit of whoever's typing, not a property of this
  // drawing. A store subscription rather than a load-once-at-mount read
  // (#321): the settings panel applies a rebind immediately now, so this has
  // to see it without the page reload that used to carry it.
  const hotkeys = useSettingsStore(s => s.hotkeys)
  const gradeHotkeyLabels = ['gradeH', 'gradeHB', 'grade2B', 'grade4B', 'grade6B']
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
  // (#23) Backed by the store now, alongside the transform-preview fields
  // below — moved for architectural consistency, but deliberately NEVER
  // persisted (see layerSlice.ts's own comment: a ruler is for quickly
  // comparing distances mid-drawing, not a saved setting).
  //
  // (#405) The line outlives the ruler being selected: switch to the pencil
  // and it stays on screen to draw against, it just stops being draggable.
  // Nothing clears it — `show` below hides it instead, so the same straight
  // edge comes back rather than having to be laid again.
  const rulerLine = useRoomStore(s => s.rulerLine)
  const setRulerLine = useRoomStore(s => s.setRulerLine)
  // (#405) The ruler's two settings, from the same TOOL_SCHEMAS store every
  // other tool's live in. `show` is the master switch, not a convenience: a
  // hidden ruler neither snaps nor moves (see the engine sync and the catcher
  // below), because an invisible line quietly bending strokes is a trap.
  const rulerShow = toolSettings.ruler.show as boolean
  const rulerSnap = toolSettings.ruler.snap as boolean
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
  const setTransformBounds = useRoomStore(s => s.setTransformBounds)
  // Custom rotation pivot (Adobe Animate-style draggable transform point) —
  // null means "use the content bounds' own center". Reset on activation
  // and after every commit: each drag already commits immediately (no
  // multi-step Free-Transform session, see #120's scope notes), so treating
  // a custom point as scoped to a single drag rather than trying to carry
  // an absolute canvas-space point through a move/scale that just changed
  // where the content actually is keeps this from silently pointing
  // somewhere stale.
  const transformCenterOverride = useRoomStore(s => s.transformCenterOverride)
  const setTransformCenterOverride = useRoomStore(s => s.setTransformCenterOverride)
  // (#399) Every gesture of the open transform session, composed — fed to
  // TransformGizmo so its handles ride along with the content, and to the
  // engine's preview so the canvas shows the same thing. Null between
  // sessions. This used to be per-*drag* and was nulled on release, which is
  // what made the frame snap back to an upright box the moment you let go of
  // a rotation: the bounds behind it are axis-aligned, so re-deriving them
  // from pixels threw the rotation away (a 30° turn grew the box 32%x42%).
  const transformSessionMatrix = useRoomStore(s => s.transformSessionMatrix)
  const setTransformSessionMatrix = useRoomStore(s => s.setTransformSessionMatrix)
  // The session itself. Authoritative (the store copy exists to drive
  // rendering), and a ref rather than state so the drag handlers don't have to
  // list a value that changes on every animation frame among their deps.
  // `matrix` accumulates gestures; `targetIds` is frozen for the session so a
  // selection change ends it rather than silently re-aiming it mid-flight.
  const transformSessionRef = useRef<{ matrix: TransformMatrix; targetIds: string[] } | null>(null)
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
  const [activePanel, setActivePanel] = useState<'layers' | 'color' | 'participants' | 'toolSettings' | null>('layers')

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
  // (#380) Who is knocking. Owner-only (the hook fetches nothing otherwise),
  // read here rather than inside ParticipantsPanel because the SidePanel tab's
  // badge needs the same count while that panel is collapsed.
  const joinQueue = useJoinQueue(id, isOwner)
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
  // (#222) Closed for editing — the lesson has been handed out and stopped
  // changing. Deliberately *not* `!isOwner`: the server binds the owner too
  // (see getOperationRejectReason in rooms.ts), and a client gate that let
  // them draw anyway would produce exactly the "drawing into the void" the
  // freeze gate below exists to prevent.
  const roomClosed = useRoomStore(s => s.room?.closedAt !== undefined)
  // Everything that would write to the room goes through this one condition.
  const editingBlocked = isBlockedByFreeze || roomClosed
  // (#152) Cursor *positions* used to live here (setPeerCursors on every
  // incoming peer_cursor packet — up to ~30Hz per peer, summed across
  // however many peers are moving a pointer at once, all landing on this
  // ~1600-line component and reconciling its whole tree). PeerCursors now
  // owns that state itself, subscribing to the socket directly (see its own
  // component) — Room only needs to hand it the socket and participants.
  const [drawingIds,  setDrawingIds]  = useState<string[]>([])

  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const engineRef     = useRef<PencilEngineAPI | null>(null)
  const pencilSoundRef = useRef<PencilSound | null>(null)
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
      console.warn(
        `[order] layer ${layerId}: seq ${seq} applied after ${highest} was already on screen — `
        + 'a concurrent stroke likely composited out of true order (see layerAppliedSeqRef\'s doc comment)',
      )
      return
    }
    layerAppliedSeqRef.current.set(layerId, seq)
  }, [])
  // (#289 epic — reliable history spec v0.2 §2/§4) layerId/folderId this
  // client itself created but the server hasn't confirmed yet — the
  // "local island" isLocalIslandSafe checks a layer_delete/layer_merge/
  // layer_transform's targets against. Added the instant a layer_add/
  // folder_add is dispatched (see onLocalOperation below), removed once
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
  const lastActiveAtRef   = useRef<Record<string, number>>({})
  const strokeActiveRef   = useRef(false)
  const lastCursorSentRef = useRef(0)
  // Stroke ops whose live reveal (previewOperation) hasn't finished playing
  // yet — i.e. not yet appendOperation'd into the log/layer. Consulted by
  // handleOperationConfirmed so a fast operation_undo/operation_revoke
  // targeting one of these can drop it from the reveal instead of trying
  // (and silently failing) to undo an op the log was never given.
  const pendingPreviewOpIdsRef = useRef<Set<string>>(new Set())
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
  // instance per room id; recreated (fresh `attempted` set) if `id` ever
  // changes, same lifetime as the socket-wiring effect below.
  const snapshotUploader = useMemo(() => (id ? createSnapshotUploader(id) : null), [id])
  // Highest seq the engine buffer has actually *committed* (painted) up to —
  // deliberately decoupled from latestKnownSeqRef's "arrived" tracking.
  // A peer stroke doesn't commit on arrival: it reveals progressively
  // (previewOperation/onPreviewApplied, paced by the stroke's own recorded
  // dab timing — see PencilEngineOptions.onPreviewApplied), and two peers'
  // reveals can finish out of order (a short stroke's reveal completing
  // before a longer, earlier-seq one that's still animating). Baking a
  // network snapshot the moment a seq merely *arrives* could therefore miss
  // an earlier op that hasn't actually painted yet. pendingCommitSeqsRef
  // holds every stroke seq that has arrived but not yet committed; the
  // watermark can only advance past the smallest still-pending one — see
  // checkSnapshotBoundary below, the single place that reads both.
  const pendingCommitSeqsRef = useRef<Set<number>>(new Set())
  const committedWatermarkRef = useRef(0)
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
  const replayIncompleteRef = useRef(false)
  const checkSnapshotBoundary = useCallback(() => {
    const engine = engineRef.current
    if (!engine || !snapshotUploader || replayIncompleteRef.current) return
    const pending = pendingCommitSeqsRef.current
    const watermark = pending.size ? Math.min(...pending) - 1 : latestKnownSeqRef.current
    if (watermark <= committedWatermarkRef.current) return
    const previous = committedWatermarkRef.current
    committedWatermarkRef.current = watermark
    snapshotUploader.onSeqObserved(previous, watermark, engine, useRoomStore.getState().layerState)
  }, [snapshotUploader])

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
  const outbox = useMemo(() => new Outbox({
    storage: createIndexedDbOutboxStorage(),
    // (#358) Binds this queue to this room, in storage as well as in memory.
    // `id` is in the dep list below for the same reason: a queue holding one
    // room's unconfirmed strokes must not survive into another room — that is
    // exactly how they used to get sent there.
    roomId: id ?? '',
    send: op => sendOperationWithTimeout(socketRef.current, op),
    // (#298) Nothing may go out before create_room/join_room has completed:
    // the server has no room to record against and answers `not_joined`, so
    // every such send is guaranteed to fail. This used to drain on *connect*
    // instead, which on a tablet with a 384-operation backlog meant blasting
    // ~55 MB of stroke JSON at a socket that had joined nothing — every
    // reconnect, forever.
    canSend: () => hasJoinedRef.current,
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
  }), [id, checkSnapshotBoundary, noteLayerSeq, scheduleLostWorkRecovery, resolveTransformCommit])
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

  // (#405) `drawingTool`, not `tool`: these are the size/opacity/colour the
  // engine is configured with, and while the ruler or the gizmo is selected
  // `tool` names something that has no such fields at all.
  const activeCfg = toolSettings[drawingTool]

  // Read directly inside useViewport's native pointerdown listener — see
  // that hook's doc comment for why a ref (checked synchronously, before
  // React ever re-renders) is required here instead of just having the
  // catcher call e.stopPropagation() itself. The ruler shares that catcher but
  // is pen-only (see handleRulerDown), so it never reserves a touch here — a
  // finger always pans/zooms while the ruler is in hand, exactly like it does
  // while drawing with the pencil.
  const toolActiveRef = useRef(false)
  toolActiveRef.current = eyedropperActive

  // (#362) Declared before useViewport because it feeds it: the pinch/rotate
  // edges the toast lives by are only observable from inside that hook's own
  // gesture handlers.
  const { toastVisible: viewportToastVisible, onPinchPhase, hide: hideViewportToast } = useViewportToast()

  const { vp, setVp, vpRef, setVpNode, vpEl, canvasWrapRef, fitCanvas, angleDeg, canvasTransform } =
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

  // Hand tool (#319) — the drag itself lives in useViewport; Room owns the
  // ways in and out of the mode, and what the mode looks like.
  const handTool = useRoomStore(s => s.handTool)
  const setHandTool = useRoomStore(s => s.setHandTool)
  const setHandHeld = useRoomStore(s => s.setHandHeld)
  const handHeld = useRoomStore(s => s.handHeld)
  const handActive = handTool || handHeld
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
  useTapToggle(vpEl, toggleUI, tapToHideEnabled, tapDebugEnabled ? setTapDebug : undefined)

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
  // (below) periodically prunes stale entries into `drawingIds`.
  const markActive = useCallback((activeUserId: string) => {
    lastActiveAtRef.current[activeUserId] = Date.now()
  }, [])

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
    try {
      await engine.retryPaper()
      setPaperFailed(false)
      requestFullResyncRef.current?.()
    } catch (err) {
      // Stays on this screen with the button live again — a second attempt is
      // exactly as reasonable as the first was, and there is nothing else to
      // offer that reloading would not do worse.
      console.error('paper texture retry failed', err)
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
  const initLayersFromLayerState = useCallback((engine: PencilEngineAPI, ls: LayerState) => {
    for (const item of Object.values(ls.items)) {
      if (item.kind === 'layer') engine.initLayer(item.id)
    }
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
  const restoreFromSnapshot = useCallback(async (engine: PencilEngineAPI, snapshot: RestoredSnapshot) => {
    initLayersFromLayerState(engine, snapshot.layerState)
    for (const [layerId, layer] of snapshot.layers) {
      engine.restoreLayerFromSnapshot(layerId, layer.tiles, layer.coveredSeq)
    }
    engine.setActiveLayer(snapshot.layerState.activeId)
    engine.setCompositeOrder(computeCompositeOrder(snapshot.layerState))
    restoredLayerStateRef.current = snapshot.layerState
  }, [initLayersFromLayerState])

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

  // (#345) Remember this room's paper so the *next* launch can start
  // downloading the right ~7.4 MB texture before anything is opened (see
  // App's usePaperPrefetch). Recorded on every room, not just the first: the
  // useful guess is the paper the person actually works on, and a teacher who
  // always uses one grain should never pay for the texture twice.
  useEffect(() => {
    if (config) useSettingsStore.getState().setLastPaperType(config.paper)
  }, [config])

  // ── mount engine ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!config || !canvasRef.current) return
    const engine = new PencilEngine(canvasRef.current, {
      infinite: config.infinite,
      paper: config.paper,
      paperColor: config.paperColor ? hexToRgb(config.paperColor) : undefined,
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
      onPreviewApplied: op => {
        pendingPreviewOpIdsRef.current.delete(op.id)
        pendingCommitSeqsRef.current.delete(op.seq ?? 0)
        applyRemoteOp(op)
        syncFromLog()
        checkSnapshotBoundary()
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

    // Pencil sound: lazy AudioContext built on the engine's own 'strokeStart'
    // below (a real pointerdown gesture, satisfying the autoplay-unlock
    // requirement) — see PencilSound's docstring.
    // (#321) The sound instance is no longer built here: it is a setting that
    // can be switched on and off mid-lesson, and tearing down a WebGL context
    // to change that would be absurd. See the sound-lifecycle effect below —
    // the handlers wired up next reach it through the ref at event time, so
    // neither effect has to run before the other.

    // Local "drawing" activity (#38): strokeStart/strokeEnd bound the local
    // stroke exactly; 'pointer' (fired on every move while the stroke's
    // pointer button is held — see PointerInput's `_active` gating) refreshes
    // it so a long stroke doesn't let the indicator time out mid-draw. Cursor
    // broadcast (#37) is handled separately below via a raw DOM listener,
    // since it must also fire on plain hover (engine 'pointer' does not).
    // Same handlers also drive the pencil-sound experiment above when enabled.
    engine
      .on('strokeStart', e => {
        strokeActiveRef.current = true
        useRoomStore.getState().setStrokeActive(true)
        diagLog('stroke: start')
        markActive(useRoomStore.getState().userId)
        pencilSoundRef.current?.start(e.pressure, e.speed, e.tiltX, e.tiltY)
      })
      .on('strokeEnd', () => {
        strokeActiveRef.current = false
        useRoomStore.getState().setStrokeActive(false)
        diagLog('stroke: end')
        pencilSoundRef.current?.stop()
      })
      .on('pointer', e => {
        if (strokeActiveRef.current) {
          markActive(useRoomStore.getState().userId)
          pencilSoundRef.current?.update(e.pressure, e.speed, e.tiltX, e.tiltY)
        }
      })

    const ls = useRoomStore.getState().layerState
    for (const id of ls.rootOrder) {
      if (ls.items[id]?.kind === 'layer') engine.initLayer(id)
    }
    engine.setActiveLayer(ls.activeId)
    engine.setCompositeOrder(computeCompositeOrder(ls))

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
        // (#346) A failure here abandons the replay rather than running it
        // against the placeholder: awaitPaper puts up the retry screen, and
        // roomContentReady stays false so the room is not claimed to be open.
        if (!(await awaitPaper(engine))) return
        try {
          // (#147) A fresh room's history can be hundreds/thousands of ops —
          // without this, appendOperation's own per-op _display() (full
          // composite + paper-blend) fires once per operation on the very
          // first paint the user sees, a visible join-time freeze that grows
          // with the room's history. suspendDisplay/resumeDisplay defer all
          // of that to one _display() right after the loop — see their own
          // doc comments.
          engine.suspendDisplay()

          // (#169) A brand-new mount always has lastKnownSeq 0 (nothing local
          // to already be caught up on) — restore whenever the room has a
          // snapshot at all, no watermark comparison needed here the way
          // handleRoomState's reconnect branch needs one.
          let restoredFromSnapshot = false
          if (id && pending.latestSnapshotSeq !== null) {
            const snapshot = await fetchLatestSnapshot(id)
            if (snapshot) { await restoreFromSnapshot(engine, snapshot); restoredFromSnapshot = true }
          }

          // (#398) Reference images decoded before the loop, not inside it —
          // see PencilEngineAPI.preloadImages. Without this, the operations
          // recorded *after* an import replay against a layer whose image
          // has not landed yet.
          await engine.preloadImages(pending.tailOperations)

          // (#385) Per-operation, not around the whole loop. One operation
          // that throws used to abandon every operation after it — and in the
          // real case that produced this guard (a GL allocation failing part
          // way through a 2001-operation room) the ones after it were the
          // overwhelming majority. Applying the rest is strictly better: the
          // canvas ends up missing whatever those particular operations drew
          // rather than missing the entire lesson.
          //
          // The room is still marked incomplete either way — see
          // replayIncompleteRef for what that stops this client from doing.
          let failed = 0
          for (const op of pending.tailOperations) {
            try {
              applyRemoteOp(op)
            } catch (err) {
              // Only the first is reported. A failure here is normally a dead
              // GL context, in which case every subsequent operation fails the
              // same way, and a thousand identical events tell Sentry nothing
              // the first one didn't while costing the quota of everything else
              // that day.
              if (failed === 0) Sentry.captureException(err)
              failed++
            }
          }
          if (failed > 0) {
            replayIncompleteRef.current = true
            notifyError(tRef.current('room.replayIncomplete'), { key: 'replay-incomplete', durationMs: null })
          }
          engine.resumeDisplay()
          // (#386) Now, not on the next microtask: the bootstrap below reads
          // the store back in this same task. See syncFromLogNow.
          syncFromLogNow()
          dispatchParticipants({ type: 'room_state', participants: pending.participants })
          useRoomStore.getState().setPalette(pending.palette)
          useRoomStore.getState().setRoomFrozen(pending.frozen)

          if (id && restoredFromSnapshot && pending.latestSnapshotSeq !== null) {
            void backfillHistory(id, engine, pending.latestSnapshotSeq)
          }
          // A room that has never had a snapshot at all stays stuck doing
          // this same full-history replay on every future join, no matter
          // how large its history grows — nobody is ever "live" at the
          // moment a checkpoint boundary is crossed for a room like that
          // (see handleRoomState's own comment on why bulk catch-up is
          // normally *not* baked). Bootstrapping one here, right after
          // finishing this catch-up, specifically only when
          // latestSnapshotSeq is still null, fixes that without changing
          // behavior for any room that already has a snapshot (every
          // future join of *this* room now gets the fast path instead).
          if (pending.latestSnapshotSeq === null && snapshotUploader) {
            snapshotUploader.onSeqObserved(0, latestKnownSeqRef.current, engine, useRoomStore.getState().layerState)
          }
        } finally {
          // Runs even if fetchLatestSnapshot/restore/replay throws — a failed
          // restore must still unblock drawing rather than leave the canvas
          // permanently inert (see roomContentReady's own doc comment for what
          // this guards against). Deliberately no longer covers the paper
          // load, which moved above it: those two failures look alike and are
          // opposites. A missing snapshot leaves an engine that draws fine on
          // an incomplete canvas, so unblocking is the lesser harm; a missing
          // paper texture leaves an engine that cannot draw at all, so
          // unblocking buys nothing and costs the only honest signal there is.
          setRoomContentReady(true)
        }
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
      void (async () => { if (await awaitPaper(engine)) setRoomContentReady(true) })()
    }

    return () => {
      engineRef.current = null
      // (#211 epic follow-up) Best-effort final thumbnail bake on room exit —
      // see uploadThumbnail's doc comment in snapshotSync.ts for why this
      // needs to exist alongside the seq-boundary trigger. `engine` (this
      // closure's local, not engineRef.current — already nulled above) stays
      // alive until the export settles; destroy() only runs after, so
      // exportPNG never reads from a torn-down GL context.
      // (#385) Not from a canvas we know is incomplete — republishing a blank
      // preview over a real lesson's is the same mistake as baking a snapshot
      // from it, just cheaper to undo. See replayIncompleteRef.
      if (id && !replayIncompleteRef.current) {
        void uploadThumbnail(id, engine).finally(() => engine.destroy())
      } else {
        engine.destroy()
      }
    }
  }, [
    id, config, markActive, applyRemoteOp, syncFromLog, syncFromLogNow, debugEnabled, predictEnabled,
    hapticGrainEnabled, checkSnapshotBoundary, restoreFromSnapshot, backfillHistory,
    grainMode, charcoalGrainMode, dispatchParticipants, isCreator, snapshotUploader, noteLayerSeq, outbox,
    awaitPaper,
  ])

  // ── sync tool → engine ────────────────────────────────────────────────────────
  const pencilGrade = toolSettings.pencil.grade as PencilGradeName
  const linerSize = toolSettings.liner.size as string
  const markerNib = toolSettings.marker.nib as string
  const markerSize = toolSettings.marker.size as number
  const charcoalType = toolSettings.charcoal.type as string
  // Same preset string engine.setPencil below records (`${nib}:${size}` for
  // marker, the size label for liner, the charcoal type for charcoal, the
  // grade name otherwise) — only marker's own dispatch (bullet/chisel)
  // actually reads it (shapingForTool -> shapingForMarkerPreset), but
  // BrushCursor takes the same shape every tool's real stroke would, not a
  // marker-only special case.
  const cursorPresetName = drawingTool === 'marker' ? `${markerNib}:${markerSize}`
    : drawingTool === 'liner' ? linerSize
    : drawingTool === 'charcoal' ? charcoalType
    : pencilGrade
  useEffect(() => {
    pencilSoundRef.current?.setHardness(PENCIL_PRESETS[pencilGrade].hardness)
  }, [pencilGrade])
  // (#321) Sound is a live setting, so its whole lifetime hangs off this one
  // effect rather than off the engine's: turning it on builds the graph,
  // turning it off tears it down (an AudioContext left open holds a real
  // audio device). Deliberately not keeping a silent instance around while
  // off — the graph is lazy anyway (PencilSound.ensureGraph runs on the first
  // stroke), so there is nothing to preserve, and "off" should mean nothing
  // is holding the speaker.
  //
  // Tool and grade are read at build time rather than being dependencies:
  // both have their own effects that push changes into the existing instance
  // (setActiveGrain/setHardness below), and rebuilding the graph on every
  // tool switch would drop the AudioContext mid-lesson.
  useEffect(() => {
    if (!soundEnabled || !config) return
    const { drawingTool: currentTool, toolSettings: currentSettings } = useRoomStore.getState()
    const grain = TOOL_SOUND_CONFIGS[currentTool]
    if (!grain) return
    const sound = new PencilSound(config.paper, grain)
    sound.setHardness(PENCIL_PRESETS[currentSettings.pencil.grade as PencilGradeName].hardness)
    sound.setVolume(useSettingsStore.getState().soundVolume)
    pencilSoundRef.current = sound
    return () => {
      sound.destroy()
      if (pencilSoundRef.current === sound) pencilSoundRef.current = null
    }
  }, [soundEnabled, config])
  useEffect(() => {
    pencilSoundRef.current?.setVolume(soundVolume)
  }, [soundVolume])
  // #278/#279: marker chisel angle → engine.setMarkerAngle, always resolved
  // to canvas-space radians before it ever reaches the engine (same
  // "engine only ever sees canvas-space" boundary PointerInput.setTransform
  // already keeps for pointer coordinates). "Зафиксировать угол кисти
  // относительно холста" off means the angle should look visually
  // unchanged on screen as the local camera rotates — since a canvas-space
  // mark gets carried along by vp.angle's own CSS rotation at display time
  // (useViewport.ts: `rotate(${v.angle}rad)`), staying screen-fixed means
  // continuously subtracting the live vp.angle here. On (or in
  // followStrokeDirection mode, where the angle is inherently already
  // canvas-space via the stroke's own tangent) the configured value is used
  // as-is. Reads vp.angle directly (not the throttled roomStore viewport
  // copy) so this tracks a live rotate gesture without lag.
  const markerAngleDeg = toolSettings.marker.angle as number
  const markerFollowStroke = toolSettings.marker.followStrokeDirection as boolean
  const lockAngleToCanvas = useSettingsStore(s => s.lockBrushAngleToCanvas)
  // Also fed to BrushCursor's hover preview below (previewDabShape), so the
  // preview shows the exact same canvas-space angle a real stroke would
  // record — BrushCursor's own doc comment: its angle is rendered as a
  // plain canvas-space value, with the viewport's own CSS transform (an
  // ancestor element) supplying the on-screen rotation for free, same as
  // Dab.angle itself.
  const markerCanvasAngleRadians = markerFollowStroke || lockAngleToCanvas
    ? (markerAngleDeg * Math.PI) / 180
    : (markerAngleDeg * Math.PI) / 180 - vp.angle
  useEffect(() => {
    engineRef.current?.setMarkerAngle(markerCanvasAngleRadians, markerFollowStroke)
  }, [markerCanvasAngleRadians, markerFollowStroke])
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
  useEffect(() => { engineRef.current?.setTiltResponse(tiltResponse) }, [tiltResponse])
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
    // Charcoal (#304) is the one tool whose preset string the engine reads
    // back *and* which needs nothing composed into it: the type name alone
    // ('vine'/'willow'/'compressed') is what _resolvePreset -> charcoalPresetFor
    // resolves, since all three types share one dab geometry (ADR 005 §2).
    const markerPreset = `${markerNib}:${markerSize}`
    engineRef.current?.setPencil(
      drawingTool === 'liner' ? linerSize
        : drawingTool === 'marker' ? markerPreset
        : drawingTool === 'charcoal' ? charcoalType
        : pencilGrade,
    )
  }, [drawingTool, pencilGrade, linerSize, markerNib, markerSize, charcoalType])
  // (#405) Every line in this block reads `drawingTool` rather than the
  // selection: `setTool` takes a `ToolType`, and the four non-painting tools
  // are deliberately not one (toolSlice). Leaving the engine configured with
  // the last real drawing tool is also what makes switching back to it
  // instant — nothing to re-push, since nothing was ever unset. What actually
  // stops paint while the ruler or the gizmo is selected is `engine.setLocked`
  // (see the layer-state sync effect), one gate rather than a second copy of
  // "which tools can draw" living in here.
  useEffect(() => { engineRef.current?.setTool(drawingTool) }, [drawingTool])
  useEffect(() => {
    // #253: each tool has its own recipe; swapping it keeps the one graph and
    // only changes what drives it (see PencilSound.setActiveGrain).
    const grain = TOOL_SOUND_CONFIGS[drawingTool]
    if (grain) pencilSoundRef.current?.setActiveGrain(grain)
  }, [drawingTool])
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
    engineRef.current?.setOpacity(activeCfg.opacity as number)
  }, [sizePx, activeCfg])
  // Which tool's own color field the "Color" SidePanel tab, the palette
  // swatches, FloatingToolPanel's color dot and the eyedropper all read and
  // write — lastDrawingTool rather than `tool` directly, so it still reflects
  // liner/marker while eraser/smudge is briefly active on top of it, same
  // reasoning as lastDrawingTool itself (see toolSlice.ts). Typed as
  // ColorCapableTool (toolSchemas.ts), the capability these consumers
  // actually depend on — not re-listing pencil/liner/marker by hand here.
  const colorTool: ColorCapableTool = lastDrawingTool
  const colorToolColor = getToolColor(toolSettings, colorTool)
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
  const activeColor = getToolColor(toolSettings, pickedColorTool)
  useEffect(() => { engineRef.current?.setColor(activeColor) }, [activeColor])
  // FloatingToolPanel (#157) is a fixed 4-slot compass layout with room for
  // only one drawing-tool button (see its own doc comment — "the 4 most-
  // reached-for actions") — marker now shares that one slot with pencil/
  // liner (whichever was actually last selected), the same way liner joined
  // it in #245's own follow-up. Only smudge stays outside it — no
  // dedicated "return to smudge" affordance exists anywhere today.
  const floatingPrimaryTool: PrimaryDrawingTool = lastDrawingTool
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
  // (#254/#256/#259) Optimistic-free, same as palette add/remove above — the
  // server is the only writer of `roomFrozen` (via room_frozen_changed);
  // this just requests the change. socketHandlers.ts rejects the request
  // outright for a non-owner, so wiring the button to always be callable
  // here is safe (the header button itself is also only rendered for the
  // owner — see the render section below — this stays defensive either way).
  const toggleRoomFrozen = useCallback(() => {
    socketRef.current?.emit('set_room_frozen', !useRoomStore.getState().roomFrozen)
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
    if (!id) return
    setClosedBusy(true)
    try {
      const updated = await setRoomClosed(id, false)
      useRoomStore.getState().setRoomClosedAt(updated.closedAt ?? null)
    } catch {
      void showAlert({ message: t('room.error.reopen') })
    } finally {
      setClosedBusy(false)
    }
  }, [id, showAlert, t])
  // (#222/#317) The student half: a closed lesson is homework, and this is
  // how it gets taken. Navigates *into* the copy — the opposite of the same
  // action in the lesson list (#317), and for the opposite reason: there the
  // point is to hand copies out, here the point is to start working.
  const takeRoomCopy = useCallback(async () => {
    if (!id) return
    setClosedBusy(true)
    try {
      const { room: copy } = await forkRoom(id, t('lessons.forkedName', { name: config?.name ?? '' }))
      navigate(`/room/${copy.id}`)
    } catch {
      void showAlert({ message: t('room.error.takeCopy') })
      setClosedBusy(false)
    }
  }, [id, navigate, config?.name, showAlert, t])
  // (#211 epic, #216) The same owner-only rename the lesson list offers, in
  // the one place the name is already on screen: click the header label and
  // it becomes the field. Non-null draft *is* the editing state — there is no
  // separate boolean, so the two can't disagree. REST rather than a socket
  // event, same reasoning as reopenRoom above: the name is persisted room
  // metadata, not canvas content, and PATCH /api/rooms/:id is where it lives
  // (roomRoutes.ts, which re-checks ownership — the owner gate here is UI,
  // not a boundary). Deliberately not broadcast: everyone else keeps the name
  // they joined with until their next join, and nothing but this label and
  // the export filename reads it.
  const [renameDraft, setRenameDraft] = useState<string | null>(null)
  const submitRename = useCallback(async () => {
    const draft = renameDraft
    setRenameDraft(null)
    const name = draft?.trim()
    const previous = useRoomStore.getState().room?.name
    if (!id || !name || name === previous) return
    // Optimistic: the field is already gone by now, so the label has to be
    // carrying the new name or the edit reads as having been dropped.
    useRoomStore.getState().setRoomName(name)
    try {
      await renameRoom(id, name)
    } catch {
      if (previous !== undefined) useRoomStore.getState().setRoomName(previous)
      void showAlert({ message: t('room.error.rename') })
    }
  }, [id, renameDraft, showAlert, t])
  // (#254/#257/#259) Same reasoning as toggleRoomFrozen above, targeted at
  // one participant — passed to ParticipantsPanel's onToggleFreeze.
  const toggleParticipantFrozen = useCallback((userId: string, frozen: boolean) => {
    socketRef.current?.emit('set_participant_frozen', { userId, frozen })
  }, [])
  // FloatingToolPanel's palette flyout escape hatch: show the full chrome
  // and land on the Color tab, same destination the eyedropper's pick
  // handler already uses (see handleEyedropperPick) for "go refine this
  // further than a quick swatch tap allows."
  const openColorPickerFromFlyout = useCallback(() => {
    setUiHidden(false)
    setActivePanel('color')
  }, [])
  // Persist last-used settings per room (#156/#196) — mirrors the pattern
  // above (derived state -> engine), just targeting storage instead.
  useEffect(() => {
    if (!id) return
    saveToolSettings(localStorage, id, toolSettings)
  }, [id, toolSettings])

  // ── sync layer state → engine ─────────────────────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setActiveLayer(layerState.activeId)
    // A non-drawing tool (#155, generalized in #405): the gizmo and the ruler
    // catcher are separate overlays on top of the canvas, not something that
    // intercepts/consumes the canvas's own native pointer events — without
    // this, dragging a gizmo handle *also* drew a real stroke underneath at
    // the same time (every pointermove reached both the gizmo's drag handler
    // and PointerInput's canvas listener), which is what those stray lines
    // during a drag were. setLocked only gates PencilEngine._onStart (see
    // engine/index.ts) — it doesn't touch layerState itself, so this never
    // shows the layer as locked in LayerPanel; it's purely "don't start a new
    // stroke right now," same effect a real per-layer lock has, just for a
    // different reason.
    //
    // (#405) One condition covers all four non-painting tools rather than
    // naming transform alone. That is the whole of "selecting the ruler means
    // you cannot draw": the engine still holds a fully configured drawing tool
    // (see the tool sync above), it is simply not allowed to start a stroke,
    // and switching back needs nothing pushed to undo it.
    //
    // (#359) A hidden layer refuses paint through the same gate, for a third
    // reason: it isn't in the composite, so a stroke drawn on it is invisible
    // to everyone — including its author — while still travelling to every
    // participant and into the log. Silently, with no warning, exactly like
    // the lock: the eye in the layer panel already says why nothing happens.
    engine.setLocked(
      isLayerLocked(layerState.items[layerState.activeId])
      || !isEffectivelyVisible(layerState, layerState.activeId)
      || !isDrawingTool(tool),
    )
    engine.setCompositeOrder(computeCompositeOrder(layerState))
  }, [layerState, tool])

  // ── sync viewport → engine ────────────────────────────────────────────────────
  useEffect(() => {
    const el = vpRef.current; if (!el) return
    if (config?.infinite) {
      // Infinite canvas (#133 Phase 1): (vp.cx, vp.cy) is the gesture
      // layer's own convention — screen position (relative to the
      // viewport's own top-left, not window-absolute) of whatever world
      // point currently sits under it — same tracked-by-delta state
      // useViewport already produces for the bounded/CSS-pan path, just
      // reinterpreted rather than fed through transformFor's CSS string
      // (see useViewport's own comment). setInfiniteCamera wants the
      // inverse: the world point at screen CENTER — see cameraMath.ts's
      // screenToWorld (#143 factored this out of an inline hand-solved
      // version so the overlay components below could share the exact
      // same conversion instead of re-deriving it).
      const { x: wx, y: wy } = screenToWorld(el.clientWidth / 2, el.clientHeight / 2, vp)
      // vp.zoom is CSS px per world unit; the engine renders into a
      // DPR-sized backing store (see the ResizeObserver below), so it wants
      // physical px per world unit — see deviceNativeZoom's doc comment.
      engineRef.current?.setInfiniteCamera(wx, wy, vp.zoom / deviceNativeZoom(), vp.angle)
      return
    }
    const rect = el.getBoundingClientRect()
    engineRef.current?.setViewport(rect.left + vp.cx, rect.top + vp.cy, vp.zoom, vp.angle)
  }, [vp, vpRef, config?.infinite])

  // ── infinite canvas: canvas element tracks the viewport container's own
  // size (#133 Phase 1) — there's no fixed room size to size it to instead.
  // A bounded-canvas room's canvas size is fixed for the room's lifetime
  // and never needs this.
  useEffect(() => {
    if (!config?.infinite) return
    const el = vpRef.current
    const engine = engineRef.current
    if (!el || !engine) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      // Backing store at physical-device resolution (contentRect is CSS px),
      // so at the device-native zoom the UI calls 100% one tile texel lands
      // on exactly one physical pixel — see deviceNativeZoom's doc comment.
      // The element's own CSS size is set separately (width/height: 100%).
      const nz = deviceNativeZoom()
      if (width > 0 && height > 0) {
        engine.resizeCanvas(Math.round(width / nz), Math.round(height / nz))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [config?.infinite, vpRef])

  // ── local cursor broadcast (#37) ──────────────────────────────────────────────
  // A raw DOM listener rather than the engine's 'pointer' event: that one only
  // fires while a stroke's pointer button is held (see PointerInput's
  // `_active` gating in engine/src/PointerInput.ts), but peers should see the
  // cursor while just hovering too. Reads `vp`/`config` via refs so the
  // listener isn't torn down and rebuilt on every pan/zoom.
  // Pen/mouse only, same devices PointerInput accepts for actual drawing —
  // touch drives pan/pinch/rotate here (see useViewport), not pointing, so
  // broadcasting it made a peer's cursor jump around whenever a finger
  // touched down to pan while a peer was mid-gesture (see chat).
  // `drawing` (see CursorMoveData in packages/shared) tells peers to freeze
  // this cursor at its last position instead of following it — the actual
  // stroke shape isn't approximated live any more (#37 follow-up v2): peers
  // instead replay the finished StrokeOperation's own dabs once it lands
  // (see handleOperationConfirmed below).
  useEffect(() => {
    const el = vpRef.current
    if (!el || !config) return
    // (#155 follow-up) Cached rect, same forced-reflow reasoning as the
    // engine's own _getCanvasRect (see its doc comment) — el.getBoundingClientRect()
    // is a synchronous layout read, and this handler runs on every real
    // pointermove reaching the viewport (throttled to shouldEmitCursor's own
    // rate for the *emit*, but the read itself ran unthrottled before this).
    // Invalidated only by a real resize of the viewport container itself —
    // panning/zooming/drawing never move or resize that element.
    let rectCache: DOMRect | null = null
    const observer = new ResizeObserver(() => { rectCache = null })
    observer.observe(el)
    const handleMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const now = Date.now()
      if (!shouldEmitCursor(lastCursorSentRef.current, now)) return
      lastCursorSentRef.current = now
      const rect = rectCache ??= el.getBoundingClientRect()
      // #143: world-space for infinite rooms (clientToRoomPoint), matching
      // what getContentBounds/painted content already use there — so a
      // peer's PeerCursors marker (rendered through the same camera
      // conversion, see the render section below) lands on the actual
      // world point the cursor is over, not wherever it happened to be
      // relative to an arbitrary placeholder canvas size.
      const { x, y } = clientToRoomPoint(e.clientX, e.clientY, rect, useRoomStore.getState().viewport, config)
      socketRef.current?.emit('cursor_move', { x, y, drawing: strokeActiveRef.current })
    }
    el.addEventListener('pointermove', handleMove)
    return () => {
      el.removeEventListener('pointermove', handleMove)
      observer.disconnect()
    }
  }, [config, vpRef])

  // ── operation log bridge ──────────────────────────────────────────────────────
  // (syncFromLog is defined above, alongside markActive, since the mount-engine
  // effect needs it too — see the pending-snapshot replay there.)
  // #185's audit: LayerPanel's onOp and TransformGizmo's commit both go
  // through dispatchOp, and undo/redo has both header buttons and hotkeys —
  // all four paths are safe no-ops while roomContentReady is false, the same
  // window the canvas itself is already pointer-events:none for (see
  // roomContentReady's own doc comment). A single guard here rather than
  // disabling each control individually — the visible preloader already
  // covers the canvas, and this window is a couple of seconds at most.
  //
  // (#254 epic, #222) editingBlocked added to the same guard: the server
  // rejects these operations outright once the room is frozen (#256/#257) or
  // closed for editing (#222), so without this the sender could still see
  // their own stroke/undo/redo apply locally before silently failing to ever
  // reach anyone else — "drawing into the void" (see its own doc comment).
  const dispatchOp = useCallback((draft: OperationDraft): DispatchedOp | null => {
    if (!roomContentReady || editingBlocked) return null
    const op = { ...draft, id: nanoid(10), userId: useRoomStore.getState().userId, timestamp: Date.now() }

    if (isLocalIslandSafe(op, pendingIdsRef.current)) {
      engineRef.current?.appendOperation(op) // source defaults to 'local' → broadcast via onLocalOperation
      syncFromLog()
      return { op, applied: true }
    }

    // (#289 §17) The same operation offline: it can only be resolved by the
    // server (that's what made it non-optimistic in the first place), and
    // queueing it would let it land minutes later against a room that has
    // since moved on. Refuse it up front, visibly, rather than appearing to
    // accept it. Operations confined to this client's own local island are
    // unaffected — they took the optimistic branch above and work offline.
    if (!connected) {
      // Fire-and-forget (#310): nothing here waits on the dismissal, the
      // operation is refused either way.
      void showAlert({ message: t('room.offlineSharedAction') })
      return null
    }

    // (#289 §2/§4) References at least one id this client didn't itself
    // just create — a concurrent delete/merge/transform race is possible
    // (the server checks aliveIds, see rooms.ts), so this must not become
    // visible locally until confirmed. Sent directly, bypassing
    // appendOperation/onLocalOperation (which would paint it immediately) —
    // handleOperationConfirmed's ordinary applyRemoteOp fallback applies it
    // for real if/when operation_confirmed for this id actually arrives,
    // exactly like a peer's own op. Still goes through the Outbox (#289 §9)
    // so a dropped packet is retried rather than silently swallowed — its
    // `onSettled` handles the verdict either way.
    void outbox.enqueue(op)
    return { op, applied: false }
  }, [syncFromLog, roomContentReady, editingBlocked, outbox, connected, t, showAlert])

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

  // (#263) A structural undo/redo (layer_add/layer_delete/layer_merge) can
  // silently wipe a layer's content on the canvas even though nothing is
  // actually lost from the log (see docs/adr/002-collaborative-undo.md and
  // this issue's own repro) — peekUndo/peekRedo is a read-only look at what
  // the pending call would act on, so a decline here leaves state exactly
  // as if the button/hotkey was never pressed.
  //
  // (#310) These two now await an in-app dialog instead of blocking on
  // window.confirm. One real difference: window.confirm froze all JS, so the
  // peek below could not go stale while it was up — an awaited dialog lets
  // peers' operations keep arriving. That's acceptable here because the peek
  // only decides whether to *ask*: undo()/redo() re-resolve their own target
  // when they actually run, so a confirmed undo still acts on current state.
  const handleUndo = useCallback(async () => {
    if (!roomContentReady || editingBlocked) return
    // (#405) An open session with gestures in it is what "undo" means right
    // now, and it is undone by throwing it away — nothing was committed, so
    // there is no entry on the stack to take back and nothing to confirm.
    // Reaching past it into the log would take back some *earlier* operation
    // while the preview carried on showing gestures the layer never received,
    // i.e. appear to do nothing at all. Same answer as Esc, deliberately:
    // both mean "not that", and a session is the innermost thing open.
    if (transformSessionRef.current && !isIdentityMatrix(transformSessionRef.current.matrix)) {
      resetTransformSessionRef.current()
      return
    }
    const peek = engineRef.current?.peekUndo()
    if (peek?.hasOtherContent && !await confirm({
      title: t('room.undo'),
      message: t('room.confirmUndo'),
      confirmLabel: t('room.undo'),
      danger: true,
    })) return
    // Reset *after* the undo, not before: re-opening the session re-derives
    // the gizmo bounds from the layer, and doing that first would read the
    // pixels the undo is about to change. Both happen in this one task, so
    // nothing is painted in between.
    const undone = engineRef.current?.undo()
    resetTransformSessionRef.current()
    if (undone) syncFromLog()
  }, [syncFromLog, roomContentReady, editingBlocked, t, confirm])

  const handleRedo = useCallback(async () => {
    if (!roomContentReady || editingBlocked) return
    const peek = engineRef.current?.peekRedo()
    if (peek?.hasOtherContent && !await confirm({
      title: t('room.redo'),
      message: t('room.confirmRedo'),
      confirmLabel: t('room.redo'),
      danger: true,
    })) return
    // Same ordering as handleUndo above.
    const redone = engineRef.current?.redo()
    resetTransformSessionRef.current()
    if (redone) syncFromLog()
  }, [syncFromLog, roomContentReady, editingBlocked, t, confirm])

  // (#357) The document root goes fullscreen, not the editor element.
  //
  // A fullscreen element is rendered in the browser's *top layer*, above every
  // z-index in the page, and nothing outside it is painted at all. Everything
  // this app portals into `<body>` — the layer row's "⋮" menu, every Modal and
  // ConfirmDialog, the notice stack, the tool pickers — is a sibling of the
  // editor rather than a descendant, so with the editor fullscreened all of it
  // silently stopped existing on screen: the menu opened, held state, passed
  // `checkVisibility()`, and was neither visible nor clickable. On a tablet,
  // where fullscreen is the normal way to work, that was half the interface.
  // Fullscreening `documentElement` keeps every portal inside the fullscreen
  // element, including ones added later, and changes nothing about layout —
  // the editor already fills the page.
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }, [])

  // Fullscreen can also be exited by the browser/OS itself (Esc, system
  // gesture) without going through toggleFullscreen — listen rather than
  // trust the button's own click to keep the icon in sync.
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

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
      setToolSetting(pickedColorTool, 'color', picked)
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
      setActivePanel('color')
    }
  }, [vpRef, vp, config, handActive, setToolSetting, pickedColorTool, setTool, drawingTool, toolSettings.eyedropper, addPaletteColor])

  // Ruler tool (#89, #405): the engine only ever knows about the ruler as a
  // *snapping* guide, so this is where "is there a line to snap to right now"
  // is answered, once, for every way the answer can change.
  //
  // Hidden means genuinely inert, not merely invisible: `show` is off, the
  // engine is handed null, and nothing bends. That is the whole reason the
  // toggle is a master switch — an invisible line quietly straightening
  // strokes, with nothing on screen to explain it, is a trap rather than a
  // feature. Snapping off keeps the line on screen and draggable, and simply
  // stops it pulling on strokes: a straight edge to measure and align against
  // is half of what a ruler on a drawing is for.
  //
  // Deliberately an effect on the state rather than an engine call inside each
  // drag handler (which is what this replaced): "the engine's ruler is exactly
  // the shown, snapping line" is an invariant, and hand-written call sites are
  // how an invariant becomes a bug. Note that the line itself is never cleared
  // — switching tools leaves it on screen to draw against (see rulerLine).
  useEffect(() => {
    engineRef.current?.setRuler(rulerShow && rulerSnap ? rulerLine : null)
  }, [rulerLine, rulerShow, rulerSnap])

  // (#405) Selecting a tool selects it. Pressing a toolbar button never hands
  // the canvas back to something else, however many times it is pressed: a
  // button that reads as "this tool is in hand" and answers a second press by
  // putting a *different* tool in hand contradicts the one thing this whole
  // change is for. It also could not be consistent — the toggle-back target
  // used to be `lastDrawingTool` for the eraser and smudge but a hardcoded
  // pencil for charcoal, liner and marker, so the same gesture landed
  // somewhere different depending on which button you pressed.
  const selectTool = useCallback((next: EditorTool) => {
    setTool(next)
  }, [setTool])

  // The toggle survives, but only on the *keys*. "Press E, do a correction,
  // press E again" is a real one-handed affordance that a key can offer and a
  // button cannot: the finger is already there, and there is no visual state
  // claiming otherwise. Both halves route through here so a second press
  // always lands on the tool you were drawing with, whichever key it was.
  const toggleTool = useCallback((next: EditorTool) => {
    setTool(prev => (prev === next ? drawingTool : next))
  }, [setTool, drawingTool])

  // Active layer, or the current multi-select from LayerPanel — background
  // is never a legal transform target, same as merge/delete (#120).
  // useMemo'd (not just a plain const) so it has a stable reference to key
  // the bounds-refresh effect below on — without that it would refire every
  // render instead of only on an actual selection change.
  const transformTargetIds = useMemo(() => (
    (layerState.selectedIds.length > 0 ? layerState.selectedIds : [layerState.activeId])
      .filter((layerId): layerId is string => !!layerId && layerId !== BACKGROUND_LAYER_ID && layerState.items[layerId]?.kind === 'layer')
  ), [layerState])
  // (#399) `transformTargetIds` is a fresh array on every layerState change —
  // i.e. on any peer's stroke — so the session effect keys on this string
  // instead; restarting a session mid-drag because someone else drew would
  // commit half a gesture. The ref is what lets startTransformSession freeze
  // the ids without listing an every-render value among its deps.
  const transformTargetKey = transformTargetIds.join(',')
  const transformTargetIdsRef = useRef(transformTargetIds)
  transformTargetIdsRef.current = transformTargetIds

  // Recomputes transformBounds from the current target(s)' actual painted
  // content (engine.getContentBounds), unioned across a multi-select — and
  // clears any custom rotation-center override (see its declaration above
  // for why). Called on activation/selection change and again after every
  // commit, never per drag frame (each call is a real readPixels + CPU scan
  // per target — see getContentBounds' docstring on cost).
  const refreshTransformBounds = useCallback(() => {
    const engine = engineRef.current
    if (!engine || transformTargetIds.length === 0) { setTransformBounds(null); setTransformCenterOverride(null); return }
    let bounds: TransformBounds | null = null
    for (const layerId of transformTargetIds) {
      const b = engine.getContentBounds(layerId)
      bounds = b ? (bounds ? unionTransformBounds(bounds, b) : b) : bounds
    }
    // A fully transparent target (nothing drawn yet) falls back to the
    // whole canvas rather than making the gizmo just vanish.
    setTransformBounds(bounds ?? (config ? { x: 0, y: 0, width: config.width, height: config.height } : null))
    setTransformCenterOverride(null)
  }, [transformTargetIds, config, setTransformBounds, setTransformCenterOverride])
  // (#395) A held commit's teardown can run a server round trip after the
  // drag that created it, and the selection may have moved on in between —
  // its captured closure would then write bounds for layers the gizmo no
  // longer targets, and nothing would correct that until the next selection
  // change. Read through a ref so the teardown always refreshes against
  // whatever the gizmo targets *now*.
  const refreshTransformBoundsRef = useRef(refreshTransformBounds)
  refreshTransformBoundsRef.current = refreshTransformBounds

  // (#405) There is no idle auto-commit any more. #401 added one — a two-second
  // countdown from the last gesture that baked the session and re-opened it —
  // because an open session lives only in this tab and a page teardown is not
  // something React reports, so a reload lost it. What it actually produced was
  // the complaint this issue starts from: the gizmo resetting itself a couple
  // of seconds after you stopped touching it, mid-edit, because baking re-derives
  // the frame as the content's axis-aligned box and throws the rotation away.
  //
  // A session now syncs when it *ends*, and nothing else ends it. What replaces
  // the lost protection is stated where each piece lives: the page-teardown
  // commit below (kept, still best-effort), and the reload hold next to it,
  // which puts an open session behind the same close-the-tab warning a non-empty
  // outbox already sits behind (#313).

  // (#399) Opens a session on the current target(s): fresh bounds from the
  // pixels, identity matrix, no custom pivot. Everything from here until the
  // matching commit is preview only — nothing touches the real layer buffer.
  const startTransformSession = useCallback(() => {
    refreshTransformBoundsRef.current()
    transformSessionRef.current = { matrix: IDENTITY_MATRIX, targetIds: transformTargetIdsRef.current }
    setTransformSessionMatrix(IDENTITY_MATRIX)
  }, [setTransformSessionMatrix])

  // (#399) Ends the session by baking everything it accumulated as *one*
  // layer_transform. One op per session rather than per gesture is the point:
  // rotate, then nudge, then scale used to cost three resamples of the layer's
  // pixels, and a drawing app cannot spend those.
  //
  // `reopen` is for the callers that apply the session while the tool stays in
  // hand — Enter, and only Enter. The gizmo has to come back for it, on the
  // freshly baked content with a clean identity matrix. Everyone else passes
  // false: the tap past the gizmo puts the tool down straight after (#407), and
  // for the teardown callers either nothing should follow or the effect's own
  // body opens the next session itself.
  const commitTransformSession = useCallback((reopen: boolean) => {
    const session = transformSessionRef.current
    transformSessionRef.current = null
    const dropPreview = () => {
      // Guarded because this can run a round trip late, by which time a
      // session for a *new* selection may already be open — this teardown
      // belongs to the old one and must not blank its matrix.
      if (!transformSessionRef.current) setTransformSessionMatrix(null)
      engineRef.current?.clearLayerTransformPreview()
    }
    // Nothing accumulated (opened and left alone, or every gesture cancelled
    // itself out): committing an identity matrix would put a real entry on
    // the undo stack for nothing, and the bounds are still the ones the
    // session started from, so there is nothing to refresh either.
    if (!session || isIdentityMatrix(session.matrix)) {
      dropPreview()
      if (session && reopen) startTransformSession()
      return
    }
    const finish = () => {
      dropPreview()
      // Reopening only after the bake has landed, not at dispatch time: the
      // new session's bounds come from the layer's pixels, and until the
      // operation is applied those are still the pre-session ones.
      if (reopen) startTransformSession()
    }
    const dispatched = dispatchOp({
      type: 'layer_transform',
      // (#392) Narrowed back on the way out: a move/scale/rotate/skew session
      // still writes six numbers, and only a session that genuinely carries a
      // Distort writes nine — see toWireMatrix's own docstring for why the
      // compact form is the rule rather than a legacy leftover.
      transforms: session.targetIds.map(layerId => ({ layerId, matrix: toWireMatrix(session.matrix) })),
    })
    // (#395) The preview is deliberately *not* dropped before the commit.
    // clearLayerTransformPreview() repaints synchronously, so dropping it
    // first paints a frame with the preview gone and the transform not yet
    // baked — the layer back where the session started. On the
    // confirmation-gated dispatch path that state then persists for a whole
    // server round trip. The engine's own API says as much: clear the preview
    // "once a real layer_transform op has been appended (commit) or the drag
    // is abandoned (cancel)" — appended, not merely sent. While the preview
    // stands in for the layer the two are pixel-identical by construction (see
    // previewLayerTransform's lockstep note against _bakeTransform), so
    // holding it across the commit shows no seam.
    //
    // Refused outright (room not ready, editing blocked, offline — see
    // dispatchOp) or already painted by the optimistic path: either way
    // nothing is in flight, so finish right here.
    if (!dispatched || dispatched.applied) { finish(); return }
    pendingTransformCommitRef.current = { opId: dispatched.op.id, finish }
  }, [dispatchOp, setTransformSessionMatrix, startTransformSession])

  const commitTransformSessionRef = useRef(commitTransformSession)
  commitTransformSessionRef.current = commitTransformSession
  // See resetTransformSessionRef's declaration for its two callers — the
  // re-derive after a real undo/redo, and Esc/Ctrl+Z as the cancel itself.
  resetTransformSessionRef.current = () => {
    if (!transformSessionRef.current) return
    transformSessionRef.current = null
    setTransformSessionMatrix(null)
    engineRef.current?.clearLayerTransformPreview()
    startTransformSession()
  }

  // (#399) One session per (tool selected, target selection). Ending the
  // effect commits what the session accumulated, which covers three of the
  // four ways a session ends without any of them needing code of its own:
  // selecting another tool, changing the active layer or the selection, and
  // the room unmounting. (#405) The first of those is the model change: with
  // one exclusive selection, "switch tool" is no longer a mode being lifted
  // off a pencil — it is this effect's dependency changing.
  //
  // The hand is deliberately not among them. It lives in viewportSlice, not in
  // `tool`, so picking it up (or holding Space) does not re-run this effect and
  // the session stays open — panning touches no content, and seeing where you
  // are dragging a layer *to* is most of why you would reach for it mid-drag.
  //
  // Keyed on the joined ids rather than the array: transformTargetIds is
  // rebuilt on every layerState change (any peer's stroke does that), and
  // restarting the session there would commit mid-drag.
  useEffect(() => {
    if (!transformActive) return
    startTransformSession()
    return () => {
      commitTransformSessionRef.current(false)
      setTransformBounds(null)
      setTransformCenterOverride(null)
    }
  }, [transformActive, transformTargetKey, startTransformSession, setTransformBounds, setTransformCenterOverride])

  // (#401) Best-effort save for the one exit React never reports: the page
  // going away. `pagehide` covers reload, tab close and bfcache;
  // `visibilitychange` catches the mobile cases where the tab is frozen
  // without pagehide ever firing.
  //
  // It stays best-effort on purpose: the operation goes through the Outbox,
  // whose IndexedDB write is async, and a teardown gives no guarantee it
  // completes. (#405) It used to be the belt on top of the idle auto-commit's
  // two-second exposure window; with that gone this is one of the two things
  // standing between an open session and a closed tab, and the other one —
  // the warning below — is the half that can actually stop the tab closing.
  useEffect(() => {
    if (!transformActive) return
    const save = () => commitTransformSessionRef.current(false)
    const onVisibility = () => { if (document.visibilityState === 'hidden') save() }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [transformActive])

  // (#405) An open transform session is unsent work, so it goes behind the
  // same guard unsent work already has: `holdReload()`, which is what arms the
  // room's beforeunload prompt and what tells the service-worker updater a new
  // build may not be applied silently right now (#313/#400 — see
  // lib/reloadSafety, and the beforeunload effect near the top of this file).
  //
  // #401 considered this and decided against it, explicitly on the grounds
  // that the idle auto-commit would have saved the session anyway. Removing
  // the auto-commit removes that reasoning, so the hold goes on.
  //
  // Deliberately its own hold rather than leaning on the room-wide one that
  // covers the whole editor today: the two are held for different reasons, and
  // if the room-wide hold is ever narrowed to "only while something is
  // actually unsent" — which is what its own comment says it is a broad
  // stand-in for — a session would silently stop being protected. Nested holds
  // are free (reloadSafety counts them for exactly this).
  useEffect(() => {
    if (!transformActive) return
    return holdReload()
  }, [transformActive])

  // (#405/#407) A click or tap on the canvas past the gizmo applies the session
  // and puts the transform tool down, handing the canvas back to the drawing
  // tool — the "I'm done here" gesture that costs no keyboard, which matters
  // because the tablet has none. It used to apply and immediately re-arm on the
  // result; the gizmo staying put after the gesture that meant *done* read as
  // the tap not having worked.
  //
  // A *click*, deliberately, not a press: a drag that starts outside the frame
  // is a pan (or a rotate begun just outside a corner and dragged away), and
  // ending someone's edit because they moved the view would be worse than the
  // auto-commit this replaces. TAP_MOVE_THRESHOLD_PX is the same threshold the
  // minimal-UI tap uses, so "what counts as a tap" has one answer in this room.
  //
  // "Past the gizmo" includes past the rotate zones, which reach ~40 screen px
  // beyond each corner — they are part of the gizmo's own hit area (see
  // data-transform-gizmo), so a press there rotates and never lands here.
  //
  // Native listeners on the viewport rather than React props on it: the gizmo,
  // the ruler catcher and the canvas are all inside, each with their own
  // handlers, and this has to see presses that none of them claimed without
  // being written into every one of them.
  useEffect(() => {
    if (!transformActive || !vpEl) return
    let candidate: { id: number; x: number; y: number } | null = null

    const onDown = (e: PointerEvent) => {
      // The hand owns every drag while it is up, including this one — the same
      // precedence the gizmo handles and the cursor already follow.
      candidate = handActiveRef.current || (e.target as Element | null)?.closest('[data-transform-gizmo]')
        ? null
        : { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const onMove = (e: PointerEvent) => {
      if (!candidate || e.pointerId !== candidate.id) return
      if (Math.hypot(e.clientX - candidate.x, e.clientY - candidate.y) > TAP_MOVE_THRESHOLD_PX) candidate = null
    }
    const onUp = (e: PointerEvent) => {
      if (!candidate || e.pointerId !== candidate.id) return
      candidate = null
      // Bake once and do *not* re-arm — the tool is going down on the next
      // line, so a fresh session would be opened only to be torn straight
      // back down.
      commitTransformSessionRef.current(false)
      // (#407) Same hand-back the eyedropper does after a pick, and for the
      // same reason: the gesture was the whole of the tool's job. Only the tap
      // does this — Enter and Esc leave the tool selected, so there is still a
      // way to finish one transform and start another without a trip to the
      // toolbar.
      setTool(drawingToolRef.current)
    }
    // A cancelled pointer (the browser taking the gesture over for a scroll or
    // a system gesture) is not a click, and must not be treated as one.
    const onCancel = () => { candidate = null }

    vpEl.addEventListener('pointerdown', onDown)
    vpEl.addEventListener('pointermove', onMove)
    vpEl.addEventListener('pointerup', onUp)
    vpEl.addEventListener('pointercancel', onCancel)
    return () => {
      vpEl.removeEventListener('pointerdown', onDown)
      vpEl.removeEventListener('pointermove', onMove)
      vpEl.removeEventListener('pointerup', onUp)
      vpEl.removeEventListener('pointercancel', onCancel)
    }
  }, [transformActive, vpEl, setTool])

  // Viewport rect for the ruler's own pointer math — see handleRulerHover for
  // why it is cached rather than read per move.
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
  // Only mounted while `rulerShow` is on, so a hidden ruler cannot be grabbed
  // any more than it can snap — see the engine sync above.
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

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      setRulerLine(computeLine(ev.clientX, ev.clientY))
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
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

  // (#391) The transform tool's own two settings, from the same TOOL_SCHEMAS
  // store every other tool's settings live in (see settingsToolId below for
  // how they reach the UI). Both are `transient` there — a transform mode
  // remembered from half an hour ago is a gizmo whose edge handles no longer
  // do what the last person to touch them expects.
  const transformMode = toolSettings.transform.mode as TransformMode
  const transformKeepProportions = toolSettings.transform.keepProportions as boolean

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

  // Layer transform tool (#120): mirrors handleRulerDown's drag-capture
  // pattern exactly, but per-handle (body/corner/rotate) rather than a
  // single A→B drag. Since #399 a gesture no longer commits anything — it
  // folds into the open session's matrix and stays a preview until the
  // session ends.
  const handleTransformHandleDown = useCallback((handle: TransformHandleKind, e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    // (#405) The hand outranks the gizmo, the same way it outranks every tool
    // in the cursor decision (resolveCursor's rule 1) and for the same reason:
    // while it is up, a drag anywhere moves the view. Without this the handles
    // would still swallow a mouse drag that started on one, so panning to see
    // where a layer is going — the whole reason to reach for the hand mid-
    // transform — would fail exactly over the thing being dragged.
    if (handActive) return
    // (#395) The previous session's commit is still in flight, so the layer
    // doesn't carry it yet and transformBounds still describes where the
    // content was before it. A gesture started here would build on a
    // transform that may yet be refused. The wait is one round trip.
    if (pendingTransformCommitRef.current) return
    const session = transformSessionRef.current
    const el = vpRef.current
    if (!session || !el || !config || !transformBounds) return
    e.stopPropagation()
    const overlay = e.currentTarget
    const penPointerId = e.pointerId
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    // #143: world-space for infinite rooms (clientToRoomPoint) — matches
    // transformBounds/pivot/center (engine.getContentBounds, real world
    // coordinates for infinite rooms) so drag deltas/pivots are computed in
    // one consistent space instead of mixing world-space bounds with a
    // placeholder-canvas-space pointer position.
    const rect = el.getBoundingClientRect()

    // (#399) Which side of the accumulated matrix a gesture composes on is not
    // a style choice — it decides whether the frame stays a rectangle.
    //
    // Scaling has to go *inside* (session ∘ gesture): the handles pull along
    // the frame's own axes, so the squash is stated in the frame's local
    // space, before whatever rotation the session already holds.
    //
    // Rotation has to go *outside* (gesture ∘ session): turning the frame is a
    // rigid move of whatever shape it currently is. Composed inside, a
    // rotation lands *under* an existing non-uniform scale — squash-then-turn
    // becomes turn-then-squash, which is a shear, and the corners stop being
    // 90°. That is the bug Ilya hit by squashing one axis and then rotating.
    // Keeping rotation outside holds the session in the form
    // rotation ∘ scale, which is angle-preserving on a rectangle no matter how
    // the two are interleaved.
    //
    // Translation *does* care, and used to be filed here as the one that
    // doesn't (#407). The claim was that for a drag of `d` canvas px,
    // session ∘ translate(A⁻¹d) and translate(d) ∘ session are the same
    // matrix — true, but only while the session has a linear part `A` to
    // invert, i.e. while it is affine. Once Distort (#392) put a projective
    // row in it, composing a move inside means sliding the source rectangle
    // *through* the perspective field before it is applied, so the layer comes
    // out re-foreshortened: measured on a distorted frame, a plain 150x40 drag
    // took the sides from 626.5/447.8/400/300 to 688.6/484.8/428.4/294.7 —
    // every one of them changed, and one got shorter. Dragging a picture
    // across the page is not supposed to reshape it.
    //
    // So translation goes outside, with rotation, for the same reason rotation
    // is there: it is a rigid move of whatever shape the session currently
    // holds. For an affine session this is exactly the old behaviour (the
    // identity above still holds), so nothing that worked before changes.
    const sessionBase = session.matrix
    const toLocalSpace = invertMatrix(sessionBase)
    if (!toLocalSpace) return
    const toCanvasPoint = (clientX: number, clientY: number) => clientToRoomPoint(clientX, clientY, rect, vp, config)
    const toPoint = (clientX: number, clientY: number) => {
      const p = toCanvasPoint(clientX, clientY)
      return applyMatrix(toLocalSpace, p.x, p.y)
    }

    const bounds = transformBounds
    const center = transformCenterOverride ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    // (#391/#392) What this handle means under the current mode — every mode
    // redefines exactly one family of handles (Rotate & Skew the edges,
    // Distort the corners) and borrows the rest from Free transform.
    const gestureKind = transformGestureKind(handle, transformMode)
    const isRotate = gestureKind === 'rotate'
    const isDistort = gestureKind === 'distort'
    const pivot = handle === 'body' || isRotate ? center : TRANSFORM_PIVOT[handle as keyof typeof TRANSFORM_PIVOT](bounds)
    const start = toPoint(e.clientX, e.clientY)
    // Rotation works entirely in canvas space, so its centre and start angle
    // are the local ones pushed back out through the session matrix.
    const centerCanvas = applyMatrix(sessionBase, center.x, center.y)
    const startCanvas = toCanvasPoint(e.clientX, e.clientY)
    const startAngle = Math.atan2(startCanvas.y - centerCanvas.y, startCanvas.x - centerCanvas.x)
    const startDist  = Math.max(Math.hypot(start.x - pivot.x, start.y - pivot.y), 1e-6)
    const startDistX = Math.max(Math.abs(start.x - pivot.x), 1e-6)
    const startDistY = Math.max(Math.abs(start.y - pivot.y), 1e-6)
    // Signed, unlike the two above: a shear is "how far the grabbed edge slid,
    // per unit of distance from the anchor edge", and which side of the anchor
    // the edge sits on decides the sign of the resulting matrix (see
    // skewAxisMatrix). Guarded away from zero the same way — an edge dragged
    // while the frame is degenerate would otherwise divide by nothing.
    const startOffsetX = Math.sign(start.x - pivot.x || 1) * startDistX
    const startOffsetY = Math.sign(start.y - pivot.y || 1) * startDistY
    // Null means "this pointer position has no usable matrix" — only Distort
    // can produce one (drag a corner onto the line through its two neighbours
    // and there is no homography at all), and the answer is to leave the frame
    // where it was rather than to throw or to snap it somewhere arbitrary.
    const computeMatrix = (clientX: number, clientY: number): TransformMatrix | null => {
      if (isRotate) {
        const w = toCanvasPoint(clientX, clientY)
        const angle = Math.atan2(w.y - centerCanvas.y, w.x - centerCanvas.x) - startAngle
        return rotateAboutMatrix(angle, centerCanvas.x, centerCanvas.y)
      }
      const p = toPoint(clientX, clientY)
      // (#407) In *canvas* px, unlike every gesture below it: a move composes
      // outside the session, so it has to be stated in the space the session's
      // output already lives in. Reading the local-space delta here instead
      // would re-introduce the same mixing the outside composition exists to
      // avoid, just from the other end.
      if (gestureKind === 'move') {
        const pc = toCanvasPoint(clientX, clientY)
        return translateMatrix(pc.x - startCanvas.x, pc.y - startCanvas.y)
      }
      // Distort (#392): the grabbed corner goes exactly where the pointer is
      // and the other three hold still, so the gesture *is* the four-point
      // correspondence the solver takes. No clamp on how far it can be
      // dragged, unlike a scale — a corner pulled past its neighbours is a
      // fold, which is a shape, not a singularity; the two ways this genuinely
      // has no answer (three corners collinear, and a quad whose vanishing
      // line crosses the frame) are refused below instead.
      if (isDistort) {
        const quad = distortQuad(bounds, handle, p)
        return quad && solveQuadMatrix(bounds, quad)
      }
      // Rotate & Skew's edge handles (#391): the edge slides along itself and
      // the opposite edge stays pinned, so only the travel *along* the edge is
      // read — pushing the top edge up or down does nothing, exactly as in
      // Adobe's own skew. Proportions have no meaning for a shear, so the
      // keep-proportions toggle is deliberately not consulted here; it still
      // governs this mode's corner handles below.
      if (gestureKind === 'skewX') {
        const shear = clamp((p.x - start.x) / startOffsetY, -MAX_TRANSFORM_SHEAR, MAX_TRANSFORM_SHEAR)
        return skewAxisMatrix(shear, 0, pivot.x, pivot.y)
      }
      if (gestureKind === 'skewY') {
        const shear = clamp((p.y - start.y) / startOffsetX, -MAX_TRANSFORM_SHEAR, MAX_TRANSFORM_SHEAR)
        return skewAxisMatrix(0, shear, pivot.x, pivot.y)
      }
      // Edge handles in Free transform: always exactly one axis, about the
      // opposite edge. The proportions toggle deliberately does not reach them
      // (#391) — an edge that keeps the aspect ratio is an edge that cannot
      // stretch, and stretching one axis is the only thing an edge handle has
      // ever been for. Briefly they scaled both axes while the lock was on,
      // which, since the lock is on by default, meant single-axis stretch was
      // unreachable out of the box: a regression of the default dressed up as
      // a feature. The toggle now governs the corners and nothing else.
      if (handle === 't' || handle === 'b') {
        const scaleY = clamp(Math.abs(p.y - pivot.y) / startDistY, 0.05, 20)
        return scaleAxisMatrix(1, scaleY, pivot.x, pivot.y)
      }
      if (handle === 'l' || handle === 'r') {
        const scaleX = clamp(Math.abs(p.x - pivot.x) / startDistX, 0.05, 20)
        return scaleAxisMatrix(scaleX, 1, pivot.x, pivot.y)
      }
      // Corner handles — the only place the proportions toggle is read. Locked
      // (the default, and what they always did before #391) the two axes share
      // one factor taken from the pointer's distance to the anchor corner;
      // unlocked, each axis is measured on its own — Free transform's whole
      // point, and the reason #132 asked for a toggle rather than a Shift key
      // nobody can press on a tablet.
      if (transformKeepProportions) {
        const scale = clamp(Math.hypot(p.x - pivot.x, p.y - pivot.y) / startDist, 0.05, 20)
        return scaleAxisMatrix(scale, scale, pivot.x, pivot.y)
      }
      return scaleAxisMatrix(
        clamp(Math.abs(p.x - pivot.x) / startDistX, 0.05, 20),
        clamp(Math.abs(p.y - pivot.y) / startDistY, 0.05, 20),
        pivot.x, pivot.y,
      )
    }

    // Coalesce to one previewLayerTransform call per animation frame rather
    // than one per raw pointermove — a pen digitizer fires well past 60/s,
    // and previewLayerTransform's own GPU cost scales with how much of the
    // page the dragged content currently covers (a bounded room's own tile
    // size is its whole canvas, see engine/index.ts's _makeLayerBuffer —
    // content spanning two such tiles means transform-blitting two full-
    // page-sized buffers on every call). Rendering more previews than the
    // display can even show is pure wasted GPU work; this was a real,
    // reported stutter/hang testing on an underpowered device once content
    // was dragged past the page edge. Only the *latest* pointer position
    // within a frame is ever previewed — nothing else about the preview's
    // correctness changes, this only throttles how often it's recomputed.
    let rafId: number | null = null
    let latestMatrix: TransformMatrix | null = null
    // What the canvas and the gizmo should show: everything the session had
    // already accumulated, with this gesture composed on the side its own
    // meaning demands (see computeMatrix's comment above). A Distort composes
    // *inside*, with the scales and for the same reason: its four target
    // corners are stated in the frame's own local space, before whatever
    // rotation the session is already carrying.
    //
    // Null when the result is not something to show: either the gesture had no
    // matrix at all, or the accumulated one folds the frame through the
    // vanishing line, where half the layer would render as a mirrored ghost
    // (isFrameInFront). Refusing beats clamping — a clamp would have to invent
    // some nearest legal quad, and the honest behaviour is that the corner
    // simply stops following the pointer once it has gone somewhere there is
    // no picture for.
    // (#407) Rotation and translation are the two rigid moves — they act on
    // the shape the session already produced, so they compose outside. Every
    // other gesture is stated in the frame's own axes and composes inside.
    const composesOutside = isRotate || gestureKind === 'move'
    const accumulated = (gesture: TransformMatrix | null): TransformMatrix | null => {
      if (!gesture) return null
      const next = composesOutside ? composeMatrix(gesture, sessionBase) : composeMatrix(sessionBase, gesture)
      return isFrameInFront(next, bounds) ? next : null
    }
    const showPreview = (matrix: TransformMatrix) => {
      setTransformSessionMatrix(matrix)
      engineRef.current?.previewLayerTransform(session.targetIds.map(layerId => ({ layerId, matrix })))
    }
    const flushPreview = () => {
      rafId = null
      if (!latestMatrix) return
      const next = accumulated(latestMatrix)
      if (next) showPreview(next)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      latestMatrix = computeMatrix(ev.clientX, ev.clientY)
      if (rafId === null) rafId = requestAnimationFrame(flushPreview)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
      // (#399) Release commits nothing. The gesture folds into the session's
      // matrix and the preview stays exactly as it is — which is the whole
      // point: the frame keeps the orientation the gesture just gave it
      // instead of being re-derived from an axis-aligned box of pixels.
      // (#405) And it keeps it until the session actually ends — Enter, Esc, a
      // click past the gizmo, another tool, another layer. Nothing bakes it on
      // a timer any more; that timer is what made the frame appear to reset
      // itself a couple of seconds after every gesture.
      const gesture = computeMatrix(ev.clientX, ev.clientY)
      // A click, or pen jitter below the threshold — and, since #392, a
      // release on a pointer position that has no usable matrix at all: roll
      // the session's display back to where it was rather than folding in a
      // no-op that would drift the accumulated matrix by a fraction of a pixel
      // per tap.
      const next = gesture && accumulated(gesture)
      if (!gesture || !next || isNegligibleTransform(gestureKind, gesture, bounds)) {
        if (isIdentityMatrix(sessionBase)) {
          setTransformSessionMatrix(sessionBase)
          engineRef.current?.clearLayerTransformPreview()
        } else {
          showPreview(sessionBase)
        }
        return
      }
      // The session may have been closed under us mid-gesture (tool switched
      // off, selection changed) — in that case its commit already went out
      // with the matrix as of then, and this gesture has nowhere to land.
      if (transformSessionRef.current) transformSessionRef.current.matrix = next
      showPreview(next)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [
    vpRef, vp, config, handActive, transformBounds, transformCenterOverride, transformMode,
    transformKeepProportions, setTransformSessionMatrix,
  ])

  // Adobe Animate-style draggable rotation pivot — a separate gesture from
  // the scale/rotate/translate handles above: it only ever updates
  // transformCenterOverride (local UI state), never previews or dispatches
  // a transform of its own. Double-click resets it back to the content
  // bounds' own center (see TransformGizmo's onCenterDoubleClick).
  const handleTransformCenterDown = useCallback((e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    // Same reason as the handles above (#405): the hand owns every drag.
    if (handActive) return
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    const overlay = e.currentTarget
    const penPointerId = e.pointerId
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    const rect = el.getBoundingClientRect()
    // #143: world-space for infinite rooms (clientToRoomPoint) — matches
    // transformBounds/pivot/center (engine.getContentBounds, real world
    // coordinates for infinite rooms) so drag deltas/pivots are computed in
    // one consistent space instead of mixing world-space bounds with a
    // placeholder-canvas-space pointer position.
    //
    // (#399) Stored in the session's local space, like transformBounds and
    // unlike the raw pointer: the handle is rendered inside the gizmo's own
    // `<g transform>`, so a canvas-space point would be pushed through the
    // session matrix a second time and slide away from the finger. Local
    // space also means the pivot rides along with the content through later
    // gestures instead of staying pinned to a canvas coordinate.
    const toLocalSpace = invertMatrix(transformSessionRef.current?.matrix ?? IDENTITY_MATRIX)
    if (!toLocalSpace) return
    const toPoint = (clientX: number, clientY: number) => {
      const p = clientToRoomPoint(clientX, clientY, rect, vp, config)
      return applyMatrix(toLocalSpace, p.x, p.y)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      setTransformCenterOverride(toPoint(ev.clientX, ev.clientY))
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [vpRef, vp, config, handActive, setTransformCenterOverride])

  const handleTransformCenterReset = useCallback(
    () => setTransformCenterOverride(null),
    [setTransformCenterOverride],
  )

  // ── who's-drawing indicator (#38) ─────────────────────────────────────────────
  // Periodically prunes `lastActiveAtRef` (refreshed by markActive) into the
  // rendered set. No dedicated drawing_start/stop socket event exists in the
  // shared contract (packages/shared) — that'd be a nice-to-have follow-up —
  // so this infers activity from stroke ops/engine events instead (see
  // drawingIndicator.ts).
  useEffect(() => {
    const t = window.setInterval(() => {
      const next = currentlyDrawing(lastActiveAtRef.current, Date.now(), DRAWING_TIMEOUT_MS)
      setDrawingIds(prev => (sameIds(prev, next) ? prev : next))
    }, 300)
    return () => window.clearInterval(t)
  }, [])

  // ── socket wiring (#84/#37/#38/join-gate) ──────────────────────────────────────
  // Runs once per room id, independent of `config` — a joiner doesn't have a
  // config yet at connect time (that's the entire point of the join gate), so
  // the socket has to exist before it does. What gets emitted on 'connect'
  // branches on creator vs. joiner instead.
  useEffect(() => {
    if (!id) return

    // Same-origin: the Vite dev server proxies /socket.io to apps/server
    // (see vite.config.ts) — works under both `npm run dev` (https, needed
    // for AudioWorklet-based sound experiments) and `npm run dev:http`.
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
      io({ withCredentials: true })
    socketRef.current = socket

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
    const handleConnect = () => {
      setConnected(true)
      setEverConnected(true)
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
                void outbox.resendAll()
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
              // Practically unreachable (would need a nanoid(8) id collision —
              // see rooms.ts's createRoom doc comment); nothing sensible to
              // retry into, so just surface it for debugging.
              else console.error('create_room failed unexpectedly', result)
            },
          )
        } else {
          socket.emit(
            'join_room',
            {
              roomId: id, name: myDisplayNameRef.current, password: creatorDraft.password,
              lastKnownSeq: latestKnownSeqRef.current || undefined,
            },
            result => {
              if (result.ok) { applyIdentity(result.userId); void outbox.resendAll() }
              else console.error('join_room failed on reconnect', result)
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
          { roomId: id, ...lastJoinAttemptRef.current, lastKnownSeq: latestKnownSeqRef.current || undefined },
          result => {
            if (result.ok) { applyIdentity(result.userId); void outbox.resendAll() }
            else console.error('join_room failed on reconnect', result)
          },
        )
      }
    }

    // (#289 §12) Re-requests the room's state from scratch-as-of-what-we-
    // have, the same way a reconnect does, without waiting for (or needing)
    // an actual socket drop — the response arrives as an ordinary
    // `room_state`, which handleRoomState already knows how to fold in.
    // Used when the live confirmed stream turns out to have a gap, i.e. the
    // connection was interrupted at some point without this client noticing.
    const requestFullResync = () => {
      lastConfirmedSeqRef.current = 0 // the stream restarts from this room_state
      const credentials = lastJoinAttemptRef.current
        ?? { name: myDisplayNameRef.current, password: creatorDraft?.password }
      socket.emit(
        'join_room',
        { roomId: id, ...credentials, lastKnownSeq: latestKnownSeqRef.current || undefined },
        result => {
          if (result.ok) applyIdentity(result.userId)
          else console.error('join_room failed during gap resync', result)
        },
      )
    }
    // (#346) Published for the paper retry, which lives outside this effect —
    // see requestFullResyncRef's own comment.
    requestFullResyncRef.current = requestFullResync

    const handleRoomState = async ({ room, latestSnapshotSeq, tailOperations, participants: roomParticipants, palette, frozen }: {
      room: RoomEntity; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
      palette: string[]; frozen: boolean
    }) => {
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

      if (!firstRoomStateReceivedRef.current) {
        firstRoomStateReceivedRef.current = true
        // Only a joiner needs this — `config` is one of the mount-engine
        // effect's own deps (so it can wait for "not yet known" -> "known"),
        // and setRoomInfo always writes a *new* object even when every
        // field is identical (toRoomConfig has no memoization), which reads
        // to that effect as "config changed" and makes it tear down and
        // recreate the engine. A creator's config is already known
        // synchronously from navigation state (see creatorDraft/toRoomConfig
        // above) with the exact same fields toRoomConfig(room) would produce
        // here (both are Pick<Room, 'id'|'name'|'paper'|'infinite'|
        // 'canvasWidth'|'canvasHeight'> from the same data) — calling this
        // again for the creator is redundant, and specifically harmful right
        // here: it silently destroyed whatever this handler had just
        // restored into the engine below (the tail replay would finish, then
        // React's next effect pass would blow the engine away and rebuild it
        // empty) — invisible before the tailOperations/latestSnapshotSeq fix
        // just above, since there used to be nothing to lose in this branch.
        if (!isCreator) useRoomStore.getState().setRoomInfo(toRoomConfig(room))
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
          // pencil until the remaining ~7 MB landed.
          if (!(await awaitPaper(engineRef.current))) return
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
      // (#346) Outside the try/finally below, for the same reason as the mount
      // effect's own site: a paper failure must leave the room closed and
      // explained, not opened and mute.
      if (!(await awaitPaper(engine))) return
      try {
        // A reconnect's full-history replay supersedes any reveal still
        // in-flight from before the drop — cancel it rather than let it keep
        // painting the same stroke a second time on top of what this loop is
        // about to commit directly.
        // (#147) Same reasoning as the initial-join replay above — see
        // suspendDisplay/resumeDisplay's own doc comments.
        engine?.suspendDisplay()

        // (#169) A snapshot exists and this socket doesn't already have
        // local state at least as fresh as it (the common reconnect case: it
        // does, so this is skipped and tailOperations alone is enough — same
        // as before this epic). Restoring here, before the tail loop below,
        // is required: the tail paints relative to this restored buffer
        // state.
        let restoredFromSnapshot = false
        if (engine && latestSnapshotSeq !== null && alreadyHadSeq < latestSnapshotSeq) {
          const snapshot = await fetchLatestSnapshot(id)
          if (snapshot) { await restoreFromSnapshot(engine, snapshot); restoredFromSnapshot = true }
        }

        // (#398) Same as the mount effect's own catch-up — see
        // PencilEngineAPI.preloadImages.
        if (engine) await engine.preloadImages(tailOperations)

        for (const op of tailOperations) {
          if (pendingPreviewOpIdsRef.current.has(op.id)) {
            engine?.dropPendingPreview(op.id)
            pendingPreviewOpIdsRef.current.delete(op.id)
          }
          applyRemoteOp(op)
        }
        engine?.resumeDisplay()
        // (#386) Same reason as the mount-engine effect's own catch-up: the
        // bootstrap below reads the store back in this same task.
        syncFromLogNow()
        dispatchParticipants({ type: 'room_state', participants: roomParticipants })
        useRoomStore.getState().setPalette(palette)
        useRoomStore.getState().setRoomFrozen(frozen)

        // Runs fully in the background — never awaited, must not block this
        // handler or the first paint it just produced.
        if (restoredFromSnapshot && engine && latestSnapshotSeq !== null) {
          void backfillHistory(id, engine, latestSnapshotSeq)
        }
        // Same bootstrap as the mount-engine effect's own first-join branch
        // (see its comment) — a reconnect can just as easily be the first
        // time anyone's stayed caught-up long enough to bake this room's
        // very first snapshot.
        if (latestSnapshotSeq === null && engine && snapshotUploader) {
          snapshotUploader.onSeqObserved(alreadyHadSeq, latestKnownSeqRef.current, engine, useRoomStore.getState().layerState)
        }
      } finally {
        // (#169 bug fix) Must run even on a plain, no-snapshot reconnect
        // (the common case) — otherwise the *next* stroke this same user
        // draws would find the canvas still gated from a re-entered
        // setRoomContentReady(false) above with nothing to ever clear it if
        // an error was thrown. See roomContentReady's own doc comment for
        // the bug this whole mechanism guards against.
        setRoomContentReady(true)
      }
    }

    // (#289 §7/§11 — reliable history spec v0.2) Renamed from
    // handlePeerOperation: this now fires for *every* confirmed operation,
    // including this client's own — `operation_confirmed` is broadcast via
    // `io.to`, not `socket.to`, specifically so every client (author
    // included) paints strictly through this one WebSocket-ordered stream
    // rather than racing it against a separate, faster ack. `seq` comes
    // from the envelope, not `operation.seq` (optional until stamped) —
    // simpler for logging/diagnostics, per the same spec.
    const handleOperationConfirmed = ({ seq, operation: op }: { seq: number; operation: Operation }) => {
      // (#289 §12) A gap in this stream is impossible on an unbroken
      // connection (TCP never silently drops or reorders within one), so
      // seeing one means the connection was interrupted without this client
      // noticing — a backgrounded tab, a sleeping device, a proxy recycling
      // the socket. Don't try to patch the hole; distrust the live stream
      // and redo the same full catch-up a normal reconnect does.
      if (hasSeqGap(lastConfirmedSeqRef.current, seq)) {
        console.warn(`[sync] seq gap: expected ${lastConfirmedSeqRef.current + 1}, got ${seq} — resyncing`)
        requestFullResync()
        return
      }
      lastConfirmedSeqRef.current = Math.max(lastConfirmedSeqRef.current, seq)
      latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, seq)
      if (appliedOpIdsRef.current.has(op.id)) {
        // This client's own operation, looping back through the same
        // ordered stream every peer gets — onLocalOperation already applied
        // it optimistically at dispatch time, so there is nothing left to
        // paint here. Advancing the watermark above is the only thing this
        // arrival still needs to do (noteLayerSeq is also called from
        // onLocalOperation's own ack — calling it again here is redundant
        // but harmless, and covers the rare case this arrives first).
        if (op.type === 'stroke') noteLayerSeq(op.layerId, seq)
        checkSnapshotBoundary()
        return
      }
      // Stroke ops are revealed progressively (#37 follow-up v2) rather than
      // committed on arrival — see the engine's onPreviewApplied option
      // above, which does the actual applyRemoteOp/syncFromLog once the
      // reveal finishes playing every dab back.
      if (op.type === 'stroke') {
        noteLayerSeq(op.layerId, seq)
        // (#289 §16) A live client that simply can't keep up (weak device,
        // several peers drawing at once) used to accumulate an unbounded
        // reveal backlog with nothing watching it. Past the threshold, drop
        // the animation and apply immediately — the same "correct content
        // now, no animation" tradeoff join/reconnect catch-up already
        // makes — until the backlog is comfortably small again.
        const backlog = pendingPreviewOpIdsRef.current.size
        if (catchingUpRef.current ? !shouldLeaveCatchUp(backlog) : shouldEnterCatchUp(backlog)) {
          if (!catchingUpRef.current) {
            catchingUpRef.current = true
            console.warn(`[sync] falling behind (${backlog} strokes queued) — applying without animation`)
          }
          applyRemoteOp(op)
          syncFromLog()
          checkSnapshotBoundary()
          return
        }
        catchingUpRef.current = false
        pendingPreviewOpIdsRef.current.add(op.id)
        // Arrived, not yet committed (#149) — held out of the snapshot
        // watermark until onPreviewApplied's reveal-complete commit deletes
        // it. See pendingCommitSeqsRef's own doc comment.
        pendingCommitSeqsRef.current.add(seq)
        engineRef.current?.previewOperation(op)
        return
      }
      // An undo/revoke racing a still-revealing stroke of its own: skip the
      // animation, but still commit the stroke to the log immediately right
      // before the undo/revoke that targets it — both applied synchronously
      // here, so nothing is ever actually painted to screen, but the log
      // still has a 'done'-then-'undone' entry a later redo can restore.
      // Dropping the operation outright (rather than just its animation)
      // would leave OperationLog.applyUndo/Redo with no entry to flip.
      if (
        (op.type === 'operation_undo' || op.type === 'operation_revoke') &&
        pendingPreviewOpIdsRef.current.has(op.targetOpId)
      ) {
        const target = engineRef.current?.dropPendingPreview(op.targetOpId)
        pendingPreviewOpIdsRef.current.delete(op.targetOpId)
        if (target) {
          pendingCommitSeqsRef.current.delete(target.seq ?? 0)
          applyRemoteOp(target)
        }
        applyRemoteOp(op)
        syncFromLog()
        checkSnapshotBoundary()
        return
      }
      // (#169) Target isn't in the log yet — background backfill hasn't
      // reached it (or, very rarely, a real gap). Defer rather than apply
      // now: applying now would silently no-op and lose it permanently. See
      // deferredOpsQueueRef's own doc comment; drainDeferredQueue re-checks
      // this after every backfill page.
      if (
        (op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke') &&
        !appliedOpIdsRef.current.has(op.targetOpId)
      ) {
        deferredOpsQueueRef.current.push(op)
        return
      }
      applyRemoteOp(op)
      syncFromLog()
      checkSnapshotBoundary()
    }

    const handlePeerJoined = (participant: Participant) => {
      dispatchParticipants({ type: 'peer_joined', participant })
    }

    const handlePeerLeft = (leftUserId: string) => {
      dispatchParticipants({ type: 'peer_left', userId: leftUserId })
      // (#152) Cursor-position cleanup for this peer now lives inside
      // PeerCursors' own 'peer_left' subscription — nothing to do here.
      delete lastActiveAtRef.current[leftUserId]
      // They left mid-reveal — commit whatever of their last stroke(s) had
      // already arrived rather than losing it, just without the animation.
      const stranded = engineRef.current?.flushPeerPreview(leftUserId) ?? []
      for (const op of stranded) {
        pendingPreviewOpIdsRef.current.delete(op.id)
        pendingCommitSeqsRef.current.delete(op.seq ?? 0)
        applyRemoteOp(op)
      }
      if (stranded.length) {
        syncFromLog()
        checkSnapshotBoundary()
      }
    }

    // (#152) peer_cursor itself is no longer handled here at all — Room had
    // nothing to do with it beyond forwarding into Room-level state (which
    // is exactly what re-rendered this whole ~1600-line component up to
    // ~30Hz per moving peer). PeerCursors now subscribes directly (see its
    // own component) — position updates never reach Room's render tree.

    const handleDisconnect = () => setConnected(false)

    const handlePaletteUpdated = ({ palette }: { palette: string[] }) => {
      useRoomStore.getState().setPalette(palette)
    }

    // (#254/#256/#259) Room-wide freeze toggled by the owner — broadcast to
    // everyone including the owner themselves (io.to, see socketHandlers.ts),
    // so this fires for the owner's own toggle too, same as palette_updated
    // above.
    const handleRoomFrozenChanged = ({ frozen }: { frozen: boolean }) => {
      useRoomStore.getState().setRoomFrozen(frozen)
    }

    // (#222) Closed-for-editing toggled by the owner, from here or from the
    // lesson list. The point of the event is that someone mid-lesson finds
    // out when it happens rather than on the rejection of their next stroke.
    const handleRoomClosedChanged = ({ closedAt }: { closedAt: string | null }) => {
      useRoomStore.getState().setRoomClosedAt(closedAt)
    }

    // (#254/#257/#259) One participant's freeze toggled — broadcast to the
    // whole room so ParticipantsPanel can show the indicator for everyone,
    // not just the target themselves.
    const handleParticipantFrozenChanged = ({ userId, frozen }: { userId: string; frozen: boolean }) => {
      dispatchParticipants({ type: 'participant_frozen_changed', userId, frozen })
    }

    // (#227/#231) The owner answered someone waiting on the join screen. On
    // approval the gate finishes the join it was refused — the person is
    // already sitting in front of the screen, and making them press a button
    // to accept being let in would be asking them to confirm the thing they
    // asked for. A denial just changes what the screen says; the server lets
    // them ask again, and the screen offers exactly that.
    //
    // Never restarts the join once we're in: the room is already open, and a
    // stale resolution arriving after a reconnect must not re-enter it.
    const handleJoinRequestResolved = (
      { roomId, requestId, approved }: { roomId: string; requestId: string; approved: boolean },
    ) => {
      // Already inside: this is not about us being let in — it is either the
      // owner hearing a decision made elsewhere (#387: a second tab, the
      // lesson list, an invite that approved someone already queued), or a
      // stale resolution arriving after a reconnect. Neither may restart the
      // join; the owner's queue just loses that one row.
      if (hasJoinedRef.current) {
        if (roomId === id) applyJoinRequestResolved(queryClient, roomId, requestId)
        return
      }
      if (approved) retryJoinRef.current()
      else setJoinState('denied')
    }

    // (#380/#227) Someone is asking to be let in. Addressed to the owner
    // personally, so this only ever fires for them — and it is what makes the
    // waiting section (and the participants tab's badge) appear mid-lesson
    // without anyone having gone looking for it.
    const handleJoinRequestCreated = (
      { roomId, request }: { roomId: string; request: RoomJoinRequest },
    ) => {
      applyJoinRequestCreated(queryClient, roomId, request)
    }

    // (#227) Removed from this room while sitting in it. The server has
    // already taken this socket out of the room, so nothing sent from here
    // will be accepted from now on — say so, rather than letting the next
    // stroke fail as an unexplained sync error.
    //
    // Deliberately does not close the editor or navigate: what should happen
    // to the canvas someone is looking at when they lose access to it — and
    // to whatever they had not finished sending — is its own decision, not
    // one to make silently inside an event handler. The notice is the part
    // that is unambiguous.
    const handleKicked = () => {
      hasJoinedRef.current = false
      notifyError(tRef.current('room.kicked'), { key: 'kicked', durationMs: null })
    }

    socket.on('connect',                    handleConnect)
    socket.on('room_state',                 handleRoomState)
    socket.on('operation_confirmed',        handleOperationConfirmed)
    socket.on('peer_joined',                handlePeerJoined)
    socket.on('peer_left',                  handlePeerLeft)
    socket.on('palette_updated',            handlePaletteUpdated)
    socket.on('room_frozen_changed',        handleRoomFrozenChanged)
    socket.on('room_closed_changed',        handleRoomClosedChanged)
    socket.on('participant_frozen_changed', handleParticipantFrozenChanged)
    socket.on('join_request_created',       handleJoinRequestCreated)
    socket.on('join_request_resolved',      handleJoinRequestResolved)
    socket.on('kicked',                     handleKicked)
    socket.on('disconnect',                 handleDisconnect)

    return () => {
      socket.disconnect()
      socketRef.current = null
      requestFullResyncRef.current = null
    }
  }, [
    id, isCreator, creatorDraft, syncFromLog, applyRemoteOp, applyIdentity, checkSnapshotBoundary,
    restoreFromSnapshot, backfillHistory, drainDeferredQueue, dispatchParticipants, snapshotUploader, noteLayerSeq,
    syncFromLogNow,
    outbox, awaitPaper,
    // Stable for the app's lifetime (one QueryClient, created outside React —
    // see lib/queryClient.ts), so listing it here can never tear the socket
    // down and rebuild it.
    queryClient,
  ])

  // Submits the join gate (joiner path only): connects/join_room's with the
  // entered name + optional password. Kept separate from the socket-wiring
  // effect above so it can run any time after the socket exists, in response
  // to a user action rather than a connection lifecycle event.
  const attemptJoin = useCallback((name: string, password: string | undefined) => {
    if (!id) return

    setJoinError(null)
    setJoinSubmitting(true)
    lastJoinAttemptRef.current = { name, password }
    socketRef.current?.emit(
      'join_room',
      { roomId: id, name, password, lastKnownSeq: latestKnownSeqRef.current || undefined },
      result => {
        setJoinSubmitting(false)
        if (!result.ok) {
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
  }, [id, applyIdentity, outbox, t])

  // Submits the join gate's form. The name is validated here rather than in
  // `attemptJoin`, which is also called with credentials already known good
  // (a retry after approval — see joinRequestResolvedRef).
  const handleJoinSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = joinName.trim()
    if (!trimmed) { setJoinError(t('join.error.nameRequired')); return }
    attemptJoin(trimmed, joinPassword || undefined)
  }, [joinName, joinPassword, attemptJoin, t])

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
  useEffect(() => {
    // A representative spread across the full 6H-6B range, not all 14 grades —
    // the grade slider below gives full-range access; these are just quick picks.
    const gradeActions: Record<string, PencilGradeName> = {
      gradeH: 'H', gradeHB: 'HB', grade2B: '2B', grade4B: '4B', grade6B: '6B',
    }
    const onKey = (e: KeyboardEvent) => {
      // (#310/#405) Who owns this keypress — see editorKeys.ts for the whole
      // precedence and why each layer outranks the canvas. This listener is on
      // `window` in the bubble phase, so a key pressed inside a dialog or a
      // dropdown reaches it too; without the check, typing in a dialog would
      // still be switching tools behind it.
      if (!editorOwnsKey({
        defaultPrevented: e.defaultPrevented,
        modalOpen: isModalOpen(),
        typing: isTypingTarget(e.target),
        popoverOpen: isDismissLayerOpen(),
      })) return
      // (#405) Enter and Esc end an open transform session — apply and cancel.
      // Handled here rather than in the registry above because they are not
      // rebindable (see lib/hotkeys.ts on why), and checked before the bindings
      // so a rebind can never shadow the only two keys that close a session.
      //
      // Cancel throws the accumulated matrix away whole. Nothing was committed
      // while the session was open, so this leaves no trace on the undo stack
      // either — there is nothing to take back, which is the same reason
      // Ctrl+Z behaves as Esc here (see handleUndo).
      if (transformSessionRef.current) {
        if (e.key === 'Enter') { commitTransformSessionRef.current(true); e.preventDefault(); return }
        if (e.key === 'Escape') { resetTransformSessionRef.current(); e.preventDefault(); return }
      }
      const is = (actionId: string) => matchesHotkey(e, hotkeys[actionId])
      if (is('undo')) { void handleUndo(); e.preventDefault(); return }
      if (is('redo')) { void handleRedo(); e.preventDefault(); return }
      if (is('toggleEraser')) { toggleTool('eraser'); return }
      if (is('toggleSmudge')) { toggleTool('smudge'); return }
      if (is('toggleCharcoal')) { toggleTool('charcoal'); return }
      if (is('toggleLiner')) { toggleTool('liner'); return }
      if (is('toggleMarker')) { toggleTool('marker'); return }
      // (#405) The four that used to be modes, selected through the same
      // registry and the same toggle-off-to-your-drawing-tool rule as the rest.
      if (is('toggleEyedropper')) { toggleTool('eyedropper'); return }
      if (is('toggleRuler')) { toggleTool('ruler'); return }
      // Selectable only with something to transform (the toolbar button is
      // `disabled` on the same condition), but always *de*selectable: making
      // the active layer the background empties the selection, and a key that
      // refused to let go there would leave the canvas locked with no gizmo on
      // it and no obvious way out.
      if (is('toggleTransform')) {
        if (transformActive || transformTargetIds.length > 0) toggleTool('transform')
        return
      }
      if (is('toggleGrid')) { toggleTool('grid'); return }
      if (is('resetRotation')) { setVp(v => ({ ...v, angle: 0 })); return }
      if (is('toggleHand')) { setHandTool(h => !h); return }
      // Both size hotkeys clamp to the tool's own schema range (toolSizeRange)
      // rather than to literals — see its comment for why (#336).
      // (#405) `drawingTool`, not the selection: with the ruler in hand there
      // is no size to step, and silently resizing the pencil behind it would
      // be a key that appears to do nothing. Sizing the tool you will go back
      // to is the useful reading of the same press.
      if (is('decreaseSize')) {
        // Liner's own 'size' field is a fixed-label enum (ADR 003), not the
        // plain px number every other tool's 'size' field holds (marker
        // included) — step through the ladder instead of subtracting 1.
        if (drawingTool === 'liner') setToolSetting('liner', 'size', prev => stepLinerSize(prev as string, -1))
        else {
          const range = toolSizeRange(drawingTool)
          if (range) setToolSetting(drawingTool, 'size', prev => Math.max(range.min, (prev as number) - 1))
        }
        return
      }
      if (is('increaseSize')) {
        if (drawingTool === 'liner') setToolSetting('liner', 'size', prev => stepLinerSize(prev as string, 1))
        else {
          const range = toolSizeRange(drawingTool)
          if (range) setToolSetting(drawingTool, 'size', prev => Math.min(range.max, (prev as number) + 1))
        }
        return
      }
      if (is('rotateCCW')) { setVp(v => ({ ...v, angle: v.angle - Math.PI / 12 })); return }
      if (is('rotateCW')) { setVp(v => ({ ...v, angle: v.angle + Math.PI / 12 })); return }
      for (const [actionId, grade] of Object.entries(gradeActions)) {
        if (is(actionId)) { setToolSetting('pencil', 'grade', grade); setTool('pencil'); return }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    drawingTool, setTool, toggleTool, transformActive, transformTargetIds.length,
    setToolSetting, setVp, setHandTool, handleUndo, handleRedo, hotkeys,
  ])

  // ── Space = hold to pan (#319, ADR 007 §4) ────────────────────────────────
  // Separate from the registry-driven effect above because this is a hold,
  // not an action: it needs the keyup half, and it must not be rebindable
  // (see lib/hotkeys.ts). Same guards as the shortcuts above — a Space typed
  // into a room name or a dialog is a space, not a gesture.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      if (isTypingTarget(e.target) || isModalOpen()) return
      // Otherwise the page scrolls under the canvas on every hold.
      e.preventDefault()
      setHandHeld(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      setHandHeld(false)
    }
    // A keyup that never arrives — alt-tabbing away mid-hold, an OS shortcut
    // swallowing it — would otherwise leave the canvas permanently in a mode
    // the person can't see the cause of and didn't ask for.
    const release = () => setHandHeld(false)

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
      setHandHeld(false)
    }
  }, [setHandHeld])

  // ── callbacks ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const blob = await engineRef.current?.exportPNG(); if (!blob) return
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${config?.name ?? 'drawing'}.png`; a.click()
    URL.revokeObjectURL(url)
  }, [config])

  // (#329) The transparent-PNG variant (#15) is gone along with its header
  // button: a second export button for a rarely-wanted variant, sitting
  // permanently in the panel #320 is trying to empty. `exportPNG` still takes
  // the flag, so it can come back as an option inside a real export dialog if
  // it's ever actually missed.

  // #15: serializes the operation log as-is (same shape appendOperation/
  // getOperations already deal in) so the exact same JSON could later be
  // replayed back through appendOperation('remote') to restore the session.
  const handleSaveSession = useCallback(() => {
    const ops = engineRef.current?.getOperations(); if (!ops) return
    const blob = new Blob([JSON.stringify(ops, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${config?.name ?? 'drawing'}-session.json`; a.click()
    URL.revokeObjectURL(url)
  }, [config])

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

      {/* ── Header ── */}
      <header className={clsx(styles.header, uiHidden && styles.uiHidden, styles.strokeBlockable)}>
        {/* The wordmark is the way out of the editor, same as on every other
            page — it replaced an arrow_back that went to /create rather than
            anywhere back, and left without asking. */}
        <button className={styles.headerLogoBtn} onClick={() => void leaveRoom()} title={t('room.home')} aria-label={t('room.home')}>
          <Logo />
        </button>
        {/* Same divider the control clusters use on the right (#329) — the
            wordmark is a button that leaves the room, and without a break
            between them it and the name beside it read as one label. */}
        <div className={styles.headerDivider} />
        {renameDraft !== null ? (
          <input
            className={clsx(styles.roomName, styles.roomNameInput)}
            autoFocus
            value={renameDraft}
            aria-label={t('room.rename')}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setRenameDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); void submitRename() }
              if (e.key === 'Escape') { e.preventDefault(); setRenameDraft(null) }
            }}
            onBlur={() => void submitRename()}
          />
        ) : isOwner ? (
          <button
            className={clsx(styles.roomName, styles.roomNameBtn)}
            onClick={() => setRenameDraft(config.name)}
            title={t('room.rename')}
          >
            {config.name}
          </button>
        ) : (
          <span className={styles.roomName}>{config.name}</span>
        )}
        {/* (#376) Beside the name, because what it reports is the state of
            the thing the name refers to. Took over from the connection
            banner's "Saving N strokes…", which flashed on and off with every
            stroke. */}
        <SyncIndicator connected={connected} pending={outboxState.pending} />

        {/* (#329) Four sections, divider-separated, in the order they're
            reached for: rotation | zoom + fit | undo/redo | fullscreen | ≡.
            Everything that isn't a per-second viewport or history action moved
            out — export/save/settings into the ≡ menu, Clear into the layer's
            own "⋮" (it always cleared *a layer*, never the canvas), the
            participants list and room freeze into the side panel (#328), and
            the transparent-PNG export and the two rotate-by-15° buttons are
            gone: the first was a second export button for a rarely-wanted
            variant, the second is what dragging the rotation readout does now.
            The rule this panel is held to from here on (#320): a control earns
            a place here by being needed *while drawing*. */}
        <div className={styles.headerRight}>
          {/* Rotation: drag up/down to turn the canvas by fine degrees, click
              to snap to the next quarter turn. (#106) If the angle is already
              exactly one of 0/90/180/270, a click advances to the next one,
              wrapping 270 back to 0; from any other angle (a free rotation
              gesture, or a drag) it resets straight to 0 rather than rounding
              up to the next multiple. */}
          <button
            className={clsx(styles.angleLabel, angleDeg !== 0 && styles.angleLabelActive)}
            onPointerDown={onAngleDragDown}
            onClick={() => setVp(v => {
              const deg = Math.round(v.angle * 180 / Math.PI)
              const normalizedDeg = ((deg % 360) + 360) % 360
              const isAtCanonicalAngle = normalizedDeg % 90 === 0
              const nextDeg = isAtCanonicalAngle ? (normalizedDeg + 90) % 360 : 0
              return { ...v, angle: nextDeg * Math.PI / 180 }
            })}
            title={t('room.rotation', { hotkey: formatHotkeyLabel(hotkeys.resetRotation) })}
          >
            <Icon name="screen_rotation_alt" />
            {angleDeg}°
          </button>

          <div className={styles.headerDivider} />

          {/* Infinite rooms display (and reset to) zoom relative to the
              device-native 1-world-unit-per-physical-pixel scale, so "100%"
              means the drawing's actual 1:1 resolution on every screen —
              see deviceNativeZoom's doc comment. Bounded rooms keep vp.zoom
              as-is (their canvas backing is the fixed document size, so
              vp.zoom already is the document scale). Both the number and the
              reset come from `zoomPercent`/`resetZoom` above, shared with
              #362's toast — this readout used to compute the same expression
              twice inline, and a third copy in the toast is how the four
              notice banners ended up needing #343. */}
          <button
            className={styles.zoomLabel}
            onPointerDown={onZoomDragDown}
            onClick={resetZoom}
            title={t('room.zoom')}
          >
            {zoomPercent}%
          </button>
          <button className={styles.headerIconBtn} title={t('room.fitCanvas')} aria-label={t('room.fitCanvas')} onClick={fitCanvas}>
            <Icon name="fit_screen" />
          </button>

          <div className={styles.headerDivider} />

          <button
            className={styles.headerIconBtn}
            onClick={handleUndo}
            title={t('room.undoTitle', { hotkey: formatHotkeyLabel(hotkeys.undo) })}
            aria-label={t('room.undo')}
          >
            <Icon name="undo" />
          </button>
          <button
            className={styles.headerIconBtn}
            onClick={handleRedo}
            title={t('room.redoTitle', { hotkey: formatHotkeyLabel(hotkeys.redo) })}
            aria-label={t('room.redo')}
          >
            <Icon name="redo" />
          </button>

          {/* (#321) A second way into minimal UI, next to the tap that is
              otherwise its only entrance — a tap on the canvas is easy to
              discover by accident and hard to discover on purpose. Only shown
              while the setting is on: it hides the chrome, so it cannot be
              the thing that brings it back (that is still the tap), and
              offering it to someone who hasn't asked for the mode would be a
              button that makes the interface vanish with no visible way to
              return. */}
          {tapToHideEnabled && (
            <>
              <div className={styles.headerDivider} />
              <button
                className={styles.headerIconBtn}
                onClick={toggleUI}
                title={t('room.minimalUi')}
                aria-label={t('room.minimalUi')}
              >
                <Icon name="visibility_off" />
              </button>
            </>
          )}

          {fullscreenSupported && (
            <>
              <div className={styles.headerDivider} />
              <button
                className={styles.headerIconBtn}
                onClick={toggleFullscreen}
                title={t(isFullscreen ? 'room.exitFullscreen' : 'room.fullscreen')}
                aria-label={t(isFullscreen ? 'room.exitFullscreen' : 'room.fullscreen')}
              >
                <Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} />
              </button>
            </>
          )}

          <div className={styles.headerDivider} />

          {/* Everything you reach for between strokes rather than during
              one. Same shared Menu as every other dropdown in the app
              (#328), with icons (#329). */}
          <Menu
            triggerClassName={styles.headerIconBtn}
            triggerLabel={t('room.menu')}
            trigger={<Icon name="menu" />}
            actions={[
              { label: t('room.export'), icon: 'download', onClick: handleExport, title: t('room.exportTitle') },
              { label: t('room.saveSession'), icon: 'save', onClick: handleSaveSession, title: t('room.saveSessionTitle') },
              { label: t('room.settings'), icon: 'settings', onClick: () => setSettingsOpen(true) },
              // The same exit as the wordmark, confirmation dialog included —
              // the logo only reads as "leave" once you already know it does.
              { label: t('room.leave'), icon: 'logout', onClick: () => void leaveRoom() },
            ]}
          />
        </div>
      </header>

      {/* (#230) roomId/isOwner are what the Access tab needs; the panel shows
          it only when both are present. */}
      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} roomId={id} isOwner={isOwner} />
      )}

      <div className={styles.body}>

        {/* ── Left toolbar — tool selection only, fixed height per row ── */}
        <aside className={clsx(styles.toolbar, uiHidden && styles.uiHidden, styles.strokeBlockable)}>

          {/* Quick picks: the gradeHotkeyLabels keys jump the pencil grade to
              H / HB / 2B / 4B / 6B; [ / ] resize whichever tool is active
              (handled by the quick-settings panel to the right, not here). */}
          <button
            className={clsx(styles.toolIconBtn, tool === 'pencil' && styles.toolIconBtnActive)}
            title={t('tool.pencilTitle', { hotkeys: gradeHotkeyLabels })}
            aria-label={t('tool.pencil')}
            onClick={() => selectTool('pencil')}
          ><Icon name="edit" /></button>
          <button
            className={clsx(styles.toolIconBtn, tool === 'eraser' && styles.toolIconBtnActive)}
            title={t('tool.eraserTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleEraser) })}
            aria-label={t('tool.eraserTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleEraser) })}
            onClick={() => selectTool('eraser')}
          ><Icon name="ink_eraser" /></button>
          <button
            className={clsx(styles.toolIconBtn, tool === 'smudge' && styles.toolIconBtnActive)}
            title={t('tool.smudgeTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleSmudge) })}
            aria-label={t('tool.smudge')}
            onClick={() => selectTool('smudge')}
          ><Icon name="smudge" /></button>
          {/* Charcoal (#304, ADR 005) — its own material, not a soft black
              pencil: three types (vine/willow/compressed) selected through
              the quick-settings panel to the right, the same way the pencil's
              6H-6B grade is, rather than as three toolbar buttons. */}
          <button
            className={clsx(styles.toolIconBtn, tool === 'charcoal' && styles.toolIconBtnActive)}
            title={t('tool.charcoalTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleCharcoal) })}
            aria-label={t('tool.charcoal')}
            onClick={() => selectTool('charcoal')}
          ><Icon name="charcoal" /></button>
          <button
            className={clsx(styles.toolIconBtn, tool === 'liner' && styles.toolIconBtnActive)}
            title={t('tool.linerTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleLiner) })}
            aria-label={t('tool.liner')}
            onClick={() => selectTool('liner')}
          ><Icon name="stylus" /></button>
          {/* Marker (#252, ADR 004) — UI/toolbar plumbing only; the actual
              bullet/chisel dab shaping and multiply compositing are separate
              in-flight engine sub-issues (#249-251), so this renders however
              the engine's current unrecognized-preset fallback handles it
              (a flat HB pencil dab) until those land — see markerSchema's
              own doc comment in toolSchemas.ts. */}
          <button
            className={clsx(styles.toolIconBtn, tool === 'marker' && styles.toolIconBtnActive)}
            title={t('tool.markerTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleMarker) })}
            aria-label={t('tool.marker')}
            onClick={() => selectTool('marker')}
          ><Icon name="ink_highlighter" /></button>

          <div className={styles.toolDivider} />

          {/* Hand (#319, ADR 007) — the only way to move the canvas with
              nothing in hand but a stylus: a pen has no middle button, and
              Space needs a free second hand. Sits above the divider with the
              other non-painting modes, not among the drawing tools, because
              it is one (ADR 007 §5). */}
          <button
            className={clsx(styles.toolIconBtn, handTool && styles.toolIconBtnHeld)}
            title={t('tool.handTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleHand) })}
            aria-label={t('tool.hand')}
            aria-pressed={handTool}
            onClick={() => setHandTool(h => !h)}
          ><Icon name="pan_tool" /></button>

          {/* (#405) The four tools below the divider select like every button
              above it — one tool is in hand at a time, and pressing the same
              one again hands the canvas back to the drawing tool. They used to
              be mode toggles laid over whichever pencil was current, which is
              what let a transform session and a pencil both be "selected".

              Eyedropper (#82) picks a color from the canvas, writes it into
              the tool it hands back to, and opens the ColorPicker tab of the
              unified right-side SidePanel (see .layerPanelWrap below) to
              refine it. */}
          <button
            className={clsx(styles.toolIconBtn, eyedropperActive && styles.toolIconBtnActive)}
            title={t('tool.eyedropperTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleEyedropper) })}
            aria-label={t('tool.eyedropper')}
            aria-pressed={eyedropperActive}
            onClick={() => selectTool('eyedropper')}
          ><Icon name="colorize" /></button>
          <button
            className={clsx(styles.toolIconBtn, rulerActive && styles.toolIconBtnActive)}
            title={t('tool.rulerTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleRuler) })}
            aria-label={t('tool.ruler')}
            aria-pressed={rulerActive}
            onClick={() => selectTool('ruler')}
          ><Icon name="square_foot" /></button>
          <button
            className={clsx(styles.toolIconBtn, transformActive && styles.toolIconBtnActive)}
            title={t('tool.transformTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleTransform) })}
            aria-label={t('tool.transform')}
            aria-pressed={transformActive}
            // (#405) Stays clickable while it is the selected tool even with
            // nothing to transform — see the hotkey's own note: disabling the
            // only way out of a tool is how you get stuck in it.
            disabled={!transformActive && transformTargetIds.length === 0}
            onClick={() => selectTool('transform')}
          ><Icon name="free-transform" /></button>

          <div className={styles.toolDivider} />

          {/* (#405) Selects the grid tool; whether the grid is *drawn* is its
              own `show` setting in the column to the right, which is what lets
              it stay up under every other tool. Selecting it currently does
              nothing but put those settings on screen — the grid has no canvas
              gesture of its own until #406 gives it move and rotate. */}
          <button
            className={clsx(styles.toolIconBtn, tool === 'grid' && styles.toolIconBtnActive)}
            title={t('tool.gridTitle', { hotkey: formatHotkeyLabel(hotkeys.toggleGrid) })}
            aria-label={t('tool.grid')}
            aria-pressed={tool === 'grid'}
            onClick={() => selectTool('grid')}
          ><Icon name="grid_on" /></button>

        </aside>

        {/* ── Quick-settings panel — the active tool's quick-access fields
            (#196), driven entirely by TOOL_SCHEMAS. Kept as its own
            same-width column next to the toolbar rather than interleaved
            with the tool-select buttons above: interleaving made the
            buttons visually jump every time the field count changed
            switching tools (pencil: grade+size+opacity+color, eraser:
            size+opacity only) — a fixed button column plus a separately
            reflowing settings column reads far more stable. */}
        <aside className={clsx(styles.quickSettingsBar, uiHidden && styles.uiHidden, styles.strokeBlockable)}>
          {Object.entries(TOOL_SCHEMAS[settingsToolId])
            .filter(([, descriptor]) => descriptor.quickAccess)
            .filter(([, descriptor]) => !descriptor.visibleWhen || descriptor.visibleWhen(toolSettings[settingsToolId]))
            .map(([key, descriptor]) => (
              <SettingField
                key={key}
                descriptor={descriptor}
                value={toolSettings[settingsToolId][key]}
                onChange={v => setToolSetting(settingsToolId, key, v)}
                layout="toolbar"
                onExpand={key === 'color' ? () => setActivePanel('color') : undefined}
              />
            ))}
        </aside>

        {/* ── Viewport ── */}
        {/* (#319) The grab cursor lives on .viewport rather than the canvas
            because the canvas is inert while the hand is on — a cursor set on
            an element that isn't hit-testable never shows. */}
        <div ref={setVpNode} className={clsx(styles.viewport, VIEWPORT_CURSOR_CLASS[cursor.viewportCursor])}>
          <div
            ref={canvasWrapRef}
            className={styles.canvasWrap}
            style={{ transform: config.infinite ? undefined : canvasTransform }}
          >
            <canvas
              ref={canvasRef}
              // Infinite canvas (#133 Phase 1): no fixed backing-buffer size
              // to set here — the ResizeObserver effect above drives it via
              // engine.resizeCanvas() to track the viewport container's own
              // size instead, and the CSS size simply fills that container.
              width={config.infinite ? undefined : config.width}
              height={config.infinite ? undefined : config.height}
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
                ...(config.infinite ? { width: '100%', height: '100%' } : { width: config.width, height: config.height }),
                pointerEvents: (roomContentReady && !editingBlocked && !handActive) ? undefined : 'none',
              }}
            />
            {/* Bounded rooms: these five assume canvas-pixel-space
                coordinates with pan/zoom/rotate inherited for free from
                canvasWrap's own CSS transform (see each one's docstring) —
                exactly as before #143, completely unchanged. */}
            {!config.infinite && (
              <PeerCursors
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
                markerAngleRadians={markerCanvasAngleRadians}
                markerFollowStroke={markerFollowStroke}
                tiltResponse={tiltResponse}
              />
            )}
            {!config.infinite && gridVisible && <GridOverlay width={config.width} height={config.height} />}
            {/* (#405) On screen whenever it is shown, whatever tool is in
                hand — a straight edge you can draw against is the point of
                one. It carries no pointer handlers at all now; dragging it is
                the catcher's job, and the catcher only exists while the ruler
                is the selected tool. */}
            {!config.infinite && rulerShow && rulerLine && (
              <RulerOverlay a={rulerLine.a} b={rulerLine.b} zoom={vp.zoom} angle={vp.angle} />
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
                  markerAngleRadians={markerCanvasAngleRadians}
                  markerFollowStroke={markerFollowStroke}
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
              {rulerShow && rulerLine && (
                <RulerOverlay a={rulerLine.a} b={rulerLine.b} zoom={vp.zoom} angle={vp.angle} />
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
            </div>
          )}
          {/* (#405) One catcher for the two tools whose gesture is a press on
              the canvas itself. The ruler's is armed for as long as the tool is
              selected and the line is shown — laying a new line and grabbing
              the existing one are the same surface now, told apart per press by
              rulerGestureAt — where it used to disappear the moment a line
              existed. A hidden ruler gets no catcher at all: hidden means
              inert, the same rule that keeps it from snapping. */}
          {eyedropperActive && (
            <div className={styles.canvasCatcher} onPointerDown={handleEyedropperPick} />
          )}
          {rulerActive && rulerShow && (
            <div
              className={styles.canvasCatcher}
              onPointerDown={handleRulerDown}
              onPointerMove={handleRulerHover}
              onPointerEnter={() => { rulerRectRef.current = null }}
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

        {/* ── Side panel (layers, color, …) ── */}
        {/* #99: wrapped rather than passing a className into SidePanel — the
            wrapper is a positioned overlay (see .layerPanelWrap) that only
            fades in/out, so the panel stays mounted (no lost focus/state)
            and the canvas underneath never resizes, same as header/toolbar
            above. */}
        <div className={clsx(styles.layerPanelWrap, uiHidden && styles.uiHidden, styles.strokeBlockable)}>
          <SidePanel
            active={activePanel}
            onSelect={setActivePanel}
            tabs={[
              {
                id: 'layers', icon: 'layers', title: t('room.panel.layers'),
                content: <LayerPanel layerState={layerState} onChange={setLayerStateLocal} onOp={dispatchOp} isOwner={isOwner} hasLayerContent={hasLayerContent} />,
              },
              {
                // Reflects whichever of pencil/liner/marker is actually
                // active (the drawing tools with a real 'color' field)
                // rather than always pencil — this tab is reached both from
                // any of those tools' own quick-field expand button and from
                // FloatingToolPanel's escape hatch (see floatingPrimaryTool
                // below — pencil/liner/marker all share its one drawing-tool
                // slot now), so falling back to pencil's color there only
                // ever matters before any of the three has been picked yet.
                id: 'color', icon: 'palette', title: t('room.panel.color'),
                content: (
                  <>
                    <ColorPicker
                      value={colorToolColor}
                      onChange={v => setToolSetting(colorTool, 'color', v)}
                      mode={colorPickerMode}
                      onModeChange={setColorPickerMode}
                    />
                    <PaletteBar
                      palette={palette}
                      value={colorToolColor}
                      onSelect={v => setToolSetting(colorTool, 'color', v)}
                      onAdd={addPaletteColor}
                      onRemove={removePaletteColor}
                    />
                  </>
                ),
              },
              {
                // (#328) Who's in the room, their live status, and the owner's
                // moderation actions on each of them — plus the room-wide
                // freeze in this tab's own header, which is where it moved to
                // from the top bar.
                id: 'participants', icon: 'group', title: t('room.panel.participants'),
                // (#380) The one thing in this panel that needs an answer
                // *now*. Without it on the strip, the waiting section below
                // only reaches an owner who was already looking at this tab —
                // which, mid-lesson, is nobody.
                badge: joinQueue.requests.length,
                badgeLabel: t('room.joinQueue.badge', { n: joinQueue.requests.length }),
                headerActions: (
                  <ParticipantsRoomActions
                    isOwner={isOwner}
                    roomFrozen={roomFrozen}
                    onToggleRoomFrozen={toggleRoomFrozen}
                  />
                ),
                content: (
                  <ParticipantsPanel
                    participants={participants}
                    drawingIds={drawingIds}
                    myUserId={myUserId}
                    isOwner={isOwner}
                    onToggleFreeze={toggleParticipantFrozen}
                    joinRequests={joinQueue.requests}
                    resolvingRequestId={joinQueue.resolvingId}
                    onResolveJoinRequest={joinQueue.resolve}
                  />
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
                        onExpand={key === 'color' ? () => setActivePanel('color') : undefined}
                      />
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* Draggable floating tool cluster (#157) — independent of the
            header/left-toolbar above, both of which stay as they are.
            (#321) When it shows is a setting now (Always / in minimal UI /
            Never) rather than "only while minimal UI has hidden the chrome",
            which is what it meant when it was that mode's replacement
            toolkit and nothing else — see lib/uiPreferences. */}
        <FloatingToolPanel
          // FloatingToolPanel (#157) is a fixed 4-slot compass layout with
          // one shared drawing-tool slot (pencil/liner/marker — see
          // floatingPrimaryTool's own doc comment above); smudge/ruler/
          // transform/grid/eyedropper stay outside it, same as before.
          // Folds into "not eraser" here purely so its own top-button/eraser
          // highlight stays correct while smudge is active elsewhere (the
          // left toolbar); tapping either of *this* panel's two buttons
          // still switches away from smudge normally via onSetTool.
          tool={tool === 'eraser' ? 'eraser' : floatingPrimaryTool}
          primaryTool={floatingPrimaryTool}
          onSetTool={setTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          primaryColor={colorToolColor}
          palette={palette}
          onSelectColor={v => setToolSetting(colorTool, 'color', v)}
          onOpenColorPicker={openColorPickerFromFlyout}
          roomId={id ?? ''}
          position={panelPosition}
          onPositionChange={setPanelPosition}
          containerRef={editorRef}
          hidden={!floatingPanelVisible(floatingPanelMode, deviceType, uiHidden)}
          undoHotkeyLabel={formatHotkeyLabel(hotkeys.undo)}
          redoHotkeyLabel={formatHotkeyLabel(hotkeys.redo)}
          flyoutOpen={paletteFlyoutOpen}
          onFlyoutOpenChange={setPaletteFlyoutOpen}
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
          paletteOpen={paletteFlyoutOpen}
        />

        {/* #185: visible while the initial content restore (snapshot fetch
            + operation-log replay/backfill) is still in flight — a direct
            child of .editor (not .viewport), rendered last and with a
            z-index above every other child (.header 3, .toolbar/
            .layerPanelWrap 2) so it genuinely covers the whole screen, not
            just the canvas — an earlier version lived inside .viewport
            (z-index 1) and could never rise above those. */}
        {/* Three ways a room can be not-open, in order of how much they know:
            no socket at all (#313), the paper texture failed (#346), or it is
            simply still loading. Each replaces the one below it. */}
        {!roomContentReady && (
          showOfflineOverlay
            ? <OfflineRoomOverlay pending={outboxState.pending} />
            : showPaperFailedOverlay
              ? <PaperFailedOverlay retrying={paperRetrying} onRetry={() => void retryPaper()} />
              : <RoomLoadingOverlay paper={paperProgress} />
        )}
      </div>

      {/* Debug overlays share one positioning stack (.debugStack) so having
          more than one flag on at once (debugOverlay/hapticGrain/
          tap stats) doesn't render them fully on top of each other at the
          same fixed corner — see chat, this is exactly what happened while
          chasing #154's latency regression with hapticGrain still on from
          earlier testing. */}
      {(debugEnabled || hapticGrainEnabled || tapDebugEnabled || pencilSoundTuningEnabled) && (
        <div className={styles.debugStack}>
          {/* On-device log capture (see lib/diagLog.ts) — for field reports
              from a device with no attached inspector (Android tablets,
              mainly): diagLog() calls throughout the tap-toggle/viewport
              gesture code (and roomContentReady transitions) feed an
              in-memory ring buffer; this copies it to the clipboard so it
              can be pasted back in chat instead of needing devtools. */}
          <div className={styles.debugOverlay} style={{ pointerEvents: 'auto' }}>
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(getDiagLogs()) }}
              style={{ font: 'inherit', color: 'inherit', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', marginRight: 6 }}
            >
              copy logs
            </button>
            <button
              type="button"
              onClick={() => clearDiagLogs()}
              style={{ font: 'inherit', color: 'inherit', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
            >
              clear logs
            </button>
          </div>
          {/* Device performance readout (#91, extended #104) — ?debug=1
              only. Shows the last completed stroke's real input-sample
              rate, paint cost, and end-to-end (PointerEvent.timeStamp →
              _display()) input latency, so a tablet with no attached
              devtools can still report hard numbers. */}
          {debugEnabled && (
            <div className={styles.debugOverlay}>
              {strokeStats ? (
                <>
                  {/* Trimmed to just the two latency lines while chasing
                      #154's DPR regression (see chat) — events/gap/dabs/
                      render were crowding out the numbers that actually
                      matter right now. Full stats are still in
                      StrokeDebugStats if needed again. */}
                  <div>e2e latency: avg {strokeStats.avgE2eLatencyMs.toFixed(1)}ms / max {strokeStats.maxE2eLatencyMs.toFixed(1)}ms</div>
                  <div>tip latency: avg {strokeStats.avgTipLatencyMs.toFixed(1)}ms / max {strokeStats.maxTipLatencyMs.toFixed(1)}ms</div>
                  {/* rAF-anchored real display latency (replaces a prior
                      attempt at this via the browser's Event Timing API —
                      PerformanceObserver({type:'event'}) — which never
                      populated: the spec excludes exactly the continuous
                      event types we cared about, pointermove/touchmove/etc,
                      from ever generating an 'event' entry at all, so it
                      silently reported zero samples for the entire life of
                      that approach. See StrokeDebugStats.avgFrameLatencyMs
                      for what this actually measures and why it's a better
                      proxy for "did it hit the screen yet" than the two
                      JS-only lines above. */}
                  <div>frame latency: avg {strokeStats.avgFrameLatencyMs.toFixed(1)}ms / max {strokeStats.maxFrameLatencyMs.toFixed(1)}ms</div>
                </>
              ) : (
                <div>draw a stroke to see stats</div>
              )}
              {/* Live paper-fill-threshold tuning (see chat) — applies to
                  the very next dab painted, no Save/reload. */}
              {/* pointerEvents: 'auto' overrides .debugStack's own
                  pointer-events: none (deliberate there — an informational
                  overlay must never block drawing/touch on the canvas
                  beneath it) — this is the one real control in that stack,
                  so it alone needs to opt back in or no pointer/touch input
                  ever reaches it at all. */}
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                <span>fill @</span>
                <input
                  type="range"
                  min={0}
                  max={0.999}
                  step={0.001}
                  value={paperFillThreshold}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setPaperFillThresholdState(v)
                    engineRef.current?.setPaperFillThreshold(v)
                  }}
                  style={{ width: 90 }}
                />
                <span>{paperFillThreshold.toFixed(3)}</span>
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                <span>fill cap</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={paperFillCap}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setPaperFillCapState(v)
                    engineRef.current?.setPaperFillCap(v)
                  }}
                  style={{ width: 90 }}
                />
                <span>{paperFillCap.toFixed(2)}</span>
              </div>

              {/* #305: charcoal's tilt ladder. Only shown while charcoal is the
                  active tool — these knobs do nothing for anything else, and
                  the overlay is already crowded. Takes effect on the next
                  stroke (shape is baked per dab at record time), so tuning is
                  "draw, nudge, draw again" rather than live-morphing what's
                  already on the page. */}
              {tool === 'charcoal' && (
                <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 6 }}>
                  <div style={{ opacity: 0.7 }}>charcoal tilt (next stroke)</div>
                  {CHARCOAL_FEEL_SLIDERS.map(s => (
                    <div key={s.key} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                      <span style={{ width: 78 }}>{s.label}</span>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={charcoalFeel[s.key]}
                        onChange={e => {
                          const v = Number(e.target.value)
                          setCharcoalFeelState(prev => ({ ...prev, [s.key]: v }))
                          engineRef.current?.setCharcoalFeel({ [s.key]: v })
                        }}
                        style={{ width: 90 }}
                      />
                      <span>{charcoalFeel[s.key].toFixed(s.step < 1 ? 2 : 0)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* #389: graphite's tilt curve. Shown for every tool that rides
                  PENCIL_DAB_SHAPING — eraser and smudge share the geometry, so
                  the knobs are live for them too even though the lightening
                  one only reaches graphite's own deposit. Same "next stroke"
                  semantics as charcoal's block above. */}
              {(tool === 'pencil' || tool === 'eraser' || tool === 'smudge') && (
                <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 6 }}>
                  <div style={{ opacity: 0.7 }}>pencil tilt (next stroke)</div>
                  {PENCIL_TILT_SLIDERS.map(s => (
                    <div key={s.key} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                      <span style={{ width: 78 }}>{s.label}</span>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={pencilTilt[s.key]}
                        onChange={e => {
                          const v = Number(e.target.value)
                          setPencilTiltState(prev => ({ ...prev, [s.key]: v }))
                          engineRef.current?.setPencilTilt({ [s.key]: v })
                        }}
                        style={{ width: 90 }}
                      />
                      <span>{pencilTilt[s.key].toFixed(s.step < 1 ? 2 : 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Haptic-grain experiment diagnostic — always shown while the flag
              is on (not gated behind ?debug=1) so it's visible on a tablet
              with no attached devtools while chasing "vibrates from the test
              button but not while drawing" (see chat). cellsEntered=0 after
              drawing means the stroke never reached HapticGrain.sample() at
              all; bumpsHit=0 means it's reaching it but the density
              threshold never trips; vibrateOk < bumpsHit is now expected
              (see HapticGrain's minIntervalMs) — most grid hits during a
              real stroke land inside the same throttle window, so only some
              of them reach an actual navigator.vibrate() call; a call that
              browser-rejects instead of being throttled is indistinguishable
              here, but that was never observed while diagnosing this. */}
          {hapticGrainEnabled && (
            <div className={styles.debugOverlay}>
              {hapticStats ? (
                <>
                  <div>cells entered: {hapticStats.cellsEntered}</div>
                  <div>bumps hit: {hapticStats.bumpsHit}</div>
                  <div>vibrate() ok: {hapticStats.vibrateOk}</div>
                </>
              ) : (
                <div>draw a stroke to see haptic stats</div>
              )}
            </div>
          )}

          {/* Minimal-UI tap diagnostic — see TapDebugInfo's docstring (chat:
              "works on Samsung, not on a Surface"). maxDistPx close to or
              over the threshold means that device's digitizer reports
              enough jitter on a stationary tap to read as a drag;
              concurrentTouches > 1 means a second touch (real or a stray
              palm contact) was down at the same time, disqualifying it as a
              single-finger tap. */}
          {tapDebugEnabled && (
            <div className={styles.debugOverlay}>
              {tapDebug ? (
                <>
                  <div>pointerType: {tapDebug.pointerType}</div>
                  <div>max move: {tapDebug.maxDistPx.toFixed(1)}px (threshold {TAP_MOVE_THRESHOLD_PX}px)</div>
                  <div>concurrent touches: {tapDebug.concurrentTouches}</div>
                  <div>was tap: {String(tapDebug.wasTap)}</div>
                  <div>on control: {String(tapDebug.onControl)}</div>
                </>
              ) : (
                <div>tap the canvas to see tap stats</div>
              )}
            </div>
          )}

          {pencilSoundTuningEnabled && <PencilSoundTuningPanel pencilSoundRef={pencilSoundRef} tool={drawingTool} />}
        </div>
      )}
    </div>
  )
}
