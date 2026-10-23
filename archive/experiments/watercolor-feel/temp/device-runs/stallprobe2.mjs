import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const [probe, ...others] = process.argv.slice(2)
for (const p of [probe, ...others]) await joinAndInstall(p)
await ev(probe, `const e = window.__engine; window.__st = []
const wrap = n => { const o = e[n]; if (!o) return; e[n] = function () { const t = performance.now(); try { return o.apply(this, arguments) } finally { const d = performance.now() - t; if (d > 60) window.__st.push({ n, ms: Math.round(d), at: Math.round(t), a0: arguments[0]?.type ? arguments[0].type + '/' + (arguments[0].tool || '') : typeof arguments[0] === 'string' ? arguments[0] : '' }) } } }
;['_appendOperationNow', '_completeSettle', '_onStart', '_onEnd', '_onMove', '_rebuildLayer', '_startRebuildJob', '_stepRebuildJob', '_flushOpQueue', '_tickSettle', '_display', '_flushLiveComposite', '_checkpointBeforeWash', '_packWashBoundaries', '_takeCheckpoint'].forEach(wrap)
new PerformanceObserver(l => { for (const x of l.getEntries()) if (x.duration > 150) window.__st.push({ n: 'FRAME', ms: Math.round(x.duration), at: Math.round(x.startTime) }) }).observe({ type: 'longtask', buffered: false })
return 1`)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
const draw = async (p, k) => {
  const r = rng(k * 31 + 7)
  await ev(p, `return window.__mt.setup(${JSON.stringify({ preset: 'normal:100:70:PB29:round', color: [0.2 + 0.2 * k, 0.4, 0.6], size: 40 + Math.round(40 * r()), layerId: 'layer-1' })})`)
  const out = []
  for (let i = 0; i < 4; i++) {
    const pts = Array.from({ length: 4 }, () => [0.15 + 0.7 * r(), 0.15 + 0.7 * r()])
    out.push(await ev(p, `return await window.__mt.stroke(${JSON.stringify({ pts, ms: 1000 })})`, 90000))
    await sleep(400)
  }
  return out
}
const res = await Promise.all([probe, ...others].map((p, k) => draw(p, k)))
console.log('probe strokes', res[0].map(s => `${s.over33}/${s.n} max${s.max}`).join(', '))
const st = JSON.parse(await ev(probe, 'return JSON.stringify(window.__st)'))
for (const x of st.sort((a, b) => a.at - b.at)) console.log(x.at, x.n, x.ms, x.a0)
