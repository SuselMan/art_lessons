// loadvsrebuild.mjs for the tablet: raw CDP to a tab, the trace injected
// before the page's own scripts, then the same comparison. Also records every
// exception thrown out of a pixel operation during the load.
// Usage: node tabletloadtrace.mjs <pageId> <roomId> [layerId]
import { createRequire } from 'node:module'
const WebSocket = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('ws')
const [pageId, room, layerId = 'layer-1'] = process.argv.slice(2)
const ws = new WebSocket(`ws://localhost:9222/devtools/page/${pageId}`, { perMessageDeflate: false })
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
let id = 0; const pending = new Map(); const logs = []
ws.on('message', m => {
  const d = JSON.parse(m)
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) logs.push(d.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200))
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300))
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) }
})
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 300) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
await send('Page.enable'); await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${((layerId) => {
  window.__trace = { load: [], rebuild: [], phase: 'load', errors: [] }
  const hash = (e) => { const buf = e._layers.get(layerId); if (!buf) return 0; let h = 0; for (const t of buf.allResident()) { const p = t.buffer.readPixels(); for (let i = 0; i < p.length; i += 61) h = (h * 31 + p[i]) >>> 0 } return h }
  const iv = setInterval(() => {
    const e = window.__engine; if (!e || e.__traced) return
    e.__traced = true; clearInterval(iv)
    window.__writes = []
    const t0 = performance.now()
    const tag = (name) => { window.__writes.push([Math.round(performance.now() - t0), name]) }
    const wrapE = (name) => { const o = e[name]; if (typeof o !== 'function') return; e[name] = function (...a) { tag(name); return o.apply(this, a) } }
    for (const n of ['_sweepReveals', '_flushLiveComposite', '_flushPendingRebuilds', '_rebuildLayer', 'restoreLayerFromSnapshot', '_completeSettle', '_dryWashScratch', 'resumeDisplay', 'suspendDisplay', '_finishRibbonStroke']) wrapE(n)
    const buf = e._layers.get(layerId)
    const proto = buf && buf.allResident()[0] ? Object.getPrototypeOf(buf.allResident()[0].buffer) : null
    if (proto && !proto.__w) { proto.__w = 1; const o = proto.restorePixelsRect; proto.restorePixelsRect = function (...a) { tag('restorePixelsRect'); return o.apply(this, a) } }
    const orig = e._applyPixelOp.bind(e)
    e._applyPixelOp = function (buf, lid, op) {
      let r
      try { r = orig(buf, lid, op) } catch (err) { window.__trace.errors.push([window.__trace.phase, op.seq, String(err && err.message || err).slice(0, 200)]); throw err }
      if (lid === layerId) window.__trace[window.__trace.phase].push([op.id, op.seq, op.tool || op.type, hash(e), e.gl.getError()])
      return r
    }
  }, 5)
}).toString()})(${JSON.stringify(layerId)})` })
await send('Page.navigate', { url: `https://192.168.1.70:5277/room/${room}?t=${Date.now()}` })
for (let i = 0; i < 120; i++) {
  await sleep(1000)
  const r = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Войти|Join/i.test(b.textContent)); if (b && !window.__engine) b.click(); const e = window.__engine; return e && e._log.layerPixelOps(${JSON.stringify(layerId)}).length > 150 && getComputedStyle(document.querySelector('canvas')).pointerEvents !== 'none' ? 'ready' : 'wait' })()`)
  if (r === 'ready') break
}
const hs = []
for (let k = 0; k < 8; k++) { hs.push(await ev(`(() => { const e = window.__engine; let h = 0; for (const t of e._layers.get(${JSON.stringify(layerId)}).allResident()) { const p = t.buffer.readPixels(); for (let i = 0; i < p.length; i += 61) h = (h * 31 + p[i]) >>> 0 } return Math.round(performance.now()) + ':' + h })()`)); await sleep(1500) }
console.log('hashes', hs.join(' '))
console.log('writes', await ev('JSON.stringify(window.__writes ? window.__writes.reduce((m, w) => { const k = w[1]; m[k] = m[k] || [0, w[0], 0]; m[k][0]++; m[k][2] = w[0]; return m }, {}) : null)'))
const res = await ev(`(() => {
  const layerId = ${JSON.stringify(layerId)}
  const e = window.__engine, T = window.__trace
  const hashNow = () => { let h = 0; for (const t of e._layers.get(layerId).allResident()) { const p = t.buffer.readPixels(); for (let i = 0; i < p.length; i += 61) h = (h * 31 + p[i]) >>> 0 } return h }
  const loaded = hashNow(); const loadTrace = T.load.slice()
  T.phase = 'rebuild'
  const saved = e._checkpoints.slice(); e._checkpoints = e._checkpoints.filter(c => c.fromSnapshot)
  e._rebuildLayer(layerId); e._checkpoints = saved
  const rebuilt = hashNow(); const R = T.rebuild
  const lastLoad = new Map(); loadTrace.forEach((r, i) => lastLoad.set(r[0], i))
  let firstDiff = null
  for (const r of R) { const i = lastLoad.get(r[0]); if (i === undefined) { firstDiff = { op: r, loadHas: false }; break } if (loadTrace[i][3] !== r[3]) { firstDiff = { op: r, load: loadTrace[i] }; break } }
  return JSON.stringify({ loaded, rebuilt, same: loaded === rebuilt, loadApplied: loadTrace.length, rebuildApplied: R.length, glErrorsLoad: loadTrace.filter(r => r[4]).map(r => [r[1], r[4]]).slice(0, 10), errors: T.errors.slice(0, 10), firstDiff })
})()`)
console.log(res)
console.log('console', JSON.stringify(logs.slice(0, 15)))
ws.close()
