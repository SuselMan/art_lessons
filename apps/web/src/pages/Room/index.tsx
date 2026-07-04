import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { clamp } from 'lodash-es'
import { nanoid } from 'nanoid'
import type { LayerState, OperationDraft } from '@art-lessons/shared'
import { BACKGROUND_LAYER_ID } from '@art-lessons/shared'
import { PencilEngine, type PencilEngineAPI } from '../../engine'
import { LayerPanel } from '../../components/LayerPanel'
import { Icon } from '../../components/Icon'
import { computeCompositeOrder, replayLayerState, overlayLocalFields } from '../../lib/layers'
import { useViewport } from './useViewport'
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
// Single-user id until auth lands (#41); the server will assign real ids.
const LOCAL_USER_ID = 'local'

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

  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const engineRef     = useRef<PencilEngineAPI | null>(null)
  const layerStateRef = useRef<LayerState>(layerState)
  const initialToolRef = useRef({ pencil, size: pencilCfg.size, opacity: pencilCfg.opacity })

  layerStateRef.current = layerState

  const activeCfg    = tool === 'pencil' ? pencilCfg : eraserCfg
  const setActiveCfg = tool === 'pencil' ? setPencilCfg : setEraserCfg

  const { vp, setVp, vpRef, fitCanvas, angleDeg, canvasTransform } = useViewport(config)

  // ── load config ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { navigate('/create'); return }
    const raw = localStorage.getItem(`room_${id}`)
    if (!raw) { navigate('/create'); return }
    setConfig(JSON.parse(raw))
  }, [id, navigate])

  // ── mount engine ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!config || !canvasRef.current) return
    const engine = new PencilEngine(canvasRef.current, {
      paper: config.paper,
      pencilType: initialToolRef.current.pencil,
      size: initialToolRef.current.size,
      opacity: initialToolRef.current.opacity,
      userId: LOCAL_USER_ID,
    })
    engineRef.current = engine

    const ls = layerStateRef.current
    for (const id of ls.rootOrder) {
      if (ls.items[id]?.kind === 'layer') engine.initLayer(id)
    }
    engine.setActiveLayer(ls.activeId)
    engine.setCompositeOrder(computeCompositeOrder(ls))

    return () => { engine.destroy(); engineRef.current = null }
  }, [config])

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

  // ── operation log bridge ──────────────────────────────────────────────────────
  // LayerState is derived: base room state + replay of done operations, with
  // per-user view fields (selection, collapse, local lock) carried over.
  const syncFromLog = useCallback(() => {
    const ops = engineRef.current?.getOperations() ?? []
    setLayerState(prev => overlayLocalFields(replayLayerState(makeInitialLayerState(), ops), prev))
  }, [])

  const dispatchOp = useCallback((draft: OperationDraft) => {
    const op = { ...draft, id: nanoid(10), userId: LOCAL_USER_ID, timestamp: Date.now() }
    engineRef.current?.appendOperation(op)
    syncFromLog()
  }, [syncFromLog])

  const handleUndo = useCallback(() => {
    if (engineRef.current?.undo()) syncFromLog()
  }, [syncFromLog])

  const handleRedo = useCallback(() => {
    if (engineRef.current?.redo()) syncFromLog()
  }, [syncFromLog])

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
