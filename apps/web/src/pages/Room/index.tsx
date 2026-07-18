import { useEffect, useRef, useState, useCallback, useMemo, useReducer } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import clsx from 'clsx'
import { clamp } from 'lodash-es'
import { nanoid } from 'nanoid'
import type {
  LayerState, OperationDraft, Operation, Participant, Room as RoomEntity,
  ClientToServerEvents, ServerToClientEvents,
} from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { PencilEngine, PENCIL_PRESETS, type PencilEngineAPI, type PencilGradeName, type StrokeDebugStats, type HapticGrainStats } from '../../engine'
import { LayerPanel } from '../../components/LayerPanel'
import { SidePanel } from '../../components/SidePanel'
import { ColorPicker } from '../../components/ColorPicker'
import { Icon } from '../../components/Icon'
import { SettingsPanel } from '../../components/SettingsPanel'
import { SettingField } from '../../components/SettingField'
import { FloatingToolPanel } from '../../components/FloatingToolPanel'
import { computeCompositeOrder } from '../../lib/layers'
import { getFeatureFlag, getPencilSoundSetting, getPaperGrainVariant, getGraphiteGrainVariant } from '../../lib/featureFlags'
import { PencilSound, PENCIL_SOUND_VARIANT_1, PENCIL_SOUND_VARIANT_2, PENCIL_SOUND_VARIANT_3 } from '../../lib/PencilSound'
import { useDragToAdjust } from '../../lib/useDragToAdjust'
import { TAP_MOVE_THRESHOLD_PX } from '../../lib/tapThreshold'
import { useViewport } from './useViewport'
import { useTapToggle, type TapDebugInfo } from './useTapToggle'
import { PencilSoundTuningPanel } from './PencilSoundTuningPanel'
import { participantsReducer } from './participants'
import { currentlyDrawing, sameIds } from './drawingIndicator'
import { getOrCreateDisplayName } from './displayName'
import { shouldEmitCursor } from './cursorThrottle'
import { clientToCanvas } from './pointerTransform'
import { clientToRoomPoint, screenToWorld, cameraTransformCss, deviceNativeZoom } from './cameraMath'
import { describeJoinError } from './joinError'
import { PeerCursors } from './PeerCursors'
import { RulerOverlay, type RulerHandleKind, type RulerPoint } from './RulerOverlay'
import { GridOverlay, InfiniteGridOverlay } from './GridOverlay'
import { TransformGizmo, type TransformHandleKind, type TransformBounds } from './TransformGizmo'
import { translateMatrix, scaleAxisMatrix, rotateAboutMatrix, type AffineMatrix } from './transformMath'
import { ParticipantsBar } from './ParticipantsBar'
import { JoinGate } from './JoinGate'
import { TOOL_SCHEMAS, loadToolSettings, saveToolSettings } from './toolSchemas'
import { loadPanelPosition, type PanelPosition } from './panelPosition'
import { createSnapshotUploader } from './snapshotSync'
import { fetchHistoryPage, fetchLatestSnapshot, type RestoredSnapshot } from './snapshotRestore'
import { useRoomStore } from '../../stores/roomStore'
import { makeInitialLayerState } from '../../stores/slices/layerSlice'
import styles from './Room.module.css'

// Infinite-canvas rooms (#133 Phase 1) don't have a real canvasWidth/Height
// — camera-relative tile rendering (a separate follow-up) is what actually
// makes the canvas element's own size independent of "room size". Until
// that lands, an infinite room's RoomConfig gets this placeholder finite
// size so the existing fixed-canvas-shaped rendering/viewport/pointer
// pipeline below (all written in terms of one fixed-size canvas) keeps
// working unmodified rather than needing every call site touched twice.
// Large enough that "infinite" still feels roomy for this interim state.
const PLACEHOLDER_INFINITE_CANVAS_SIZE = 8192

interface RoomConfig {
  id: string
  name: string
  paper: 'rough' | 'smooth' | 'bristol'
  // Infinite (tiled) canvas (#133 Phase 1) — see PLACEHOLDER_INFINITE_CANVAS_SIZE.
  infinite: boolean
  width: number
  height: number
}

/** Navigation state CreateRoom hands off to a freshly created room (see
 *  CreateRoom/index.tsx) — its presence is how this component tells "I am
 *  the creator, opening my own room" apart from "I opened someone else's
 *  room link" (no state at all, e.g. a second device). */
interface CreatorNavState {
  room: Pick<RoomEntity, 'id' | 'name' | 'paper' | 'infinite' | 'canvasWidth' | 'canvasHeight'>
  password?: string
}

function toRoomConfig(
  room: Pick<RoomEntity, 'id' | 'name' | 'paper' | 'infinite' | 'canvasWidth' | 'canvasHeight'>,
): RoomConfig {
  return {
    id: room.id, name: room.name, paper: room.paper, infinite: room.infinite,
    width: room.canvasWidth ?? PLACEHOLDER_INFINITE_CANVAS_SIZE,
    height: room.canvasHeight ?? PLACEHOLDER_INFINITE_CANVAS_SIZE,
  }
}

// Placeholder id until the socket connects and create_room/join_room's ack
// hands us the server-resolved identity (#41) — see applyIdentity. Kept as
// the pre-connection fallback so drawing before the socket connects still
// works (single-user/offline-ish behavior).
const INITIAL_USER_ID = 'local'
// LAN dev server port (apps/server); derived from window.location.hostname
// How long a stroke's "drawing" activity (local or peer) stays visible before
// the #38 indicator clears it — see drawingIndicator.ts.
const DRAWING_TIMEOUT_MS = 1500

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

// A drag that ends essentially where it started (a click, or a barely-moved
// touch/pen jitter) shouldn't commit a no-op layer_transform — an identity
// matrix would still be a real undo-stack entry for nothing.
function isNegligibleTransform(handle: TransformHandleKind, m: AffineMatrix): boolean {
  if (handle === 'body') return Math.hypot(m[4], m[5]) < 0.5
  if (handle.startsWith('rotate')) return Math.abs(Math.atan2(m[1], m[0])) < 0.001
  if (handle === 't' || handle === 'b') return Math.abs(m[3] - 1) < 0.001 // scaleY = d
  if (handle === 'l' || handle === 'r') return Math.abs(m[0] - 1) < 0.001 // scaleX = a
  return Math.abs(m[0] - 1) < 0.001 // corners: uniform, m[0] === m[3] === scale
}

export function Room() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

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
  // Starts ready for the creator (a brand-new room has nothing to restore);
  // a joiner starts blocked until the mount-engine effect's replay (or
  // handleRoomState's reconnect branch) flips it.
  const [roomContentReady, setRoomContentReady] = useState(isCreator)

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
  const [paperFillCap, setPaperFillCapState] = useState(0.25)

  // Optional pointer-prediction experiment (#92) — same feature-flag pattern
  // as debugEnabled above. Off by default; lets Ilya A/B it on real hardware
  // before deciding whether to keep it.
  const predictEnabled = getFeatureFlag('predictPointer')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // #93: fullscreen toggle for the whole editor root — removes tablet
  // browser chrome (address bar/nav), which eats real estate especially in
  // landscape. iOS Safari doesn't support Fullscreen API for arbitrary
  // elements, hence the fullscreenEnabled gate below (hide rather than show
  // a button that would throw).
  const editorRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fullscreenSupported = typeof document !== 'undefined' && document.fullscreenEnabled

  // Minimal-UI experiment (#99): a short single-finger tap on the canvas
  // hides the header/toolbar/layer panel via a CSS class (never unmounted —
  // no lost focus/state), tap again to bring them back. Same feature-flag
  // pattern as debugEnabled/predictEnabled; off by default until there's
  // real-usage feedback on whether to keep it.
  const tapToHideEnabled = getFeatureFlag('tapToHideUI')
  const [uiHidden, setUiHidden] = useState(false)
  const toggleUI = useCallback(() => setUiHidden(h => !h), [])

  // #94: a resting hand/finger on a tablet can brush the surrounding chrome
  // (most often the size slider) mid-stroke and corrupt settings partway
  // through drawing. Real state (not just strokeActiveRef below) because it
  // needs to trigger a re-render to actually apply/remove pointer-events —
  // only flipped twice per stroke (start/end), so the cost is negligible
  // despite this codebase's general perf-consciousness about per-move state
  // (see e.g. the vp-state discussion elsewhere). Mirrors uiHidden's own
  // "toggle a class on the header/toolbar/layer-panel wrapper" shape (#99),
  // but pointer-events only — the UI stays visible, just unresponsive, unlike
  // uiHidden's fade.
  const [isDrawing, setIsDrawing] = useState(false)
  // Diagnostic for "works on Samsung, not on a Surface" (see chat) — see
  // TapDebugInfo's docstring for what each field means.
  const [tapDebug, setTapDebug] = useState<TapDebugInfo | null>(null)

  // Pencil sound: Off / Variant 1 / Variant 2, set via the gear-icon settings
  // panel (see SettingsPanel) — persisted per-browser in localStorage, same
  // as the boolean feature flags above. See PencilSound.ts and
  // PENCIL_SOUND_TUNING_LOG.md for what each variant is and how they were
  // chosen.
  const pencilSoundSetting = getPencilSoundSetting()

  // Live-tuning debug panel for every PencilSound knob (#153 round 13, see
  // PencilSoundTuningPanel.tsx) — only meaningful for variant3 (the only
  // recipe with tap/brightnessScale/qScale/etc.), same feature-flag pattern
  // as debugEnabled/hapticGrain above.
  const pencilSoundTuningEnabled = getFeatureFlag('pencilSoundTuning') && pencilSoundSetting === 'variant3'

  // Haptic paper-grain experiment: same feature-flag pattern as the ones
  // above. Off by default — for-fun prototype, Android Chrome only.
  const hapticGrainEnabled = getFeatureFlag('hapticGrain')
  const [hapticStats, setHapticStats] = useState<HapticGrainStats | null>(null)

  // Dev-only paper-grain fiber-variant comparison (see SettingsPanel /
  // paperNoise.ts's ROUGH_VARIANTS) — 'off' unless explicitly picked in
  // Settings; only ever overrides *rough* paper's texture (see
  // PencilEngineOptions.paperVariantUrl's own comment).
  const paperGrainVariant = getPaperGrainVariant()
  const paperVariantUrl = paperGrainVariant === 'off' ? undefined : `/paper-variants/rough-v${paperGrainVariant}.paper`

  // Dev-only graphite-grain A/B (see SettingsPanel / DAB_FRAG's
  // computeGrain) — live shader mode, applies to every paper type.
  const graphiteGrainVariant = getGraphiteGrainVariant()
  const grainMode = graphiteGrainVariant === 'off' ? undefined : Number(graphiteGrainVariant)

  const [config,     setConfig]     = useState<RoomConfig | null>(
    () => (creatorDraft?.room ? toRoomConfig(creatorDraft.room) : null),
  )
  const tool = useRoomStore(s => s.tool)
  const setTool = useRoomStore(s => s.setTool)
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
  // Eyedropper (#82) is a one-shot mode, not a recorded ToolType — it never
  // paints or produces an Operation, so it lives entirely as local UI state
  // rather than going through engine.setTool(). See .eyedropperOverlay in
  // Room.module.css for how it intercepts the next canvas pointerdown.
  const [eyedropperActive, setEyedropperActive] = useState(false)
  // Ruler tool (#89) — a draggable straight-edge guide that a pencil stroke
  // snaps to while it's placed (see engine.setRuler / engine/src/
  // rulerSnap.ts for the actual snapping math, which runs inside the
  // pointer pipeline, not here). Local UI state, same non-Operation status
  // as eyedropper above (it never paints or produces an Operation either).
  // Unlike a one-shot A→B drag, `rulerLine` is a *persistent* guide once
  // placed — it survives across strokes so a student can draw several
  // guided lines along the same edge — and is only cleared when the tool
  // is toggled off, or another one-shot tool takes over the pointer catcher.
  const [rulerActive, setRulerActive] = useState(false)
  // (#23) Backed by the store now, alongside the transform-preview fields
  // below — moved for architectural consistency, but deliberately NEVER
  // persisted (see layerSlice.ts's own comment: a ruler is for quickly
  // comparing distances mid-drawing, not a saved setting).
  const rulerLine = useRoomStore(s => s.rulerLine)
  const setRulerLine = useRoomStore(s => s.setRulerLine)
  // True once the initial placement drag has actually finished (pointerup).
  // Deliberately NOT the same thing as "rulerLine !== null": rulerLine is
  // set to a (degenerate, a===b) value on the very first pointerdown of the
  // placement drag, before the user has dragged anywhere — gating
  // .rulerPlaceOverlay's presence on rulerLine directly was tried first and
  // was a real bug: React would unmount that catcher div the instant
  // rulerLine got its first (degenerate) value, i.e. mid-gesture, so the
  // rest of the drag's pointermove/pointerup (which the now-detached
  // overlay's own listeners never got attached to their eventual real
  // target) silently went nowhere. rulerPlaced only flips true in
  // handleRulerPlaceDown's onUp, so the catcher div survives the entire
  // placement drag.
  const [rulerPlaced, setRulerPlaced] = useState(false)
  // Construction grid (#89) — unlike eyedropper/ruler above, a passive
  // toggle rather than a one-shot tool: it never intercepts pointer events,
  // so it doesn't need its own overlay div, just a conditional render.
  const [gridActive, setGridActive] = useState(false)
  // Layer transform tool (#120) — same one-shot-mode shape as eyedropper/
  // ruler above, but unlike them it *does* produce an Operation
  // (layer_transform) on commit, via the engine's live preview + dispatchOp,
  // not engine.setTool().
  const [transformActive, setTransformActive] = useState(false)
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
  // Matrix for the *current* drag frame, fed to TransformGizmo so its handles
  // visually ride along with the content instead of staying glued to the
  // pre-drag bounds (see TransformGizmo's docstring) — null between drags.
  const transformLiveMatrix = useRoomStore(s => s.transformLiveMatrix)
  const setTransformLiveMatrix = useRoomStore(s => s.setTransformLiveMatrix)
  // (#21) Backed by the store now — layerState is still a *derived cache*
  // of the engine's operation log (ADR 002), never independently mutable
  // content state; see syncFromLog below and roomStore's layerSlice.
  const layerState = useRoomStore(s => s.layerState)
  const setLayerStateLocal = useRoomStore(s => s.setLayerStateLocal)
  const [activePanel, setActivePanel] = useState<'layers' | 'color' | 'toolSettings' | null>('layers')

  // ── realtime state (#84/#37/#38) ────────────────────────────────────────────
  const [connected,   setConnected]   = useState(false)
  const [participants, dispatchParticipants] = useReducer(participantsReducer, [])
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
  })

  const socketRef        = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const userIdRef         = useRef(INITIAL_USER_ID)
  // Stamped by every create_room/join_room ack (#41) with the server's
  // cookie-resolved identity — stable across reconnects, unlike socket.id.
  const applyIdentity = useCallback((userId: string) => {
    userIdRef.current = userId
    engineRef.current?.setUserId(userId)
  }, [])
  const appliedOpIdsRef   = useRef<Set<string>>(new Set())
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
  // handlePeerOperation so a fast operation_undo/operation_revoke targeting
  // one of these can drop it from the reveal instead of trying (and
  // silently failing) to undo an op the log was never given.
  const pendingPreviewOpIdsRef = useRef<Set<string>>(new Set())
  const configRef         = useRef(config)
  // A joiner's first room_state can arrive before the engine exists — we need
  // that very event to learn `config` in the first place, and the engine only
  // mounts once `config` is set (see the mount-engine effect below). Its
  // operations/participants are stashed here and replayed once the engine is
  // up, instead of being dropped.
  const pendingSnapshotRef = useRef<{
    latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
  } | null>(null)
  // Highest operation seq this client has definitely seen — from ack'd local
  // operations and from peer_operation's stamped copies (#149). Sent back as
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
  const checkSnapshotBoundary = useCallback(() => {
    const engine = engineRef.current
    if (!engine || !snapshotUploader) return
    const pending = pendingCommitSeqsRef.current
    const watermark = pending.size ? Math.min(...pending) - 1 : latestKnownSeqRef.current
    if (watermark <= committedWatermarkRef.current) return
    const previous = committedWatermarkRef.current
    committedWatermarkRef.current = watermark
    snapshotUploader.onSeqObserved(previous, watermark, engine, useRoomStore.getState().layerState)
  }, [snapshotUploader])
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
  const [joinName,       setJoinName]       = useState(() => getOrCreateDisplayName(localStorage))
  const [joinPassword,   setJoinPassword]   = useState('')
  const [joinError,      setJoinError]      = useState<string | null>(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)

  configRef.current = config

  const activeCfg = toolSettings[tool]

  // Read directly inside useViewport's native pointerdown listener — see
  // that hook's doc comment for why a ref (checked synchronously, before
  // React ever re-renders) is required here instead of just having the
  // eyedropper overlay call e.stopPropagation() itself. Ruler placement is
  // pen-only (see handleRulerPlaceDown) so it never needs to reserve a touch
  // here — a finger always pans/zooms while placing a ruler, exactly like it
  // does while drawing with the pencil.
  const toolActiveRef = useRef(false)
  toolActiveRef.current = eyedropperActive

  const { vp, setVp, vpRef, canvasWrapRef, fitCanvas, angleDeg, canvasTransform } =
    useViewport(config, toolActiveRef, config?.infinite ?? false)

  // Drag up/down on the zoom label to adjust zoom without a two-finger pinch
  // (#97); a plain click still resets to 100%, mirroring angleLabel's
  // click-to-reset-rotation below.
  const { onPointerDown: onZoomDragDown } = useDragToAdjust(
    vp.zoom,
    z => setVp(v => ({ ...v, zoom: clamp(z, 0.04, 20) })),
    { min: 0.04, max: 20, sensitivity: 0.01 },
  )

  // #99: layered independently on top of useViewport's own touch pan/pinch
  // handling on the same vpRef element — see useTapToggle's docstring for
  // why the two never conflict.
  useTapToggle(vpRef, toggleUI, tapToHideEnabled, tapToHideEnabled ? setTapDebug : undefined)

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
  // peer_operation, undo/redo, and finished stroke-reveal (onPreviewApplied).
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
  const syncFromLog = useCallback(() => {
    if (syncFromLogScheduledRef.current) return
    syncFromLogScheduledRef.current = true
    queueMicrotask(() => {
      syncFromLogScheduledRef.current = false
      const base = restoredLayerStateRef.current
      const ops = base
        ? (engineRef.current?.getOperationsSinceRestore() ?? [])
        : (engineRef.current?.getOperations() ?? [])
      useRoomStore.getState().syncLayerStateFromLog(base ?? makeInitialLayerState(), ops)
    })
  }, [])

  // Applies an operation that arrived from the network (room_state replay or
  // peer_operation) exactly once. The guard isn't full reconnect/catch-up
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
  }, [markActive])

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
  const restoreFromSnapshot = useCallback(async (engine: PencilEngineAPI, snapshot: RestoredSnapshot) => {
    initLayersFromLayerState(engine, snapshot.layerState)
    for (const [layerId, tiles] of snapshot.tiles) engine.restoreLayerFromSnapshot(layerId, tiles)
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
  const backfillHistory = useCallback(async (roomId: string, engine: PencilEngineAPI, fromSeq: number) => {
    let cursor = fromSeq
    while (cursor > 0) {
      const page = await fetchHistoryPage(roomId, cursor)
      if (page.length === 0) break
      engine.absorbHistoricalOperations(page)
      for (const op of page) appliedOpIdsRef.current.add(op.id)
      drainDeferredQueue()
      cursor = page[0].seq ?? 0
    }
  }, [drainDeferredQueue])

  // ── mount engine ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!config || !canvasRef.current) return
    const engine = new PencilEngine(canvasRef.current, {
      infinite: config.infinite,
      paper: config.paper,
      pencilType: initialToolRef.current.pencil,
      size: initialToolRef.current.size,
      opacity: initialToolRef.current.opacity,
      userId: userIdRef.current,
      // Broadcast-loop fix (#84): only genuinely local appends (layer-panel
      // ops via dispatchOp, and the stroke this engine records internally on
      // pointer up) reach this callback — see PencilEngineOptions.onLocalOperation.
      // Remote ops are applied via appendOperation(op, 'remote') below, which
      // skips it, so they're never echoed back to the server.
      onLocalOperation: op => {
        socketRef.current?.emit('operation', op, stamped => {
          // A local op always paints synchronously (real-time, as the user
          // draws) — never goes through the peer-reveal delay — so it's
          // always safe to treat as committed the instant its ack arrives.
          // Still routed through the shared watermark (not applied
          // directly), since an *earlier*, still-revealing peer stroke can
          // legitimately hold the watermark back below this op's own seq.
          latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, stamped.seq ?? 0)
          checkSnapshotBoundary()
        })
        if (op.type === 'stroke') markActive(userIdRef.current)
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
      paperVariantUrl,
      grainMode,
    })
    engineRef.current = engine

    // Pencil sound: lazy AudioContext built on the engine's own 'strokeStart'
    // below (a real pointerdown gesture, satisfying the autoplay-unlock
    // requirement) — see PencilSound's docstring.
    if (pencilSoundSetting !== 'off') {
      const grain = pencilSoundSetting === 'variant1' ? PENCIL_SOUND_VARIANT_1
        : pencilSoundSetting === 'variant2' ? PENCIL_SOUND_VARIANT_2
        : PENCIL_SOUND_VARIANT_3
      const sound = new PencilSound(config.paper, grain)
      sound.setHardness(PENCIL_PRESETS[initialToolRef.current.pencil].hardness)
      pencilSoundRef.current = sound
    }

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
        setIsDrawing(true)
        markActive(userIdRef.current)
        pencilSoundRef.current?.start(e.pressure, e.speed, e.tiltX, e.tiltY)
      })
      .on('strokeEnd', () => {
        strokeActiveRef.current = false
        setIsDrawing(false)
        pencilSoundRef.current?.stop()
      })
      .on('pointer', e => {
        if (strokeActiveRef.current) {
          markActive(userIdRef.current)
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
        try {
          await engine.paperReady()
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

          for (const op of pending.tailOperations) applyRemoteOp(op)
          engine.resumeDisplay()
          syncFromLog()
          dispatchParticipants({ type: 'room_state', participants: pending.participants })

          if (id && restoredFromSnapshot && pending.latestSnapshotSeq !== null) {
            void backfillHistory(id, engine, pending.latestSnapshotSeq)
          }
        } finally {
          // Runs even if paperReady/fetchLatestSnapshot/etc. throws — a
          // failed restore must still unblock drawing rather than leave the
          // canvas permanently inert (see roomContentReady's own doc
          // comment for what this guards against).
          setRoomContentReady(true)
        }
      })()
    } else {
      // Nothing to restore on this particular mount (e.g. a remount after
      // the first join already completed) — don't leave a stale `false`
      // from a prior mount stuck forever with nothing left to flip it.
      setRoomContentReady(true)
    }

    return () => {
      engine.destroy()
      engineRef.current = null
      pencilSoundRef.current?.destroy()
      pencilSoundRef.current = null
    }
  }, [
    id, config, markActive, applyRemoteOp, syncFromLog, debugEnabled, predictEnabled, pencilSoundSetting,
    hapticGrainEnabled, checkSnapshotBoundary, restoreFromSnapshot, backfillHistory, paperVariantUrl,
    grainMode,
  ])

  // ── sync tool → engine ────────────────────────────────────────────────────────
  const pencilGrade = toolSettings.pencil.grade as PencilGradeName
  useEffect(() => {
    engineRef.current?.setPencil(pencilGrade)
    pencilSoundRef.current?.setHardness(PENCIL_PRESETS[pencilGrade].hardness)
  }, [pencilGrade])
  useEffect(() => { engineRef.current?.setTool(tool) },     [tool])
  useEffect(() => {
    engineRef.current?.setSize(activeCfg.size as number)
    engineRef.current?.setOpacity(activeCfg.opacity as number)
  }, [activeCfg])
  const pencilColor = toolSettings.pencil.color as [number, number, number]
  useEffect(() => { engineRef.current?.setColor(pencilColor) }, [pencilColor])
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
    // transformActive (#155): the transform gizmo is a separate overlay on
    // top of the canvas, not something that intercepts/consumes the
    // canvas's own native pointer events — without this, dragging a gizmo
    // handle *also* drew a real stroke underneath at the same time (every
    // pointermove reached both the gizmo's drag handler and PointerInput's
    // canvas listener), which is what those stray lines during a drag were.
    // setLocked only gates PencilEngine._onStart (see engine/index.ts) —
    // it doesn't touch layerState itself, so this never shows the layer as
    // locked in LayerPanel; it's purely "don't start a new stroke right
    // now," same effect a real per-layer lock has, just for a different
    // reason.
    engine.setLocked(!!(layerState.items[layerState.activeId]?.locked) || transformActive)
    engine.setCompositeOrder(computeCompositeOrder(layerState))
  }, [layerState, transformActive])

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
  // (see handlePeerOperation below).
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
  const dispatchOp = useCallback((draft: OperationDraft) => {
    const op = { ...draft, id: nanoid(10), userId: userIdRef.current, timestamp: Date.now() }
    engineRef.current?.appendOperation(op) // source defaults to 'local' → broadcast via onLocalOperation
    syncFromLog()
  }, [syncFromLog])

  const handleUndo = useCallback(() => {
    if (engineRef.current?.undo()) syncFromLog()
  }, [syncFromLog])

  const handleRedo = useCallback(() => {
    if (engineRef.current?.redo()) syncFromLog()
  }, [syncFromLog])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else editorRef.current?.requestFullscreen()
  }, [])

  // Fullscreen can also be exited by the browser/OS itself (Esc, system
  // gesture) without going through toggleFullscreen — listen rather than
  // trust the button's own click to keep the icon in sync.
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === editorRef.current)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Eyedropper (#82): consumes the next pointerdown on .eyedropperOverlay
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
      setToolSetting('pencil', 'color', picked)
      setActivePanel('color')
    }
    setEyedropperActive(false)
  }, [vpRef, vp, config, setToolSetting])

  // Shared by every other tool's toggle below, so activating any of them
  // also clears the ruler — see toggleRuler's own doc comment for why
  // turning the ruler off always clears rulerLine + the engine's guide
  // together rather than leaving them out of sync.
  const deactivateRuler = useCallback(() => {
    setRulerActive(false)
    setRulerLine(null)
    setRulerPlaced(false)
    engineRef.current?.setRuler(null)
  }, [setRulerLine])

  // Eyedropper, ruler, and transform mode all take over the same
  // canvas-pointer catcher slot (or, for transform, the gizmo's own handles;
  // for ruler, its own SVG handles once placed) — only one should ever be
  // armed at a time, so each toggle turns the others off.
  const toggleEyedropper = useCallback(() => {
    setTransformActive(false)
    deactivateRuler()
    setEyedropperActive(a => !a)
  }, [deactivateRuler])

  const toggleTransform = useCallback(() => {
    setEyedropperActive(false)
    deactivateRuler()
    setTransformActive(a => !a)
  }, [deactivateRuler])

  // Ruler tool (#89): turning it OFF (not on) is when rulerLine/the engine
  // guide get cleared — while it's on, rulerLine is meant to persist across
  // strokes (see its declaration above), so clearing it on every toggle
  // would defeat that.
  const toggleRuler = useCallback(() => {
    setEyedropperActive(false)
    setTransformActive(false)
    setRulerActive(a => {
      const next = !a
      if (!next) {
        setRulerLine(null)
        setRulerPlaced(false)
        engineRef.current?.setRuler(null)
      }
      return next
    })
  }, [setRulerLine])

  // Active layer, or the current multi-select from LayerPanel — background
  // is never a legal transform target, same as merge/delete (#120).
  // useMemo'd (not just a plain const) so it has a stable reference to key
  // the bounds-refresh effect below on — without that it would refire every
  // render instead of only on an actual selection change.
  const transformTargetIds = useMemo(() => (
    (layerState.selectedIds.length > 0 ? layerState.selectedIds : [layerState.activeId])
      .filter((layerId): layerId is string => !!layerId && layerId !== BACKGROUND_LAYER_ID && layerState.items[layerId]?.kind === 'layer')
  ), [layerState])

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

  useEffect(() => {
    if (!transformActive) { setTransformBounds(null); setTransformCenterOverride(null); return }
    refreshTransformBounds()
  }, [transformActive, refreshTransformBounds, setTransformBounds, setTransformCenterOverride])

  // Ruler tool (#89): initial placement drag — down/move/up tracked
  // manually via setPointerCapture + direct DOM listeners, the same pattern
  // ColorPicker's onSvDown/onHueDown use for their own drag handling.
  // Pen-only, same as the pencil itself ignores touch (see PointerInput.ts) —
  // a finger on .rulerPlaceOverlay falls straight through to useViewport's
  // own panning untouched, instead of trying to arbitrate whose gesture a
  // given touch belongs to. Only runs pre-placement (while !rulerPlaced; see
  // .rulerPlaceOverlay's render
  // below, and rulerPlaced's own doc comment for why this catcher div's
  // presence is gated on that flag rather than on rulerLine itself).
  // rulerPlaced only flips true in onUp below, so this div — and its
  // pointermove/pointerup listeners — survive the entire drag. After
  // placement, dragging the ruler is handled per-handle by
  // handleRulerHandleDown instead (RulerOverlay's own endpoints/body), so
  // the rest of the canvas stays free for an actual pencil stroke to snap
  // against it.
  const handleRulerPlaceDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    const overlay = e.currentTarget as HTMLElement
    const penPointerId = e.pointerId
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    const rect = el.getBoundingClientRect()
    // #143: world-space for infinite rooms (clientToRoomPoint) — matches
    // what engine.setRuler's snapping (rulerSnap.ts) compares against real
    // stroke dabs there (genuine world coordinates, see setInfiniteCamera's
    // pointer transform), and what RulerOverlay's a/b props now expect for
    // infinite rooms (see the render section below).
    const toPoint = (clientX: number, clientY: number): RulerPoint => clientToRoomPoint(clientX, clientY, rect, vp, config)

    const start = toPoint(e.clientX, e.clientY)
    setRulerLine({ a: start, b: start })
    engineRef.current?.setRuler({ a: start, b: start })

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      const line = { a: start, b: toPoint(ev.clientX, ev.clientY) }
      setRulerLine(line)
      engineRef.current?.setRuler(line)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      setRulerPlaced(true)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [vpRef, vp, config, setRulerLine])

  // Ruler tool (#89): once placed, repositioning — grabbing an endpoint
  // rotates/resizes it, grabbing the body translates both endpoints
  // together (see RulerOverlay's .rulerHitLine). Same drag-capture pattern
  // as handleTransformHandleDown, minus the scale/rotate-matrix math — a
  // ruler is just two points, not a bounded rect. Every move updates both
  // the visible line (rulerLine) and the engine's live snapping guide
  // together, so what's drawn while dragging is exactly what a
  // concurrently-drawn stroke would snap to (in practice the two gestures
  // can't overlap anyway — both are pen-only and a pen has one tip).
  const handleRulerHandleDown = useCallback((kind: RulerHandleKind, e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    const el = vpRef.current
    if (!el || !config || !rulerLine) return
    e.stopPropagation()
    const overlay = e.currentTarget
    const penPointerId = e.pointerId
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    const rect = el.getBoundingClientRect()
    // #143: world-space for infinite rooms (clientToRoomPoint) — matches
    // what engine.setRuler's snapping (rulerSnap.ts) compares against real
    // stroke dabs there (genuine world coordinates, see setInfiniteCamera's
    // pointer transform), and what RulerOverlay's a/b props now expect for
    // infinite rooms (see the render section below).
    const toPoint = (clientX: number, clientY: number): RulerPoint => clientToRoomPoint(clientX, clientY, rect, vp, config)

    const startLine = rulerLine // frozen for the duration of this drag
    const startPoint = toPoint(e.clientX, e.clientY)

    const computeLine = (clientX: number, clientY: number): { a: RulerPoint; b: RulerPoint } => {
      const p = toPoint(clientX, clientY)
      if (kind === 'a') return { a: p, b: startLine.b }
      if (kind === 'b') return { a: startLine.a, b: p }
      const dx = p.x - startPoint.x
      const dy = p.y - startPoint.y
      return {
        a: { x: startLine.a.x + dx, y: startLine.a.y + dy },
        b: { x: startLine.b.x + dx, y: startLine.b.y + dy },
      }
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      const line = computeLine(ev.clientX, ev.clientY)
      setRulerLine(line)
      engineRef.current?.setRuler(line)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [vpRef, vp, config, rulerLine, setRulerLine])

  // Layer transform tool (#120): mirrors handleRulerPlaceDown's drag-capture
  // pattern exactly, but per-handle (body/corner/rotate) rather than a
  // single A→B drag, and it actually mutates content — every frame previews
  // via the engine (never touching the real buffer, see
  // previewLayerTransform's docstring), and pointerup either commits a real
  // layer_transform op or, for a negligible drag, just clears the preview.
  const handleTransformHandleDown = useCallback((handle: TransformHandleKind, e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    const el = vpRef.current
    if (!el || !config || !transformBounds || transformTargetIds.length === 0) return
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
    const toPoint = (clientX: number, clientY: number) => clientToRoomPoint(clientX, clientY, rect, vp, config)

    const targetIds = transformTargetIds // frozen for the duration of this drag
    const bounds = transformBounds
    const center = transformCenterOverride ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const isRotate = handle.startsWith('rotate')
    const pivot = handle === 'body' || isRotate ? center : TRANSFORM_PIVOT[handle as keyof typeof TRANSFORM_PIVOT](bounds)
    const start = toPoint(e.clientX, e.clientY)
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
    const startDist  = Math.max(Math.hypot(start.x - pivot.x, start.y - pivot.y), 1e-6)
    const startDistX = Math.max(Math.abs(start.x - pivot.x), 1e-6)
    const startDistY = Math.max(Math.abs(start.y - pivot.y), 1e-6)

    const computeMatrix = (clientX: number, clientY: number): AffineMatrix => {
      const p = toPoint(clientX, clientY)
      if (handle === 'body') return translateMatrix(p.x - start.x, p.y - start.y)
      if (isRotate) return rotateAboutMatrix(Math.atan2(p.y - center.y, p.x - center.x) - startAngle, center.x, center.y)
      if (handle === 't' || handle === 'b') {
        const scaleY = clamp(Math.abs(p.y - pivot.y) / startDistY, 0.05, 20)
        return scaleAxisMatrix(1, scaleY, pivot.x, pivot.y)
      }
      if (handle === 'l' || handle === 'r') {
        const scaleX = clamp(Math.abs(p.x - pivot.x) / startDistX, 0.05, 20)
        return scaleAxisMatrix(scaleX, 1, pivot.x, pivot.y)
      }
      // Corner handles: uniform-only for now — no Shift-to-constrain on
      // tablets, see the follow-up issue on tablet-friendly modifiers (#120).
      const scale = clamp(Math.hypot(p.x - pivot.x, p.y - pivot.y) / startDist, 0.05, 20)
      return scaleAxisMatrix(scale, scale, pivot.x, pivot.y)
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
    let latestMatrix: AffineMatrix | null = null
    const flushPreview = () => {
      rafId = null
      if (!latestMatrix) return
      setTransformLiveMatrix(latestMatrix)
      engineRef.current?.previewLayerTransform(targetIds.map(layerId => ({ layerId, matrix: latestMatrix! })))
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
      const matrix = computeMatrix(ev.clientX, ev.clientY)
      setTransformLiveMatrix(null)
      engineRef.current?.clearLayerTransformPreview()
      if (isNegligibleTransform(handle, matrix)) return
      dispatchOp({ type: 'layer_transform', transforms: targetIds.map(layerId => ({ layerId, matrix })) })
      // (#155) Deferring this past the next paint (tried both requestAnimationFrame
      // and requestIdleCallback) measurably cut the reported pointerup INP, but left
      // the gizmo outline showing stale (pre-drag) bounds for a real, user-visible
      // stretch whenever the deferred callback took a while to fire — confusingly
      // "not on the content" right after a commit, occasionally bad enough that a
      // second drag started against the wrong (stale) bounds. Correctness of what's
      // on screen matters more than shaving this one call off the interaction, so
      // it stays inline; _bakeTransform's own cost (scratch pooling, dropTile,
      // suspendEviction) is where #155's INP work continues instead.
      refreshTransformBounds()
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [vpRef, vp, config, transformBounds, transformTargetIds, transformCenterOverride, dispatchOp, refreshTransformBounds, setTransformLiveMatrix])

  // Adobe Animate-style draggable rotation pivot — a separate gesture from
  // the scale/rotate/translate handles above: it only ever updates
  // transformCenterOverride (local UI state), never previews or dispatches
  // a transform of its own. Double-click resets it back to the content
  // bounds' own center (see TransformGizmo's onCenterDoubleClick).
  const handleTransformCenterDown = useCallback((e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
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
    const toPoint = (clientX: number, clientY: number) => clientToRoomPoint(clientX, clientY, rect, vp, config)

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
  }, [vpRef, vp, config, setTransformCenterOverride])

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

      if (isCreator && creatorDraft) {
        if (!hasJoinedRef.current) {
          socket.emit(
            'create_room',
            {
              room: creatorDraft.room, password: creatorDraft.password,
              lastKnownSeq: latestKnownSeqRef.current || undefined,
            },
            result => {
              if (result.ok) { hasJoinedRef.current = true; applyIdentity(result.userId) }
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
              roomId: id, name: getOrCreateDisplayName(localStorage), password: creatorDraft.password,
              lastKnownSeq: latestKnownSeqRef.current || undefined,
            },
            result => {
              if (result.ok) applyIdentity(result.userId)
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
            if (result.ok) applyIdentity(result.userId)
            else console.error('join_room failed on reconnect', result)
          },
        )
      }
    }

    const handleRoomState = async ({ room, latestSnapshotSeq, tailOperations, participants: roomParticipants }: {
      room: RoomEntity; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
    }) => {
      // What this socket already had *before* this room_state's own tail —
      // the reconnect fast-path check below needs this, not the value after
      // folding tailOperations' seqs in just below.
      const alreadyHadSeq = latestKnownSeqRef.current
      // Bulk catch-up (join/reconnect), not a live single operation — doesn't
      // trigger snapshotUploader here even if it spans a checkpoint
      // boundary. Any client live at the moment a boundary was actually
      // crossed already baked it (see onLocalOperation/handlePeerOperation
      // below); this client wasn't present for it, and doesn't need to
      // retroactively contribute a bake for history it's only now replaying.
      for (const op of tailOperations) latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, op.seq ?? 0)

      if (!configRef.current) {
        // Joiner's first snapshot: this is how we learn paper/canvas size —
        // the engine doesn't exist yet to apply `tailOperations` to, so stash
        // them for the mount-engine effect to replay once it does.
        pendingSnapshotRef.current = { latestSnapshotSeq, tailOperations, participants: roomParticipants }
        setConfig(toRoomConfig(room))
        return
      }
      // See the mount-engine effect's own comment on engine.paperReady() —
      // same reasoning applies to a reconnect's full-history replay. A
      // no-op await in the overwhelmingly common case (paper long since
      // loaded by the time a reconnect happens).
      const engine = engineRef.current
      setRoomContentReady(false)
      try {
        await engine?.paperReady()
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

        for (const op of tailOperations) {
          if (pendingPreviewOpIdsRef.current.has(op.id)) {
            engine?.dropPendingPreview(op.id)
            pendingPreviewOpIdsRef.current.delete(op.id)
          }
          applyRemoteOp(op)
        }
        engine?.resumeDisplay()
        syncFromLog()
        dispatchParticipants({ type: 'room_state', participants: roomParticipants })

        // Runs fully in the background — never awaited, must not block this
        // handler or the first paint it just produced.
        if (restoredFromSnapshot && engine && latestSnapshotSeq !== null) {
          void backfillHistory(id, engine, latestSnapshotSeq)
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

    const handlePeerOperation = (op: Operation) => {
      latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, op.seq ?? 0)
      // Stroke ops are revealed progressively (#37 follow-up v2) rather than
      // committed on arrival — see the engine's onPreviewApplied option
      // above, which does the actual applyRemoteOp/syncFromLog once the
      // reveal finishes playing every dab back.
      if (op.type === 'stroke') {
        pendingPreviewOpIdsRef.current.add(op.id)
        // Arrived, not yet committed (#149) — held out of the snapshot
        // watermark until onPreviewApplied's reveal-complete commit deletes
        // it. See pendingCommitSeqsRef's own doc comment.
        pendingCommitSeqsRef.current.add(op.seq ?? 0)
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

    socket.on('connect',        handleConnect)
    socket.on('room_state',     handleRoomState)
    socket.on('peer_operation', handlePeerOperation)
    socket.on('peer_joined',    handlePeerJoined)
    socket.on('peer_left',      handlePeerLeft)
    socket.on('disconnect',     handleDisconnect)

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [
    id, isCreator, creatorDraft, syncFromLog, applyRemoteOp, applyIdentity, checkSnapshotBoundary,
    restoreFromSnapshot, backfillHistory, drainDeferredQueue,
  ])

  // Submits the join gate (joiner path only): connects/join_room's with the
  // entered name + optional password. Kept separate from the socket-wiring
  // effect above so it can run any time after the socket exists, in response
  // to a user action rather than a connection lifecycle event.
  const handleJoinSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = joinName.trim()
    if (!trimmed) { setJoinError('Name is required'); return }
    if (!id) return

    setJoinError(null)
    setJoinSubmitting(true)
    const password = joinPassword || undefined
    lastJoinAttemptRef.current = { name: trimmed, password }
    socketRef.current?.emit(
      'join_room',
      { roomId: id, name: trimmed, password, lastKnownSeq: latestKnownSeqRef.current || undefined },
      result => {
        setJoinSubmitting(false)
        if (!result.ok) { setJoinError(describeJoinError(result.error)); return }
        hasJoinedRef.current = true
        applyIdentity(result.userId)
        // room_state (already wired above) populates `config` from here, which
        // unmounts the gate in favor of the editor.
      },
    )
  }, [id, joinName, joinPassword, applyIdentity])

  // ── keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.tagName === 'INPUT') return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) handleRedo(); else handleUndo()
        e.preventDefault(); return
      }
      if (e.key === 'e' || e.key === 'E') { setTool(t => t === 'eraser' ? 'pencil' : 'eraser'); return }
      if (e.key === 'r' || e.key === 'R') { setVp(v => ({ ...v, angle: 0 })); return }
      // A representative spread across the full 6H-6B range, not all 14 grades —
      // the grade slider below gives full-range access; these are just quick picks.
      const map: Record<string, PencilGradeName> = { '1':'H','2':'HB','3':'2B','4':'4B','5':'6B' }
      if (map[e.key]) { setToolSetting('pencil', 'grade', map[e.key]); setTool('pencil') }
      if (e.key === '[') setToolSetting(tool, 'size', prev => Math.max(1,   (prev as number) - 1))
      if (e.key === ']') setToolSetting(tool, 'size', prev => Math.min(120, (prev as number) + 1))
      if (e.shiftKey && e.key === '{') setVp(v => ({ ...v, angle: v.angle - Math.PI / 12 }))
      if (e.shiftKey && e.key === '}') setVp(v => ({ ...v, angle: v.angle + Math.PI / 12 }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, setTool, setToolSetting, setVp, handleUndo, handleRedo])

  // ── callbacks ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const blob = await engineRef.current?.exportPNG(); if (!blob) return
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${config?.name ?? 'drawing'}.png`; a.click()
    URL.revokeObjectURL(url)
  }, [config])

  // #15: same as handleExport, but with no paper texture/color baked in —
  // just the graphite/ink content, transparent where nothing is drawn.
  const handleExportTransparent = useCallback(async () => {
    const blob = await engineRef.current?.exportPNG(true); if (!blob) return
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${config?.name ?? 'drawing'}-transparent.png`; a.click()
    URL.revokeObjectURL(url)
  }, [config])

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
        name={joinName}
        onNameChange={setJoinName}
        password={joinPassword}
        onPasswordChange={setJoinPassword}
        error={joinError}
        submitting={joinSubmitting}
        onSubmit={handleJoinSubmit}
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
      <header className={clsx(styles.header, uiHidden && styles.uiHidden, isDrawing && styles.strokeBlocked)}>
        <button className={styles.headerIconBtn} onClick={() => navigate('/create')} title="New room" aria-label="New room">
          <Icon name="arrow_back" />
        </button>
        <span className={styles.roomName}>{config.name}</span>

        <div className={styles.headerRight}>
          <button className={styles.headerIconBtn} onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings">
            <Icon name="settings" />
          </button>
          {fullscreenSupported && (
            <button
              className={styles.headerIconBtn}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} />
            </button>
          )}
          <ParticipantsBar participants={participants} drawingIds={drawingIds} connected={connected} />
          {/* Infinite rooms display (and reset to) zoom relative to the
              device-native 1-world-unit-per-physical-pixel scale, so "100%"
              means the drawing's actual 1:1 resolution on every screen —
              see deviceNativeZoom's doc comment. Bounded rooms keep vp.zoom
              as-is (their canvas backing is the fixed document size, so
              vp.zoom already is the document scale). */}
          <button
            className={styles.zoomLabel}
            onPointerDown={onZoomDragDown}
            onClick={() => setVp(v => ({ ...v, zoom: config?.infinite ? deviceNativeZoom() : 1 }))}
            title="Zoom — drag up/down to adjust, click to reset to 100%"
          >
            {Math.round(vp.zoom / (config?.infinite ? deviceNativeZoom() : 1) * 100)}%
          </button>
          <button
            className={clsx(styles.angleLabel, angleDeg !== 0 && styles.angleLabelActive)}
            // (#106) If the current angle is already exactly one of the four canonical
            // 0/90/180/270 positions (e.g. reached via a previous tap, or via free rotation
            // landing exactly on one), tap advances to the next one, wrapping 270 back to 0.
            // Otherwise (a free-rotation gesture left it at some other angle, e.g. 45°) tap
            // resets straight to 0 rather than rounding up to the next multiple.
            onClick={() => setVp(v => {
              const deg = Math.round(v.angle * 180 / Math.PI)
              const normalizedDeg = ((deg % 360) + 360) % 360
              const isAtCanonicalAngle = normalizedDeg % 90 === 0
              const nextDeg = isAtCanonicalAngle ? (normalizedDeg + 90) % 360 : 0
              return { ...v, angle: nextDeg * Math.PI / 180 }
            })}
            title="Rotation — click to rotate 90°  (R to reset)"
          >
            <Icon name="screen_rotation_alt" />
            {angleDeg}°
          </button>
          {/* Rotate/Fit (#198): viewport actions, moved out of the tool
              toolbar (they aren't tools) to sit next to the zoom/angle
              controls they're already conceptually grouped with. */}
          <button
            className={styles.headerIconBtn} title="Rotate −15°  (Shift+[)" aria-label="Rotate −15°  (Shift+[)"
            onClick={() => setVp(v => ({ ...v, angle: v.angle - Math.PI / 12 }))}
          >
            <Icon name="rotate_left" />
          </button>
          <button
            className={styles.headerIconBtn} title="Rotate +15°  (Shift+])" aria-label="Rotate +15°  (Shift+])"
            onClick={() => setVp(v => ({ ...v, angle: v.angle + Math.PI / 12 }))}
          >
            <Icon name="rotate_right" />
          </button>
          <button className={styles.headerIconBtn} title="Fit canvas" aria-label="Fit canvas" onClick={fitCanvas}>
            <Icon name="fit_screen" />
          </button>
          <div className={styles.headerDivider} />
          <button className={styles.headerBtn} onClick={handleUndo} title="Undo  Ctrl+Z">
            <Icon name="undo" /><span>Undo</span>
          </button>
          <button className={styles.headerBtn} onClick={handleRedo} title="Redo  Ctrl+Shift+Z">
            <Icon name="redo" /><span>Redo</span>
          </button>
          <button className={styles.headerBtn} onClick={handleExport} title="Export PNG">
            <Icon name="download" /><span>Export</span>
          </button>
          <button className={styles.headerBtn} onClick={handleExportTransparent} title="Export PNG with transparent background">
            <Icon name="image" /><span>Transparent</span>
          </button>
          <button className={styles.headerBtn} onClick={handleSaveSession} title="Save session as JSON">
            <Icon name="save" /><span>Save</span>
          </button>
          <div className={styles.headerDivider} />
          {/* Clear canvas (#198): destructive content action, deliberately
              set apart from the frequently-used buttons above (not a
              viewport action like Rotate/Fit, and not something to reach
              for by accident) — moved out of the tool toolbar, it was never
              a tool either. Existing confirm() (#171) unchanged by the move;
              a real non-native confirm dialog is still tracked separately. */}
          <button className={styles.headerIconBtn} title="Clear canvas" aria-label="Clear canvas"
            onClick={() => {
              if (window.confirm('Clear the active layer? This can be undone with Ctrl+Z.')) {
                engineRef.current?.clear()
              }
            }}>
            <Icon name="delete_forever" />
          </button>
        </div>
      </header>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      <div className={styles.body}>

        {/* ── Left toolbar — tool selection only, fixed height per row ── */}
        <aside className={clsx(styles.toolbar, uiHidden && styles.uiHidden, isDrawing && styles.strokeBlocked)}>

          {/* Quick picks: number keys 1-5 jump the pencil grade to
              H / HB / 2B / 4B / 6B; [ / ] resize whichever tool is active
              (handled by the quick-settings panel to the right, not here). */}
          <button
            className={clsx(styles.toolIconBtn, tool === 'pencil' && styles.toolIconBtnActive)}
            title="Pencil  (1-5 for quick grade picks)"
            aria-label="Pencil"
            onClick={() => setTool('pencil')}
          ><Icon name="edit" /></button>
          <button
            className={clsx(styles.toolIconBtn, tool === 'eraser' && styles.toolIconBtnActive)}
            title="Eraser  E"
            aria-label="Eraser  E"
            onClick={() => setTool(t => t === 'eraser' ? 'pencil' : 'eraser')}
          ><Icon name="ink_eraser" /></button>

          <div className={styles.toolDivider} />

          {/* Eyedropper (#82) picks a color from the canvas and opens the
              ColorPicker tab of the unified right-side SidePanel (see
              .layerPanelWrap below) to refine it; the actual palette (saved
              custom colors) is a separate, later task. */}
          <button
            className={clsx(styles.toolIconBtn, eyedropperActive && styles.toolIconBtnActive)}
            title="Eyedropper — pick a color from the canvas"
            aria-label="Eyedropper — pick a color from the canvas"
            onClick={toggleEyedropper}
          ><Icon name="colorize" /></button>
          <button
            className={clsx(styles.toolIconBtn, rulerActive && styles.toolIconBtnActive)}
            title="Ruler — drag a straight edge; pencil strokes drawn near it snap to its line and show the distance"
            aria-label="Ruler — drag a straight edge; pencil strokes drawn near it snap to its line and show the distance"
            onClick={toggleRuler}
          ><Icon name="square_foot" /></button>
          <button
            className={clsx(styles.toolIconBtn, transformActive && styles.toolIconBtnActive)}
            title="Transform — move/scale/rotate the active layer or current selection"
            aria-label="Transform — move/scale/rotate the active layer or current selection"
            disabled={transformTargetIds.length === 0}
            onClick={toggleTransform}
          ><Icon name="transform" /></button>

          <div className={styles.toolDivider} />

          <button
            className={clsx(styles.toolIconBtn, gridActive && styles.toolIconBtnActive)}
            title="Toggle construction grid"
            aria-label="Toggle construction grid"
            onClick={() => setGridActive(a => !a)}
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
        <aside className={clsx(styles.quickSettingsBar, uiHidden && styles.uiHidden, isDrawing && styles.strokeBlocked)}>
          {Object.entries(TOOL_SCHEMAS[tool])
            .filter(([, descriptor]) => descriptor.quickAccess)
            .map(([key, descriptor]) => (
              <SettingField
                key={key}
                descriptor={descriptor}
                value={toolSettings[tool][key]}
                onChange={v => setToolSetting(tool, key, v)}
                layout="toolbar"
                onExpand={key === 'color' ? () => setActivePanel('color') : undefined}
              />
            ))}
        </aside>

        {/* ── Viewport ── */}
        <div ref={vpRef} className={styles.viewport}>
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
              style={{
                ...(config.infinite ? { width: '100%', height: '100%' } : { width: config.width, height: config.height }),
                pointerEvents: roomContentReady ? undefined : 'none',
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
            {!config.infinite && gridActive && <GridOverlay width={config.width} height={config.height} />}
            {!config.infinite && rulerActive && rulerLine && (
              <RulerOverlay a={rulerLine.a} b={rulerLine.b} onHandleDown={handleRulerHandleDown} zoom={vp.zoom} angle={vp.angle} />
            )}
            {!config.infinite && transformActive && transformBounds && (
              <TransformGizmo
                bounds={transformBounds}
                center={transformCenterOverride ?? {
                  x: transformBounds.x + transformBounds.width / 2,
                  y: transformBounds.y + transformBounds.height / 2,
                }}
                matrix={transformLiveMatrix ?? undefined}
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
              {gridActive && (
                <InfiniteGridOverlay
                  vp={vp}
                  viewportWidth={vpRef.current?.clientWidth ?? 0}
                  viewportHeight={vpRef.current?.clientHeight ?? 0}
                />
              )}
              {rulerActive && rulerLine && (
                <RulerOverlay a={rulerLine.a} b={rulerLine.b} onHandleDown={handleRulerHandleDown} zoom={vp.zoom} angle={vp.angle} />
              )}
              {transformActive && transformBounds && (
                <TransformGizmo
                  bounds={transformBounds}
                  center={transformCenterOverride ?? {
                    x: transformBounds.x + transformBounds.width / 2,
                    y: transformBounds.y + transformBounds.height / 2,
                  }}
                  matrix={transformLiveMatrix ?? undefined}
                  onHandleDown={handleTransformHandleDown}
                  onCenterDown={handleTransformCenterDown}
                  onCenterDoubleClick={handleTransformCenterReset}
                />
              )}
            </div>
          )}
          {eyedropperActive && (
            <div className={styles.eyedropperOverlay} onPointerDown={handleEyedropperPick} />
          )}
          {rulerActive && !rulerPlaced && (
            <div className={styles.rulerPlaceOverlay} onPointerDown={handleRulerPlaceDown} />
          )}
        </div>

        {/* ── Side panel (layers, color, …) ── */}
        {/* #99: wrapped rather than passing a className into SidePanel — the
            wrapper is a positioned overlay (see .layerPanelWrap) that only
            fades in/out, so the panel stays mounted (no lost focus/state)
            and the canvas underneath never resizes, same as header/toolbar
            above. */}
        <div className={clsx(styles.layerPanelWrap, uiHidden && styles.uiHidden, isDrawing && styles.strokeBlocked)}>
          <SidePanel
            active={activePanel}
            onSelect={setActivePanel}
            tabs={[
              {
                id: 'layers', icon: 'layers', title: 'Layers',
                content: <LayerPanel layerState={layerState} onChange={setLayerStateLocal} onOp={dispatchOp} />,
              },
              {
                id: 'color', icon: 'palette', title: 'Color',
                content: <ColorPicker value={pencilColor} onChange={v => setToolSetting('pencil', 'color', v)} />,
              },
              {
                // #197: full settings for the *currently active* tool, same
                // TOOL_SCHEMAS/SettingField data + component the toolbar's
                // quick-access row uses (#196) — this tab just renders every
                // field, not only the quickAccess-flagged ones.
                id: 'toolSettings', icon: 'tune', title: 'Tool settings',
                content: Object.keys(TOOL_SCHEMAS[tool]).length === 0 ? (
                  <p className={styles.noToolSettings}>This tool has no settings yet.</p>
                ) : (
                  <div className={styles.toolSettingsPanel}>
                    {Object.entries(TOOL_SCHEMAS[tool]).map(([key, descriptor]) => (
                      <SettingField
                        key={key}
                        descriptor={descriptor}
                        value={toolSettings[tool][key]}
                        onChange={v => setToolSetting(tool, key, v)}
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
            hidden is inverted (`!uiHidden`, not `uiHidden`) — see
            FloatingToolPanel's own doc comment: this panel is the minimal
            #99 replacement toolkit, so it only shows up once the rest of
            the chrome has hidden, not the other way round. */}
        <FloatingToolPanel
          tool={tool}
          onSetTool={setTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          roomId={id ?? ''}
          position={panelPosition}
          onPositionChange={setPanelPosition}
          containerRef={editorRef}
          hidden={!uiHidden}
          strokeBlocked={isDrawing}
        />

      </div>

      {/* Debug overlays share one positioning stack (.debugStack) so having
          more than one flag on at once (debugOverlay/hapticGrain/
          tapToHideUI) doesn't render them fully on top of each other at the
          same fixed corner — see chat, this is exactly what happened while
          chasing #154's latency regression with hapticGrain still on from
          earlier testing. */}
      {(debugEnabled || hapticGrainEnabled || tapToHideEnabled || pencilSoundTuningEnabled) && (
        <div className={styles.debugStack}>
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
          {tapToHideEnabled && (
            <div className={styles.debugOverlay}>
              {tapDebug ? (
                <>
                  <div>pointerType: {tapDebug.pointerType}</div>
                  <div>max move: {tapDebug.maxDistPx.toFixed(1)}px (threshold {TAP_MOVE_THRESHOLD_PX}px)</div>
                  <div>concurrent touches: {tapDebug.concurrentTouches}</div>
                  <div>was tap: {String(tapDebug.wasTap)}</div>
                </>
              ) : (
                <div>tap the canvas to see tap stats</div>
              )}
            </div>
          )}

          {pencilSoundTuningEnabled && <PencilSoundTuningPanel pencilSoundRef={pencilSoundRef} />}
        </div>
      )}
    </div>
  )
}
