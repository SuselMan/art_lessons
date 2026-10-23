// Pause a (possibly busy) page and print where its main thread is.
import { createRequire } from 'node:module'
const WebSocket = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('ws')
const ws = new WebSocket(`ws://localhost:9222/devtools/page/${process.argv[2]}`, { perMessageDeflate: false })
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
let id = 0
ws.on('message', m => { const d = JSON.parse(m); if (d.method === 'Debugger.paused') { console.log('PAUSED', d.params.reason); for (const f of d.params.callFrames.slice(0, 18)) console.log('  ', f.functionName || '(anon)', (f.url || '').split('/').pop().split('?')[0] + ':' + (f.location.lineNumber + 1)); ws.send(JSON.stringify({ id: ++id, method: 'Debugger.resume' })); setTimeout(() => process.exit(0), 500) } })
ws.send(JSON.stringify({ id: ++id, method: 'Debugger.enable' }))
setTimeout(() => ws.send(JSON.stringify({ id: ++id, method: 'Debugger.pause' })), 500)
setTimeout(() => { console.log('no pause within 40 s'); process.exit(1) }, 40000)
