// Does a room's picture after LOAD equal the same layer REBUILT from its log?
// Hashes the layer after every pixel operation on both paths and prints the
// first operation where they part. Read-only for the room: nothing is drawn,
// no operation is sent. Usage: node loadvsrebuild.mjs <roomId> [layerId]
import { createRequire } from 'node:module'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const [room, layerId = 'layer-1'] = process.argv.slice(2)
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.addInitScript((layerId) => {
  window.__trace = { load: [], rebuild: [], phase: 'load' }
  const hash = (e) => {
    const buf = e._layers.get(layerId); if (!buf) return 0
    let h = 0
    for (const t of buf.allResident()) { const p = t.buffer.readPixels(); for (let i = 0; i < p.length; i += 61) h = (h * 31 + p[i]) >>> 0 }
    return h
  }
  const iv = setInterval(() => {
    const e = window.__engine; if (!e || e.__traced) return
    e.__traced = true; clearInterval(iv)
    const orig = e._paintDabs.bind(e)
    e._paintDabs = function (buf, dabs, tool, preset, color, userId, a, b, strokeId, washId, wet, seed) {
      const pre = buf === e._layers.get(layerId) ? hash(e) : null
      const r = orig(buf, dabs, tool, preset, color, userId, a, b, strokeId, washId, wet, seed)
      if (buf === e._layers.get(layerId)) window.__trace[window.__trace.phase].push([strokeId + ':' + dabs.length + ':' + (dabs[0] ? Math.round(dabs[0].x) : ''), 0, tool, hash(e), pre, washId])
      return r
    }
  }, 5)
}, layerId)
await page.goto('https://localhost:5277/room/' + room)
const inp = page.getByRole('textbox').first(); await inp.waitFor({ timeout: 30000 }); await inp.fill('probe')
await page.getByRole('button', { name: /join|войти/i }).last().click()
await page.waitForFunction((l) => window.__engine && window.__engine._log.layerPixelOps(l).length > 0 && getComputedStyle(document.querySelector('canvas')).pointerEvents !== 'none', layerId, { timeout: 600000 })
await page.waitForTimeout(8000)
const res = await page.evaluate((layerId) => {
  const e = window.__engine, T = window.__trace
  const hashNow = () => { let h = 0; for (const t of e._layers.get(layerId).allResident()) { const p = t.buffer.readPixels(); for (let i = 0; i < p.length; i += 61) h = (h * 31 + p[i]) >>> 0 } return h }
  const loaded = hashNow()
  const loadTrace = T.load.slice()
  T.phase = 'rebuild'
  // Rebuild from the snapshot, as the old code and a fresh load both do.
  const saved = e._checkpoints.slice(); e._checkpoints = e._checkpoints.filter(c => c.fromSnapshot)
  e._rebuildLayer(layerId)
  e._checkpoints = saved
  const rebuilt = hashNow()
  const R = T.rebuild
  // The LAST application of each op on the load path (it may apply twice: once as it arrives, once in a deferred rebuild).
  const lastLoad = new Map(); loadTrace.forEach((r, i) => lastLoad.set(r[0], i))
  let firstDiff = null
  for (let k = 0; k < R.length; k++) { const r = R[k]; const i = lastLoad.get(r[0]); if (i === undefined) { firstDiff = { k, op: r, loadHas: false, prevLoad: loadTrace[k] }; break } if (loadTrace[i][3] !== r[3]) { firstDiff = { k, i, op: r, load: loadTrace[i], prevRebuild: R[k - 1], prevLoad: loadTrace[i - 1] }; break } }
  return { loaded, rebuilt, same: loaded === rebuilt, loadApplied: loadTrace.length, loadSeqs: loadTrace.map(r => r[1]).join(','), rebuildApplied: R.length, firstDiff }
}, layerId)
console.log(JSON.stringify(res, null, 1))
await browser.close()
