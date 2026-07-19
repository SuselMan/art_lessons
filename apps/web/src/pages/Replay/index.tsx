import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LayerState, Room as RoomEntity, StrokeOperation } from '@art-lessons/shared'

import { PencilEngine, type PencilEngineAPI } from '../../engine'
import { fetchRoomReplay, ApiError } from '../../lib/api'
import { applyContentOp, computeCompositeOrder } from '../../lib/layers'
import { makeInitialLayerState } from '../../stores/slices/layerSlice'
import { Icon } from '../../components/Icon'
import { deviceNativeZoom } from '../Room/cameraMath'
import { PlayerControls } from './PlayerControls'
import { appliedCountForElapsed, buildTimeline, currentElapsedMs, type ReplayTimeline, type Speed } from './playback'
import styles from './Replay.module.css'

// Mirrors Room/index.tsx's own placeholder — an infinite room's canvas
// backing store is sized live by the ResizeObserver effect below, this is
// only ever the pre-first-measurement default.
const PLACEHOLDER_INFINITE_CANVAS_SIZE = 8192

/** Recenters an infinite room's camera on the union of every current
 *  layer's actual painted content, zoomed to fit `containerW x containerH`
 *  (CSS px). Falls back to world origin at native zoom when there's no
 *  content yet (room hasn't started, or seeked to time 0) or the container
 *  hasn't been measured yet. Only called right after a (re)build finishes
 *  applying its target range of ops — not on every playback frame, so the
 *  camera doesn't jump around while a stroke happens to extend the
 *  drawing's bounds mid-play (see #108's own scope: a player, not a full
 *  pan/zoom-capable viewer). */
function fitInfiniteCamera(
  engine: PencilEngineAPI, layerIds: string[], containerW: number, containerH: number,
): void {
  const nativeZoom = deviceNativeZoom()
  let union: { x: number; y: number; width: number; height: number } | null = null
  for (const id of layerIds) {
    const b = engine.getContentBounds(id)
    if (!b || b.width <= 0 || b.height <= 0) continue
    union = union
      ? {
          x: Math.min(union.x, b.x), y: Math.min(union.y, b.y),
          width: Math.max(union.x + union.width, b.x + b.width) - Math.min(union.x, b.x),
          height: Math.max(union.y + union.height, b.y + b.height) - Math.min(union.y, b.y),
        }
      : b
  }
  if (!union || containerW <= 0 || containerH <= 0) {
    engine.setInfiniteCamera(0, 0, 1, 0)
    return
  }
  const PADDING = 1.15
  // Backing store is CSS px / nativeZoom (see the ResizeObserver effect
  // below) — the engine's own zoom unit is physical backing-store px per
  // world unit, so fitting content into it means dividing the CSS-space fit
  // by nativeZoom too, same conversion Room's viewport-sync effect uses.
  const zoom = Math.min(
    (containerW / nativeZoom) / (union.width * PADDING),
    (containerH / nativeZoom) / (union.height * PADDING),
  )
  engine.setInfiniteCamera(union.x + union.width / 2, union.y + union.height / 2, Math.max(zoom, 0.001), 0)
}

export function Replay(): React.JSX.Element {
  const { roomId } = useParams<{ roomId: string }>()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['rooms', roomId, 'replay'],
    queryFn: () => fetchRoomReplay(roomId!),
    enabled: !!roomId,
    retry: false,
  })
  const room = data?.room
  const ops = data?.operations

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportElRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PencilEngineAPI | null>(null)
  const layerStateRef = useRef<LayerState>(makeInitialLayerState())
  const appliedCountRef = useRef(0)
  // The one stroke op currently being revealed dab-by-dab (#108 "draw it as
  // it was originally drawn" — see engine.previewOperation), or null when
  // nothing is animating. At most one at a time: tick() below never starts a
  // new op while this is set, so ops that were genuinely drawn concurrently
  // by different authors in the original session replay sequentially here —
  // see the doc comment on tick's while-loop for why that's an accepted
  // simplification.
  const inFlightRef = useRef<{ index: number; op: StrokeOperation } | null>(null)
  const timelineRef = useRef<ReplayTimeline>({ offsetsMs: [], durationMs: 0 })
  const anchorRef = useRef({ wallMs: 0, elapsedMs: 0 })
  const speedRef = useRef<Speed>(1)
  const rafRef = useRef<number | null>(null)
  const epochRef = useRef(0)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [speed, setSpeed] = useState<Speed>(1)

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  /** engine.previewOperation's completion callback (#108): the animated
   *  reveal finished, so commit the stroke's pixels into the real layer
   *  buffer for real — mirrors Room's own onPreviewApplied handling for a
   *  peer's live stroke (see appendOperation's 'remote' source). Stable
   *  ([] deps) since it's handed to `new PencilEngine(...)` at construction
   *  time and never reattached — reads everything it needs live via refs. */
  const handlePreviewApplied = useCallback((op: StrokeOperation) => {
    engineRef.current?.appendOperation(op, 'remote')
    // stroke is a no-op for LayerState (see lib/layers.ts's applyContentOp),
    // so no compositeOrder update is needed here — only bookkeeping.
    if (inFlightRef.current?.op.id === op.id) {
      appliedCountRef.current = inFlightRef.current.index + 1
      inFlightRef.current = null
    }
  }, [])

  /** Creates a fresh, blank engine seeded with the room's two always-there
   *  starting layers (background + the first raster layer) — the same base
   *  every room's operation log implicitly starts from (see
   *  Room/index.tsx's own initial-mount seeding). View-only: setLocked(true)
   *  blocks PointerInput's _onStart, so nothing a stray touch/click does on
   *  this canvas ever paints (#108 "no real pointer input"). */
  const createEngine = useCallback((canvas: HTMLCanvasElement, r: RoomEntity): PencilEngineAPI => {
    const engine = new PencilEngine(canvas, { infinite: r.infinite, paper: r.paper, onPreviewApplied: handlePreviewApplied })
    engine.setLocked(true)
    const ls = makeInitialLayerState()
    for (const id of ls.rootOrder) if (ls.items[id]?.kind === 'layer') engine.initLayer(id)
    engine.setActiveLayer(ls.activeId)
    engine.setCompositeOrder(computeCompositeOrder(ls))
    layerStateRef.current = ls
    appliedCountRef.current = 0
    inFlightRef.current = null
    return engine
  }, [handlePreviewApplied])

  /** Applies ops[fromIndex, toIndex) to `engine` in order, instantly (no
   *  per-dab reveal) — used for the fast-forward catch-up phase of a seek,
   *  never for live forward playback (see tick() below for that). Keeps
   *  layerStateRef and the engine's composite order in sync — the same
   *  split Room's own remote-op handling keeps (appendOperation paints
   *  pixels / creates-destroys buffers; structural LayerState + composite
   *  order is this caller's job, see appendOperation's own doc comment). */
  const applyOpsInstant = useCallback((engine: PencilEngineAPI, fromIndex: number, toIndex: number) => {
    if (!ops) return
    let state = layerStateRef.current
    for (let i = fromIndex; i < toIndex; i++) {
      const op = ops[i]
      engine.appendOperation(op, 'remote')
      const next = applyContentOp(state, op)
      if (next !== state) {
        state = next
        engine.setCompositeOrder(computeCompositeOrder(state))
      }
    }
    layerStateRef.current = state
  }, [ops])

  /** Live forward playback, one animation frame at a time. Ops due by the
   *  current elapsed position are applied in order; a `stroke` op starts an
   *  animated dab-by-dab reveal (engine.previewOperation, #108) instead of
   *  painting instantly, and — since the engine only ever reveals one op per
   *  author at a time and there is exactly one "current position" in this
   *  player — no *further* op starts until it commits (handlePreviewApplied),
   *  even if later ops' own offsets have already been reached. Two strokes
   *  genuinely drawn at overlapping times by different authors in the
   *  original lesson therefore replay one after another here, not in
   *  parallel — accepted for #108's scope (a single-timeline player, not a
   *  full multi-track reconstruction). Non-stroke ops are unaffected: they
   *  still apply the instant they're due, in a burst if several are due the
   *  same frame, exactly as before. */
  const tick = useCallback(() => {
    const engine = engineRef.current
    if (!engine || !ops) { rafRef.current = null; return }
    const timeline = timelineRef.current
    const projected = currentElapsedMs(anchorRef.current.wallMs, anchorRef.current.elapsedMs, speedRef.current, performance.now())
    const clamped = Math.min(Math.max(projected, 0), timeline.durationMs)

    if (inFlightRef.current === null) {
      let idx = appliedCountRef.current
      while (idx < ops.length && timeline.offsetsMs[idx] <= clamped) {
        const op = ops[idx]
        if (op.type === 'stroke') {
          engine.previewOperation(op, speedRef.current)
          inFlightRef.current = { index: idx, op }
          break
        }
        engine.appendOperation(op, 'remote')
        const next = applyContentOp(layerStateRef.current, op)
        if (next !== layerStateRef.current) {
          layerStateRef.current = next
          engine.setCompositeOrder(computeCompositeOrder(layerStateRef.current))
        }
        appliedCountRef.current = idx + 1
        idx++
      }
    }

    // While a stroke is mid-reveal, freeze the displayed/scrubber position
    // at its own offset — advancing the clock further would visibly desync
    // the timeline from what's actually on screen (still being drawn).
    const displayElapsed = inFlightRef.current
      ? Math.min(clamped, timeline.offsetsMs[inFlightRef.current.index])
      : clamped
    setElapsedMs(displayElapsed)

    if (clamped >= timeline.durationMs && inFlightRef.current === null) {
      setPlaying(false)
      rafRef.current = null
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [ops])

  /** Tears down whatever engine currently exists and rebuilds one from
   *  scratch, fast-forwarding (no per-op delay) to `targetElapsedMs` — the
   *  engine only ever replays forward (#108: same constraint a late
   *  joiner's catch-up already lives with), so *every* seek, forward or
   *  backward, is "replay from the start up to here". `epochRef` guards
   *  against two overlapping rebuilds (a second scrub landing before the
   *  first's async paperReady() resolves): only the most recent call's
   *  continuation is allowed to touch engineRef/layerStateRef once it
   *  resumes. */
  const rebuildEngine = useCallback((targetElapsedMs: number, resumePlaying: boolean) => {
    const canvas = canvasRef.current
    if (!canvas || !room || !ops) return
    stopLoop()
    setPlaying(false)
    const myEpoch = ++epochRef.current

    engineRef.current?.destroy()
    const engine = createEngine(canvas, room)
    engineRef.current = engine
    setReady(false)

    void (async () => {
      await engine.paperReady()
      if (epochRef.current !== myEpoch) return // superseded by a newer rebuild

      const timeline = timelineRef.current
      const clamped = Math.min(Math.max(targetElapsedMs, 0), timeline.durationMs)
      const targetIndex = appliedCountForElapsed(timeline.offsetsMs, clamped)
      engine.suspendDisplay()
      applyOpsInstant(engine, 0, targetIndex)
      engine.resumeDisplay()
      appliedCountRef.current = targetIndex

      if (room.infinite) {
        const el = viewportElRef.current
        fitInfiniteCamera(engine, Object.keys(layerStateRef.current.items), el?.clientWidth ?? 0, el?.clientHeight ?? 0)
      }

      anchorRef.current = { wallMs: performance.now(), elapsedMs: clamped }
      setElapsedMs(clamped)
      setReady(true)
      if (resumePlaying) {
        setPlaying(true)
        stopLoop()
        rafRef.current = requestAnimationFrame(tick)
      }
    })()
  }, [room, ops, createEngine, applyOpsInstant, stopLoop, tick])

  // ── mount / room change ─────────────────────────────────────────────────
  useEffect(() => {
    if (!room || !ops) return
    timelineRef.current = buildTimeline(ops)
    setDurationMs(timelineRef.current.durationMs)
    rebuildEngine(0, false)
    return () => {
      // Deliberately reads engineRef.current live, not a copy captured when
      // this effect ran: rebuildEngine (seeks) can have swapped in a whole
      // new engine instance since then, and unmount must tear down whichever
      // one is actually live, not a stale reference to the one from mount —
      // not a DOM ref, so the "value may have changed" concern this rule
      // warns about is exactly the behavior wanted here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      epochRef.current++
      stopLoop()
      engineRef.current?.destroy()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuildEngine/stopLoop only change identity when room/ops themselves do
  }, [room, ops])

  // ── infinite canvas: backing store tracks the viewport container's size ──
  useEffect(() => {
    if (!room?.infinite) return
    const el = viewportElRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      const nz = deviceNativeZoom()
      if (width > 0 && height > 0) engineRef.current?.resizeCanvas(Math.round(width / nz), Math.round(height / nz))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [room?.infinite, ready]) // eslint-disable-line react-hooks/exhaustive-deps -- `engine` read live via engineRef, not a dep

  const handlePlay = useCallback(() => {
    if (!ready || !ops) return
    const timeline = timelineRef.current
    if (anchorRef.current.elapsedMs >= timeline.durationMs) {
      rebuildEngine(0, true)
      return
    }
    anchorRef.current = { wallMs: performance.now(), elapsedMs: anchorRef.current.elapsedMs }
    setPlaying(true)
    stopLoop()
    rafRef.current = requestAnimationFrame(tick)
  }, [ready, ops, rebuildEngine, stopLoop, tick])

  const handlePause = useCallback(() => {
    stopLoop()
    setPlaying(false)
    const engine = engineRef.current
    // A stroke mid-reveal keeps animating on the engine's own internal
    // timer regardless of our rAF loop (see PeerPreviewState's doc comment
    // — setTimeout, not rAF, so it survives a backgrounded tab) — pausing
    // must stop that too, or the line would keep drawing itself while
    // "paused". Completing it instantly rather than freezing it mid-stroke:
    // there's no engine API to suspend-and-resume a partial reveal, and a
    // half-drawn line hanging there until Play is pressed again would read
    // as broken, not paused.
    if (engine && inFlightRef.current) {
      const { op } = inFlightRef.current
      const dropped = engine.dropPendingPreview(op.id)
      engine.appendOperation(dropped ?? op, 'remote')
      appliedCountRef.current = inFlightRef.current.index + 1
      inFlightRef.current = null
    }
    const timeline = timelineRef.current
    const projected = Math.min(
      currentElapsedMs(anchorRef.current.wallMs, anchorRef.current.elapsedMs, speedRef.current, performance.now()),
      timeline.durationMs,
    )
    anchorRef.current = { wallMs: performance.now(), elapsedMs: projected }
    setElapsedMs(projected)
  }, [stopLoop])

  const handleSpeedChange = useCallback((next: Speed) => {
    const timeline = timelineRef.current
    const projected = Math.min(
      currentElapsedMs(anchorRef.current.wallMs, anchorRef.current.elapsedMs, speedRef.current, performance.now()),
      timeline.durationMs,
    )
    anchorRef.current = { wallMs: performance.now(), elapsedMs: projected }
    speedRef.current = next
    setSpeed(next)
  }, [])

  const handleSeekCommit = useCallback((targetMs: number, resume: boolean) => {
    rebuildEngine(targetMs, resume)
  }, [rebuildEngine])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/my-lessons" className={styles.backLink}>
          <Icon name="arrow_back" />
        </Link>
        <div className={styles.title}>{room?.name ?? 'Lesson replay'}</div>
      </header>

      <div ref={viewportElRef} className={styles.viewport}>
        {isLoading && <div className={styles.status}>Loading replay…</div>}
        {isError && (
          <div className={styles.status}>
            {error instanceof ApiError && error.status === 403
              ? 'You don’t have access to this lesson’s replay.'
              : 'This lesson replay could not be loaded.'}
          </div>
        )}
        {room && ops && ops.length === 0 && (
          <div className={styles.status}>Nothing was drawn in this lesson yet.</div>
        )}
        {room && (
          <div className={styles.canvasWrap} style={room.infinite ? undefined : { maxWidth: '100%', maxHeight: '100%' }}>
            <canvas
              ref={canvasRef}
              width={room.infinite ? undefined : (room.canvasWidth ?? PLACEHOLDER_INFINITE_CANVAS_SIZE)}
              height={room.infinite ? undefined : (room.canvasHeight ?? PLACEHOLDER_INFINITE_CANVAS_SIZE)}
              className={styles.canvas}
              style={room.infinite ? { width: '100%', height: '100%' } : undefined}
            />
          </div>
        )}
      </div>

      {room && ops && ops.length > 0 && (
        <PlayerControls
          playing={playing}
          onPlay={handlePlay}
          onPause={handlePause}
          elapsedMs={elapsedMs}
          durationMs={durationMs}
          speed={speed}
          onSpeedChange={handleSpeedChange}
          onSeekCommit={handleSeekCommit}
          disabled={!ready}
        />
      )}
    </div>
  )
}
