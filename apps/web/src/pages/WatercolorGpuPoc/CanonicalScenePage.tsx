import { useEffect, useRef, useState } from 'react'
import type { StrokeOperation } from '@grafetto/shared'
import { createCanonicalWatercolorScene, watercolorPresetString, type CanonicalSceneSession, type CanonicalSceneSettings } from '../../engine'
import styles from './styles.module.css'

declare global { interface Window { __canonicalNativeScene?: CanonicalSceneSession } }

export function CanonicalScenePage() {
 const [boundedSettle] = useState(() => new URLSearchParams(window.location.search).get('boundedSettle') === '1')
 const canvas = useRef<HTMLCanvasElement>(null), scene = useRef<CanonicalSceneSession | null>(null)
 const operations = useRef<StrokeOperation[]>([])
 const [version, setVersion] = useState(0), [size, setSize] = useState(100)
 const [water, setWater] = useState(100), [pigment, setPigment] = useState(100), [color, setColor] = useState('#663399')
 const [nib, setNib] = useState<'round' | 'chisel'>('round'), [status, setStatus] = useState('Подготовка бумаги и WebGPU…')
 const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [count, setCount] = useState(0)
 const settings = useRef<CanonicalSceneSettings>(null!)
 settings.current = { tool: 'watercolor', preset: watercolorPresetString('normal', { water: water / 100, pigment: pigment / 100 }, 'PB29', nib), color: [parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255], size, opacity: 1, nibAngle: { angle: 0, anchor: 'canvas' }, tiltResponse: 'smooth' }
 useEffect(() => {
  let cancelled = false, owned: CanonicalSceneSession | null = null
  setReady(false); setBusy(false); setStatus('Подготовка бумаги и WebGPU…')
  void createCanonicalWatercolorScene(canvas.current!, {
   onStatus: message => { if (!cancelled) setStatus(message) },
   onOperation: operation => { if (operation.type === 'stroke' && !cancelled) { operations.current.push(operation); setCount(operations.current.length) } },
  }).then(value => {
   if (cancelled) { value.destroy(); return }
   owned = value; scene.current = value; window.__canonicalNativeScene = value
   if (boundedSettle) value.runner.setDiagnosticProgressiveQuantum({ maxOps: 8, cpuBudgetMs: 4 })
   value.attach(() => settings.current); setReady(true); setStatus('Можно рисовать')
  }, error => { if (!cancelled) setStatus(String(error)) })
  return () => { cancelled = true; owned?.destroy(); if (scene.current === owned) scene.current = null; if (window.__canonicalNativeScene === owned) delete window.__canonicalNativeScene }
 }, [version, boundedSettle])
 async function replay() {
  const value = scene.current
  if (!value || !value.isIdle) { setStatus('Дождись завершения текущего штриха.'); return }
  setBusy(true); setStatus('Перерисовка записанных мазков…')
  try { await value.replay(operations.current); setStatus('Перерисовка закончена') } catch (error) { setStatus(String(error)) } finally { setBusy(false) }
 }
 function download() {
  const blob = new Blob([JSON.stringify({ version: 1, engine: 'canonical-webgpu-bounded', operations: operations.current }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'canonical-watercolor-strokes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
 }
 return <main className={styles.page}>
  <h1>Акварель Grafetto · WebGPU</h1>
  <p className={styles.notice}>Эксперимент с текущей моделью акварели. Один холст, следующий штрих после завершения расчёта предыдущего. Во время осадка показываются промежуточные поля растекания.{boundedSettle && ' Включён эксперимент с ускоренным расчётом между кадрами.'}</p>
  <div className={styles.controls}>
   <label>Кисть <input aria-label="Размер кисти" type="range" min="20" max="400" value={size} onChange={e => setSize(+e.target.value)} />{size}</label>
   <label>Вода <input aria-label="Вода" type="range" min="0" max="100" value={water} onChange={e => setWater(+e.target.value)} />{water}%</label>
   <label>Пигмент <input aria-label="Пигмент" type="range" min="0" max="100" value={pigment} onChange={e => setPigment(+e.target.value)} />{pigment}%</label>
   <label>Цвет <input aria-label="Цвет" type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
   <label>Кончик <select value={nib} onChange={e => setNib(e.target.value as 'round' | 'chisel')}><option value="round">Круглый</option><option value="chisel">Плоский</option></select></label>
  </div>
  <div className={styles.actions}>
   <button onClick={() => { operations.current = []; setCount(0); setVersion(v => v + 1) }}>Очистить</button>
   <button disabled={!ready || busy || !count} onClick={() => void replay()}>Перерисовать</button>
   <button disabled={!count} onClick={download}>Сохранить мазки</button>
  </div>
  <p role="status">{status} · записано мазков: {count}</p>
  <div className={styles.canvases}><figure><canvas className={styles.nativeCanvas} ref={canvas} /></figure></div>
 </main>
}
