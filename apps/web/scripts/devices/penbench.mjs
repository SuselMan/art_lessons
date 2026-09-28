// Pen-load benchmark on one device, through the dev bridge: a zigzag laid by
// the engine's own pointer handlers inside the page, rAF intervals counted
// during it and 1.5 s after. Same method on every device (Android, iPad,
// Surface, laptop), so the numbers compare.
// Usage: node penbench.mjs <page> [size=400] [legs=8] [legMs=300] [runs=3]
import { ev, joinAndInstall } from './bridge.mjs'
const [sel, size = '400', legs = '8', legMs = '300', runs = '3'] = process.argv.slice(2)
if (!sel) { console.error('usage: node penbench.mjs <page|room|ua-part> [size] [legs] [legMs] [runs]'); process.exit(2) }
await joinAndInstall(sel)
const pts = Array.from({ length: +legs + 1 }, (_, i) => [0.2 + 0.4 * i / +legs, i % 2 ? 0.8 : 0.2])
for (let i = 0; i < +runs; i++) {
  await ev(sel, `return window.__mt.setup({ preset: 'normal:100:100:PB29:round', color: [0.3, 0.15, 0.55], size: ${+size} })`)
  const r = await ev(sel, `return await window.__mt.stroke(${JSON.stringify({ pts, ms: +legs * +legMs })})`, 120000)
  const perf = await ev(sel, `return JSON.stringify(window.__engine.getWatercolorPerf())`)
  console.log(`run ${i + 1}: dropped ${r.over33}/${r.n} (over 100 ms: ${r.over100}), worst ${r.max} ms | settle ${Math.round(perf.settleMs)} ms, scratch ${perf.scratchLiveMB}+${perf.scratchFreeMB} MB, field ${Math.round(perf.fieldMB)} MB`)
}
