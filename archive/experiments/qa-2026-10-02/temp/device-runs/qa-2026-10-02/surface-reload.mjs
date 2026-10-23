import WebSocket from 'ws'
const { webSocketDebuggerUrl } = await (await fetch('http://127.0.0.1:9322/json/version')).json()
const ws = new WebSocket(webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
let serial = 0
const pending = new Map()
ws.on('message', data => { const msg = JSON.parse(String(data)); const p = pending.get(msg.id); if (p) { clearTimeout(p.timer); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result) } })
function call(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')) }, 15000) }); ws.send(JSON.stringify({ id, method, params, sessionId })) }) }
try {
 const { targetInfos } = await call('Target.getTargets')
 const pages = targetInfos.filter(x => x.type === 'page' && x.url.includes(':5277/'))
 console.log(pages.map(x => ({id:x.targetId,url:x.url})))
 for (const page of pages) {
  console.log(await call('Target.closeTarget', {targetId:page.targetId}))
  console.log(await call('Target.createTarget', {url:'https://192.168.1.70:5277/room/Yks648i0'}))
 }
} finally { ws.close() }
