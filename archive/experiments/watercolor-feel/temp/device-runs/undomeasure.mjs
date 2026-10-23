import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const devs = JSON.parse(process.env.DEVS ?? '{"laptop":"drpsi5","ipad":"7f5b44"}')
const undoer = process.argv[2] ?? 'laptop'
for (const p of Object.values(devs)) await joinAndInstall(p)
for (const [n, p] of Object.entries(devs)) await ev(p, `window.__mt.watch(); window.__uj = []; const e = window.__engine; clearInterval(window.__ujT); window.__ujT = setInterval(() => { window.__uj.push([Math.round(performance.now()), e._rebuildJobs.size]) }, 100); return 1`)
await ev(devs[undoer], `return window.__mt.setup(${JSON.stringify({ preset: 'normal:100:70:PB29:round', color: [0.15, 0.35, 0.7], size: 80 })})`)
await ev(devs[undoer], `return await window.__mt.stroke(${JSON.stringify({ pts: [[0.3, 0.3], [0.6, 0.5], [0.4, 0.7]], ms: 1200 })})`, 60000)
await sleep(3000)
for (const p of Object.values(devs)) await ev(p, `window.__mt.watch(); window.__uj.length = 0; window.__t0 = performance.now(); return 1`)
console.log('undo', await ev(devs[undoer], `const o = window.__engine.undo(); return o ? o.type : 'nothing'`))
await sleep(25000)
for (const [n, p] of Object.entries(devs)) {
  const r = await ev(p, `const u = window.__uj, t0 = window.__t0; const on = u.filter(x => x[1] > 0); const s = JSON.parse(window.__mt.stalls()); return JSON.stringify({ jobStart: on.length ? Math.round(on[0][0]-t0) : null, jobEnd: on.length ? Math.round(on[on.length-1][0]-t0) : null, maxGap: Math.max(0, ...u.slice(1).map((x,i)=>x[0]-u[i][0])), lost: window.__engine.gl.isContextLost(), stalls: s.filter(x => (x.ms ?? x.dur ?? 0) > 100).slice(0, 6) })`)
  console.log(n, r)
}
