import { createRequire } from 'node:module'
const { chromium } = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('playwright')
const room = process.argv[2]
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-certificate-errors', '--window-position=0,0'] })
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } })).newPage()
await page.goto('https://localhost:5277/room/' + room)
const inp = page.getByRole('textbox').first(); await inp.waitFor({ timeout: 30000 }); await inp.fill('probe')
await page.getByRole('button', { name: /join|войти/i }).last().click()
await page.waitForFunction(() => window.__engine && window.__engine._log.entries.length > 150 && getComputedStyle(document.querySelector('canvas')).pointerEvents !== 'none', undefined, { timeout: 300000 })
await page.waitForTimeout(3000)
console.log(await page.evaluate(() => {
  const e = window.__engine, id = 'layer-1'
  const h = () => { let x = 0; for (const t of e._layers.get(id).allResident()) { const p = t.buffer.readPixels(); for (let i = 0; i < p.length; i += 61) x = (x * 31 + p[i]) >>> 0 } return x }
  const freeField = () => { for (const f of e._fieldCache) for (const k of Object.keys(f)) { const b = f[k]; if (b && typeof b.destroy === 'function') b.destroy() } e._fieldCache = [] }
  const snapOnly = (fn) => { const saved = e._checkpoints.slice(); e._checkpoints = e._checkpoints.filter(c => c.fromSnapshot); fn(); e._checkpoints = saved }
  const L = h()
  freeField(); snapOnly(() => e._rebuildLayer(id)); const R1 = h()
  snapOnly(() => e._rebuildLayer(id)); const R2 = h()
  freeField(); snapOnly(() => e._rebuildLayer(id)); const R3 = h()
  freeField(); e._diffuseFieldFor(2400, 2400); snapOnly(() => e._rebuildLayer(id)); const R4 = h()
  const dims = []
  const orig = e._diffuseFieldFor.bind(e); e._diffuseFieldFor = (w, hh) => { dims.push([Math.round(w), Math.round(hh)]); return orig(w, hh) }
  freeField(); snapOnly(() => e._rebuildLayer(id)); e._diffuseFieldFor = orig
  return JSON.stringify({ newCode: String(orig).includes('CLEAN') || String(e.constructor.prototype._diffuseFieldFor).includes('b.clear()'), load: L, freshField: R1, dirtyField: R2, freshAgain: R3, bigCleanField: R4, maxAsked: dims.reduce((m, d) => [Math.max(m[0], d[0]), Math.max(m[1], d[1])], [0, 0]), firstAsked: dims[0], asks: dims.length })
}))
await browser.close()
