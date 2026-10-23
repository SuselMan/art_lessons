import { createRequire } from 'node:module'
const WebSocket = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('ws')
const ws = new WebSocket(process.argv[2], { perMessageDeflate: false })
ws.on('open', () => { console.log('open'); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'location.href + " engine=" + !!window.__engine + " vis=" + document.visibilityState', returnByValue: true } })) })
ws.on('message', m => { console.log(String(m).slice(0, 300)); process.exit(0) })
ws.on('error', e => { console.log('err', e.message); process.exit(1) })
setTimeout(() => { console.log('timeout'); process.exit(2) }, 15000)
