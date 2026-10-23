// Breaks each remote watercolour appendOperation on `probe` into parts (with a
// readPixels sync around each), while `others` draw on layer-1.
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const [probe, ...others] = process.argv.slice(2)
for (const p of [probe, ...others]) await joinAndInstall(p)
await ev(probe, `const e = window.__engine, gl = e.gl
const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null)
const px = new Uint8Array(4)
const sync = () => { const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, prev) }
window.__ob = []; let cur = null
const wrap = (n) => { const o = e[n]; e[n] = function () { if (!cur) return o.apply(this, arguments); sync(); const t = performance.now(); try { return o.apply(this, arguments) } finally { sync(); cur[n] = (cur[n] || 0) + Math.round(performance.now() - t) } } }
;['_completeSettle', '_paintRibbonStroke', '_diffuseFieldFor', '_startSettle', '_finishRibbonStroke', '_checkpointBeforeWash', '_retireWashesOf'].forEach(wrap)
const ao = e.appendOperation
e.appendOperation = function (op, src) { if (op.type !== 'stroke' || op.tool !== 'watercolor' || src !== 'remote') return ao.apply(this, arguments); cur = { }; sync(); const t = performance.now(); try { return ao.apply(this, arguments) } finally { sync(); cur.total = Math.round(performance.now() - t); window.__ob.push(cur); cur = null } }
return 1`)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
await Promise.all(others.map(async (p, k) => {
  const r = rng(k * 31 + 9)
  await ev(p, `return window.__mt.setup(${JSON.stringify({ preset: 'normal:100:70:PB29:round', color: [0.3, 0.5, 0.7], size: 50, layerId: 'layer-1' })})`)
  for (let i = 0; i < 4; i++) {
    const pts = Array.from({ length: 4 }, () => [0.15 + 0.7 * r(), 0.15 + 0.7 * r()])
    await ev(p, `return await window.__mt.stroke(${JSON.stringify({ pts, ms: 1000 })})`, 90000)
    await sleep(300)
  }
}))
await sleep(3000)
console.log(JSON.stringify(await ev(probe, 'return JSON.stringify(window.__ob)')).replace(/\\\\/g, ''))
