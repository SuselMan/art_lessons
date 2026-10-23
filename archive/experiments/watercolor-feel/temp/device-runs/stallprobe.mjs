// The probe page draws a few strokes while the others draw on the same layer;
// then prints the probe's long frames and what engine work they held.
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const [probe, ...others] = process.argv.slice(2)
for (const p of [probe, ...others]) await joinAndInstall(p)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
await ev(probe, 'window.__mt.watch(); return 1')
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
const stalls = await ev(probe, 'return window.__mt.stalls()')
console.log(JSON.stringify(stalls.filter(s => (s.ms ?? 0) > 80), null, 0).replace(/},{/g, '}\n{'))
