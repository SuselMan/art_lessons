import { createContext, loadPaperTexture, makeQuad, probeFloatTargets } from './gl.js'
import { DEFAULTS, Sim } from './sim.js'
import { Brush } from './brush.js'
import { PIGMENTS } from './pigments.js'
import { buildScript, ScriptRunner } from './script.js'

const q = new URLSearchParams(location.search)
const N = parseInt(q.get('size') || '1024', 10)
const $ = (id) => document.getElementById(id)
const canvas = $('c')
const hud = $('hud')

const stats = { fps: 0, frameMs: 0, simMs: 0, stepMs: 0, steps: 0, sub: 0, mark: null, type: '', n: N }
window.__wc = { stats, ready: false }

function fail(e) {
  console.error(e)
  $('err').textContent = String(e && e.message || e)
  window.__wc.error = String(e && e.message || e)
}

async function init() {
  canvas.width = N
  canvas.height = N
  const gl = createContext(canvas, { preserve: q.has('shots') || q.has('preserve') })
  const quad = makeQuad(gl)
  const probe = probeFloatTargets(gl, quad)
  window.__wc.probe = probe
  const want = q.get('prec') || 'auto'
  const usable = probe.results.filter((r) => r.renders)
  const pick = want === 'half' ? usable.find((r) => r.name === 'half16')
    : want === 'float' ? usable.find((r) => r.name === 'float32')
    : usable.find((r) => r.name === 'float32') || usable[0]
  if (!pick) throw new Error('Нет рендерящегося float/half-float формата: ' + JSON.stringify(probe))
  stats.type = pick.name + (pick.precise ? '' : ' (fp16-точность)')

  const paper = await loadPaperTexture(gl, './paper-coarse.png')
  const sim = new Sim(gl, quad, N, pick.type, paper)
  for (const [k, v] of q) if (k.startsWith('p.') && k.slice(2) in sim.P) sim.P[k.slice(2)] = parseFloat(v)
  const brush = new Brush(N)
  window.__wc.sim = sim
  window.__wc.brush = brush
  window.__wc.shaderSizes = sim.shaderSizes()

  let sub = parseInt(q.get('sub') || '8', 10)
  let paused = false
  let view = 0
  let runner = null
  let scriptSub = parseInt(q.get('fast') || '0', 10)

  // ---------- UI ----------
  const sw = $('swatches')
  PIGMENTS.forEach((p, i) => {
    const d = document.createElement('div')
    d.className = 'sw'
    d.style.background = p.swatch
    d.title = p.name
    d.onclick = () => { brush.slot = i; syncUI() }
    sw.appendChild(d)
  })
  const bindRange = (id, get, set, fmt = (v) => v) => {
    const el = $(id)
    el.value = get()
    const show = () => { $('v-' + id).textContent = fmt(get()) }
    el.oninput = () => { set(parseFloat(el.value)); show() }
    show()
  }
  bindRange('size', () => brush.size, (v) => { brush.size = v })
  bindRange('water', () => brush.water, (v) => { brush.water = v }, (v) => v.toFixed(2))
  bindRange('pigment', () => brush.pigment, (v) => { brush.pigment = v }, (v) => v.toFixed(2))
  bindRange('sub', () => sub, (v) => { sub = v })
  function syncUI() {
    ;[...sw.children].forEach((c, i) => c.classList.toggle('on', i === brush.slot))
    $('pigName').textContent = PIGMENTS[brush.slot].name
    for (const id of ['size', 'water', 'pigment']) { $(id).value = brush[id]; $('v-' + id).textContent = (+brush[id]).toFixed(id === 'size' ? 0 : 2) }
  }
  syncUI()
  $('clear').onclick = () => { sim.clear(); runner = null }
  $('dry').onclick = () => sim.dryAll()
  $('pause').onclick = () => { paused = !paused; $('pause').classList.toggle('on', paused) }
  $('script').onclick = () => startScript()
  $('view').onchange = (e) => { view = +e.target.value }

  // physics knobs, generated from DEFAULTS
  const body = $('physBody')
  for (const k of Object.keys(DEFAULTS)) {
    const v0 = DEFAULTS[k]
    const lab = document.createElement('label')
    lab.className = 'r'
    const max = v0 === 0 ? 1 : v0 * 4
    lab.innerHTML = `${k} <span class="v"></span><input type="range" min="0" max="${max}" step="${max / 400}">`
    const inp = lab.querySelector('input'), span = lab.querySelector('span')
    inp.value = sim.P[k]
    const show = () => { span.textContent = (+sim.P[k]).toPrecision(2) }
    inp.oninput = () => { sim.P[k] = parseFloat(inp.value); show() }
    show()
    body.appendChild(lab)
  }

  // ---------- canvas fit ----------
  function fit() {
    const st = $('stage').getBoundingClientRect()
    const s = Math.floor(Math.min(st.width, st.height) - 16)
    canvas.style.width = s + 'px'
    canvas.style.height = s + 'px'
  }
  window.addEventListener('resize', fit)
  fit()

  // ---------- input ----------
  const toCell = (e) => {
    const r = canvas.getBoundingClientRect()
    const p = e.pointerType === 'mouse' ? 0.6 : (e.pressure || 0.5)
    return [((e.clientX - r.left) / r.width) * N, (1 - (e.clientY - r.top) / r.height) * N, p]
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    if (driven) return // the rig is driving a script; a stray click must not kill it
    canvas.setPointerCapture(e.pointerId)
    runner = null
    brush.pointerDown(...toCell(e))
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!brush.down) return
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
    for (const ev of (evs.length ? evs : [e])) brush.pointerMove(...toCell(ev))
  })
  const up = () => brush.pointerUp()
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })

  // ---------- script ----------
  function startScript() {
    sim.clear()
    const opts = {}
    if (q.has('bloomAt')) opts.bloomAt = parseInt(q.get('bloomAt'), 10)
    if (q.has('dampFrac')) opts.dampFrac = parseFloat(q.get('dampFrac'))
    if (q.has('dropDelay')) opts.dropDelay = parseInt(q.get('dropDelay'), 10)
    opts.name = q.get('script') || 'all'
    runner = new ScriptRunner(sim, brush, buildScript(opts), (name) => {
      stats.mark = name
      window.__wc.marks = [...(window.__wc.marks || []), { name, step: sim.steps }]
      if (q.has('shots') && name !== 'done') runner.paused = true
    })
    window.__wc.runner = runner
  }
  window.__wc.startScript = startScript
  window.__wc.resume = () => { if (runner) runner.paused = false }
  window.__wc.setSub = (v) => { sub = v }
  window.__wc.setScriptSub = (v) => { scriptSub = v }
  window.__wc.setView = (v) => { view = v }
  window.__wc.dryAll = () => sim.dryAll()
  window.__wc.totals = () => sim.totals()
  window.__wc.clear = () => sim.clear()
  // GPU cost of one substep, synchronous (gl.finish-style via readPixels)
  // (whole canvas active: the worst case, every cell simulated)
  window.__wc.benchSteps = (n = 200) => {
    const keep = sim.useRegion
    sim.useRegion = false
    sim.finish()
    const t0 = performance.now()
    for (let i = 0; i < n; i++) sim.step()
    sim.finish()
    const ms = (performance.now() - t0) / n
    sim.useRegion = keep
    if (keep) sim.region = null
    return ms
  }
  window.__wc.benchRender = (n = 60) => {
    sim.finish()
    const t0 = performance.now()
    for (let i = 0; i < n; i++) sim.render(N, N, view)
    sim.finish()
    return (performance.now() - t0) / n
  }

  // Headless-style driving for the rig: step the script synchronously from
  // page.evaluate, independent of rAF (which a hidden/occluded window stops).
  var driven = q.has('drive')
  window.__wc.runScriptSteps = (n) => {
    driven = true
    if (!runner) return { done: true }
    for (let i = 0; i < n && !runner.done && !runner.paused; i++) {
      sim.brush = runner.tick()
      if (runner.paused || runner.done) break
      sim.step()
      if (i % 256 === 255) sim.finish()
    }
    sim.finish()
    return { done: runner.done, paused: runner.paused, steps: sim.steps }
  }
  window.__wc.renderNow = () => { sim.render(N, N, view); sim.finish() }

  // ---------- loop ----------
  let last = performance.now(), acc = 0, frames = 0, simAcc = 0, lastHud = last
  const syncTiming = q.has('sync')
  function frame(now) {
    const dt = now - last
    last = now
    if (!paused && !driven) {
      const t0 = performance.now()
      const nSub = runner && !runner.done && scriptSub ? scriptSub : sub
      brush.beginFrame()
      for (let k = 0; k < nSub; k++) {
        sim.brush = runner && !runner.done ? runner.tick() : brush.substep(k, nSub)
        if (runner && runner.paused) break
        sim.step()
      }
      if (syncTiming) sim.finish()
      simAcc += performance.now() - t0
      stats.sub = nSub
    }
    sim.render(N, N, view)
    acc += dt; frames++
    if (now - lastHud > 500) {
      stats.fps = (1000 * frames) / acc
      stats.frameMs = acc / frames
      stats.simMs = simAcc / frames
      stats.steps = sim.steps
      acc = 0; frames = 0; simAcc = 0; lastHud = now
      hud.textContent =
        `${stats.fps.toFixed(0)} fps  кадр ${stats.frameMs.toFixed(1)} мс\n` +
        `симуляция ${stats.simMs.toFixed(1)} мс${syncTiming ? ' (sync)' : ' (CPU)'}\n` +
        `${stats.sub} шаг/кадр, ${N}², ${stats.type}\n` +
        `шагов ${sim.steps}${stats.mark ? '  метка ' + stats.mark : ''}${paused ? '  ПАУЗА' : ''}`
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  window.__wc.ready = true
  if (q.has('script')) startScript()
}

init().catch(fail)
