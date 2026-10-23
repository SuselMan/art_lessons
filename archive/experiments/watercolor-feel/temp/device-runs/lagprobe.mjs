// All pages draw; afterwards, how long each page's queue took to empty.
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const pages = process.argv.slice(2)
for (const p of pages) await joinAndInstall(p)
for (const p of pages) await ev(p, `const e = window.__engine; window.__lag = { maxQ: 0 }; clearInterval(window.__lagT); window.__lagT = setInterval(() => { window.__lag.maxQ = Math.max(window.__lag.maxQ, e._opQueue.length); if (e._opQueue.length) window.__lag.lastNonEmpty = performance.now() }, 100); return 1`)
const { default: _ } = await import('node:process')
const t0 = Date.now()
await import('./stallprobe2.mjs').catch(() => {})
