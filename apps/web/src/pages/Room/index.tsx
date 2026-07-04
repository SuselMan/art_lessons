import { useEffect, useRef, useState, useCallback, useReducer } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import clsx from 'clsx'
import { clamp } from 'lodash-es'
import { nanoid } from 'nanoid'
import type {
  LayerState, OperationDraft, Operation, Participant,
  ClientToServerEvents, ServerToClientEvents,
} from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { PencilEngine, type PencilEngineAPI } from '../../engine'
import { LayerPanel } from '../../components/LayerPanel'
import { Icon } from '../../components/Icon'
import { computeCompositeOrder, replayLayerState, overlayLocalFields } from '../../lib/layers'
import { useViewport } from './useViewport'
import { participantsReducer } from './participants'
import { currentlyDrawing, sameIds } from './drawingIndicator'
import { getOrCreateDisplayName } from './displayName'
import { shouldEmitCursor } from './cursorThrottle'
import { clientToCanvas } from './pointerTransform'
import { PeerCursors, type PeerCursorPosition } from './PeerCursors'
import { ParticipantsBar } from './ParticipantsBar'
import styles from './Room.module.css'

interface RoomConfig {
  id: string
  name: string
  paper: 'rough' | 'smooth' | 'bristol'
  width: number
  height: number
  password: string | null
}

interface ToolConfig { size: number; opacity: number }

const PENCIL_TYPES = ['H', 'HB', '2B', '4B', '6B'] as const
type PencilType = (typeof PENCIL_TYPES)[number]

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

  const [config,     setConfig]     = useState<RoomConfig | null>(null)
  const [pencil,     setPencil]     = useState<PencilType>('HB')
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
  const layerStateRef = useRef<LayerState>(layerState)
  const initialToolRef = useRef({ pencil, size: pencilCfg.size, opacity: pencilCfg.opacity })

  const socketRef        = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const userIdRef         = useRef(INITIAL_USER_ID)
  const appliedOpIdsRef   = useRef<Set<string>>(new Set())
  const lastActiveAtRef   = useRef<Record<string, number>>({})
  const strokeActiveRef   = useRef(false)
  const lastCursorSentRef = useRef(0)
  const [displayName]     = useState(() => getOrCreateDisplayName(localStorage))

  layerStateRef.current = layerState

  const activeCfg    = tool === 'pencil' ? pencilCfg : eraserCfg
  const setActiveCfg = tool === 'pencil' ? setPencilCfg : setEraserCfg

  const { vp, setVp, vpRef, fitCanvas, angleDeg, canvasTransform } = useViewport(config)
  const vpValueRef = useRef(vp)
  vpValueRef.current = vp

  // ── load config ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { navigate('/create'); return }
    const raw = localStorage.getItem(`room_${id}`)
    if (!raw) { navigate('/create'); return }
    setConfig(JSON.parse(raw))
  }, [id, navigate])

  // Marks a user as "currently drawing" (#38) — a timestamp refreshed by local
  // stroke start/move and by incoming remote stroke ops; a separate interval
  // (below) periodically prunes stale entries into `drawingIds`.
  const markActive = useCallback((activeUserId: string) => {
    lastActiveAtRef.current[activeUserId] = Date.now()
  }, [])

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
    })
    engineRef.current = engine

    // Local "drawing" activity (#38): strokeStart/strokeEnd bound the local
    // stroke exactly; 'pointer' (fired on every move while the stroke's
    // pointer button is held — see PointerInput's `_active` gating) refreshes
    // it so a long stroke doesn't let the indicator time out mid-draw. Cursor
    // broadcast (#37) is handled separately below via a raw DOM listener,
    // since it must also fire on plain hover (engine 'pointer' does not).
    engine
      .on('strokeStart', () => { strokeActiveRef.current = true; markActive(userIdRef.current) })
      .on('strokeEnd',   () => { strokeActiveRef.current = false })
      .on('pointer', () => {
        if (strokeActiveRef.current) markActive(userIdRef.current)
      })

    const ls = layerStateRef.current
    for (const id of ls.rootOrder) {
      if (ls.items[id]?.kind === 'layer') engine.initLayer(id)
    }
    engine.setActiveLayer(ls.activeId)
    engine.setCompositeOrder(computeCompositeOrder(ls))

    return () => { engine.destroy(); engineRef.current = null }
  }, [config, markActive])

  // ── sync tool → engine ────────────────────────────────────────────────────────
  useEffect(() => { engineRef.current?.setPencil(pencil) }, [pencil])
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
  // LayerState is derived: base room state + replay of done operations, with
  // per-user view fields (selection, collapse, local lock) carried over.
  const syncFromLog = useCallback(() => {
    const ops = engineRef.current?.getOperations() ?? []
    setLayerState(prev => overlayLocalFields(replayLayerState(makeInitialLayerState(), ops), prev))
  }, [])

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

  // ── socket wiring (#84/#37/#38) ────────────────────────────────────────────────
  useEffect(() => {
    if (!config || !id) return

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
      io(`http://${window.location.hostname}:${SERVER_PORT}`)
    socketRef.current = socket

    // Fires on the initial connect *and* on every auto-reconnect (socket.io-
    // client's default behavior) — each (re)connect gets a fresh socket id,
    // so identity is re-derived and the room re-joined every time. Rejoining
    // after a drop is what gives us the "reasonable MVP" reconnect behavior
    // called for by #84 (full catch-up/session-continuity is #74): the client
    // resyncs from a fresh room_state rather than getting stuck. The known
    // gap is identity churn — operations authored before a reconnect keep the
    // old (now stale) userId, so this client's own undo can no longer reach
    // them after reconnecting (#41 auth will give a stable identity).
    const handleConnect = () => {
      if (socket.id) {
        userIdRef.current = socket.id
        engineRef.current?.setUserId(socket.id)
      }
      setConnected(true)
      socket.emit('join_room', { roomId: id, name: displayName, password: config.password ?? undefined })
    }

    const handleRoomState = ({ operations, participants: roomParticipants }: {
      operations: Operation[]; participants: Participant[]
    }) => {
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
  }, [config, id, displayName, syncFromLog, applyRemoteOp])

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
      const map: Record<string, PencilType> = { '1':'H','2':'HB','3':'2B','4':'4B','5':'6B' }
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

  if (!config) return null

  const dotSize = clamp(activeCfg.size * vp.zoom * 0.5, 3, 36)

  return (
    <div className={styles.editor}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <button className={styles.headerIconBtn} onClick={() => navigate('/create')} title="New room">
          <Icon name="arrow_back" />
        </button>
        <span className={styles.roomName}>{config.name}</span>

        <div className={styles.headerRight}>
          <ParticipantsBar participants={participants} drawingIds={drawingIds} connected={connected} />
          <span className={styles.zoomLabel}>{Math.round(vp.zoom * 100)}%</span>
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

      <div className={styles.body}>

        {/* ── Left toolbar ── */}
        <aside className={styles.toolbar}>

          <div className={styles.toolSection}>
            {PENCIL_TYPES.map(t => (
              <button key={t}
                className={clsx(styles.pencilBtn, tool === 'pencil' && pencil === t && styles.pencilBtnActive)}
                onClick={() => { setPencil(t); setTool('pencil') }}
                title={`${t} pencil`}
              >{t}</button>
            ))}
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
              <input type="range" min={1} max={120} value={activeCfg.size}
                onChange={e => setActiveCfg(c => ({ ...c, size: Number(e.target.value) }))}
                className={styles.vSlider} title={`Size: ${activeCfg.size}px  ([ / ])`} />
            </div>
            <span className={styles.sliderVal}>{activeCfg.size}</span>
          </div>

          <div className={styles.toolDivider} />

          {/* Opacity slider */}
          <div className={styles.sliderBlock}>
            <Icon name="opacity" />
            <div className={styles.sliderTrack}>
              <input type="range" min={0} max={100} value={Math.round(activeCfg.opacity * 100)}
                onChange={e => setActiveCfg(c => ({ ...c, opacity: Number(e.target.value) / 100 }))}
                className={styles.vSlider} title={`Opacity: ${Math.round(activeCfg.opacity * 100)}%`} />
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
        <LayerPanel
          layerState={layerState}
          onChange={setLayerState}
          onOp={dispatchOp}
          open={panelOpen}
          onToggle={() => setPanelOpen(o => !o)}
        />

      </div>
    </div>
  )
}
