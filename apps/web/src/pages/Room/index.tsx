import { useEffect, useRef, useState, useCallback, useMemo, useReducer } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import clsx from 'clsx'
import { clamp } from 'lodash-es'
import { nanoid } from 'nanoid'
import type {
  LayerState, OperationDraft, Operation, Participant, Room as RoomEntity,
  ClientToServerEvents, ServerToClientEvents, CursorMoveData,
} from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { PencilEngine, PENCIL_GRADES, PENCIL_PRESETS, DEFAULT_GRAPHITE_COLOR, type PencilEngineAPI, type PencilGradeName, type StrokeDebugStats, type HapticGrainStats } from '../../engine'
import { LayerPanel } from '../../components/LayerPanel'
import { SidePanel } from '../../components/SidePanel'
import { ColorPicker } from '../../components/ColorPicker'
import { Icon } from '../../components/Icon'
import { SettingsPanel } from '../../components/SettingsPanel'
import { PrecisionSlider } from '../../components/PrecisionSlider'
import { computeCompositeOrder, replayLayerState, overlayLocalFields } from '../../lib/layers'
import { getFeatureFlag, getPencilSoundSetting } from '../../lib/featureFlags'
import { rgbToHex } from '../../lib/color'
import { PencilSound, PENCIL_SOUND_VARIANT_1, PENCIL_SOUND_VARIANT_2 } from '../../lib/PencilSound'
import { useDragToAdjust } from '../../lib/useDragToAdjust'
import { TAP_MOVE_THRESHOLD_PX } from '../../lib/tapThreshold'
import { useViewport } from './useViewport'
import { useTapToggle, type TapDebugInfo } from './useTapToggle'
import { participantsReducer } from './participants'
import { currentlyDrawing, sameIds } from './drawingIndicator'
import { getOrCreateDisplayName } from './displayName'
import { shouldEmitCursor } from './cursorThrottle'
import { clientToCanvas } from './pointerTransform'
import { describeJoinError } from './joinError'
import { PeerCursors, type PeerCursorPosition } from './PeerCursors'
import { MeasureOverlay, type MeasurePoint } from './MeasureOverlay'
import { GridOverlay } from './GridOverlay'
import { TransformGizmo, type TransformHandleKind, type TransformBounds } from './TransformGizmo'
import { translateMatrix, scaleAxisMatrix, rotateAboutMatrix, type AffineMatrix } from './transformMath'
import { ParticipantsBar } from './ParticipantsBar'
import { JoinGate } from './JoinGate'
import styles from './Room.module.css'

interface RoomConfig {
  id: string
  name: string
  paper: 'rough' | 'smooth' | 'bristol'
  width: number
  height: number
}

/** Navigation state CreateRoom hands off to a freshly created room (see
 *  CreateRoom/index.tsx) — its presence is how this component tells "I am
 *  the creator, opening my own room" apart from "I opened someone else's
 *  room link" (no state at all, e.g. a second device). */
interface CreatorNavState {
  room: Pick<RoomEntity, 'id' | 'name' | 'paper' | 'canvasWidth' | 'canvasHeight'>
  password?: string
}

function toRoomConfig(room: Pick<RoomEntity, 'id' | 'name' | 'paper' | 'canvasWidth' | 'canvasHeight'>): RoomConfig {
  return { id: room.id, name: room.name, paper: room.paper, width: room.canvasWidth, height: room.canvasHeight }
}

interface ToolConfig { size: number; opacity: number }

const INITIAL_LAYER_ID = 'layer-1'
// Placeholder id until the socket connects and create_room/join_room's ack
// hands us the server-resolved identity (#41) — see applyIdentity. Kept as
// the pre-connection fallback so drawing before the socket connects still
// works (single-user/offline-ish behavior).
const INITIAL_USER_ID = 'local'
// LAN dev server port (apps/server); derived from window.location.hostname
// (not hardcoded 'localhost') so it works from other devices on the LAN per
// CLAUDE.md's "vite --host always on" for tablet testing.
const SERVER_PORT = 4000
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

function makeInitialLayerState(): LayerState {
  return {
    items: {
      [BACKGROUND_LAYER_ID]: { kind: 'layer', id: BACKGROUND_LAYER_ID, name: 'Background', opacity: 1, visible: true },
      [INITIAL_LAYER_ID]:    { kind: 'layer', id: INITIAL_LAYER_ID,    name: 'Layer 1',    opacity: 1, visible: true },
    },
    rootOrder:  [INITIAL_LAYER_ID, BACKGROUND_LAYER_ID],
    activeId:   INITIAL_LAYER_ID,
    selectedIds: [],
  }
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

  // Haptic paper-grain experiment: same feature-flag pattern as the ones
  // above. Off by default — for-fun prototype, Android Chrome only.
  const hapticGrainEnabled = getFeatureFlag('hapticGrain')
  const [hapticStats, setHapticStats] = useState<HapticGrainStats | null>(null)

  const [config,     setConfig]     = useState<RoomConfig | null>(
    () => (creatorDraft?.room ? toRoomConfig(creatorDraft.room) : null),
  )
  const [pencil,     setPencil]     = useState<PencilGradeName>('HB')
  const [tool,       setTool]       = useState<'pencil' | 'eraser'>('pencil')
  const [pencilCfg,  setPencilCfg]  = useState<ToolConfig>({ size: 8,  opacity: 1.0 })
  const [eraserCfg,  setEraserCfg]  = useState<ToolConfig>({ size: 24, opacity: 1.0 })
  const [color,      setColor]      = useState<[number, number, number]>(DEFAULT_GRAPHITE_COLOR)
  // Eyedropper (#82) is a one-shot mode, not a recorded ToolType — it never
  // paints or produces an Operation, so it lives entirely as local UI state
  // rather than going through engine.setTool(). See .eyedropperOverlay in
  // Room.module.css for how it intercepts the next canvas pointerdown.
  const [eyedropperActive, setEyedropperActive] = useState(false)
  // Measure tool (#119) — same non-recorded local-UI-state shape as the
  // eyedropper above: it never paints or produces an Operation, so it's
  // plain React state rather than an engine.setTool() mode. `measurePoints`
  // is the transient A→B line; it's cleared on every toggle (see
  // toggleMeasure) rather than persisting across a tool switch — "measure
  // mode off means nothing measured" is the simplest invariant to reason
  // about, at the cost of losing the last measurement when you switch away.
  const [measureActive, setMeasureActive] = useState(false)
  const [measurePoints, setMeasurePoints] = useState<{ a: MeasurePoint; b: MeasurePoint } | null>(null)
  // Construction grid (#89) — unlike eyedropper/measure above, a passive
  // toggle rather than a one-shot tool: it never intercepts pointer events,
  // so it doesn't need its own overlay div, just a conditional render.
  const [gridActive, setGridActive] = useState(false)
  // Layer transform tool (#120) — same one-shot-mode shape as measure, but
  // unlike measure it *does* produce an Operation (layer_transform) on
  // commit, via the engine's live preview + dispatchOp, not engine.setTool().
  const [transformActive, setTransformActive] = useState(false)
  // Content bounding box (engine.getContentBounds, unioned across the
  // current target(s)) — recomputed on activation/selection change and
  // after every commit (see refreshTransformBounds below), not per drag
  // frame. null while the tool is off, or before the first computation
  // lands, or (edge case) an active target with no content bounds and no
  // config to fall back to yet.
  const [transformBounds, setTransformBounds] = useState<TransformBounds | null>(null)
  // Custom rotation pivot (Adobe Animate-style draggable transform point) —
  // null means "use the content bounds' own center". Reset on activation
  // and after every commit: each drag already commits immediately (no
  // multi-step Free-Transform session, see #120's scope notes), so treating
  // a custom point as scoped to a single drag rather than trying to carry
  // an absolute canvas-space point through a move/scale that just changed
  // where the content actually is keeps this from silently pointing
  // somewhere stale.
  const [transformCenterOverride, setTransformCenterOverride] = useState<{ x: number; y: number } | null>(null)
  // Matrix for the *current* drag frame, fed to TransformGizmo so its handles
  // visually ride along with the content instead of staying glued to the
  // pre-drag bounds (see TransformGizmo's docstring) — null between drags.
  const [transformLiveMatrix, setTransformLiveMatrix] = useState<AffineMatrix | null>(null)
  const [layerState, setLayerState] = useState<LayerState>(makeInitialLayerState)
  const [activePanel, setActivePanel] = useState<'layers' | 'color' | null>('layers')

  // ── realtime state (#84/#37/#38) ────────────────────────────────────────────
  const [connected,   setConnected]   = useState(false)
  const [participants, dispatchParticipants] = useReducer(participantsReducer, [])
  const [peerCursors, setPeerCursors] = useState<Record<string, PeerCursorPosition>>({})
  const [drawingIds,  setDrawingIds]  = useState<string[]>([])

  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const engineRef     = useRef<PencilEngineAPI | null>(null)
  const pencilSoundRef = useRef<PencilSound | null>(null)
  const layerStateRef = useRef<LayerState>(layerState)
  const initialToolRef = useRef({ pencil, size: pencilCfg.size, opacity: pencilCfg.opacity })

  const socketRef        = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const userIdRef         = useRef(INITIAL_USER_ID)
  // Stamped by every create_room/join_room ack (#41) with the server's
  // cookie-resolved identity — stable across reconnects, unlike socket.id.
  const applyIdentity = useCallback((userId: string) => {
    userIdRef.current = userId
    engineRef.current?.setUserId(userId)
  }, [])
  const appliedOpIdsRef   = useRef<Set<string>>(new Set())
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
  const pendingSnapshotRef = useRef<{ operations: Operation[]; participants: Participant[] } | null>(null)
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

  layerStateRef.current = layerState
  configRef.current     = config

  const activeCfg    = tool === 'pencil' ? pencilCfg : eraserCfg
  const setActiveCfg = tool === 'pencil' ? setPencilCfg : setEraserCfg

  // Read directly inside useViewport's native pointerdown listener — see
  // that hook's doc comment for why a ref (checked synchronously, before
  // React ever re-renders) is required here instead of just having the
  // eyedropper overlay call e.stopPropagation() itself. Measure is pen-only
  // (see handleMeasureDown) so it never needs to reserve a touch here — a
  // finger always pans/zooms while measuring, exactly like it does while
  // drawing with the pencil.
  const toolActiveRef = useRef(false)
  toolActiveRef.current = eyedropperActive

  const { vp, setVp, vpRef, fitCanvas, angleDeg, canvasTransform } = useViewport(config, toolActiveRef)
  const vpValueRef = useRef(vp)
  vpValueRef.current = vp

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
  const syncFromLog = useCallback(() => {
    const ops = engineRef.current?.getOperations() ?? []
    setLayerState(prev => overlayLocalFields(replayLayerState(makeInitialLayerState(), ops), prev))
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

  // ── mount engine ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!config || !canvasRef.current) return
    const engine = new PencilEngine(canvasRef.current, {
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
        socketRef.current?.emit('operation', op)
        if (op.type === 'stroke') markActive(userIdRef.current)
      },
      // A peer's stroke reveal (#37 follow-up v2) has finished playing back —
      // commit it for real now, matching what's already visible on screen.
      onPreviewApplied: op => {
        pendingPreviewOpIdsRef.current.delete(op.id)
        applyRemoteOp(op)
        syncFromLog()
      },
      debug: debugEnabled,
      onStrokeDebugStats: debugEnabled ? setStrokeStats : undefined,
      predictPointer: predictEnabled,
      hapticGrain: hapticGrainEnabled,
      onHapticGrainStats: hapticGrainEnabled ? setHapticStats : undefined,
    })
    engineRef.current = engine

    // Pencil sound: lazy AudioContext built on the engine's own 'strokeStart'
    // below (a real pointerdown gesture, satisfying the autoplay-unlock
    // requirement) — see PencilSound's docstring.
    if (pencilSoundSetting !== 'off') {
      const grain = pencilSoundSetting === 'variant1' ? PENCIL_SOUND_VARIANT_1 : PENCIL_SOUND_VARIANT_2
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

    const ls = layerStateRef.current
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
      for (const op of pending.operations) applyRemoteOp(op)
      syncFromLog()
      dispatchParticipants({ type: 'room_state', participants: pending.participants })
    }

    return () => {
      engine.destroy()
      engineRef.current = null
      pencilSoundRef.current?.destroy()
      pencilSoundRef.current = null
    }
  }, [config, markActive, applyRemoteOp, syncFromLog, debugEnabled, predictEnabled, pencilSoundSetting, hapticGrainEnabled])

  // ── sync tool → engine ────────────────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.setPencil(pencil)
    pencilSoundRef.current?.setHardness(PENCIL_PRESETS[pencil].hardness)
  }, [pencil])
  useEffect(() => { engineRef.current?.setTool(tool) },     [tool])
  useEffect(() => {
    engineRef.current?.setSize(activeCfg.size)
    engineRef.current?.setOpacity(activeCfg.opacity)
  }, [activeCfg])
  useEffect(() => { engineRef.current?.setColor(color) }, [color])

  // ── sync layer state → engine ─────────────────────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setActiveLayer(layerState.activeId)
    engine.setLocked(!!(layerState.items[layerState.activeId]?.locked))
    engine.setCompositeOrder(computeCompositeOrder(layerState))
  }, [layerState])

  // ── sync viewport → engine ────────────────────────────────────────────────────
  useEffect(() => {
    const el = vpRef.current; if (!el) return
    const rect = el.getBoundingClientRect()
    engineRef.current?.setViewport(rect.left + vp.cx, rect.top + vp.cy, vp.zoom, vp.angle)
  }, [vp, vpRef])

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
    const handleMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const now = Date.now()
      if (!shouldEmitCursor(lastCursorSentRef.current, now)) return
      lastCursorSentRef.current = now
      const rect = el.getBoundingClientRect()
      const { cx, cy, zoom, angle } = vpValueRef.current
      const { x, y } = clientToCanvas(
        e.clientX, e.clientY,
        { cx: rect.left + cx, cy: rect.top + cy, zoom, angle },
        config,
      )
      socketRef.current?.emit('cursor_move', { x, y, drawing: strokeActiveRef.current })
    }
    el.addEventListener('pointermove', handleMove)
    return () => el.removeEventListener('pointermove', handleMove)
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
  // canvas as a stroke. Same clientToCanvas convention as the #37 cursor
  // broadcast above.
  const handleEyedropperPick = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const el = vpRef.current
    if (!el || !config) return
    const rect = el.getBoundingClientRect()
    const { x, y } = clientToCanvas(
      e.clientX, e.clientY,
      { cx: rect.left + vp.cx, cy: rect.top + vp.cy, zoom: vp.zoom, angle: vp.angle },
      config,
    )
    const picked = engineRef.current?.pickColor(x, y)
    if (picked) {
      setColor(picked)
      setActivePanel('color')
    }
    setEyedropperActive(false)
  }, [vpRef, vp, config])

  // Eyedropper, measure, and transform mode all take over the same
  // canvas-pointer catcher slot (or, for transform, the gizmo's own handles)
  // — only one should ever be armed at a time, so each toggle turns the
  // others off.
  const toggleEyedropper = useCallback(() => {
    setMeasureActive(false)
    setMeasurePoints(null)
    setTransformActive(false)
    setEyedropperActive(a => !a)
  }, [])

  const toggleMeasure = useCallback(() => {
    setEyedropperActive(false)
    setTransformActive(false)
    setMeasureActive(a => !a)
    setMeasurePoints(null)
  }, [])

  const toggleTransform = useCallback(() => {
    setEyedropperActive(false)
    setMeasureActive(false)
    setMeasurePoints(null)
    setTransformActive(a => !a)
  }, [])

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
  }, [transformTargetIds, config])

  useEffect(() => {
    if (!transformActive) { setTransformBounds(null); setTransformCenterOverride(null); return }
    refreshTransformBounds()
  }, [transformActive, refreshTransformBounds])

  // Measure tool (#119): mirrors handleEyedropperPick's clientToCanvas
  // conversion, but for a full drag rather than a single click — down/move/up
  // tracked manually via setPointerCapture + direct DOM listeners, the same
  // pattern ColorPicker's onSvDown/onHueDown use for their own drag handling.
  // Pen-only, same as the pencil itself ignores touch (see PointerInput.ts) —
  // a finger on .measureOverlay falls straight through to useViewport's own
  // panning untouched, instead of trying to arbitrate whose gesture a given
  // touch belongs to. Fewer finger/ruler conflicts, and one fewer thing to
  // explain than the old touch-reservation scheme.
  const handleMeasureDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    const overlay = e.currentTarget as HTMLElement
    const penPointerId = e.pointerId
    // Same defensive try/catch as useViewport's own setPointerCapture calls
    // (search "context loss" there) — without it, a throw here (observed:
    // NotFoundError, "no active pointer with the given id") would abort the
    // rest of this handler before setMeasurePoints ever runs, silently
    // dropping the whole gesture.
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    const rect = el.getBoundingClientRect()
    const viewport = { cx: rect.left + vp.cx, cy: rect.top + vp.cy, zoom: vp.zoom, angle: vp.angle }
    const toPoint = (clientX: number, clientY: number): MeasurePoint => clientToCanvas(clientX, clientY, viewport, config)

    const start = toPoint(e.clientX, e.clientY)
    setMeasurePoints({ a: start, b: start })

    // Filtered by pointerId: these listeners sit on the overlay (not scoped
    // to a single pointer by the DOM), and a concurrent second finger
    // panning/zooming with useViewport's own touch handling (see that hook's
    // docstring — measure never reserves a touch, so it's free to pan) also
    // dispatches pointermove/pointerup at this same overlay. Without this
    // check, that finger's moves were observed corrupting the measurement's
    // endpoint, and its pointerup was observed tearing down the pen's own
    // tracking before the pen had actually lifted.
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      setMeasurePoints(prev => prev && { a: prev.a, b: toPoint(ev.clientX, ev.clientY) })
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [vpRef, vp, config])

  // Layer transform tool (#120): mirrors handleMeasureDown's drag-capture
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
    const viewport = { cx: rect.left + vp.cx, cy: rect.top + vp.cy, zoom: vp.zoom, angle: vp.angle }
    const toPoint = (clientX: number, clientY: number) => clientToCanvas(clientX, clientY, viewport, config)

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

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      const matrix = computeMatrix(ev.clientX, ev.clientY)
      setTransformLiveMatrix(matrix)
      engineRef.current?.previewLayerTransform(targetIds.map(layerId => ({ layerId, matrix })))
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      const matrix = computeMatrix(ev.clientX, ev.clientY)
      setTransformLiveMatrix(null)
      engineRef.current?.clearLayerTransformPreview()
      if (isNegligibleTransform(handle, matrix)) return
      dispatchOp({ type: 'layer_transform', transforms: targetIds.map(layerId => ({ layerId, matrix })) })
      refreshTransformBounds()
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [vpRef, vp, config, transformBounds, transformTargetIds, transformCenterOverride, dispatchOp, refreshTransformBounds])

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
    const viewport = { cx: rect.left + vp.cx, cy: rect.top + vp.cy, zoom: vp.zoom, angle: vp.angle }
    const toPoint = (clientX: number, clientY: number) => clientToCanvas(clientX, clientY, viewport, config)

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
  }, [vpRef, vp, config])

  const handleTransformCenterReset = useCallback(() => setTransformCenterOverride(null), [])

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

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
      io(`http://${window.location.hostname}:${SERVER_PORT}`, { withCredentials: true })
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
          socket.emit('create_room', { room: creatorDraft.room, password: creatorDraft.password }, result => {
            if (result.ok) { hasJoinedRef.current = true; applyIdentity(result.userId) }
            // Practically unreachable (would need a nanoid(8) id collision —
            // see rooms.ts's createRoom doc comment); nothing sensible to
            // retry into, so just surface it for debugging.
            else console.error('create_room failed unexpectedly', result)
          })
        } else {
          socket.emit(
            'join_room',
            { roomId: id, name: getOrCreateDisplayName(localStorage), password: creatorDraft.password },
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
        socket.emit('join_room', { roomId: id, ...lastJoinAttemptRef.current }, result => {
          if (result.ok) applyIdentity(result.userId)
          else console.error('join_room failed on reconnect', result)
        })
      }
    }

    const handleRoomState = ({ room, operations, participants: roomParticipants }: {
      room: RoomEntity; operations: Operation[]; participants: Participant[]
    }) => {
      if (!configRef.current) {
        // Joiner's first snapshot: this is how we learn paper/canvas size —
        // the engine doesn't exist yet to apply `operations` to, so stash them
        // for the mount-engine effect to replay once it does.
        pendingSnapshotRef.current = { operations, participants: roomParticipants }
        setConfig(toRoomConfig(room))
        return
      }
      // A reconnect's full-history replay supersedes any reveal still
      // in-flight from before the drop — cancel it rather than let it keep
      // painting the same stroke a second time on top of what this loop is
      // about to commit directly.
      for (const op of operations) {
        if (pendingPreviewOpIdsRef.current.has(op.id)) {
          engineRef.current?.dropPendingPreview(op.id)
          pendingPreviewOpIdsRef.current.delete(op.id)
        }
        applyRemoteOp(op)
      }
      syncFromLog()
      dispatchParticipants({ type: 'room_state', participants: roomParticipants })
    }

    const handlePeerOperation = (op: Operation) => {
      // Stroke ops are revealed progressively (#37 follow-up v2) rather than
      // committed on arrival — see the engine's onPreviewApplied option
      // above, which does the actual applyRemoteOp/syncFromLog once the
      // reveal finishes playing every dab back.
      if (op.type === 'stroke') {
        pendingPreviewOpIdsRef.current.add(op.id)
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
        if (target) applyRemoteOp(target)
        applyRemoteOp(op)
        syncFromLog()
        return
      }
      applyRemoteOp(op)
      syncFromLog()
    }

    const handlePeerJoined = (participant: Participant) => {
      dispatchParticipants({ type: 'peer_joined', participant })
    }

    const handlePeerLeft = (leftUserId: string) => {
      dispatchParticipants({ type: 'peer_left', userId: leftUserId })
      setPeerCursors(prev => {
        if (!(leftUserId in prev)) return prev
        const next = { ...prev }
        delete next[leftUserId]
        return next
      })
      delete lastActiveAtRef.current[leftUserId]
      // They left mid-reveal — commit whatever of their last stroke(s) had
      // already arrived rather than losing it, just without the animation.
      const stranded = engineRef.current?.flushPeerPreview(leftUserId) ?? []
      for (const op of stranded) {
        pendingPreviewOpIdsRef.current.delete(op.id)
        applyRemoteOp(op)
      }
      if (stranded.length) syncFromLog()
    }

    const handlePeerCursor = (data: CursorMoveData & { userId: string }) => {
      const { userId: peerId, x, y, drawing } = data
      // Frozen while they're mid-stroke (#37 follow-up v2) — the dot stays
      // put at wherever it last was until the finished stroke reveals, since
      // there's no live approximation of the in-progress shape any more.
      if (drawing) return
      setPeerCursors(prev => ({ ...prev, [peerId]: { userId: peerId, x, y } }))
    }

    const handleDisconnect = () => setConnected(false)

    socket.on('connect',        handleConnect)
    socket.on('room_state',     handleRoomState)
    socket.on('peer_operation', handlePeerOperation)
    socket.on('peer_joined',    handlePeerJoined)
    socket.on('peer_left',      handlePeerLeft)
    socket.on('peer_cursor',    handlePeerCursor)
    socket.on('disconnect',     handleDisconnect)

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [id, isCreator, creatorDraft, syncFromLog, applyRemoteOp, applyIdentity])

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
    socketRef.current?.emit('join_room', { roomId: id, name: trimmed, password }, result => {
      setJoinSubmitting(false)
      if (!result.ok) { setJoinError(describeJoinError(result.error)); return }
      hasJoinedRef.current = true
      applyIdentity(result.userId)
      // room_state (already wired above) populates `config` from here, which
      // unmounts the gate in favor of the editor.
    })
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
      if (map[e.key]) { setPencil(map[e.key]); setTool('pencil') }
      if (e.key === '[') setActiveCfg(c => ({ ...c, size: Math.max(1,   c.size - 1) }))
      if (e.key === ']') setActiveCfg(c => ({ ...c, size: Math.min(120, c.size + 1) }))
      if (e.shiftKey && e.key === '{') setVp(v => ({ ...v, angle: v.angle - Math.PI / 12 }))
      if (e.shiftKey && e.key === '}') setVp(v => ({ ...v, angle: v.angle + Math.PI / 12 }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setActiveCfg, setVp, handleUndo, handleRedo])

  // ── callbacks ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const blob = await engineRef.current?.exportPNG(); if (!blob) return
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${config?.name ?? 'drawing'}.png`; a.click()
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

  const dotSize = clamp(activeCfg.size * vp.zoom * 0.5, 3, 36)
  const gradePreset  = PENCIL_PRESETS[pencil]
  const gradeDotSize = clamp(gradePreset.sizeMultiplier * 14, 6, 22)

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
          <button
            className={styles.zoomLabel}
            onPointerDown={onZoomDragDown}
            onClick={() => setVp(v => ({ ...v, zoom: 1 }))}
            title="Zoom — drag up/down to adjust, click to reset to 100%"
          >
            {Math.round(vp.zoom * 100)}%
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
          <button className={styles.headerBtn} onClick={handleUndo} title="Undo  Ctrl+Z">
            <Icon name="undo" /><span>Undo</span>
          </button>
          <button className={styles.headerBtn} onClick={handleRedo} title="Redo  Ctrl+Shift+Z">
            <Icon name="redo" /><span>Redo</span>
          </button>
          <button className={styles.headerBtn} onClick={handleExport} title="Export PNG">
            <Icon name="download" /><span>Export</span>
          </button>
        </div>
      </header>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      <div className={styles.body}>

        {/* ── Left toolbar ── */}
        <aside className={clsx(styles.toolbar, uiHidden && styles.uiHidden, isDrawing && styles.strokeBlocked)}>

          {/* Pencil grade — compact vertical slider over the full 6H-6B (+F) range.
              Quick picks: number keys 1-5 jump to H / HB / 2B / 4B / 6B. */}
          <div className={styles.sliderBlock} onClick={() => setTool('pencil')}>
            <div className={styles.sliderPreview}>
              <div className={styles.sizeDot}
                style={{ width: gradeDotSize, height: gradeDotSize, opacity: gradePreset.opacity }} />
            </div>
            <div className={styles.gradeTrack}>
              <PrecisionSlider
                value={PENCIL_GRADES.indexOf(pencil)}
                min={0} max={PENCIL_GRADES.length - 1} step={1}
                trackHeight={108}
                onChange={v => { setPencil(PENCIL_GRADES[v]); setTool('pencil') }}
                formatValue={v => PENCIL_GRADES[v]}
                title={`Pencil grade: ${pencil}  (1-5 for quick picks)`} />
            </div>
            <span className={clsx(styles.sliderVal, styles.gradeLabel, tool === 'pencil' && styles.gradeLabelActive)}>
              {pencil}
            </span>
          </div>

          <div className={styles.toolDivider} />

          <button
            className={clsx(styles.toolIconBtn, tool === 'eraser' && styles.toolIconBtnActive)}
            title="Eraser  E"
            aria-label="Eraser  E"
            onClick={() => setTool(t => t === 'eraser' ? 'pencil' : 'eraser')}
          ><Icon name="ink_eraser" /></button>

          <div className={styles.toolDivider} />

          {/* Size slider */}
          <div className={styles.sliderBlock}>
            <div className={styles.sliderPreview}>
              <div className={styles.sizeDot} style={{ width: dotSize, height: dotSize }} />
            </div>
            <div className={styles.sliderTrack}>
              <PrecisionSlider
                value={activeCfg.size} min={1} max={120} step={1} trackHeight={76}
                onChange={v => setActiveCfg(c => ({ ...c, size: v }))}
                formatValue={v => `${v}px`}
                title={`Size: ${activeCfg.size}px  ([ / ])`} />
            </div>
            <span className={styles.sliderVal}>{activeCfg.size}</span>
          </div>

          <div className={styles.toolDivider} />

          {/* Opacity slider */}
          <div className={styles.sliderBlock}>
            <Icon name="opacity" />
            <div className={styles.sliderTrack}>
              <PrecisionSlider
                value={Math.round(activeCfg.opacity * 100)} min={0} max={100} step={1} trackHeight={76}
                onChange={v => setActiveCfg(c => ({ ...c, opacity: v / 100 }))}
                formatValue={v => `${v}%`}
                title={`Opacity: ${Math.round(activeCfg.opacity * 100)}%`} />
            </div>
            <span className={styles.sliderVal}>{Math.round(activeCfg.opacity * 100)}%</span>
          </div>

          <div className={styles.toolDivider} />

          {/* Color (#81) — current-color swatch opens the ColorPicker tab of
              the unified right-side SidePanel (see .layerPanelWrap below);
              the actual palette (saved custom colors) is a separate, later
              task. Eyedropper (#82) picks a color from the canvas and opens
              the same tab to refine it. */}
          <button
            className={styles.colorSwatch}
            style={{ background: rgbToHex(color) }}
            title="Color"
            aria-label="Color"
            onClick={() => setActivePanel('color')}
          />
          <button
            className={clsx(styles.toolIconBtn, eyedropperActive && styles.toolIconBtnActive)}
            title="Eyedropper — pick a color from the canvas"
            aria-label="Eyedropper — pick a color from the canvas"
            onClick={toggleEyedropper}
          ><Icon name="colorize" /></button>
          <button
            className={clsx(styles.toolIconBtn, measureActive && styles.toolIconBtnActive)}
            title="Measure — drag between two points to see the distance"
            aria-label="Measure — drag between two points to see the distance"
            onClick={toggleMeasure}
          ><Icon name="straighten" /></button>
          <button
            className={clsx(styles.toolIconBtn, transformActive && styles.toolIconBtnActive)}
            title="Transform — move/scale/rotate the active layer or current selection"
            aria-label="Transform — move/scale/rotate the active layer or current selection"
            disabled={transformTargetIds.length === 0}
            onClick={toggleTransform}
          ><Icon name="transform" /></button>

          <div className={styles.toolDivider} />

          <button className={styles.toolIconBtn} title="Rotate −15°  (Shift+[)" aria-label="Rotate −15°  (Shift+[)"
            onClick={() => setVp(v => ({ ...v, angle: v.angle - Math.PI / 12 }))}>
            <Icon name="rotate_left" />
          </button>
          <button className={styles.toolIconBtn} title="Rotate +15°  (Shift+])" aria-label="Rotate +15°  (Shift+])"
            onClick={() => setVp(v => ({ ...v, angle: v.angle + Math.PI / 12 }))}>
            <Icon name="rotate_right" />
          </button>

          <div className={styles.toolDivider} />

          <button className={styles.toolIconBtn} title="Fit canvas" aria-label="Fit canvas" onClick={fitCanvas}>
            <Icon name="fit_screen" />
          </button>
          <button className={styles.toolIconBtn} title="Clear canvas" aria-label="Clear canvas"
            onClick={() => engineRef.current?.clear()}>
            <Icon name="delete_forever" />
          </button>

          <div className={styles.toolDivider} />

          <button
            className={clsx(styles.toolIconBtn, gridActive && styles.toolIconBtnActive)}
            title="Toggle construction grid"
            aria-label="Toggle construction grid"
            onClick={() => setGridActive(a => !a)}
          ><Icon name="grid_on" /></button>

        </aside>

        {/* ── Viewport ── */}
        <div ref={vpRef} className={styles.viewport}>
          <div className={styles.canvasWrap} style={{ transform: canvasTransform }}>
            <canvas
              ref={canvasRef}
              width={config.width}
              height={config.height}
              className={styles.canvas}
              style={{ width: config.width, height: config.height }}
            />
            <PeerCursors
              cursors={Object.values(peerCursors)}
              participants={participants}
              zoom={vp.zoom}
              angle={vp.angle}
            />
            {measurePoints && (
              <MeasureOverlay a={measurePoints.a} b={measurePoints.b} zoom={vp.zoom} angle={vp.angle} />
            )}
            {gridActive && <GridOverlay width={config.width} height={config.height} />}
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
          {eyedropperActive && (
            <div className={styles.eyedropperOverlay} onPointerDown={handleEyedropperPick} />
          )}
          {measureActive && (
            <div className={styles.measureOverlay} onPointerDown={handleMeasureDown} />
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
                content: <LayerPanel layerState={layerState} onChange={setLayerState} onOp={dispatchOp} />,
              },
              {
                id: 'color', icon: 'palette', title: 'Color',
                content: <ColorPicker value={color} onChange={setColor} />,
              },
            ]}
          />
        </div>

      </div>

      {/* Device performance readout (#91, extended #104) — ?debug=1 only.
          Shows the last completed stroke's real input-sample rate, paint
          cost, and end-to-end (PointerEvent.timeStamp → _display()) input
          latency, so a tablet with no attached devtools can still report
          hard numbers. */}
      {debugEnabled && (
        <div className={styles.debugOverlay}>
          {strokeStats ? (
            <>
              <div>events: {strokeStats.moveEvents} over {strokeStats.durationMs.toFixed(0)}ms</div>
              <div>gap: avg {strokeStats.avgGapMs.toFixed(1)}ms / max {strokeStats.maxGapMs.toFixed(1)}ms</div>
              <div>dabs: {strokeStats.dabCount}</div>
              <div>render: {strokeStats.renderMsTotal.toFixed(1)}ms total / {strokeStats.avgRenderMsPerDab.toFixed(2)}ms per dab</div>
              <div>e2e latency: avg {strokeStats.avgE2eLatencyMs.toFixed(1)}ms / max {strokeStats.maxE2eLatencyMs.toFixed(1)}ms</div>
              <div>tip latency: avg {strokeStats.avgTipLatencyMs.toFixed(1)}ms / max {strokeStats.maxTipLatencyMs.toFixed(1)}ms</div>
            </>
          ) : (
            <div>draw a stroke to see stats</div>
          )}
        </div>
      )}

      {/* Haptic-grain experiment diagnostic — always shown while the flag is
          on (not gated behind ?debug=1) so it's visible on a tablet with no
          attached devtools while chasing "vibrates from the test button but
          not while drawing" (see chat). cellsEntered=0 after drawing means
          the stroke never reached HapticGrain.sample() at all; bumpsHit=0
          means it's reaching it but the density threshold never trips;
          vibrateOk < bumpsHit is now expected (see HapticGrain's
          minIntervalMs) — most grid hits during a real stroke land inside
          the same throttle window, so only some of them reach an actual
          navigator.vibrate() call; a call that browser-rejects instead of
          being throttled is indistinguishable here, but that was never
          observed while diagnosing this. */}
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
          "works on Samsung, not on a Surface"). maxDistPx close to or over
          the threshold means that device's digitizer reports enough jitter
          on a stationary tap to read as a drag; concurrentTouches > 1 means
          a second touch (real or a stray palm contact) was down at the same
          time, disqualifying it as a single-finger tap. */}
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
    </div>
  )
}
