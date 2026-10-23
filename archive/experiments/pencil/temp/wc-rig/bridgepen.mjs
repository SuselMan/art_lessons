// In-page pen load for ANY device the dev bridge reaches (iPad without a Mac,
// or the Android tablet): the stroke is generated inside the page - one
// coalesced pointermove per animation frame, perFrame samples each, fed to the
// engine's own PointerInput handlers - and rAF intervals are counted during
// the stroke and for 2.5 s after it. Same numbers as tabletpen.mjs, no CDP.
// Usage: node bridgepen.mjs <page|ua-part> [size] [legs] [legMs] [perFrame]
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const [client = 'ipad', size = '400', legs = '8', legMs = '300', perFrame = '2'] = process.argv.slice(2)
const P = { size: +size, legs: +legs, legMs: +legMs, perFrame: +perFrame }
const join = `(async () => {
  for (let i = 0; i < 90 && !window.__engine; i++) {
    const b = [...document.querySelectorAll('button')].find(b => /Войти|Join/i.test(b.textContent)); if (b) b.click()
    await new Promise(r => setTimeout(r, 1000))
  }
  await new Promise(r => setTimeout(r, 1500))
})()`
const pen = `new Promise(resolve => {
  const e = window.__engine
  e.setTool('watercolor'); e.setPencil('normal:100:100:PB29:round'); e.setColor([0.3, 0.15, 0.55]); e.setSize(${P.size})
  const p = e._pointer
  const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
  const origCapture = canvas.setPointerCapture; canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {}
  const r = canvas.getBoundingClientRect()
  const legs = ${P.legs}, legMs = ${P.legMs}, perFrame = ${P.perFrame}
  const x0 = r.left + r.width * 0.2, x1 = r.left + r.width * 0.6, yT = r.top + r.height * 0.2, yB = r.top + r.height * 0.8
  const at = (t) => { const leg = Math.min(legs - 1, Math.floor(t / legMs)); const f = Math.min(1, (t - leg * legMs) / legMs)
    const ax = x0 + (x1 - x0) * leg / legs, bx = x0 + (x1 - x0) * (leg + 1) / legs
    const ay = leg % 2 ? yB : yT, by = leg % 2 ? yT : yB
    return [ax + (bx - ax) * f, ay + (by - ay) * f] }
  const mk = (x, y, ts, buttons) => { const ev = { clientX: x, clientY: y, pressure: 0.8, tiltX: 0, tiltY: 0, twist: 0, width: 1, height: 1,
      pointerType: 'pen', pointerId: 7, isPrimary: true, button: 0, buttons, timeStamp: ts, target: canvas, currentTarget: canvas,
      preventDefault() {}, stopPropagation() {}, getCoalescedEvents() { return [ev] }, getPredictedEvents() { return [] } }; return ev }
  const frames = []; const work = []
  const t0 = performance.now()
  p._handleDown(mk(x0, yT, t0, 1))
  const total = legs * legMs
  let last = t0
  const tick = (now) => {
    frames.push(now)
    const w0 = performance.now()
    // One pointermove per frame, the samples since the last frame coalesced
    // into it - what Chrome actually delivers for a pen (rAF-aligned input).
    const samples = []
    for (let k = 1; k <= perFrame; k++) {
      const ts = last + (now - last) * k / perFrame
      const [x, y] = at(Math.min(total, ts - t0))
      samples.push(mk(x, y, ts, 1))
    }
    const ev = samples[samples.length - 1]
    ev.getCoalescedEvents = () => samples
    p._handleMove(ev)
    work.push(performance.now() - w0)
    last = now
    if (now - t0 < total) { requestAnimationFrame(tick); return }
    const [x, y] = at(total)
    p._handleUp(mk(x, y, now, 0))
    canvas.setPointerCapture = origCapture
    // Keep counting frames through the settle's tail.
    const tail = (t) => { frames.push(t); if (t - now < 2500) requestAnimationFrame(tail); else done() }
    requestAnimationFrame(tail)
  }
  const done = () => {
    const d = []; for (let i = 1; i < frames.length; i++) d.push(frames[i] - frames[i - 1])
    const during = d.slice(0, work.length), after = d.slice(work.length)
    const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(p * (s.length - 1))]) : 0 }
    const over = (a, ms) => a.filter(v => v > ms).length
    resolve(JSON.stringify({
      during: { n: during.length, p50: q(during, .5), p90: q(during, .9), p99: q(during, .99), max: Math.round(Math.max(...during)), over33: over(during, 33), over50: over(during, 50) },
      after: { n: after.length, p50: q(after, .5), p99: q(after, .99), max: Math.round(Math.max(...after, 0)), over33: over(after, 33) },
      handlerMs: { p50: q(work, .5), p90: q(work, .9), max: Math.round(Math.max(...work)) },
      perf: e.getWatercolorPerf(),
      t0,
    }))
  }
  requestAnimationFrame(tick)
})`
const code = `await ${join}; return await ${pen}`
const file = '/tmp/claude-1000/-home-suselman-projects-pencil/0e784eb2-06ab-4b6e-86fd-68bbe5084ec8/scratchpad/bridgepen.js'
writeFileSync(file, code)
const out = execFileSync('npx', ['tsx', '/home/suselman/projects/pencil-agents/watercolor-feel/apps/web/scripts/devbridge.ts', 'eval', client, '@' + file, '--timeout', '180000'], { encoding: 'utf8' })
console.log(out.trim())
