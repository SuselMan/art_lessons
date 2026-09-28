// A lesson, compressed: several devices draw lesson-sized strokes with pauses
// for N rounds, and after every round each device reports its texture memory,
// whether its tab was reloaded (performance.timeOrigin), its GL context, and
// the frames its own strokes dropped. Looks for growth and for the round a
// device gives up in.
// Usage: node soak.mjs <room> <rounds> name=page [name=page ...]
import { ev, joinAndInstall } from './bridge.mjs'

const [room, roundsArg, ...rest] = process.argv.slice(2)
if (!room || !rest.length) { console.error('usage: node soak.mjs <room> <rounds> name=page ...'); process.exit(2) }
const devices = rest.map(a => { const [name, sel] = a.split('='); return { name, sel } })
const COLORS = [[0.75, 0.2, 0.15], [0.15, 0.35, 0.7], [0.2, 0.55, 0.3], [0.9, 0.7, 0.1]]
const PRESETS = ['normal:100:0:PB29:round', 'normal:100:70:PB29:round', 'normal:60:100:PB29:round', 'normal:100:100:PB29:flex']
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const origin = {}
for (const d of devices) { await joinAndInstall(d.sel); origin[d.name] = await ev(d.sel, 'return Math.round(performance.timeOrigin)') }
console.log('room', room, 'devices', devices.map(d => d.name).join(', '))

for (let round = 1; round <= +roundsArg; round++) {
  const results = await Promise.all(devices.map(async (d, k) => {
    const r = rng(round * 131 + k * 17)
    const out = []
    try {
      for (let i = 0; i < 3; i++) {
        const pts = Array.from({ length: 3 + Math.floor(r() * 3) }, () => [0.1 + 0.8 * r(), 0.1 + 0.8 * r()])
        await ev(d.sel, `return window.__mt.setup(${JSON.stringify({ preset: PRESETS[Math.floor(r() * PRESETS.length)], color: COLORS[k % COLORS.length], size: 20 + Math.round(130 * r()) })})`)
        const s = await ev(d.sel, `return await window.__mt.stroke(${JSON.stringify({ pts, ms: 700 + Math.round(900 * r()) })})`, 60000)
        out.push(`${s.over33}/${s.n}${s.over100 ? '!' + s.over100 : ''}`)
        await sleep(500 + Math.round(2000 * r()))
      }
      const st = await ev(d.sel, `const e = window.__engine; const p = e.getWatercolorPerf(); return JSON.stringify({ o: Math.round(performance.timeOrigin), lost: e.gl.isContextLost(), live: p.scratchLiveMB, free: p.scratchFreeMB, field: Math.round(p.fieldMB), reveal: p.revealMB, ops: e.getOperations().length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null })`)
      const reloaded = st.o !== origin[d.name]
      return `${d.name}: strokes ${out.join(' ')} | tex ${st.live}+${st.free} field ${st.field} reveal ${st.reveal} | heap ${st.heap ?? '-'} | ops ${st.ops}${st.lost ? ' | GL LOST' : ''}${reloaded ? ' | TAB RELOADED' : ''}`
    } catch (e) {
      return `${d.name}: FAILED ${String(e.message).slice(0, 120)}`
    }
  }))
  console.log(`round ${round}\n  ` + results.join('\n  '))
}
