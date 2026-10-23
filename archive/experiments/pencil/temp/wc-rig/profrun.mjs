// CPU profile of one tabletpen run: a second CDP client on the same page
// records while tabletpen draws. Usage: node profrun.mjs <pageId> [size]
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const WebSocket = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('ws')
const [pageId, size = '400'] = process.argv.slice(2)
const url = `ws://localhost:9222/devtools/page/${pageId}`
const ws = new WebSocket(url, { perMessageDeflate: false })
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
let id = 0; const pending = new Map()
ws.on('message', m => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } })
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 250 }); await send('Profiler.start')
const r = spawnSync('node', ['tabletpen.mjs', url, size, '8', '300', '2'], { encoding: 'utf8', env: process.env })
console.log(r.stdout.split('\n').filter(l => l.startsWith('pen')).map(l => { const d = JSON.parse(l.slice(4)); return 'during ' + JSON.stringify(d.during) + ' after ' + JSON.stringify(d.after) }).join('\n'))
const { profile } = (await send('Profiler.stop')).result
const byId = new Map(profile.nodes.map(n => [n.id, n]))
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
const self = new Map(), total = new Map()
const dts = profile.timeDeltas
const nm = n => (n.callFrame.functionName || '(anon)') + ':' + n.callFrame.lineNumber
profile.samples.forEach((sid, i) => {
  const dt = (dts[i + 1] ?? dts[i]) / 1000
  const n = byId.get(sid); self.set(nm(n), (self.get(nm(n)) || 0) + dt)
  const seen = new Set(); let cur = sid
  while (cur !== undefined) { const k = nm(byId.get(cur)); if (!seen.has(k)) { total.set(k, (total.get(k) || 0) + dt); seen.add(k) } cur = parent.get(cur) }
})
const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([a, v]) => Math.round(v) + ' ' + a).join('\n  ')
console.log('SELF\n  ' + top(self, 22)); console.log('TOTAL\n  ' + top(total, 30))
ws.close()
