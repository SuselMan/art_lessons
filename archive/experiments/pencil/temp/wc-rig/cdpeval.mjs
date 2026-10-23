// node cdpeval.mjs <pageId> '<js expression>'  — prints the returned value
import { createRequire } from 'node:module'
const WebSocket = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('ws')
const [id, expr] = process.argv.slice(2)
const ws = new WebSocket(`ws://localhost:9222/devtools/page/${id}`, { perMessageDeflate: false })
ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })))
ws.on('message', m => { const d = JSON.parse(m); if (d.id === 1) { console.log(d.result?.result?.value ?? JSON.stringify(d.result).slice(0, 400)); ws.close() } })
