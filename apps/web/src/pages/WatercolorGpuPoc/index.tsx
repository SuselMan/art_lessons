import { useEffect, useRef, useState } from 'react'
import type { Dab, StrokeOperation } from '@grafetto/shared'
import { WatercolorGpuPoc, GPU_WORLD, makeDab, packGpuDabs, pocPreset } from '../../engine/webgpuPoc'
import type { BrushOptions, GpuStroke, InputPoint } from '../../engine/webgpuPoc'
import type { PencilEngine } from '../../engine'
import styles from './styles.module.css'

type TickEvent = { tick: number; data?: number[]; dry?: boolean; stroke?: number }
type Journal = { version: 1; events: TickEvent[]; ticks: number; strokes: GpuStroke[] }
export function WatercolorGpuPocPage() {
  const canvas = useRef<HTMLCanvasElement>(null), comparison = useRef<HTMLCanvasElement>(null)
  const engine = useRef<WatercolorGpuPoc | null>(null), baseline = useRef<PencilEngine | null>(null)
  const tick = useRef(0), events = useRef<TickEvent[]>([]), strokes = useRef<GpuStroke[]>([])
  const pointer = useRef<{ id: number; options: BrushOptions; previous: Dab | null; used: number; dabs: Dab[]; started: number } | null>(null)
  const busyRef = useRef(false)
  const redoTape = useRef<Journal | null>(null)
  const paused = useRef(false), replaying = useRef(false), mounted = useRef(true)
  const [size, setSize] = useState(400), [water, setWater] = useState(100), [pigment, setPigment] = useState(100)
  const [color, setColor] = useState('#663399'), [nib, setNib] = useState<'round' | 'chisel'>('round')
  const [status, setStatus] = useState('Requesting WebGPU adapter…'), [ready, setReady] = useState(false)
  const [metrics, setMetrics] = useState(''), [busy, setBusy] = useState(false), [baselineVisible, setBaselineVisible] = useState(false)
  const [baselineImage, setBaselineImage] = useState('')
  const [baselineStatus, setBaselineStatus] = useState(''), [pausedUi, setPausedUi] = useState(false)
  const options = (): BrushOptions => ({ size, water: water / 100, pigment: pigment / 100, color: [parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255], nib })
  useEffect(() => {
    mounted.current = true
    let frame = 0, last = performance.now(), elapsed = 0, report = 0
    const draw = (now: number) => {
      elapsed += Math.min(now - last, 100); last = now
      if (engine.current && !paused.current && !replaying.current) {
        // Fixed ticks are written into the journal; replay does not use wall-clock.
        let steps = 0
        while (elapsed >= 1000 / 60 && steps < 1 && engine.current.canStep) { engine.current.step(); tick.current++; elapsed -= 1000 / 60; steps++ }
      } else elapsed = 0
      if (now - report > 500 && engine.current) {
        const m = engine.current.metrics
        setMetrics(`${m.adapter || 'WebGPU adapter'} · ${m.memoryBytes / 1048576 | 0} MiB fields · ${m.dabs} dabs · ${m.solverSteps} ticks · CPU submit ${m.cpuSubmitMs.toFixed(1)} ms total · GPU solve ${m.gpuMs === null ? 'timer unavailable / pending' : `${m.gpuMs.toFixed(3)} ms last sample`}`)
        report = now
      }
      frame = requestAnimationFrame(draw)
    }
    void WatercolorGpuPoc.create(canvas.current!, message => { if (mounted.current) { setStatus(message); setReady(false); paused.current = true } }).then(value => {
      if (!mounted.current) { value.destroy(); return }
      engine.current = value; window.__watercolorGpuPoc = value; setReady(true); setStatus('WebGPU · independent float compute model · no room writes')
      frame = requestAnimationFrame(draw)
    }).catch(error => { if (mounted.current) setStatus(String(error)) })
    return () => { mounted.current = false; cancelAnimationFrame(frame); engine.current?.destroy(); engine.current = null; delete window.__watercolorGpuPoc; baseline.current?.destroy(); baseline.current = null }
  }, [])
  function send(data: Float32Array) {
    if (!engine.current) return
    for (let k = 0; k < data.length; k += 64 * 16) {
      const part = data.subarray(k, k + 64 * 16)
      engine.current.addDabs(part); events.current.push({ tick: tick.current, data: Array.from(part), stroke: strokes.current.length })
    }
    engine.current.draw()
  }
  function point(event: React.PointerEvent<HTMLCanvasElement>): InputPoint {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - box.left) / box.width * GPU_WORLD.width, y: (event.clientY - box.top) / box.height * GPU_WORLD.height, pressure: event.pointerType === 'mouse' ? 0.8 : Math.max(event.pressure, 0.03), t: performance.now() - (pointer.current?.started ?? performance.now()) }
  }
  function begin(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready || busyRef.current || event.button !== 0) return
    event.preventDefault(); paused.current = false; setPausedUi(false); redoTape.current = null; event.currentTarget.setPointerCapture(event.pointerId)
    pointer.current = { id: event.pointerId, options: options(), previous: null, used: 0, dabs: [], started: performance.now() }
    move(event)
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const active = pointer.current
    if (!active || active.id !== event.pointerId || busyRef.current) return
    event.preventDefault()
    const p = point(event), target = makeDab(p, active.options), from = active.previous
    const batch: Dab[] = []
    if (!from) batch.push(target)
    else {
      const distance = Math.hypot(target.x - from.x, target.y - from.y)
      const n = Math.ceil(distance / Math.max(2, target.size * 0.025))
      for (let k = 1; k <= n; k++) { const f = k / n; batch.push({ ...target, x: from.x + (target.x - from.x) * f, y: from.y + (target.y - from.y) * f, t: from.t + (target.t - from.t) * f }) }
    }
    if (!batch.length) return
    const packed = packGpuDabs(batch, active.options, active.used, active.previous)
    active.used = packed.travelled; active.previous = packed.previous; active.dabs.push(...batch); send(packed.data)
  }
  function finish(event: React.PointerEvent<HTMLCanvasElement>) {
    const active = pointer.current
    if (!active || active.id !== event.pointerId) return
    pointer.current = null
    if (!active.dabs.length) return
    recordStroke(active.dabs, active.options)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function recordStroke(dabs: Dab[], brush: BrushOptions) {
    const id = `webgpu-poc-${strokes.current.length}`
    const operation: StrokeOperation = { type: 'stroke', id, userId: 'webgpu-poc', timestamp: Date.now(), layerId: 'webgpu-layer', tool: 'watercolor', preset: pocPreset(brush), color: brush.color, dabs, strokeId: id, washId: 'webgpu-poc-wash' }
    strokes.current.push({ operation, water: brush.water, pigment: brush.pigment })
  }
  function clear() {
    engine.current?.clear(); tick.current = 0; events.current = []; strokes.current = []; pointer.current = null; redoTape.current = null; setBaselineVisible(false)
  }
  function journal(): Journal { return { version: 1, events: events.current, ticks: tick.current, strokes: strokes.current } }
  async function replay(tape = journal(), nested = false) {
    if (!engine.current || (busyRef.current && !nested)) return
    const alreadyBusy = busyRef.current
    busyRef.current = true; setBusy(true); replaying.current = true; engine.current.clear()
    let k = 0
    try {
      for (let t = 0; t <= tape.ticks; t++) {
        let dryTick = false
        while (k < tape.events.length && tape.events[k].tick === t) {
          const event = tape.events[k++]
          if (event.data) engine.current.addDabs(new Float32Array(event.data))
          if (event.dry) { engine.current.step(1 / 60, true); dryTick = true }
        }
        if (t < tape.ticks && !dryTick) engine.current.step()
        if (t % 8 === 0) { await engine.current.whenIdle(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
      }
      tick.current = tape.ticks; events.current = tape.events; strokes.current = tape.strokes; engine.current.draw()
      setStatus('Replay complete: same recorded deposits and fixed simulation ticks.')
    } finally { replaying.current = false; if (!alreadyBusy) { busyRef.current = false; setBusy(false) } }
  }
  async function runDiagnostic(task: () => Promise<void>) {
    if (!engine.current || busyRef.current) return
    const wasPaused = paused.current
    busyRef.current = true; setBusy(true); paused.current = true; setPausedUi(true)
    try { await engine.current.whenIdle(); await task() }
    catch (error) { setStatus(String(error)) }
    finally { paused.current = wasPaused; setPausedUi(wasPaused); busyRef.current = false; setBusy(false) }
  }
  async function checkReplay() {
    await runDiagnostic(async () => {
      const tape = journal(), before = await engine.current!.readState()
      await replay(tape, true)
      const after = await engine.current!.readState()
      const beforeBits = new Uint32Array(before.buffer, before.byteOffset, before.length), afterBits = new Uint32Array(after.buffer, after.byteOffset, after.length)
      let different = 0, max = 0
      for (let k = 0; k < before.length; k++) { if (beforeBits[k] !== afterBits[k]) different++; max = Math.max(max, Math.abs(before[k] - after[k])) }
      setStatus(`Same-device replay: ${different} different floats (bitwise), max |Δ|=${max}. Float compute is not cross-device bitwise guaranteed.`)
    })
  }
  function sample(which: 'zigzag' | 'water' | 'mix') {
    clear(); paused.current = false; setPausedUi(false)
    const base = options()
    const paths: { points: [number, number][]; brush: BrushOptions }[] = []
    if (which === 'water') {
      paths.push({ points: [[200, 380], [820, 380]], brush: { ...base, size: 300, pigment: 0, water: 1 } })
      paths.push({ points: [[220, 380], [800, 380]], brush: { ...base, size: 100, water: 0.05, pigment: 1 } })
    } else if (which === 'mix') {
      paths.push({ points: [[180, 380], [820, 380]], brush: { ...base, size: 300, pigment: 0, water: 1 } })
      paths.push({ points: [[320, 200], [500, 550]], brush: { ...base, size: 120, color: [0.90, 0.74, 0.12], water: 1 } })
      paths.push({ points: [[650, 200], [460, 550]], brush: { ...base, size: 120, color: [0.10, 0.45, 0.65], water: 1 } })
    } else paths.push({ points: [[230, 220], [750, 280], [250, 330], [750, 380], [250, 430], [750, 480], [250, 550]], brush: { ...base, size: 160 } })
    for (const path of paths) {
      const dabs: Dab[] = []
      for (let n = 0; n < path.points.length - 1; n++) {
        const [x, y] = path.points[n], [tx, ty] = path.points[n + 1]
        const count = Math.ceil(Math.hypot(tx - x, ty - y) / 6)
        for (let k = n ? 1 : 0; k <= count; k++) dabs.push(makeDab({ x: x + (tx - x) * k / count, y: y + (ty - y) * k / count, pressure: 0.8, t: dabs.length * 8 }, path.brush))
      }
      const packed = packGpuDabs(dabs, path.brush, 0, null); send(packed.data); recordStroke(dabs, path.brush)
    }
  }
  async function compare() {
    const target = comparison.current
    if (!target) return
    await runDiagnostic(async () => {
    setBaselineVisible(true); setBaselineImage(''); setBaselineStatus('Replaying the same recorded elliptical dabs in the current WebGL1 engine…')
    try {
      baseline.current?.destroy()
      const { PencilEngine } = await import('../../engine')
      target.width = 1024; target.height = 768
      const value = new PencilEngine(target, { pageWidth: 1024, pageHeight: 768, paper: 'flat', userId: 'webgpu-baseline', joinedTouch: true })
      baseline.current = value
      await value.paperReady()
      value.appendOperation({ type: 'layer_add', id: 'webgpu-layer-add', userId: 'webgpu-baseline', timestamp: 0, layerId: 'webgpu-layer', name: 'Comparison' }, 'remote')
      value.setCompositeOrder([{ id: 'webgpu-layer', opacity: 1 }])
      const start = performance.now()
      for (const stroke of strokes.current) { value.appendOperation(stroke.operation, 'remote'); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
      value.watercolorDryAll()
      const blob = await value.exportPNG(false)
      const wall = performance.now() - start
      if (!blob) throw new Error('WebGL export failed')
      // Export redraw is camera-independent; present it directly after releasing engine resources.
      const bitmap = await createImageBitmap(blob); value.destroy(); baseline.current = null
      target.width = 1024; target.height = 768
      // A WebGL canvas cannot change context type; place an image over it instead.
      setBaselineStatus(`Same ${strokes.current.length} stroke inputs. WebGL dry replay + export wall ${wall.toFixed(0)} ms (not comparable to a single GPU tick). Flat baseline paper; PoC paper / deposit / solver differ.`)
      const image = document.createElement('canvas'); image.width = 1024; image.height = 768
      image.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close()
      setBaselineImage(image.toDataURL())
    } catch (error) { setBaselineStatus(String(error)) }
    })
  }
  async function undo() {
    if (!strokes.current.length || busyRef.current) return
    const saved = journal(); redoTape.current = saved
    await replay({ ...saved, strokes: saved.strokes.slice(0, -1), events: saved.events.filter(e => e.stroke === undefined || e.stroke < saved.strokes.length - 1) })
    setStatus('Prototype undo recomputed the complete fixed-tick history.')
  }
  async function inspectMass() {
    await runDiagnostic(async () => {
      const savedTick = engine.current!.tickCount
      const before = await engine.current!.readState()
      const total = (field: Float32Array) => {
        const mass = [0, 0, 0, 0]; let negative = 0
        for (let k = 0; k < field.length; k += 16) for (let ch = 0; ch < 4; ch++) {
          mass[ch] += field[k + ch] + field[k + 4 + ch]
          if (field[k + ch] < -1e-6 || field[k + 4 + ch] < -1e-6) negative++
        }
        return { mass, negative }
      }
      try {
      for (let n = 0; n < 30; n++) engine.current!.step(0)
      const after = await engine.current!.readState(), a = total(before), b = total(after)
      setStatus(`30 transport ticks / no evaporation: relative mass drift ${Math.max(...a.mass.map((v, k) => Math.abs(b.mass[k] - v) / Math.max(v, 1e-8))).toExponential(3)}; negative channels ${b.negative}. Float rounding remains.`)
      } finally { engine.current!.writeState(before, savedTick) }
    })
  }
  function download() {
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(journal())], { type: 'application/json' }))
    link.href = url; link.download = 'watercolor-webgpu-journal.json'; link.click(); URL.revokeObjectURL(url)
  }
  return <main className={styles.page}>
    <h1>Watercolor · WebGPU PoC</h1>
    <p className={styles.notice}>Independent experimental compute model. Water, mobile pigment and settled pigment stay on the GPU. This is a test canvas; it does not change or save Grafetto rooms.</p>
    <div className={styles.controls}>
      <label>Brush <input type="range" min="10" max="400" value={size} onChange={e => setSize(+e.target.value)} />{size}</label>
      <label>Water <input type="range" min="0" max="100" value={water} onChange={e => setWater(+e.target.value)} />{water}%</label>
      <label>Pigment <input type="range" min="0" max="100" value={pigment} onChange={e => setPigment(+e.target.value)} />{pigment}%</label>
      <label>Color <input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
      <label>Nib <select value={nib} onChange={e => setNib(e.target.value === 'chisel' ? 'chisel' : 'round')}><option>round</option><option>chisel</option></select></label>
    </div>
    <div className={styles.actions}>
      <button disabled={!ready || busy} onClick={clear}>Clear</button>
      <button disabled={!ready || busy} onClick={() => { events.current.push({ tick: tick.current, dry: true }); engine.current?.step(1 / 60, true); tick.current++; setStatus('Dry-all is immediate in this PoC; accelerated physical drying is separate work.') }}>Dry all</button>
      <button disabled={!ready || busy} onClick={() => { paused.current = !paused.current; setPausedUi(paused.current) }}>{pausedUi ? 'Resume' : 'Pause'}</button>
      <button disabled={!ready || busy} onClick={() => void replay()}>Replay</button>
      <button disabled={!ready || busy} onClick={() => void checkReplay()}>Check replay bytes</button>
      <button disabled={!ready || busy} onClick={() => sample('zigzag')}>Dense zigzag</button>
      <button disabled={!ready || busy} onClick={() => sample('water')}>Paint into water</button>
      <button disabled={!ready || busy} onClick={() => sample('mix')}>Mix colors</button>
      <button disabled={!ready || busy || !strokes.current.length} onClick={() => void compare()}>Compare same dabs · WebGL1</button>
      <button disabled={!ready || busy} onClick={() => void undo()}>Undo</button>
      <button disabled={!ready || busy || !redoTape.current} onClick={() => { const tape = redoTape.current; if (tape) void replay(tape) }}>Redo</button>
      <button disabled={!ready || busy} onClick={() => void inspectMass()}>Check mass</button>
      <button disabled={!ready || busy} onClick={() => void runDiagnostic(async () => { const result = await engine.current!.checkOracle(); setStatus(`Production CPU oracle: ${JSON.stringify(result)}`) })}>Check CPU oracle</button>
      <button disabled={!ready || busy} onClick={() => void runDiagnostic(async () => { const result = await engine.current!.checkCanonicalBrush(); setStatus(`Canonical Q8 brush: ${JSON.stringify(result)}`) })}>Check Q8 brush · WebGL1</button>
      <button disabled={!ready || busy} onClick={download}>Export journal</button>
    </div>
    <p role="status">{busy ? 'Working… ' : ''}{status}</p>
    <p className={styles.notice}>{pausedUi ? 'Simulation paused. Resume or start a new stroke to continue water movement.' : 'Simulation running: water and pigment evolve continuously.'}</p>
    <div className={styles.canvases}>
      <figure><figcaption>WebGPU · live float fields · 512 × 384 simulation / 1024 × 768 world</figcaption><canvas ref={canvas} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} /></figure>
      <figure hidden={!baselineVisible}><figcaption>Current WebGL1 · same stroke inputs · dry output</figcaption><canvas ref={comparison} hidden={!!baselineImage} />{baselineImage && <img src={baselineImage} alt="Current WebGL1 watercolor replay" />}<p>{baselineStatus}</p></figure>
    </div>
    <p className={styles.metrics}>{metrics}</p>
    <details><summary>What differs from production?</summary><p>Shared Dab geometry, pressure response, travel depletion and logarithmic pigment absorption. Experimental multiscale conservative donor transport follows continuous wet paths; a separate legacy nearest-neighbor oracle checks production algebra. Float32 fields replace Q8 writes; the continuous water solver, paper seed, contact advection and deposition normalisation are experimental. Current production tide/front schedules, ribbons, bristle gaps, baked paper, live peers and production layer/undo contracts are not ported yet. WebGPU availability and speed do not establish watercolor quality.</p></details>
  </main>
}
