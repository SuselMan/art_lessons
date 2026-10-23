// Compares queue/pace variants on the probe page while others draw.
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const [probe, ...others] = process.argv.slice(2)
for (const p of [probe, ...others]) await joinAndInstall(p)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
const draw = async (p, k, seed) => {
  const r = rng(seed * 101 + k * 31 + 7)
  await ev(p, `return window.__mt.setup(${JSON.stringify({ preset: 'normal:100:70:PB29:round', color: [0.2 + 0.2 * k, 0.4, 0.6], size: 40 + Math.round(40 * r()), layerId: 'layer-1' })})`)
  const out = []
  for (let i = 0; i < 4; i++) {
    const pts = Array.from({ length: 4 }, () => [0.15 + 0.7 * r(), 0.15 + 0.7 * r()])
    out.push(await ev(p, `return await window.__mt.stroke(${JSON.stringify({ pts, ms: 1000 })})`, 90000))
    await sleep(400)
  }
  return out
}
const variants = [['pace2', 2], ['noqueue', null], ['pace2', 2], ['noqueue', null]]
let seed = 1
for (const [name, k] of variants) {
  await ev(probe, k === null ? 'window.__engine._shouldQueue = () => false; return 1' : `delete window.__engine._shouldQueue; window.__engine.settleBacklogMax = ${k}; return 1`)
  const res = await Promise.all([probe, ...others].map((p, i) => draw(p, i, seed)))
  const t = Date.now(); let drain = 0
  for (let i = 0; i < 240; i++) { const q = await ev(probe, 'return window.__engine._opQueue.length'); if (!q) { drain = Date.now() - t; break } await sleep(250) }
  const s = res[0]
  const bad = s.reduce((a, x) => a + x.over33, 0), frames = s.reduce((a, x) => a + x.n, 0), worst = Math.max(...s.map(x => x.max))
  console.log(name.padEnd(8), 'bad', bad, 'of', frames, 'worst', worst, 'drain', drain)
  seed++
  await sleep(4000)
}
await ev(probe, 'delete window.__engine._shouldQueue; window.__engine.settleBacklogMax = 2; return 1')
