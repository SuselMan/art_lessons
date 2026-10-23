import { createRequire } from 'node:module'
const WebSocket = createRequire('/home/suselman/projects/pencil-agents/watercolor-feel/package.json')('ws')
const ws = new WebSocket(process.argv[2], { perMessageDeflate: false })
ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Page.handleJavaScriptDialog', params: { accept: true } })))
ws.on('message', m => { console.log(String(m).slice(0, 200)); process.exit(0) })
setTimeout(() => { console.log('timeout'); process.exit(2) }, 10000)
