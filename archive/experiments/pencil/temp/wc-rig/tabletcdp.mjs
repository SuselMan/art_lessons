// Raw CDP against one tab of the tablet's Chrome (adb forward tcp:9222
// localabstract:chrome_devtools_remote). Playwright's connectOverCDP hangs on
// Android Chrome's browser target, a page socket does not.
// Usage: node tabletcdp.mjs <pageWsUrl> [size] [zigzags] [movesPerLeg] [reload]
import { createRequire } from 'node:module'
const WebSocket = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('ws')
const [wsUrl, sizeStr = '240', zzStr = '8', perLegStr = '12', reload = ''] = process.argv.slice(2)
const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
let id = 0
const pending = new Map()
ws.on('message', m => { const d = JSON.parse(m); if (d.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: 999999, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } })
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const profSrc = process.env.PROF ? (await import('node:fs')).readFileSync(new URL('./gpuprof.js', import.meta.url), 'utf8') : null
if (reload) { await send('Page.enable'); send('Page.reload', { ignoreCache: true }); await sleep(10000) }
for (let i = 0; i < 60 && !(await evalJs('!!window.__engine')); i++) {
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Войти|Join/i.test(b.textContent)); if (b) b.click(); return !!b })()`)
  await sleep(1000)
}
const info = await evalJs(`JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, round: document.body.innerText.match(/акварель r[0-9]+[^\\n]*/)?.[0] ?? null })`)
console.log('page', info)
const size = +sizeStr
await evalJs(`(() => { const e = window.__engine; e.setTool('watercolor'); e.setPencil('normal:100:100:PB29:round'); e.setColor([0.165, 0.231, 0.592]); e.setSize(${size}); return 1 })()`)
const box = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll('canvas')].map(c => c.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0])`))
console.log('canvas', JSON.stringify(box))
const zz = +zzStr, perLeg = +perLegStr
const x0 = box.x + box.width * 0.2, x1 = box.x + box.width * 0.6, yT = box.y + box.height * 0.2, yB = box.y + box.height * 0.8
const pts = []; for (let i = 0; i <= zz; i++) pts.push([x0 + (x1 - x0) * i / zz, i % 2 ? yB : yT])
// A PEN, not a finger: on a tablet a finger pans once a pen has been seen.
const penType = { touchStart: 'mousePressed', touchMove: 'mouseMoved', touchEnd: 'mouseReleased' }
const touch = (type, x, y) => send('Input.dispatchMouseEvent', { type: penType[type], x, y, button: 'left', buttons: type === 'touchEnd' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.8 })
// Reset the HUD window so it covers this stroke only.
await evalJs(`(() => { const p = window.__engine._wcPerf; for (const k of ['frameAt','frameMs','batchAt','batchMs']) if (p[k]) p[k].length = 0; return 1 })()`)
if (profSrc) await evalJs(`window.__gpuProf ? 1 : (${JSON.stringify(profSrc)}, eval(${JSON.stringify(profSrc)}), 1)`)
if (process.env.PATCH) console.log('patch', await evalJs(process.env.PATCH))
await evalJs(`(() => { window.__rafT = []; const loop = (t) => { window.__rafT.push(t); if (window.__rafOn) requestAnimationFrame(loop) }; window.__rafOn = true; requestAnimationFrame(loop); return 1 })()`)
const opsBefore = await evalJs('window.__engine.getOperations().length')
await evalJs('window.__gpuProf && window.__gpuProf.reset(); 1')
await evalJs(`(() => { window.__pt = {}; for (const t of ['pointerdown','pointermove','pointerup']) addEventListener(t, e => { const k = t + ':' + e.pointerType + ':' + (e.target.tagName || ''); window.__pt[k] = (window.__pt[k] || 0) + 1 }, true); return 1 })()`)
if (process.env.CPUPROF) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start') }
const t0 = Date.now()
await touch('touchStart', pts[0][0], pts[0][1])
let [px, py] = pts[0]
for (const [x, y] of pts.slice(1)) {
  // One event every ~8 ms, awaited: a pen at ~120 Hz. A leg of perLeg moves.
  for (let i = 1; i <= perLeg; i++) { await touch('touchMove', px + (x - px) * i / perLeg, py + (y - py) * i / perLeg); await sleep(6) }
  ;[px, py] = [x, y]
}
await touch('touchEnd', px, py)
const strokeMs = Date.now() - t0
{ const iv = await evalJs(`(() => { window.__rafOn = false; const t = window.__rafT; const d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); const q = (p) => d.length ? Math.round(d[Math.floor(p * (d.length - 1))]) : 0; return JSON.stringify({ n: d.length, p50: q(0.5), p90: q(0.9), p99: q(0.99), fps: Math.round(1000 * d.length / (t[t.length - 1] - t[0])) }) })()`); console.log('raf', iv) }
if (process.env.CPUPROF) {
  await sleep(1500)
  const { profile } = (await send('Profiler.stop')).result
  const byId = new Map(profile.nodes.map(n => [n.id, n]))
  const dt = (profile.endTime - profile.startTime) / 1000 / profile.samples.length
  const self = new Map(); const total = new Map()
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
  for (const id of profile.samples) {
    const n = byId.get(id); const name = (n.callFrame.functionName || '(anon)') + ':' + n.callFrame.lineNumber
    self.set(name, (self.get(name) || 0) + dt)
    const seen = new Set(); let cur = id
    while (cur !== undefined) { const m = byId.get(cur); const nm = (m.callFrame.functionName || '(anon)') + ':' + m.callFrame.lineNumber; if (!seen.has(nm)) { total.set(nm, (total.get(nm) || 0) + dt); seen.add(nm) } cur = parent.get(cur) }
  }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ' ' + Math.round(v)).join('\n  ')
  console.log('SELF ms\n  ' + top(self)); console.log('TOTAL ms\n  ' + top(total))
  if (process.env.WHO) {
    const chains = new Map()
    for (const id of profile.samples) {
      const n = byId.get(id); if (n.callFrame.functionName !== process.env.WHO) continue
      const path = []; let cur = parent.get(id)
      while (cur !== undefined && path.length < 7) { const m = byId.get(cur); path.push(m.callFrame.functionName + ':' + m.callFrame.lineNumber); cur = parent.get(cur) }
      const k = path.join(' < '); chains.set(k, (chains.get(k) || 0) + dt)
    }
    console.log('WHO ' + process.env.WHO + '\n  ' + [...chains].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => Math.round(v) + ' ' + k).join('\n  '))
  }
}
console.log('events', JSON.stringify(await evalJs('window.__pt')))
await sleep(500)
console.log('batchList', JSON.stringify(await evalJs('window.__engine._wcPerf.batchMs.map(v => Math.round(v))')), JSON.stringify(await evalJs('window.__engine._wcPerf.frameMs.map(v => Math.round(v))')))
console.log('stroke', JSON.stringify({ size, zz, perLeg, strokeMs, opsAdded: (await evalJs('window.__engine.getOperations().length')) - opsBefore, perf: await evalJs('window.__engine.getWatercolorPerf()') }))
console.log('prof-stroke', JSON.stringify(await evalJs('window.__gpuProf ? window.__gpuProf.report() : null')))
await evalJs('window.__gpuProf && window.__gpuProf.reset(); 1')
await sleep(3000)
console.log('prof-after', JSON.stringify(await evalJs('window.__gpuProf ? window.__gpuProf.report() : null')))
console.log('after3s', JSON.stringify(await evalJs('window.__engine.getWatercolorPerf()')))
ws.close()
