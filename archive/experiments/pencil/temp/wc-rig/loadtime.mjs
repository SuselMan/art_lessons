// Time a room's load on the tablet: open a fresh tab, then poll the page
// until the engine exists and the main thread answers promptly three times.
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
const WebSocket = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('ws')
const room = process.argv[2]
const adb = `${process.env.HOME}/tools/platform-tools/adb -s 192.168.1.36:36307`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const list = async () => (await (await fetch('http://localhost:9222/json')).json())
for (const t of await list()) if (t.url.includes(room)) await fetch('http://localhost:9222/json/close/' + t.id)
const t0 = Date.now()
execSync(`${adb} shell am start -a android.intent.action.VIEW -d "https://192.168.1.70:5277/room/${room}?t=${Date.now()}" -p com.android.chrome`)
let tab
while (!tab) { await sleep(300); tab = (await list()).find(t => t.url.includes(room)) }
const ws = new WebSocket(tab.webSocketDebuggerUrl, { perMessageDeflate: false })
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
let id = 0; const pending = new Map()
ws.on('message', m => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } })
const ev = expr => new Promise(res => { const i = ++id; pending.set(i, d => res(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })) })
let good = 0, engineAt = 0
while (good < 3 && Date.now() - t0 < 240000) {
  const a = Date.now()
  const r = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Войти|Join/i.test(b.textContent)); if (b && !window.__engine) b.click(); const e = window.__engine; return e ? e.getOperations().length : -1 })()`)
  const lat = Date.now() - a
  if (r >= 0 && !engineAt) engineAt = Date.now() - t0
  good = r > 0 && lat < 120 ? good + 1 : 0
  await sleep(250)
}
console.log(JSON.stringify({ room, engineAt, readyAt: Date.now() - t0, ops: await ev('window.__engine?.getOperations().length') }))
ws.close()
