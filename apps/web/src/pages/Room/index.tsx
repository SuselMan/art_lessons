import { useEffect, useRef, useState, useCallback, useReducer } from 'react'
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
import { PencilEngine, PENCIL_GRADES, PENCIL_PRESETS, type PencilEngineAPI, type PencilGradeName, type StrokeDebugStats } from '../../engine'
import { LayerPanel } from '../../components/LayerPanel'
import { Icon } from '../../components/Icon'
import { SettingsPanel } from '../../components/SettingsPanel'
import { PrecisionSlider } from '../../components/PrecisionSlider'
import { computeCompositeOrder, replayLayerState, overlayLocalFields } from '../../lib/layers'
import { getFeatureFlag } from '../../lib/featureFlags'
import { PencilSound } from '../../lib/PencilSound'
import { useDragToAdjust } from '../../lib/useDragToAdjust'
import { useViewport } from './useViewport'
import { useTapToggle } from './useTapToggle'
import { participantsReducer } from './participants'
import { currentlyDrawing, sameIds } from './drawingIndicator'
import { getOrCreateDisplayName } from './displayName'
import { shouldEmitCursor } from './cursorThrottle'
import { clientToCanvas } from './pointerTransform'
import { describeJoinError } from './joinError'
import { PeerCursors, type PeerCursorPosition } from './PeerCursors'
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
// Placeholder id until the socket connects and hands us the server-assigned
// one (its socket id — see the socket-wiring effect below) — and until real
// auth lands (#41). Kept as the pre-connection fallback so drawing before the
// socket connects still works (single-user/offline-ish behavior).
const INITIAL_USER_ID = 'local'
// LAN dev server port (apps/server); derived from window.location.hostname
// (not hardcoded 'localhost') so it works from other devices on the LAN per
// CLAUDE.md's "vite --host always on" for tablet testing.
const SERVER_PORT = 4000
// How long a stroke's "drawing" activity (local or peer) stays visible before
// the #38 indicator clears it — see drawingIndicator.ts.
const DRAWING_TIMEOUT_MS = 1500

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
  // Live-tip segment experiment (#104) — same feature-flag pattern as
  // predictEnabled above. Off by default; lets Ilya A/B it (and compare
  // avgTipLatencyMs against avgE2eLatencyMs in the debug overlay) on real
  // hardware before deciding whether to keep it.
  const liveTipEnabled = getFeatureFlag('liveTipSegment')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Minimal-UI experiment (#99): a short single-finger tap on the canvas
  // hides the header/toolbar/layer panel via a CSS class (never unmounted —
  // no lost focus/state), tap again to bring them back. Same feature-flag
  // pattern as debugEnabled/predictEnabled; off by default until there's
  // real-usage feedback on whether to keep it.
  const tapToHideEnabled = getFeatureFlag('tapToHideUI')
  const [uiHidden, setUiHidden] = useState(false)
  const toggleUI = useCallback(() => setUiHidden(h => !h), [])

  // Pencil-sound experiment: same feature-flag pattern as the ones above. Off
  // by default — untuned first pass, just to feel out on real hardware.
  const pencilSoundEnabled = getFeatureFlag('pencilSound')

  const [config,     setConfig]     = useState<RoomConfig | null>(
    () => (creatorDraft?.room ? toRoomConfig(creatorDraft.room) : null),
  )
  const [pencil,     setPencil]     = useState<PencilGradeName>('HB')
  const [tool,       setTool]       = useState<'pencil' | 'eraser'>('pencil')
  const [pencilCfg,  setPencilCfg]  = useState<ToolConfig>({ size: 8,  opacity: 1.0 })
  const [eraserCfg,  setEraserCfg]  = useState<ToolConfig>({ size: 24, opacity: 1.0 })
  const [layerState, setLayerState] = useState<LayerState>(makeInitialLayerState)
  const [panelOpen,  setPanelOpen]  = useState(true)

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
  const appliedOpIdsRef   = useRef<Set<string>>(new Set())
  const lastActiveAtRef   = useRef<Record<string, number>>({})
  const strokeActiveRef   = useRef(false)
  const lastCursorSentRef = useRef(0)
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

  const { vp, setVp, vpRef, fitCanvas, angleDeg, canvasTransform } = useViewport(config)
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
  useTapToggle(vpRef, toggleUI, tapToHideEnabled)

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
      debug: debugEnabled,
      onStrokeDebugStats: debugEnabled ? setStrokeStats : undefined,
      predictPointer: predictEnabled,
      liveTipSegment: liveTipEnabled,
    })
    engineRef.current = engine

    // Pencil-sound experiment: lazy AudioContext built on the engine's own
    // 'strokeStart' below (a real pointerdown gesture, satisfying the
    // autoplay-unlock requirement) — see PencilSound's docstring.
    if (pencilSoundEnabled) {
      const sound = new PencilSound(config.paper)
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
        markActive(userIdRef.current)
        pencilSoundRef.current?.start(e.pressure, e.speed, e.tiltX, e.tiltY)
      })
      .on('strokeEnd', () => {
        strokeActiveRef.current = false
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
  }, [config, markActive, applyRemoteOp, syncFromLog, debugEnabled, predictEnabled, liveTipEnabled, pencilSoundEnabled])

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
  useEffect(() => {
    const el = vpRef.current
    if (!el || !config) return
    const handleMove = (e: PointerEvent) => {
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
      socketRef.current?.emit('cursor_move', { x, y })
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
      io(`http://${window.location.hostname}:${SERVER_PORT}`)
    socketRef.current = socket

    // Fires on the initial connect *and* on every auto-reconnect (socket.io-
    // client's default behavior) — each (re)connect gets a fresh socket id,
    // so identity is re-derived every time. Rejoining after a drop is what
    // gives us the "reasonable MVP" reconnect behavior called for by #84
    // (full catch-up/session-continuity is #74): the client resyncs from a
    // fresh room_state rather than getting stuck. The known gap is identity
    // churn — a fresh socket id is always a `student` (#41 known limitation),
    // even for the room's own creator reconnecting, and operations authored
    // before the drop keep the old (now stale) userId.
    const handleConnect = () => {
      if (socket.id) {
        userIdRef.current = socket.id
        engineRef.current?.setUserId(socket.id)
      }
      setConnected(true)

      if (isCreator && creatorDraft) {
        if (!hasJoinedRef.current) {
          socket.emit('create_room', { room: creatorDraft.room, password: creatorDraft.password }, result => {
            if (result.ok) hasJoinedRef.current = true
            // Practically unreachable (would need a nanoid(8) id collision —
            // see rooms.ts's createRoom doc comment); nothing sensible to
            // retry into, so just surface it for debugging.
            else console.error('create_room failed unexpectedly', result)
          })
        } else {
          socket.emit(
            'join_room',
            { roomId: id, name: getOrCreateDisplayName(localStorage), password: creatorDraft.password },
            result => { if (!result.ok) console.error('join_room failed on reconnect', result) },
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
          if (!result.ok) console.error('join_room failed on reconnect', result)
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
      for (const op of operations) applyRemoteOp(op)
      syncFromLog()
      dispatchParticipants({ type: 'room_state', participants: roomParticipants })
    }

    const handlePeerOperation = (op: Operation) => {
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
    }

    const handlePeerCursor = ({ userId: peerId, x, y }: { userId: string; x: number; y: number }) => {
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
  }, [id, isCreator, creatorDraft, syncFromLog, applyRemoteOp])

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
      // room_state (already wired above) populates `config` from here, which
      // unmounts the gate in favor of the editor.
    })
  }, [id, joinName, joinPassword])

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
      <header className={clsx(styles.header, uiHidden && styles.uiHidden)}>
        <button className={styles.headerIconBtn} onClick={() => navigate('/create')} title="New room">
          <Icon name="arrow_back" />
        </button>
        <span className={styles.roomName}>{config.name}</span>

        <div className={styles.headerRight}>
          <button className={styles.headerIconBtn} onClick={() => setSettingsOpen(true)} title="Settings">
            <Icon name="settings" />
          </button>
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
            onClick={() => setVp(v => ({ ...v, angle: 0 }))}
            title="Rotation — click to reset  (R)"
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
        <aside className={clsx(styles.toolbar, uiHidden && styles.uiHidden)}>

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

          <button className={styles.toolIconBtn} title="Rotate −15°  (Shift+[)"
            onClick={() => setVp(v => ({ ...v, angle: v.angle - Math.PI / 12 }))}>
            <Icon name="rotate_left" />
          </button>
          <button className={styles.toolIconBtn} title="Rotate +15°  (Shift+])"
            onClick={() => setVp(v => ({ ...v, angle: v.angle + Math.PI / 12 }))}>
            <Icon name="rotate_right" />
          </button>

          <div className={styles.toolDivider} />

          <button className={styles.toolIconBtn} title="Fit canvas" onClick={fitCanvas}>
            <Icon name="fit_screen" />
          </button>
          <button className={styles.toolIconBtn} title="Clear canvas"
            onClick={() => engineRef.current?.clear()}>
            <Icon name="delete_forever" />
          </button>

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
          </div>
        </div>

        {/* ── Layer panel ── */}
        {/* #99: wrapped rather than passing a className into LayerPanel — the
            wrapper is a positioned overlay (see .layerPanelWrap) that only
            fades in/out, so LayerPanel stays mounted (no lost focus/state)
            and the canvas underneath never resizes, same as header/toolbar
            above. */}
        <div className={clsx(styles.layerPanelWrap, uiHidden && styles.uiHidden)}>
          <LayerPanel
            layerState={layerState}
            onChange={setLayerState}
            onOp={dispatchOp}
            open={panelOpen}
            onToggle={() => setPanelOpen(o => !o)}
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
              {liveTipEnabled && (
                <div>tip latency: avg {strokeStats.avgTipLatencyMs.toFixed(1)}ms / max {strokeStats.maxTipLatencyMs.toFixed(1)}ms</div>
              )}
            </>
          ) : (
            <div>draw a stroke to see stats</div>
          )}
        </div>
      )}
    </div>
  )
}
