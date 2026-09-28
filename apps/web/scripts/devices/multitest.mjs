// Multi-device watercolour test through the dev bridge: several devices in one
// room drawing AT ONCE - same layer, different layers, the same spot - with an
// undo and a "dry everything" in the middle; then every device's layers are
// sampled and compared (the room must converge to one picture everywhere), and
// the comparison is repeated after some devices reload.
// Usage: node multitest.mjs <room> name=page [name=page ...]
//   names android / ipad / surface / laptop pick colours and roles; any others
//   work too. The first device is the reference for comparisons.
//   SIZE_SCALE scales every brush size (default 1).
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { call, ev as evSel, joinAndInstall } from './bridge.mjs'

const [room, ...devArgs] = process.argv.slice(2)
if (!room || !devArgs.length) { console.error('usage: node multitest.mjs <room> name=page [name=page ...]'); process.exit(2) }
const devices = devArgs.map(a => { const [name, sel] = a.split('='); return { name, sel } })
const OUTDIR = fileURLToPath(new URL('../../../../temp/device-runs/', import.meta.url))
mkdirSync(OUTDIR, { recursive: true })
const OUT = OUTDIR + `multitest-${Date.now()}.json`
const report = { room, devices: devices.map(d => d.name), rounds: [], checks: [] }
const log = (...a) => { console.log(...a) }
const ev = (dev, code, timeoutMs) => evSel(dev.sel, code, timeoutMs)
// SIZE_SCALE=0.4: the brush sizes of a lesson rather than of a stress test
// (the scenario's own sizes run to 400 px, the tool's maximum).
const SIZE_SCALE = Number(process.env.SIZE_SCALE ?? 1)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Deterministic randomness per device and round.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
const COLORS = { android: [0.75, 0.2, 0.15], ipad: [0.15, 0.35, 0.7], surface: [0.9, 0.7, 0.1], laptop: [0.2, 0.55, 0.3] }
const PRESETS = ['normal:100:0:PB29:round', 'normal:100:70:PB29:round', 'normal:60:100:PB29:round', 'normal:100:100:PB29:flex']

const ensureJoined = dev => joinAndInstall(dev.sel)

async function round(name, plan) {
  // plan: dev -> { layerId, strokes: [{ pts, ms, size, preset }], gapMs }
  log(`-- round ${name}`)
  const t0 = Date.now()
  const results = await Promise.all(devices.map(async dev => {
    const p = plan(dev)
    const out = []
    for (const s of p.strokes) {
      await ev(dev, `return window.__mt.setup(${JSON.stringify({ preset: s.preset, color: COLORS[dev.name] ?? [0.4, 0.4, 0.4], size: Math.max(8, Math.round(s.size * SIZE_SCALE)), layerId: p.layerId })})`)
      const r = await ev(dev, `return await window.__mt.stroke(${JSON.stringify({ pts: s.pts, ms: s.ms })})`, 60000)
      out.push(r)
      await sleep(p.gapMs ?? 300)
    }
    return { dev: dev.name, strokes: out }
  }))
  const summary = results.map(r => `${r.dev}: ${r.strokes.map(s => `${s.over33}/${s.n}${s.over100 ? '!' + s.over100 : ''} max${s.max}`).join(', ')}`)
  log(summary.join('\n'))
  report.rounds.push({ name, ms: Date.now() - t0, results })
}

async function compare(label) {
  await sleep(8000) // settles, reveals, the last confirmations
  const infos = await Promise.all(devices.map(d => ev(d, 'return window.__mt.info()')))
  const layerIds = [...new Set(infos.flatMap(i => i.layers.filter(l => l.ops).map(l => l.id)))]
  const check = { label, ops: Object.fromEntries(devices.map((d, i) => [d.name, infos[i].ops])), layers: {} }
  for (const id of layerIds) {
    const samples = await Promise.all(devices.map(d => ev(d, `return window.__mt.sample(${JSON.stringify(id)}, 48)`, 180000)))
    const ref = samples[0]
    const per = {}
    for (let k = 1; k < samples.length; k++) {
      const s = samples[k]
      if (!s.cells || !ref.cells) { per[devices[k].name] = { missing: true, refOps: ref.ops, ops: s.ops }; continue }
      let over8 = 0, over24 = 0, max = 0, painted = 0
      for (let i = 0; i < ref.cells.length; i += 4) {
        let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(ref.cells[i + c] - s.cells[i + c]))
        if (ref.cells[i + 3] > 2 || s.cells[i + 3] > 2) painted++
        if (d > 8) over8++; if (d > 24) over24++; if (d > max) max = d
      }
      per[devices[k].name] = { vs: devices[0].name, painted, over8, over24, max, ops: [ref.ops, s.ops] }
    }
    check.layers[id] = per
  }
  log(`== ${label}: ops ${JSON.stringify(check.ops)}`)
  for (const [id, per] of Object.entries(check.layers)) log(`   ${id}: ${JSON.stringify(per)}`)
  report.checks.push(check)
  writeFileSync(OUT, JSON.stringify(report, null, 1))
}

const pathRand = (r, n = 4, box = [0.1, 0.1, 0.9, 0.9]) => Array.from({ length: n }, () => [box[0] + (box[2] - box[0]) * r(), box[1] + (box[3] - box[1]) * r()])

for (const d of devices) log(d.name, await ensureJoined(d))
// A second layer, made by one participant through the ordinary UI.
const maker = devices.find(d => d.name === 'laptop') ?? devices[0]
await ev(maker, `const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); if (!b) return 'no add-layer button'; b.click(); await new Promise(r => setTimeout(r, 2500)); return 'ok'`)
await sleep(3000)
const layerInfo = await ev(devices[0], 'return window.__mt.info()')
const layer2 = layerInfo.layers.map(l => l.id).find(id => id !== 'layer-1' && id !== 'background') ?? 'layer-1'
log('layers', layerInfo.layers.map(l => l.id).join(','), '-> second:', layer2)

await round('A same layer, scattered', dev => {
  const r = rng(dev.name.length * 97 + 1)
  return { layerId: 'layer-1', gapMs: 400, strokes: Array.from({ length: 3 }, (_, i) => ({ pts: pathRand(r, 4), ms: 1200 + 800 * r(), size: [60, 200, 400][i % 3], preset: PRESETS[Math.floor(r() * PRESETS.length)] })) }
})
await compare('after A')
await round('B two layers', dev => {
  const r = rng(dev.name.length * 131 + 7)
  const layerId = ['android', 'ipad'].includes(dev.name) ? 'layer-1' : layer2
  return { layerId, gapMs: 200, strokes: Array.from({ length: 3 }, () => ({ pts: pathRand(r, 5), ms: 1000 + 1000 * r(), size: 80 + Math.round(300 * r()), preset: PRESETS[Math.floor(r() * PRESETS.length)] })) }
})
await compare('after B')
await round('C same spot, wet-in-wet', dev => {
  const r = rng(dev.name.length * 17 + 3)
  return { layerId: 'layer-1', gapMs: 50, strokes: Array.from({ length: 3 }, () => ({ pts: pathRand(r, 4, [0.35, 0.35, 0.65, 0.65]), ms: 900 + 600 * r(), size: 150 + Math.round(150 * r()), preset: PRESETS[1 + Math.floor(r() * 2)] })) }
})
await compare('after C')
// An undo by one participant, a dry by another, and a last stroke each.
const undoer = devices.find(d => d.name === 'surface') ?? devices[0]
log('undo on', undoer.name, await ev(undoer, `const o = window.__engine.undo(); return o ? o.type + ':' + o.id : 'nothing'`))
const dryer = devices.find(d => d.name === 'laptop') ?? devices[0]
log('dry by', dryer.name, await ev(dryer, `const uid = window.__roomStore.getState().userId; window.__engine.appendOperation({ id: 'dry-' + Date.now(), type: 'paper_dry', userId: uid, timestamp: Date.now() }); return uid`))
await round('D after undo + dry', dev => {
  const r = rng(dev.name.length * 7 + 11)
  return { layerId: 'layer-1', gapMs: 100, strokes: [{ pts: pathRand(r, 3, [0.3, 0.3, 0.7, 0.7]), ms: 1200, size: 200, preset: PRESETS[1] }] }
})
await compare('after D')
// Some participants reload: their picture must come back as the others see it.
for (const name of ['android', 'laptop']) {
  const d = devices.find(x => x.name === name); if (!d) continue
  await ev(d, `__devNavigate(location.pathname + '?r=' + Date.now()); return 'reloading'`).catch(() => {})
}
await sleep(15000)
for (const name of ['android', 'laptop']) { const d = devices.find(x => x.name === name); if (d) log(name, await ensureJoined(d)) }
await compare('after reload')
const logs = await Promise.all(devices.map(async d => [d.name, await call(`/logs?client=${encodeURIComponent(d.sel)}`)]))
report.logs = Object.fromEntries(logs.map(([n, l]) => [n, Array.isArray(l) ? l.slice(-30) : l]))
for (const [n, l] of logs) if (Array.isArray(l) && l.length) log(`logs ${n}:`, l.slice(-6).map(x => x.level + ' ' + x.text.slice(0, 140)).join(' | '))
writeFileSync(OUT, JSON.stringify(report, null, 1))
log('report', OUT)
